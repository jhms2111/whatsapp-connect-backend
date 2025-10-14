// src/infraestructure/express/routes/numberAccessRequestRoutes.ts
import { Router, Request, Response } from 'express';
import { authenticateJWT } from '../middleware/authMiddleware';
import NumberAccessRequest from '../../mongo/models/numberAccessRequestModel';

const router = Router();

// POST /api/number-access-requests
router.post('/number-access-requests', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const username = (req as any).user?.username as string | undefined;
    if (!username) return res.status(401).json({ error: 'Usuário não autenticado' });
    const { companyName, companyEmail, website, description } = req.body || {};
    if (!companyName || !companyEmail) {
      return res.status(400).json({ error: 'companyName e companyEmail são obrigatórios' });
    }
    const open = await NumberAccessRequest.findOne({ username, status: 'submitted' }).lean();
    if (open) return res.status(409).json({ error: 'Já existe uma solicitação em análise.' });

    const doc = await NumberAccessRequest.create({
      username, companyName, companyEmail, website, description, status: 'submitted',
    });
    res.status(201).json(doc);
  } catch (err) {
    console.error('[ACCESS] create error:', err);
    res.status(500).json({ error: 'Erro ao criar solicitação' });
  }
});

// GET /api/number-access-requests/mine
router.get('/number-access-requests/mine', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const username = (req as any).user?.username as string | undefined;
    if (!username) return res.status(401).json({ error: 'Usuário não autenticado' });
    const list = await NumberAccessRequest.find({ username }).sort({ createdAt: -1 }).lean();
    res.json(list);
  } catch (err) {
    console.error('[ACCESS] mine error:', err);
    res.status(500).json({ error: 'Erro ao listar solicitações' });
  }
});

export default router;
