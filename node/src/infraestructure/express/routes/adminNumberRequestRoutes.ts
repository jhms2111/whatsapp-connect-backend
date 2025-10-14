// src/infraestructure/express/routes/adminNumberRequestRoutes.ts
import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import NumberRequest from '../../mongo/models/numberRequestModel';
import TwilioNumber from '../../mongo/models/twilioNumberModel';
import { authenticateJWT } from '../middleware/authMiddleware';
import { requireAdmin } from '../middleware/requireAdmin'

const router = Router();

// Todas as rotas /admin passam por autenticação e checagem de admin
router.use('/admin', authenticateJWT, requireAdmin);

/**
 * GET /api/admin/number-requests?status=paid|approved|rejected|pending_review|all
 * Lista pedidos com filtro opcional
 */
router.get('/admin/number-requests', async (req: Request, res: Response) => {
  try {
    const { status } = req.query as { status?: string };
    const filter: any = {};
    if (status && status !== 'all') filter.status = status;
    const requests = await NumberRequest.find(filter).sort({ createdAt: -1 }).lean();
    res.json(requests);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar pedidos' });
  }
});

/**
 * POST /api/admin/number-requests/:id/approve
 * body: { phoneNumber: string, adminNotes?: string }
 * Requer que o pedido esteja "paid"
 */
router.post('/admin/number-requests/:id/approve', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { phoneNumber, adminNotes } = req.body || {};
  if (!phoneNumber) return res.status(400).json({ error: 'phoneNumber é obrigatório' });

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const nr = await NumberRequest.findById(id).session(session);
    if (!nr) {
      await session.abortTransaction();
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }
    if (nr.status !== 'paid') {
      await session.abortTransaction();
      return res.status(400).json({ error: 'Só é possível aprovar pedidos com status "paid"' });
    }

    // Unicidade do número
    const dup = await TwilioNumber.findOne({ number: phoneNumber }).session(session);
    if (dup) {
      await session.abortTransaction();
      return res.status(409).json({ error: 'Número já cadastrado por outro cliente' });
    }

    // Atualiza pedido -> approved
    nr.status = 'approved';
    nr.approvedAt = new Date();
    nr.selectedNumber = phoneNumber;
    if (adminNotes) nr.adminNotes = adminNotes;
    await nr.save({ session });

    // Cria o TwilioNumber para o usuário
    await TwilioNumber.create([{ owner: nr.username, number: phoneNumber }], { session });

    await session.commitTransaction();
    session.endSession();
    return res.json(nr);
  } catch (e) {
    await session.abortTransaction();
    session.endSession();
    console.error('[ADMIN] approve error:', e);
    return res.status(500).json({ error: 'Erro ao aprovar pedido' });
  }
});

/**
 * POST /api/admin/number-requests/:id/reject
 * body: { adminNotes?: string }
 */
router.post('/admin/number-requests/:id/reject', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { adminNotes } = req.body || {};
  try {
    const nr = await NumberRequest.findById(id);
    if (!nr) return res.status(404).json({ error: 'Pedido não encontrado' });

    nr.status = 'rejected';
    nr.rejectedAt = new Date();
    if (adminNotes) nr.adminNotes = adminNotes;
    await nr.save();

    return res.json(nr);
  } catch (e) {
    console.error('[ADMIN] reject error:', e);
    return res.status(500).json({ error: 'Erro ao rejeitar pedido' });
  }
});

/**
 * (compatibilidade antiga)
 * GET /api/admin/number-requests/:username
 */
router.get('/admin/number-requests/:username', async (req: Request, res: Response) => {
  try {
    const requests = await NumberRequest.find({ username: req.params.username })
      .sort({ createdAt: -1 })
      .lean();
    res.json(requests);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar pedidos' });
  }
});

export default router;
