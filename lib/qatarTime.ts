// Everything time-related in the app is shown, and every "today" is worked out, in Qatar time (Asia/Qatar,
// UTC+3 all year, no daylight saving), whatever the browser's or the server's own time zone is.
export const QATAR_TZ = "Asia/Qatar";
const OFFSET = "+03:00";
const OFFSET_MS = 3 * 3600_000;

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: QATAR_TZ });

// "2026-10-13" for the given moment, as a Qatar calendar day.
export const qatarDay = (d: Date | string | number = Date.now()): string => dayFmt.format(new Date(d));

export const qatarStartOfDay = (day: string = qatarDay()): Date => new Date(`${day}T00:00:00${OFFSET}`);
export const qatarEndOfDay = (day: string = qatarDay()): Date => new Date(qatarStartOfDay(day).getTime() + 86400000 - 1);
export const shiftDay = (day: string, n: number): string => qatarDay(new Date(qatarStartOfDay(day).getTime() + n * 86400000 + 12 * 3600_000));

// Whole Qatar days from now until the given moment (0 = today, 1 = tomorrow, negative = past).
export function qatarDayDiff(iso: string | Date, now: number = Date.now()): number {
  return Math.round((qatarStartOfDay(qatarDay(iso)).getTime() - qatarStartOfDay(qatarDay(now)).getTime()) / 86400000);
}

// The value for an <input type="datetime-local"> showing a Qatar wall-clock time, "yyyy-MM-ddTHH:mm".
// offsetHours is from now; `hour` pins the clock time (in Qatar) of the resulting day.
export function qatarInputValue(offsetHours: number, hour?: number): string {
  const t = new Date(Date.now() + offsetHours * 3600_000);
  const day = qatarDay(t);
  if (hour !== undefined) return `${day}T${String(hour).padStart(2, "0")}:00`;
  return new Date(t.getTime() + OFFSET_MS).toISOString().slice(0, 16);
}

// What the person typed into a datetime-local input is Qatar time; this turns it into the real moment.
export function fromQatarInput(value: string): Date {
  return new Date(`${value.length === 16 ? value + ":00" : value}${OFFSET}`);
}
