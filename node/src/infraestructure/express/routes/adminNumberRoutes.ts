import { Router, Request, Response } from 'express';
import { authenticateJWT } from '../middleware/authMiddleware';
import { requireAdmin } from '../middleware/requireAdmin';

import NumberRequest from '../../mongo/models/numberRequestModel';
import TwilioNumber from '../../mongo/models/twilioNumberModel';

const normalize = (n: string) => n.trim();

const router = Router();

// ADMIN: listar pedidos por status
router.get(
  '/admin/number-requests',
  authenticateJWT,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { status } = req.query as { status?: string };
      const query: any = {};
      if (status && status !== 'all') query.status = status;

      const list = await NumberRequest.find(query).sort({ createdAt: -1 });
      return res.json(list);
    } catch (err) {
      console.error('[ADMIN] erro ao listar pedidos:', err);
      return res.status(500).json({ error: 'Erro ao listar pedidos.' });
    }
  }
);

// ADMIN: rejeitar pedido
router.post(
  '/admin/number-requests/:id/reject',
  authenticateJWT,
  requireAdmin,
  async (req: Request, res: Response) => {
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
  }
);

// ADMIN: aprovar pedido e associar número (sem inventário)
router.post(
  '/admin/number-requests/:id/approve',
  authenticateJWT,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { phoneNumber, adminNotes } = req.body as {
        phoneNumber?: string;
        adminNotes?: string;
      };

      if (!phoneNumber)
        return res.status(400).json({ error: 'phoneNumber é obrigatório' });
      const number = normalize(phoneNumber);

      const nr = await NumberRequest.findById(id);
      if (!nr) return res.status(404).json({ error: 'Pedido não encontrado' });

      // cria ou atualiza TwilioNumber para o usuário
      await TwilioNumber.findOneAndUpdate(
        { owner: nr.username },
        { owner: nr.username, number },
        { upsert: true, new: true }
      );

      // atualiza pedido
      nr.status = 'approved';
      nr.selectedNumber = number;
      nr.adminNotes = adminNotes;
      nr.approvedAt = new Date();
      await nr.save();

      return res.json({
        message: 'Pedido aprovado com sucesso',
        numberRequest: nr,
      });
    } catch (err) {
      console.error('[ADMIN] erro ao aprovar pedido:', err);
      return res.status(500).json({ error: 'Erro ao aprovar pedido.' });
    }
  }
);

export default router;
