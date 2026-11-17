import Link from "next/link";
import { EFFORT, type EffortKey } from "./effort";

export interface StripDay {
  date: string; dow: string; effort: EffortKey | null; plannedKm: number; doneKm: number; today: boolean; future: boolean;
  status?: string; href?: string; strength?: boolean;
}

/**
 * The week as seven lanes. Bar height is distance, colour is effort. A planned run is an outline;
 * it fills as the run comes in from Strava. Rest days stay empty on purpose.
 */
export function WeekStrip({ days, plannedKm, doneKm, caption }: { days: StripDay[]; plannedKm: number; doneKm: number; caption?: React.ReactNode }) {
  const max = Math.max(6, ...days.map((d) => Math.max(d.plannedKm, d.doneKm)));
  const kinds = [...new Set(days.map((d) => d.effort).filter((e): e is EffortKey => !!e))];
  return (
    <section className="card" aria-label="This week">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
        <h2 className="h2">This week</h2>
        <p className="text-sm text-ink-2 tnum"><span className="numeral text-3xl text-ink">{doneKm.toFixed(1)}</span> of {plannedKm.toFixed(1)} km run</p>
      </div>
      <ol className="mt-4 grid grid-cols-7 gap-1.5 sm:gap-3">
        {days.map((d, i) => {
          const color = d.effort ? EFFORT[d.effort].color : "var(--color-line)";
          const h = (km: number) => `${Math.max(km > 0 ? 8 : 0, (km / max) * 100)}%`;
          const label = `${d.dow}: ${d.effort ? `${EFFORT[d.effort].label.toLowerCase()} ${d.plannedKm ? `${d.plannedKm} km planned` : ""}` : "rest"}${d.doneKm ? `, ${d.doneKm.toFixed(1)} km run` : ""}${d.strength ? ", strength" : ""}`;
          const body = (
            <>
              <div className="relative h-28 border-b-2 border-ink sm:h-36">
                {d.plannedKm > 0 && <div className="rise absolute inset-x-0 bottom-0 border-2 border-b-0" style={{ height: h(d.plannedKm), borderColor: color, borderStyle: d.future ? "dashed" : "solid", ["--i" as string]: i }} />}
                {d.doneKm > 0 && <div className="rise absolute inset-x-0 bottom-0" style={{ height: h(d.doneKm), background: color, ["--i" as string]: i }} />}
                {d.strength && <span className="absolute inset-x-0 top-0 mx-auto h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-strength)" }} />}
              </div>
              <div className={`mt-1.5 text-center text-xs font-semibold sm:text-sm ${d.today ? "" : "text-muted"}`}><span className={d.today ? "mark" : ""}>{d.dow}</span></div>
              <div className="text-center text-xs text-muted tnum">{d.doneKm ? d.doneKm.toFixed(1) : d.plannedKm ? d.plannedKm : "rest"}</div>
            </>
          );
          return <li key={d.date}>{d.href ? <Link href={d.href} aria-label={label} className="block">{body}</Link> : <div role="img" aria-label={label}>{body}</div>}</li>;
        })}
      </ol>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2">
        {kinds.filter((k) => k !== "strength").map((k) => <span key={k} className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5" style={{ background: EFFORT[k].color }} />{EFFORT[k].label}</span>)}
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 border-2 border-dashed border-muted" />Still to run</span>
        {days.some((d) => d.strength) && <span className="inline-flex items-center gap-1.5"><i className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-strength)" }} />Strength</span>}
        {caption && <span className="ml-auto">{caption}</span>}
      </div>
    </section>
  );
}
