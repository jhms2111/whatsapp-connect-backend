import { Router, Request, Response } from 'express';
import { authenticateJWT } from '../middleware/authMiddleware';
import { getSlotsForDate } from '../../../infraestructure/express/service/slotEngine';

const router = Router();

/** GET /slots?date=YYYY-MM-DD&serviceId=...&durationMin=...&professionalId=...&stepMin=15 */
router.get('/slots', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const owner = (req as any).user.username;
    const { date, serviceId, durationMin, professionalId, stepMin } = req.query as any;

    if (!date) return res.status(400).json({ error: 'Parâmetro "date" é obrigatório (YYYY-MM-DD)' });
    if (!serviceId && !durationMin) {
      return res.status(400).json({ error: 'Informe "serviceId" ou "durationMin"' });
    }

    const results = await getSlotsForDate({
      owner,
      dateISO: String(date),
      professionalId: professionalId ? String(professionalId) : undefined,
      serviceId: serviceId ? String(serviceId) : undefined,
      durationMin: durationMin ? Number(durationMin) : undefined,
      stepMin: stepMin ? Number(stepMin) : 15,
    });

    res.json(results);
  } catch (err) {
    console.error('[SLOTS] error:', err);
    res.status(500).json({ error: 'Erro ao gerar slots' });
  }
});

export default router;