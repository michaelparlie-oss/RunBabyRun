import { redirect } from "next/navigation";
import { WeeklyChart } from "@/app/_c/WeeklyChart";
import { Kpi, PageTitle, Panel } from "@/app/_c/ui";
import { loadCtx } from "@/lib/server/view";
import { requireUser } from "@/lib/session";
import { addDays, diffDays, fmtDate, mondayOf } from "@/lib/util/dates";
import { fmtDuration, fmtPace } from "@/lib/util/format";
import { predictedRaceS, RACES } from "@/lib/zones";

export default async function ProgressPage() {
  const c = await loadCtx(await requireUser());
  if (!c.plan || !c.profile) redirect("/start");
  const thisMon = mondayOf(c.today);
  // Every Monday from the first planned session (including history from before a rebuild) to the end of the plan.
  const firstMon = mondayOf(c.sessions[0]?.date ?? c.plan.start);
  const lastMon = c.plan.weeks[c.plan.weeks.length - 1].start;
  const rows = [] as { start: string; planned: number; actual: number; long: number; future: boolean }[];
  for (let m = firstMon; m <= lastMon; m = addDays(m, 7)) {
    const end = addDays(m, 7);
    const planned = c.sessions.filter((s) => s.category === "run" && !s.optional && s.date >= m && s.date < end).reduce((t, s) => t + (s.distance_km ?? 0), 0);
    const runs = c.acts.filter((a) => a.local_date >= m && a.local_date < end);
    rows.push({ start: m, planned, actual: runs.reduce((t, a) => t + a.distance_m / 1000, 0), long: Math.max(0, ...runs.map((a) => a.distance_m / 1000)), future: m > thisMon });
  }
  const due = c.sessions.filter((s) => s.category === "run" && !s.optional && s.date < c.today && !s.skipped);
  const done = due.filter((s) => ["done", "partial"].includes(c.status.get(s.id) ?? "")).length;
  const strengthDue = c.sessions.filter((s) => s.category === "strength" && s.date < c.today && !s.skipped);
  const strengthDone = strengthDue.filter((s) => c.status.get(s.id) === "done").length;
  const last28 = c.acts.filter((a) => { const g = diffDays(a.local_date, c.today); return g >= 0 && g < 28; });
  const longest30 = Math.max(0, ...c.acts.filter((a) => { const g = diffDays(a.local_date, c.today); return g >= 0 && g <= 30; }).map((a) => a.distance_m / 1000));
  const race = RACES[c.profile.race.key];
  const pred = predictedRaceS(c.profile);
  const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "–");
  return (
    <>
      <PageTitle title="Progress" sub={`${diffDays(c.today, c.plan.race_date)} days to ${c.profile.race.name || race.label}`} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Runs completed" value={pct(done, due.length)} sub={`${done} of ${due.length} planned so far`} />
        <Kpi label="Strength completed" value={pct(strengthDone, strengthDue.length)} sub={`${strengthDone} of ${strengthDue.length}`} />
        <Kpi label="Last 4 weeks" value={(last28.reduce((t, a) => t + a.distance_m / 1000, 0) / 4).toFixed(1)} unit="km / week" sub={`Longest run in 30 days: ${longest30.toFixed(1)} km`} />
        <Kpi label={`Predicted ${race.short}`} value={fmtDuration(pred)} sub={`${fmtPace(pred / race.km)} /km, from your reference result`} />
      </div>

      <Panel title="Weekly distance" sub="Planned against what Strava recorded. The aim is to be close to the plan, not above it." className="mb-4">
        <div className="mb-2 flex gap-4 text-xs text-muted">
          <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: "var(--color-grid)", outline: "1px solid var(--color-axis)" }} />Planned</span>
          <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: "var(--color-series-1)" }} />Run</span>
        </div>
        <WeeklyChart rows={rows} thisMon={thisMon} />
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-semibold text-muted">Show as a table</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Week of</th><th className="num">Planned</th><th className="num">Run</th><th className="num">Longest</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.start} className={r.start === thisMon ? "bg-hivis/40" : ""}>
                    <td className="whitespace-nowrap">{fmtDate(r.start)}</td>
                    <td className="num">{r.planned.toFixed(1)}</td><td className="num">{r.future ? "" : r.actual.toFixed(1)}</td><td className="num">{r.future || !r.long ? "" : r.long.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Race and time-trial results" sub="Add a new one in Settings to update your paces.">
          {c.logs.results.length === 0 ? <p className="text-sm text-muted">Nothing logged yet. Your plan includes a 5 km time trial every few weeks once your long run is far enough along.</p> : (
            <table className="tbl"><thead><tr><th>Date</th><th>Distance</th><th>Time</th><th>Pace /km</th></tr></thead>
              <tbody>{[...c.logs.results].reverse().map((r, i) => <tr key={i}><td>{fmtDate(r.date)}</td><td>{+r.distance_km.toFixed(1)} km</td><td>{fmtDuration(r.time_s)}</td><td>{fmtPace(r.time_s / r.distance_km)}</td></tr>)}</tbody></table>
          )}
        </Panel>
        <Panel title="Pain log" sub="Scores above 3 out of 10 change the advice on Today.">
          {c.logs.wellbeing.length === 0 ? <p className="text-sm text-muted">No entries. Log a score from any run page or from Settings.</p> : (
            <table className="tbl"><thead><tr><th>Date</th><th>Where</th><th className="num">Pain</th><th>Note</th></tr></thead>
              <tbody>{[...c.logs.wellbeing].reverse().slice(0, 20).map((w, i) => <tr key={i}><td className="whitespace-nowrap">{fmtDate(w.date)}</td><td>{w.area}</td><td className={`num ${w.pain > 3 ? "font-bold text-red-700" : ""}`}>{w.pain}</td><td className="text-ink-2">{w.note}</td></tr>)}</tbody></table>
          )}
        </Panel>
      </div>
    </>
  );
}
