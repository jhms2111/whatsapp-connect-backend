import { DateTime } from 'luxon';

export function zoneIsValid(tz: string): boolean {
  return DateTime.now().setZone(tz).isValid;
}

/** Início/fim do DIA na zona dada, retornados em UTC + weekday local (0=Dom..6=Sáb) */
export function dayRangeUTC(dateISO: string, tz: string) {
  const startLocal = DateTime.fromISO(dateISO, { zone: tz }).startOf('day');
  const endLocal = startLocal.plus({ days: 1 });
  const weekdayLuxon = startLocal.weekday; // 1=Mon..7=Sun
  const weekdayLocal = weekdayLuxon % 7;   // 0=Sun .. 6=Sat
  return {
    startUTC: startLocal.toUTC().toJSDate(),
    endUTC: endLocal.toUTC().toJSDate(),
    weekdayLocal,
  };
}

/** Converte “minutos do dia” LOCAL → Date UTC */
export function localMinutesToUTC(dateISO: string, tz: string, minutes: number): Date {
  const dtLocal = DateTime.fromISO(dateISO, { zone: tz }).startOf('day').plus({ minutes });
  return dtLocal.toUTC().toJSDate();
}
