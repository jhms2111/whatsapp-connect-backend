// src/modules/scheduling/slotEngine.ts
import Assignment from '../../mongo/models/assignmentModel';
import AvailabilityTemplate, { IAvailabilityTemplate } from '../../mongo/models/availabilityTemplateModel';
import Professional from '../../mongo/models/professionalModel';
import Service from '../../mongo/models/serviceModel';
import TimeOff from '../../mongo/models/timeOffModel';
import AppointmentV2 from '../../mongo/models/appointment2Model';

import { dayRangeUTC, localMinutesToUTC, zoneIsValid } from '../../../modules/scheduling/tz';

type SlotResult = {
  professionalId: string;
  professionalName: string;
  slots: string[]; // ISO inicio (UTC)
};

function overlapsMs(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

function subtractWindows(
  base: { startMin: number; endMin: number }[],
  offs: { startMin: number; endMin: number }[]
) {
  let current = [...base];
  for (const off of offs) {
    const next: typeof current = [];
    for (const w of current) {
      const overlap = w.startMin < off.endMin && off.startMin < w.endMin;
      if (!overlap) { next.push(w); continue; }
      if (w.startMin < off.startMin) next.push({ startMin: w.startMin, endMin: Math.max(w.startMin, off.startMin) });
      if (off.endMin < w.endMin) next.push({ startMin: Math.min(off.endMin, w.endMin), endMin: w.endMin });
    }
    current = next.filter(w => w.endMin - w.startMin >= 5);
  }
  return current;
}

/**
 * Retorna slots em grade (default 15 min) respeitando:
 * - Template (por assignment) com TZ própria
 * - TimeOff (empresa ou profissional) no mesmo “dia local”
 * - Appointments existentes (bufferBefore/After, capacity)
 */
export async function getSlotsForDate(params: {
  owner: string;
  dateISO: string;                     // ex: '2025-10-21'
  professionalId?: string;
  serviceId?: string;
  durationMin?: number;
  stepMin?: number;                    // granularidade da grade (default 15)
}): Promise<SlotResult[]> {
  const { owner, dateISO, professionalId, serviceId, durationMin, stepMin = 15 } = params;

  const service = serviceId ? await Service.findOne({ _id: serviceId, owner }).lean() : null;
  const dur = service?.durationMin ?? durationMin ?? 30;
  const bufferBefore = service?.bufferBeforeMin ?? 0;
  const bufferAfter  = service?.bufferAfterMin  ?? 0;
  const requiredSkills = service?.requiredSkills ?? [];

  const profQuery: any = { owner, active: true };
  if (professionalId) profQuery._id = professionalId;
  if (requiredSkills.length) profQuery.skills = { $all: requiredSkills };
  const professionals = await Professional.find(profQuery).lean();

  const results: SlotResult[] = [];
  if (!professionals.length) return results;

  for (const p of professionals) {
    const assigns = await Assignment.find({
      owner,
      professional: p._id,
      startDate: { $lte: new Date(dateISO + 'T23:59:59.999Z') },
      $or: [{ endDate: null }, { endDate: { $gte: new Date(dateISO + 'T00:00:00.000Z') } }],
    })
    .populate<{ template: IAvailabilityTemplate }>('template')
    .exec();

    let allSlotsUTC: string[] = [];

    for (const a of assigns) {
      const t = a.template;
      if (!t) continue;

      const tz = zoneIsValid(t.timezone) ? t.timezone : 'UTC';
      const { startUTC: dayStartUTC, endUTC: dayEndUTC, weekdayLocal } = dayRangeUTC(dateISO, tz);

      // janelas do dia (LOCAL)
      let windows = (t.windows || [])
        .filter(w => w.dayOfWeek === weekdayLocal)
        .map(w => ({ startMin: w.startMin, endMin: w.endMin }));

      if (!windows.length) continue;

      // exceções do dia (LOCAL)
      const offs = await TimeOff.find({
        owner,
        date: { $gte: dayStartUTC, $lt: dayEndUTC },
        $or: [
          { professional: { $exists: false } },
          { professional: null },
          { professional: p._id },
        ],
      }).lean();

      const offIntervals = offs.map(o => ({
        startMin: o.startMin ?? 0,
        endMin:   o.endMin   ?? 24 * 60,
      }));

      windows = subtractWindows(windows, offIntervals);
      if (!windows.length) continue;

      // appointments existentes
      const appts = await AppointmentV2.find({
        owner,
        professional: p._id,
        start: { $gte: dayStartUTC, $lt: dayEndUTC },
        status: { $in: ['confirmed','pending'] },
      }).lean();

      // gerar grade (stepMin) e validar
      for (const w of windows) {
        for (let s = w.startMin; s + dur <= w.endMin; s += stepMin) {
          const slotStartUTC = localMinutesToUTC(dateISO, tz, s);
          const slotEndUTC   = localMinutesToUTC(dateISO, tz, s + dur);

          const effStart = slotStartUTC.getTime() - bufferBefore * 60000;
          const effEnd   = slotEndUTC.getTime()   + bufferAfter  * 60000;

          const overlapping = appts.filter(a => {
            const aStart = new Date(a.start).getTime();
            const aEnd   = aStart + (a.durationMin ?? dur) * 60000;
            const aEffStart = aStart - bufferBefore * 60000;
            const aEffEnd   = aEnd   + bufferAfter  * 60000;
            return overlapsMs(effStart, effEnd, aEffStart, aEffEnd);
          }).length;

          if (overlapping < (p.capacity || 1)) {
            allSlotsUTC.push(slotStartUTC.toISOString());
          }
        }
      }
    }

    allSlotsUTC = Array.from(new Set(allSlotsUTC)).sort();

    results.push({
      professionalId: String(p._id),
      professionalName: p.name,
      slots: allSlotsUTC,
    });
  }

  return results;
}
