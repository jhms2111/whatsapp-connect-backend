import { Router, Request, Response } from 'express';
import { authenticateJWT } from '../middleware/authMiddleware';
import Professional from '../../mongo/models/professionalModel';

const router = Router();

// Criar
router.post('/professionals', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const owner = (req as any).user.username;
    const { name, skills = [], active = true, capacity = 1 } = req.body;
    const doc = await Professional.create({ owner, name, skills, active, capacity });
    res.status(201).json(doc);
  } catch (err: any) {
    if (err?.code === 11000) return res.status(409).json({ error: 'Profissional com esse nome já existe.' });
    console.error('[PROF] create:', err);
    res.status(500).json({ error: 'Erro ao criar profissional' });
  }
});

// Listar (meus)
router.get('/professionals', authenticateJWT, async (req: Request, res: Response) => {
  const owner = (req as any).user.username;
  const list = await Professional.find({ owner }).sort({ createdAt: -1 }).lean();
  res.json(list);
});

// Atualizar
router.put('/professionals/:id', authenticateJWT, async (req: Request, res: Response) => {
  const owner = (req as any).user.username;
  const { id } = req.params;
  const upd = await Professional.findOneAndUpdate({ _id: id, owner }, req.body, { new: true });
  if (!upd) return res.status(404).json({ error: 'Profissional não encontrado' });
  res.json(upd);
});

// Remover
router.delete('/professionals/:id', authenticateJWT, async (req: Request, res: Response) => {
  const owner = (req as any).user.username;
  const { id } = req.params;
  const del = await Professional.findOneAndDelete({ _id: id, owner });
  if (!del) return res.status(404).json({ error: 'Profissional não encontrado' });
  res.json({ success: true });
});

export default router;
