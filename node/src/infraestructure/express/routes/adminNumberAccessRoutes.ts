// src/infraestructure/express/routes/adminNumberAccessRoutes.ts
import { Router, Request, Response } from 'express';
import { authenticateJWT } from '../middleware/authMiddleware';
import { requireAdmin } from '../middleware/requireAdmin';
import NumberAccessRequest from '../../mongo/models/numberAccessRequestModel';

const router = Router();

// todas as rotas aqui exigem admin
router.use(authenticateJWT, requireAdmin);

// GET /api/admin/number-access-requests?status=submitted|approved|rejected|all
router.get('/number-access-requests', async (req: Request, res: Response) => {
  try {
    const { status } = req.query as { status?: string };
    const filter: any = {};
    if (status && status !== 'all') filter.status = status;
    const list = await NumberAccessRequest.find(filter).sort({ createdAt: -1 }).lean();
    res.json(list);
  } catch (err) {
    console.error('[ADMIN ACCESS] list error:', err);
    res.status(500).json({ error: 'Erro ao listar solicitações' });
  }
});

// POST /api/admin/number-access-requests/:id/approve
router.post('/number-access-requests/:id/approve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { adminNotes } = req.body || {};
    const doc = await NumberAccessRequest.findById(id);
    if (!doc) return res.status(404).json({ error: 'Solicitação não encontrada' });
    if (doc.status !== 'submitted') return res.status(400).json({ error: 'Já decidida' });

    doc.status = 'approved';
    doc.adminNotes = adminNotes;
    doc.decidedAt = new Date();
    await doc.save();
    res.json(doc);
  } catch (err) {
    console.error('[ADMIN ACCESS] approve error:', err);
    res.status(500).json({ error: 'Erro ao aprovar solicitação' });
  }
});

// POST /api/admin/number-access-requests/:id/reject
router.post('/number-access-requests/:id/reject', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { adminNotes } = req.body || {};
    const doc = await NumberAccessRequest.findById(id);
    if (!doc) return res.status(404).json({ error: 'Solicitação não encontrada' });
    if (doc.status !== 'submitted') return res.status(400).json({ error: 'Já decidida' });

    doc.status = 'rejected';
    doc.adminNotes = adminNotes;
    doc.decidedAt = new Date();
    await doc.save();
    res.json(doc);
  } catch (err) {
    console.error('[ADMIN ACCESS] reject error:', err);
    res.status(500).json({ error: 'Erro ao rejeitar solicitação' });
  }
});

export default router;
