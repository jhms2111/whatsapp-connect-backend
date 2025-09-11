import { Router, Request, Response } from 'express';
import { authenticateJWT } from '../middleware/authMiddleware';
import Assignment from '../../mongo/models/assignmentModel';
import Professional from '../../mongo/models/professionalModel';
import AvailabilityTemplate from '../../mongo/models/availabilityTemplateModel';

const router = Router();

router.post('/assignments', authenticateJWT, async (req: Request, res: Response) => {
  const owner = (req as any).user.username;
  const { professional, template, startDate, endDate } = req.body;
  // valida ownership
  const [p, t] = await Promise.all([
    Professional.findOne({ _id: professional, owner }),
    AvailabilityTemplate.findOne({ _id: template, owner }),
  ]);
  if (!p || !t) return res.status(400).json({ error: 'Profissional ou Template inválido' });

  const doc = await Assignment.create({ owner, professional, template, startDate, endDate });
  res.status(201).json(doc);
});

router.get('/assignments', authenticateJWT, async (req: Request, res: Response) => {
  const owner = (req as any).user.username;
  const list = await Assignment.find({ owner }).populate('professional template').lean();
  res.json(list);
});

router.delete('/assignments/:id', authenticateJWT, async (req: Request, res: Response) => {
  const owner = (req as any).user.username;
  const del = await Assignment.findOneAndDelete({ _id: req.params.id, owner });
  if (!del) return res.status(404).json({ error: 'Assignment não encontrado' });
  res.json({ success: true });
});

export default router;
