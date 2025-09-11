import { Router, Request, Response } from 'express';
import { authenticateJWT } from '../middleware/authMiddleware';
import AvailabilityTemplate from '../../mongo/models/availabilityTemplateModel';

const router = Router();

router.post('/availability-templates', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const owner = (req as any).user.username;
    const { name, timezone, windows = [] } = req.body;
    // validações simples
    for (const w of windows) {
      if (w.startMin >= w.endMin) return res.status(400).json({ error: 'Faixa inválida' });
    }
    const doc = await AvailabilityTemplate.create({ owner, name, timezone, windows });
    res.status(201).json(doc);
  } catch (err: any) {
    if (err?.code === 11000) return res.status(409).json({ error: 'Template com esse nome já existe.' });
    console.error('[AVT] create:', err);
    res.status(500).json({ error: 'Erro ao criar template' });
  }
});

router.get('/availability-templates', authenticateJWT, async (req: Request, res: Response) => {
  const owner = (req as any).user.username;
  const list = await AvailabilityTemplate.find({ owner }).sort({ createdAt: -1 }).lean();
  res.json(list);
});

router.put('/availability-templates/:id', authenticateJWT, async (req: Request, res: Response) => {
  const owner = (req as any).user.username;
  const upd = await AvailabilityTemplate.findOneAndUpdate({ _id: req.params.id, owner }, req.body, { new: true });
  if (!upd) return res.status(404).json({ error: 'Template não encontrado' });
  res.json(upd);
});

router.delete('/availability-templates/:id', authenticateJWT, async (req: Request, res: Response) => {
  const owner = (req as any).user.username;
  const del = await AvailabilityTemplate.findOneAndDelete({ _id: req.params.id, owner });
  if (!del) return res.status(404).json({ error: 'Template não encontrado' });
  res.json({ success: true });
});

export default router;
