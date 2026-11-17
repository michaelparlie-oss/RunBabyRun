import Link from "next/link";
import type { Ctx } from "@/lib/server/view";
import type { Session, StrengthTemplate } from "@/lib/types";
import { EXERCISES } from "@/lib/strength/library";
import { fmtDate, weekdayShort } from "@/lib/util/dates";
import { fmtDuration, fmtKm, fmtPace } from "@/lib/util/format";
import { toggleStrength } from "@/app/actions";
import { Submit } from "./Forms";
import { EFFORT, effortOf } from "./effort";
import { SegmentList, StatusPill, TargetBadge } from "./ui";

const when = (s: Session) => `${weekdayShort(s.date)} ${fmtDate(s.date)}, week ${s.week}, ${s.phase.toLowerCase()}${s.deload ? ", easier week" : ""}`;

function Ran({ a }: { a: NonNullable<ReturnType<Ctx["actFor"]["get"]>> }) {
  return <>You ran {fmtKm(a.distance_m / 1000)} in {fmtDuration(a.moving_time_s)} ({fmtPace(a.moving_time_s / (a.distance_m / 1000))} /km){a.avg_hr ? `, average heart rate ${Math.round(a.avg_hr)}` : ""}.</>;
}

/** Today's run, set like a race bib: the one loud block on the page. */
export function RunHero({ s, c }: { s: Session; c: Ctx }) {
  const st = c.status.get(s.id) ?? "pending";
  const a = c.actFor.get(s.id);
  const e = EFFORT[effortOf(s)];
  return (
    <article className="overflow-hidden rounded-[10px] border border-line" style={{ background: e.color }}>
      <div className="px-4 pb-4 pt-4 lg:px-6 lg:pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold">
          <span>{e.label} run, {when(s)}</span>
          <StatusPill status={st} />
        </div>
        <h2 className="display mt-3 text-5xl sm:text-6xl lg:text-7xl">{s.title}</h2>
        <p className="mt-3 text-lg tnum">{fmtKm(s.distance_km)}{s.est_duration_min ? `, about ${s.est_duration_min} min` : ""}{s.optional ? ", optional" : ""}</p>
      </div>
      <div className="bg-hivis px-4 py-2.5 text-base font-semibold text-ink lg:px-6">{s.kind === "race" ? "Race day: follow the pacing notes" : s.kind === "test" ? "Test day: even, honest effort" : s.kind === "easy" || s.kind === "long" ? "Heart rate decides today: keep it easy" : "Pace decides today: heart rate is a ceiling"}</div>
      <div className="bg-card px-4 pb-4 pt-1 text-ink lg:px-6">
        {c.zones && <SegmentList segments={s.segments} zones={c.zones} />}
        {s.summary && <p className="mt-3 max-w-prose text-sm text-ink-2">{s.summary}</p>}
        {a && <p className="mt-3 border-l-4 border-good bg-wash px-3 py-2 text-sm tnum"><Ran a={a} /></p>}
        <div className="mt-4"><Link href={`/session/${s.id}`} className="btn">{a ? "See how it went" : "Open this session"}</Link></div>
      </div>
    </article>
  );
}

export function RunCard({ s, c, full = false }: { s: Session; c: Ctx; full?: boolean }) {
  const st = c.status.get(s.id) ?? "pending";
  const a = c.actFor.get(s.id);
  const e = EFFORT[effortOf(s)];
  return (
    <article className="card lane" style={{ ["--lane" as string]: e.color }}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="kicker">{e.label} run, {when(s)}</div>
          <h3 className="mt-1 text-2xl font-bold uppercase">{s.title}</h3>
          <div className="mt-1 text-sm text-ink-2 tnum">{fmtKm(s.distance_km)}{s.est_duration_min ? `, about ${s.est_duration_min} min` : ""}{s.optional ? ", optional" : ""}</div>
        </div>
        <StatusPill status={st} />
      </div>
      {full && <div className="mt-2"><TargetBadge kind={s.kind} /></div>}
      {full && c.zones && <SegmentList segments={s.segments} zones={c.zones} />}
      {full && s.summary && <p className="mt-3 max-w-prose text-sm text-ink-2">{s.summary}</p>}
      {a && <p className="mt-3 border-l-4 border-good bg-wash px-3 py-2 text-sm tnum"><Ran a={a} /></p>}
      <div className="mt-3"><Link href={`/session/${s.id}`} className="text-sm font-semibold underline underline-offset-4">{a ? "See how it went" : "Session details"}</Link></div>
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
              <td><Link href={`/library#${it.exercise}`} className="font-semibold underline underline-offset-4">{EXERCISES[it.exercise]?.name ?? it.exercise}</Link>{it.note && <div className="text-xs text-muted">{it.note}</div>}</td>
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
    <article className="card lane">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="kicker">Strength, {weekdayShort(s.date)} {fmtDate(s.date)}</div>
          <h3 className="mt-1 text-2xl font-bold uppercase">{s.title}</h3>
          {t && <div className="mt-1 text-sm text-ink-2">About {t.minutes} min, {t.items.length} exercises</div>}
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
