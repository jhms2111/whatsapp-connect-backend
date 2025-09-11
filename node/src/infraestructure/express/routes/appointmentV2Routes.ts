import { Router, Request, Response } from 'express';
import { authenticateJWT } from '../middleware/authMiddleware';
import AppointmentV2 from '../../mongo/models/appointment2Model';
import { scheduleAppointmentV2 } from '../../../modules/appointments/scheduleAppointmentV2';

const router = Router();

/** Criar (confirmado) */
router.post('/appointments', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const owner = (req as any).user.username;
    const { clientId, clientName, startISO, professionalId, serviceId, durationMin, createdBy = 'human' } = req.body;

    if (!clientId || !clientName || !startISO || !professionalId) {
      return res.status(400).json({ error: 'clientId, clientName, startISO e professionalId são obrigatórios' });
    }

    const start = new Date(startISO);
    if (isNaN(start.getTime())) return res.status(400).json({ error: 'startISO inválido' });

    if (!serviceId && !durationMin) {
      return res.status(400).json({ error: 'Informe serviceId ou durationMin' });
    }

    const appt = await scheduleAppointmentV2({
      owner,
      clientId,
      clientName,
      start,
      professional: professionalId,
      serviceId,
      durationMin,
      createdBy: createdBy === 'bot' ? 'bot' : 'human',
    });

    res.status(201).json(appt);
  } catch (err: any) {
    console.error('[APPT] create error:', err);
    res.status(400).json({ error: err.message || 'Erro ao criar agendamento' });
  }
});

/** Listar por dia (UTC) + opcional por profissional */
router.get('/appointments', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const owner = (req as any).user.username;
    const { date, professionalId } = req.query as any;
    if (!date) return res.status(400).json({ error: 'Parâmetro "date" é obrigatório (YYYY-MM-DD)' });

    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd   = new Date(`${date}T23:59:59.999Z`);

    const q: any = { owner, start: { $gte: dayStart, $lt: dayEnd } };
    if (professionalId) q.professional = professionalId;

    const list = await AppointmentV2.find(q)
      .populate('professional service')
      .sort({ start: 1 })
      .lean();

    res.json(list);
  } catch (err) {
    console.error('[APPT] list error:', err);
    res.status(500).json({ error: 'Erro ao listar agendamentos' });
  }
});

/** Cancelar */
router.delete('/appointments/:id', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const owner = (req as any).user.username;
    const { id } = req.params;

    const appt = await AppointmentV2.findOneAndUpdate(
      { _id: id, owner },
      { status: 'cancelled' },
      { new: true }
    );
    if (!appt) return res.status(404).json({ error: 'Agendamento não encontrado' });

    res.json(appt);
  } catch (err) {
    console.error('[APPT] cancel error:', err);
    res.status(500).json({ error: 'Erro ao cancelar agendamento' });
  }
});

/** (Opcional) Remarcar */
router.put('/appointments/:id/reschedule', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const owner = (req as any).user.username;
    const { id } = req.params;
    const { startISO, serviceId, durationMin } = req.body;

    const appt = await AppointmentV2.findOne({ _id: id, owner });
    if (!appt) return res.status(404).json({ error: 'Agendamento não encontrado' });

    const start = new Date(startISO);
    if (isNaN(start.getTime())) return res.status(400).json({ error: 'startISO inválido' });

    // reutiliza a mesma função de criação para validar conflito
    const moved = await scheduleAppointmentV2({
      owner,
      clientId: appt.clientId,
      clientName: appt.clientName,
      start,
      professional: appt.professional,
      serviceId: serviceId ?? appt.service,
      durationMin: durationMin ?? appt.durationMin,
      createdBy: appt.createdBy,
    });

    // cancela o antigo
    appt.status = 'cancelled';
    await appt.save();

    res.json(moved);
  } catch (err: any) {
    console.error('[APPT] reschedule error:', err);
    res.status(400).json({ error: err.message || 'Erro ao remarcar' });
  }
});

export default router;
