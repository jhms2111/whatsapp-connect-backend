import { Router, Request, Response } from 'express';
import { authenticateJWT } from '../middleware/authMiddleware';
import Service from '../../mongo/models/serviceModel';

const router = Router();

router.post('/services', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const owner = (req as any).user.username;
    const doc = await Service.create({ owner, ...req.body });
    res.status(201).json(doc);
  } catch (err: any) {
    if (err?.code === 11000) return res.status(409).json({ error: 'Serviço com esse nome já existe.' });
    console.error('[SERV] create:', err);
    res.status(500).json({ error: 'Erro ao criar serviço' });
  }
});

router.get('/services', authenticateJWT, async (req: Request, res: Response) => {
  const owner = (req as any).user.username;
  const list = await Service.find({ owner }).sort({ createdAt: -1 }).lean();
  res.json(list);
});

router.put('/services/:id', authenticateJWT, async (req: Request, res: Response) => {
  const owner = (req as any).user.username;
  const upd = await Service.findOneAndUpdate({ _id: req.params.id, owner }, req.body, { new: true });
  if (!upd) return res.status(404).json({ error: 'Serviço não encontrado' });
  res.json(upd);
});

router.delete('/services/:id', authenticateJWT, async (req: Request, res: Response) => {
  const owner = (req as any).user.username;
  const del = await Service.findOneAndDelete({ _id: req.params.id, owner });
  if (!del) return res.status(404).json({ error: 'Serviço não encontrado' });
  res.json({ success: true });
});

export default router;
