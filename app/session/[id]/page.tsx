import { notFound, redirect } from "next/navigation";
import { toggleSkip } from "@/app/actions";
import { PainForm, Submit } from "@/app/_c/Forms";
import { PageTitle, Panel, ScoreRing, SegmentList, StatusPill, TargetBadge } from "@/app/_c/ui";
import { scoreRun } from "@/lib/match/score";
import { NIGGLES } from "@/lib/screening";
import { loadCtx, toAct } from "@/lib/server/view";
import { requireUser } from "@/lib/session";
import { ensureDetail } from "@/lib/strava/sync";
import { fmtDate, weekdayShort } from "@/lib/util/dates";
import { fmtDuration, fmtKm, fmtPace } from "@/lib/util/format";

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const uid = await requireUser();
  const c = await loadCtx(uid);
  if (!c.plan || !c.zones) redirect("/start");
  const s = c.sessions.find((x) => x.id === id);
  if (!s) notFound();
  if (s.category !== "run") redirect(`/strength/${s.id}`);
  const st = c.status.get(s.id) ?? "pending";
  const a = c.actFor.get(s.id);
  const detail = a ? await ensureDetail(uid, a.id) : null;
  const score = a ? scoreRun(s, { ...toAct(a), laps: detail?.laps ?? null, streams: detail?.streams ?? null }, c.zones) : null;
  const reps = score?.details.reps.reps ?? [];
  const canSkip = !a && s.date >= c.today && s.kind !== "race";
  return (
    <>
      <PageTitle title={s.title} sub={`${weekdayShort(s.date)} ${fmtDate(s.date)}, Week ${s.week}, ${s.phase}${s.deload ? ", easier week" : ""}`} back={`/week?w=${c.plan.weeks.some((w) => w.n === s.week && c.plan!.sessions.some((x) => x.id === s.id)) ? s.week : ""}`} actions={<StatusPill status={st} />} />
      <Panel className="mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <TargetBadge kind={s.kind} />
          <span className="text-sm text-muted tnum">{fmtKm(s.distance_km)}{s.est_duration_min ? `, about ${s.est_duration_min} min` : ""}</span>
        </div>
        <SegmentList segments={s.segments} zones={c.zones} />
        {s.summary && <p className="mt-3 text-sm text-ink-2">{s.summary}</p>}
      </Panel>

      {a && score && (
        <Panel title="How it went" sub={<>{a.name}, {fmtKm(a.distance_m / 1000)} in {fmtDuration(a.moving_time_s)}, {fmtPace(a.moving_time_s / (a.distance_m / 1000))} /km{a.avg_hr ? `, average HR ${Math.round(a.avg_hr)}` : ""}</>} className="mb-4"
          right={<a href={`https://www.strava.com/activities/${a.id}`} target="_blank" rel="noreferrer" className="text-sm font-semibold underline" style={{ color: "#fc4c02" }}>View on Strava</a>}>
          <div className="flex justify-around rounded-[4px] bg-wash py-4">
            <ScoreRing score={score.overall_score} label="overall" />
            <ScoreRing score={score.distance_score} label="distance" />
            <ScoreRing score={score.hr_score} label="heart rate" />
            <ScoreRing score={score.pace_score} label="pace" />
          </div>
          <p className="mt-3 font-medium">{score.verdict}</p>
          {score.details.flags.map((f, i) => <p key={i} className="mt-1 text-sm text-amber-800">{f}</p>)}
          {reps.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <table className="tbl">
                <thead><tr><th>#</th><th>Target /km</th><th>Actual /km</th><th>HR</th><th>Result</th></tr></thead>
                <tbody>
                  {reps.map((r) => (
                    <tr key={r.rep_no}>
                      <td>{r.rep_no}</td><td>{r.target_min != null ? `${fmtPace(r.target_min)}–${fmtPace(r.target_max)}` : "–"}</td><td className="font-semibold">{fmtPace(r.pace_s_per_km)}</td>
                      <td>{r.avg_hr ? Math.round(r.avg_hr) : "–"}{r.hr_max ? ` / ${r.hr_max}` : ""}</td>
                      <td>{r.in_range == null ? "–" : r.in_range ? "On target" : `${Math.abs(Math.round(r.delta_s!))} s ${r.delta_s! < 0 ? "fast" : "slow"}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 text-xs text-muted">Reps found from {score.details.reps.method === "laps" ? "your watch laps" : "the GPS data"}.</p>
            </div>
          )}
          {!detail && <p className="mt-2 text-xs text-muted">Detailed data from Strava isn&apos;t available right now, so this uses the summary only. Reload later for the full check.</p>}
        </Panel>
      )}

      {s.date <= c.today && (
        <Panel title="Any pain?" sub="A 0–10 score after a run helps catch problems early. Above 3 changes the advice on Today." className="mb-4">
          <PainForm areas={NIGGLES as unknown as string[]} date={s.date} />
        </Panel>
      )}
      {(canSkip || s.skipped) && (
        <form action={toggleSkip} className="card flex flex-wrap items-end gap-3">
          <input type="hidden" name="id" value={s.id} />
          {!s.skipped && <label className="block flex-1 text-sm font-medium">Can&apos;t do this one?<input name="reason" maxLength={120} placeholder="Reason (optional): travel, ill, tired…" className="input mt-1" /></label>}
          <Submit className="btn" pendingText="Saving…">{s.skipped ? "Un-skip this session" : "Skip this session"}</Submit>
          {!s.skipped && <p className="w-full text-xs text-muted">Skipped sessions don&apos;t count as missed. Don&apos;t make them up on a rest day.</p>}
        </form>
      )}
    </>
  );
}
