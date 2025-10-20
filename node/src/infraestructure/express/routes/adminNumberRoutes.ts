// src/infraestructure/express/routes/adminNumberRoutes.ts
import { Router, Request, Response } from 'express';
import { adminOnly } from '../middleware/adminMiddleware';
import NumberRequest, { INumberRequest } from '../../mongo/models/numberRequestModel';
import TwilioNumber from '../../mongo/models/twilioNumberModel';
import ConversationQuota from '../../mongo/models/conversationQuotaModel';

const router = Router();

// Config do brinde
const FREE_TRIAL_CONVERSATIONS = 100;
const FREE_TRIAL_DAYS = 30;

// Concede (soma) 100 conversas e garante janela de 30 dias
async function grantFreeTrialConversations(username: string) {
  const now = new Date();
  const end = new Date(now.getTime() + FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000);

  const q = await ConversationQuota.findOneAndUpdate(
    { username },
    {
      $setOnInsert: {
        username,
        totalConversations: 0,
        usedCharacters: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        periodStart: now,
        periodEnd: end,
      },
    },
    { upsert: true, new: true }
  );

  // soma os 100 ao saldo atual
  q.totalConversations = (q.totalConversations || 0) + FREE_TRIAL_CONVERSATIONS;

  // garante validade de pelo menos 30 dias a partir de agora
  const currentEnd = q.periodEnd ? new Date(q.periodEnd) : null;
  if (!currentEnd || currentEnd < end) {
    if (!q.periodStart) q.periodStart = now;
    q.periodEnd = end;
  }

  q.updatedAt = new Date();
  await q.save();
}

/**
 * GET /api/admin/number-requests?status=pending_review|paid|approved|rejected|all
 * Lista pedidos para o admin (para UI de agregar número funcionar)
 */
router.get('/number-requests', adminOnly, async (req: Request, res: Response) => {
  try {
    const { status } = req.query as { status?: string };
    const filter: any = {};
    if (status && status !== 'all') {
      filter.status = status;
    }
    const list = await NumberRequest.find(filter).sort({ createdAt: -1 }).lean();
    return res.json(list);
  } catch (err) {
    console.error('[ADMIN] list number requests error:', err);
    return res.status(500).json({ error: 'Erro ao listar pedidos.' });
  }
});

/**
 * POST /api/admin/number-requests/:id/approve
 * Body: { selectedNumber: string }
 * - Marca a solicitação como aprovada
 * - Associa (ou cria) o TwilioNumber para o usuário
 * - Concede 100 conversas por 30 dias (idempotente)
 */
router.post('/number-requests/:id/approve', adminOnly, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { selectedNumber } = req.body as { selectedNumber?: string };

    if (!selectedNumber || typeof selectedNumber !== 'string') {
      return res.status(400).json({ error: 'selectedNumber é obrigatório.' });
    }

    const nr = (await NumberRequest.findById(id)) as INumberRequest | null;
    if (!nr) return res.status(404).json({ error: 'Pedido não encontrado.' });

    if (nr.status === 'rejected') {
      return res.status(400).json({ error: 'Pedido já foi rejeitado.' });
    }

    // 1) Associa/cria TwilioNumber para o usuário
    const existingNumber = await TwilioNumber.findOne({ number: selectedNumber });
    if (existingNumber && existingNumber.owner !== nr.username) {
      return res.status(409).json({ error: 'Número já está associado a outro cliente.' });
    }
    if (!existingNumber) {
      await TwilioNumber.create({
        owner: nr.username,
        number: selectedNumber,
      });
    } else if (existingNumber.owner !== nr.username) {
      // por segurança — já retornamos 409 acima
      existingNumber.owner = nr.username;
      await existingNumber.save();
    }

    // 2) Atualiza o pedido como aprovado
    nr.status = 'approved';
    nr.approvedAt = new Date();
    nr.selectedNumber = selectedNumber;

    // 3) Concede brinde, idempotente
    if (!nr.freeTrialGrantedAt) {
      await grantFreeTrialConversations(nr.username);
      nr.freeTrialGrantedAt = new Date();
    }

    await nr.save();

    return res.json({
      message: 'Pedido aprovado, número associado e conversas concedidas.',
      numberRequest: nr,
    });
  } catch (err) {
    console.error('[ADMIN] approve number request error:', err);
    return res.status(500).json({ error: 'Erro ao aprovar pedido.' });
  }
});

/**
 * POST /api/admin/number-requests/:id/reject
 * (opcional) rejeita pedido
 */
router.post('/number-requests/:id/reject', adminOnly, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const nr = await NumberRequest.findById(id);
    if (!nr) return res.status(404).json({ error: 'Pedido não encontrado.' });

    nr.status = 'rejected';
    nr.rejectedAt = new Date();
    await nr.save();

    return res.json({ message: 'Pedido rejeitado.', numberRequest: nr });
  } catch (err) {
    console.error('[ADMIN] reject number request error:', err);
    return res.status(500).json({ error: 'Erro ao rejeitar pedido.' });
  }
});

export default router;
