import { Router, Request, Response } from 'express';
import { authenticateJWT } from '../middleware/authMiddleware';
import { requireAdmin } from '../middleware/requireAdmin';

import TwilioInventory from '../../mongo/models/twilioInventoryModel';
import NumberRequest from '../../mongo/models/numberRequestModel';
import CustomerNumber from '../../mongo/models/CustomerNumber';
import TwilioNumber from '../../mongo/models/twilioNumberModel';

// simples normalizador (ajuste se quiser manter 'whatsapp:+')
const normalize = (n: string) => n.trim();

// ADMIN: adicionar número ao inventário
const router = Router();

router.post('/admin/inventory', authenticateJWT, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { number, label } = req.body as { number?: string; label?: string };
    if (!number) return res.status(400).json({ error: 'Número é obrigatório' });

    const doc = await TwilioInventory.create({
      number: normalize(number),
      label,
      active: true,
    });
    return res.status(201).json(doc);
  } catch (err) {
    console.error('[ADMIN] erro ao adicionar inventário:', err);
    return res.status(500).json({ error: 'Erro ao adicionar número ao inventário.' });
  }
});

// ADMIN: listar inventário
router.get('/admin/inventory', authenticateJWT, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const list = await TwilioInventory.find().sort({ active: -1, createdAt: -1 });
    return res.json(list);
  } catch (err) {
    console.error('[ADMIN] erro ao listar inventário:', err);
    return res.status(500).json({ error: 'Erro ao listar inventário.' });
  }
});

// ADMIN: listar pedidos por status
router.get('/admin/number-requests', authenticateJWT, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { status } = req.query as { status?: string };
    const query: any = {};
    // NÃO filtre quando vier "all" ou estiver vazio
    if (status && status !== 'all') query.status = status;

    const list = await NumberRequest.find(query).sort({ createdAt: -1 });
    return res.json(list);
  } catch (err) {
    console.error('[ADMIN] erro ao listar pedidos:', err);
    return res.status(500).json({ error: 'Erro ao listar pedidos.' });
  }
});

// ADMIN: rejeitar pedido
router.post('/admin/number-requests/:id/reject', authenticateJWT, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { adminNotes } = req.body as { adminNotes?: string };

    const doc = await NumberRequest.findByIdAndUpdate(
      id,
      { status: 'rejected', adminNotes, rejectedAt: new Date() },
      { new: true }
    );
    if (!doc) return res.status(404).json({ error: 'Pedido não encontrado' });

    return res.json(doc);
  } catch (err) {
    console.error('[ADMIN] erro ao rejeitar pedido:', err);
    return res.status(500).json({ error: 'Erro ao rejeitar pedido.' });
  }
});

// ADMIN: aprovar pedido e associar número
router.post('/admin/number-requests/:id/approve', authenticateJWT, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { phoneNumber, adminNotes } = req.body as { phoneNumber?: string; adminNotes?: string };

    if (!phoneNumber) return res.status(400).json({ error: 'phoneNumber é obrigatório' });
    const number = normalize(phoneNumber);

    const nr = await NumberRequest.findById(id);
    if (!nr) return res.status(404).json({ error: 'Pedido não encontrado' });

    // número precisa estar no inventário e disponível
    const inv = await TwilioInventory.findOne({ number, active: true });
    if (!inv) return res.status(400).json({ error: 'Número não está disponível no inventário' });

    // 1) vincular CustomerNumber (30 dias)
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    await CustomerNumber.findOneAndUpdate(
      { userId: nr.userId, phoneNumber: number },
      {
        userId: nr.userId,
        phoneNumber: number,
        active: true,
        purchasedAt: now,
        expiresAt,
      },
      { upsert: true, new: true }
    );

    // 2) atualizar TwilioNumber mapeando o dono -> número (para compatibilidade com seus envios)
    await TwilioNumber.findOneAndUpdate(
      { owner: nr.username },
      { owner: nr.username, number },
      { upsert: true, new: true }
    );

    // 3) Marcar inventário como atribuído
    inv.assignedTo = nr.userId;
    inv.active = false;
    await inv.save();

    // 4) Atualizar pedido
    nr.status = 'approved';
    nr.selectedNumber = number;
    nr.adminNotes = adminNotes;
    nr.approvedAt = now;
    await nr.save();

    return res.json({ numberRequest: nr, inventory: inv });
  } catch (err) {
    console.error('[ADMIN] erro ao aprovar pedido:', err);
    return res.status(500).json({ error: 'Erro ao aprovar pedido.' });
  }
});

export default router;
