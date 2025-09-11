import { Router, Request, Response } from 'express';
import { authenticateJWT } from '../middleware/authMiddleware';
import TimeOff from '../../mongo/models/timeOffModel';

const router = Router();

router.post('/time-off', authenticateJWT, async (req: Request, res: Response) => {
  const owner = (req as any).user.username;
  const { professional, date, startMin, endMin, reason } = req.body;
  if (startMin != null && endMin != null && startMin >= endMin) {
    return res.status(400).json({ error: 'Faixa inválida' });
  }
  const doc = await TimeOff.create({ owner, professional, date, startMin, endMin, reason });
  res.status(201).json(doc);
});

router.get('/time-off', authenticateJWT, async (req: Request, res: Response) => {
  const owner = (req as any).user.username;
  const list = await TimeOff.find({ owner }).populate('professional').lean();
  res.json(list);
});

router.delete('/time-off/:id', authenticateJWT, async (req: Request, res: Response) => {
  const owner = (req as any).user.username;
  const del = await TimeOff.findOneAndDelete({ _id: req.params.id, owner });
  if (!del) return res.status(404).json({ error: 'Registro não encontrado' });
  res.json({ success: true });
});

export default router;
