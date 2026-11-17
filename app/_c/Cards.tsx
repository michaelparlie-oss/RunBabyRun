import Link from "next/link";
import type { Ctx } from "@/lib/server/view";
import type { Session, StrengthTemplate } from "@/lib/types";
import { EXERCISES } from "@/lib/strength/library";
import { fmtDate, weekdayShort } from "@/lib/util/dates";
import { fmtDuration, fmtKm, fmtPace } from "@/lib/util/format";
import { toggleStrength } from "@/app/actions";
import { Submit } from "./Forms";
import { SegmentList, StatusPill, TargetBadge } from "./ui";

export function RunCard({ s, c, full = false }: { s: Session; c: Ctx; full?: boolean }) {
  const st = c.status.get(s.id) ?? "pending";
  const a = c.actFor.get(s.id);
  return (
    <article className="card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="kicker">{weekdayShort(s.date)} {fmtDate(s.date)} · Week {s.week} · {s.phase}{s.deload ? " · easier week" : ""}</div>
          <h3 className="text-lg font-extrabold leading-snug">{s.title}</h3>
          <div className="mt-0.5 text-sm text-muted tnum">{fmtKm(s.distance_km)}{s.est_duration_min ? ` · about ${s.est_duration_min} min` : ""}{s.optional ? " · optional" : ""}</div>
        </div>
        <StatusPill status={st} />
      </div>
      <div className="mt-2"><TargetBadge kind={s.kind} /></div>
      {full && c.zones && <SegmentList segments={s.segments} zones={c.zones} />}
      {full && s.summary && <p className="mt-3 text-sm text-ink-2">{s.summary}</p>}
      {a && <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm tnum">You ran {fmtKm(a.distance_m / 1000)} in {fmtDuration(a.moving_time_s)} ({fmtPace(a.moving_time_s / (a.distance_m / 1000))} /km){a.avg_hr ? `, average HR ${Math.round(a.avg_hr)}` : ""}.</p>}
      <div className="mt-3"><Link href={`/session/${s.id}`} className="text-sm font-semibold text-accent hover:underline">{a ? "See how it went →" : "Session details →"}</Link></div>
    </article>
  );
}

export function sets(n: number, deload: boolean, template: string) {
  return deload && template !== "mobility" && template !== "taper" ? Math.ceil(n / 2) : n;
}

export function StrengthTable({ t, deload, template }: { t: StrengthTemplate; deload: boolean; template: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="tbl">
        <thead><tr><th>Exercise</th><th>Sets × reps</th><th>Rest</th><th>Effort</th></tr></thead>
        <tbody>
          {t.items.map((it, i) => (
            <tr key={i}>
              <td><Link href={`/library#${it.exercise}`} className="font-semibold text-accent hover:underline">{EXERCISES[it.exercise]?.name ?? it.exercise}</Link>{it.note && <div className="text-xs text-muted">{it.note}</div>}</td>
              <td>{sets(it.sets, deload, template)} × {it.reps}</td>
              <td>{it.rest_s ? `${it.rest_s} s` : "–"}</td>
              <td>{it.rpe ? `RPE ${it.rpe}` : "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StrengthCard({ s, c }: { s: Session; c: Ctx }) {
  const t = c.plan?.templates[s.template ?? ""];
  const st = c.status.get(s.id) ?? "pending";
  return (
    <article className="card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="kicker">{weekdayShort(s.date)} {fmtDate(s.date)} · strength</div>
          <h3 className="text-lg font-extrabold leading-snug">{s.title}</h3>
          {t && <div className="mt-0.5 text-sm text-muted">About {t.minutes} min · {t.items.length} exercises</div>}
        </div>
        <StatusPill status={st} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Link href={`/strength/${s.id}`} className="btn">Open the menu</Link>
        <form action={toggleStrength}><input type="hidden" name="id" value={s.id} /><Submit className="btn" pendingText="Saving…">{st === "done" ? "Mark as not done" : "Mark as done"}</Submit></form>
      </div>
    </article>
  );
}
