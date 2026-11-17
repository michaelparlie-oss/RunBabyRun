import { formatInTimeZone } from "date-fns-tz";

export const DEFAULT_TZ = "Asia/Jakarta";

export function safeTz(tz: string | null | undefined): string {
  if (!tz) return DEFAULT_TZ;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TZ;
  }
}

/** Today's date in the runner's time zone. APP_TODAY overrides it for demos and tests. */
export function todayLocal(tz: string = DEFAULT_TZ, now: Date = new Date()): string {
  const o = process.env.APP_TODAY;
  if (o && /^\d{4}-\d{2}-\d{2}$/.test(o)) return o;
  return formatInTimeZone(now, safeTz(tz), "yyyy-MM-dd");
}

export const nowEpoch = () => Math.floor(Date.now() / 1000);
const toUTC = (d: string) => new Date(`${d}T00:00:00Z`);
export const isDate = (d: unknown): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(toUTC(d).getTime());

export function addDays(d: string, n: number): string {
  const t = toUTC(d);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
/** b − a in whole days. */
export function diffDays(a: string, b: string): number {
  return Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / 86400000);
}
/** 0 = Monday … 6 = Sunday. */
export function dow(d: string): number {
  return (toUTC(d).getUTCDay() + 6) % 7;
}
export const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DOW_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const weekdayShort = (d: string) => DOW[dow(d)];
export const mondayOf = (d: string) => addDays(d, -dow(d));
export function fmtDate(d: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }): string {
  return toUTC(d).toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });
}
/** Local date part of a Strava start_date_local (Strava writes local time with a Z suffix). */
export const localDateOf = (startDateLocal: string) => startDateLocal.slice(0, 10);
