import { Types } from 'mongoose';
import AppointmentV2 from '../../infraestructure/mongo/models/appointment2Model';
import Professional from '../../infraestructure/mongo/models/professionalModel';
import Service from '../../infraestructure/mongo/models/serviceModel';

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}
function minutesUTC(d: Date) { return d.getUTCHours() * 60 + d.getUTCMinutes(); }

export async function scheduleAppointmentV2(params: {
  owner: string;
  clientId: string;
  clientName: string;
  start: Date;                          // ISO -> Date
  professional: Types.ObjectId | string;
  serviceId?: Types.ObjectId | string;
  durationMin?: number;
  createdBy: 'bot' | 'human';
}) {
  const { owner, clientId, clientName, start, professional, serviceId, durationMin, createdBy } = params;

  // valida profissional
  const prof = await Professional.findOne({ _id: professional, owner, active: true });
  if (!prof) throw new Error('Profissional inválido ou inativo');

  // serviço/duração/buffer
  const service = serviceId ? await Service.findOne({ _id: serviceId, owner, active: true }) : null;
  const dur = service?.durationMin ?? durationMin ?? 30;
  const bufferBefore = service?.bufferBeforeMin ?? 0;
  const bufferAfter  = service?.bufferAfterMin  ?? 0;

  // janela do dia (UTC)
  const dayStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const dayEnd   = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  // busca existentes do mesmo prof nesse dia
  const existing = await AppointmentV2.find({
    owner, professional,
    start: { $gte: dayStart, $lt: dayEnd },
    status: { $in: ['confirmed', 'pending'] },
  });

  // checa conflito com buffers e capacidade
  const sMin = minutesUTC(start);
  const eMin = sMin + dur;
  const effStart = sMin - bufferBefore;
  const effEnd   = eMin + bufferAfter;

  const overlapping = existing.filter(a => {
    const aStart = minutesUTC(a.start);
    const aEnd   = aStart + (a.durationMin ?? dur);
    const aEffStart = aStart - bufferBefore;
    const aEffEnd   = aEnd   + bufferAfter;
    return overlaps(effStart, effEnd, aEffStart, aEffEnd);
  }).length;

  if (overlapping >= (prof.capacity || 1)) {
    throw new Error('Conflito de agenda para este horário');
  }

  // cria
  const doc = await AppointmentV2.create({
    owner,
    clientId,
    clientName,
    start,
    durationMin: dur,
    status: 'confirmed',
    createdBy,
    professional,
    service: service?._id,
  });

  return doc;
}
