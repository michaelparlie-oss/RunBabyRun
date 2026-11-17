import { redirect } from "next/navigation";
import Link from "next/link";
import { LoadRatio, PaceBands, PaceHeart, PaceTrend, VolumeBars, type Bucket, type RunPoint, type WeekPoint } from "@/app/_c/Charts";
import { EFFORT, effortOf } from "@/app/_c/effort";
import { WeeklyChart } from "@/app/_c/WeeklyChart";
import { analyse, efficiencyOf, measured, paceOf } from "@/lib/analysis";
import { PageTitle, Panel } from "@/app/_c/ui";
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
  // ---- analysis of recorded runs ----
  const an = analyse(c.acts, c.today);
  const day0 = addDays(c.today, -120);
  const ms = c.acts.filter((a) => measured(a) && a.local_date >= day0 && a.local_date <= c.today);
  const med = (xs: number[]) => { const v = [...xs].sort((x, y) => x - y); return v.length ? v[v.length >> 1] : null; };
  const points: RunPoint[] = ms.map((a) => {
    const window = ms.filter((b) => { const g = diffDays(b.local_date, a.local_date); return g >= 0 && g < 28; }).map((b) => paceOf(b)!);
    return { day: diffDays(day0, a.local_date), label: fmtDate(a.local_date), pace: paceOf(a)!, trend: window.length >= 3 ? med(window) : null, hr: a.avg_hr, km: a.distance_m / 1000, recent: diffDays(a.local_date, c.today) < 28 };
  });
  const weeksPts: WeekPoint[] = an.blocks.map((b) => ({ label: fmtDate(b.end), km: Math.round(b.km * 10) / 10, longest: Math.round(b.longest * 10) / 10, ratio: b.ratio == null ? null : Math.round(b.ratio * 100) / 100 }));
  const lo = ms.length ? Math.floor(Math.min(...ms.map((a) => paceOf(a)!)) / 15) * 15 : 0, hi = ms.length ? Math.max(...ms.map((a) => paceOf(a)!)) : 0;
  const buckets: Bucket[] = [];
  for (let p0 = lo; ms.length && p0 <= hi && buckets.length < 24; p0 += 15) buckets.push({ label: fmtPace(p0), n: ms.filter((a) => { const p = paceOf(a)!; return p >= p0 && p < p0 + 15; }).length, mid: an.pace28 != null && an.pace28 >= p0 && an.pace28 < p0 + 15 });
  const effDelta = an.efficiency28 && an.efficiency_prev ? (an.efficiency28 / an.efficiency_prev - 1) * 100 : null;
  const ratioWord = an.load_ratio == null ? "not enough history" : an.load_ratio > 1.5 ? "sharp jump: ease off" : an.load_ratio > 1.3 ? "above your norm" : an.load_ratio < 0.8 ? "below your norm" : "steady";
  const byKind = (["easy", "long", "quality", "test"] as const).map((k) => {
    const got = c.sessions.filter((s) => s.kind === k && c.actFor.has(s.id)).map((s) => c.actFor.get(s.id)!).filter(measured);
    return { k, n: got.length, pace: med(got.map((a) => paceOf(a)!)), hr: med(got.filter((a) => a.avg_hr).map((a) => a.avg_hr!)), km: got.reduce((t, a) => t + a.distance_m / 1000, 0) };
  }).filter((r) => r.n > 0);
  const recentRuns = [...c.acts].filter((a) => a.local_date <= c.today).slice(-12).reverse();
  const sessionOf = new Map([...c.actFor.entries()].map(([sid, a]) => [a.id, c.sessions.find((s) => s.id === sid)]));
  const Stat = ({ label, value, unit, sub, tint }: { label: string; value: React.ReactNode; unit?: string; sub?: string; tint?: string }) => (
    <div className="stat" style={tint ? { ["--tint" as string]: tint } : undefined}>
      <div className="text-xs font-semibold text-ink-2">{label}</div>
      <div className="numeral mt-0.5">{value}{unit && <span className="ml-1 font-sans text-xs font-semibold text-ink-2">{unit}</span>}</div>
      {sub && <div className="text-xs text-ink-2">{sub}</div>}
    </div>
  );

  return (
    <>
      <PageTitle title="Analysis" sub={`${diffDays(c.today, c.plan.race_date)} days to ${c.profile.race.name || race.label}. ${ms.length} timed runs in the last 120 days.`}
        actions={<><a href="/api/export?format=csv" className="btn">Export runs (CSV)</a><a href="/api/export?format=plan" className="btn">Export plan (CSV)</a></>} />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        <Stat label="Last 7 days" value={an.acute7.toFixed(1)} unit="km" tint="var(--color-long)" />
        <Stat label="4-week average" value={an.mean4.toFixed(1)} unit="km/wk" sub={`8-week: ${an.mean8.toFixed(1)}`} tint="var(--color-long)" />
        <Stat label="Load ratio" value={an.load_ratio == null ? "–" : an.load_ratio.toFixed(2)} sub={ratioWord} tint={an.load_ratio != null && an.load_ratio > 1.3 ? "var(--color-hard)" : "var(--color-easy)"} />
        <Stat label="Runs per week" value={an.runs_per_week.toFixed(1)} sub={`active ${an.active_weeks8} of 8 weeks`} tint="var(--color-easy)" />
        <Stat label="Median pace, 28 d" value={an.pace28 ? fmtPace(an.pace28) : "–"} unit="/km" tint="var(--color-test)" />
        <Stat label="Median heart rate" value={an.hr28 ? Math.round(an.hr28) : "–"} unit="bpm" tint="var(--color-hard)" />
        <Stat label="Efficiency" value={an.efficiency28 ? an.efficiency28.toFixed(2) : "–"} unit="m/beat" sub={effDelta == null ? "needs heart-rate data" : `${effDelta >= 0 ? "+" : ""}${effDelta.toFixed(1)}% vs prior 28 d`} tint="var(--color-test)" />
        <Stat label={`Predicted ${race.short}`} value={fmtDuration(pred)} sub={`${fmtPace(pred / race.km)} /km`} tint="var(--color-race)" />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Pace trend" sub="Each dot is a run. The line is the 28-day rolling median. Higher is faster.">
          {points.length >= 3 ? <PaceTrend runs={points} /> : <p className="text-sm text-muted">Needs at least three timed runs. Runs only marked as done have no pace.</p>}
        </Panel>
        <Panel title="Pace against heart rate" sub="Pink is the last 28 days, grey is older. Bigger dots are longer runs. Up and to the left means fitter.">
          {points.filter((r) => r.hr).length >= 3 ? <PaceHeart runs={points} /> : <p className="text-sm text-muted">Needs at least three runs with heart-rate data.</p>}
        </Panel>
        <Panel title="Weekly distance and longest run" sub="Rolling 7-day blocks ending today. The darker part of each bar is that week's longest run.">
          <VolumeBars weeks={weeksPts} />
        </Panel>
        <Panel title="Load ratio" sub="Each week's distance divided by the average of the four weeks ending with it. The green band (0.8 to 1.3) is a rough guide only: researchers disagree on how well this ratio predicts injury.">
          <LoadRatio weeks={weeksPts} />
        </Panel>
        <Panel title="Pace distribution" sub="Number of runs in each 15-second pace band over 120 days. The darker bar holds your 28-day median.">
          {buckets.length ? <PaceBands buckets={buckets} /> : <p className="text-sm text-muted">No timed runs yet.</p>}
        </Panel>
        <Panel title="Plan against actual" sub="Planned distance and what was recorded, by plan week.">
          <WeeklyChart rows={rows} thisMon={thisMon} />
        </Panel>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        <Panel title="By session type" sub="Median pace and heart rate of runs matched to the plan.">
          {byKind.length === 0 ? <p className="text-sm text-muted">Appears once runs are matched to planned sessions.</p> : (
            <table className="tbl">
              <thead><tr><th>Type</th><th className="num">Runs</th><th className="num">km</th><th className="num">Pace /km</th><th className="num">HR</th></tr></thead>
              <tbody>{byKind.map((r) => <tr key={r.k}><td><i className="mr-2 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: EFFORT[r.k].color, outline: `1px solid ${EFFORT[r.k].ink}` }} />{EFFORT[r.k].label}</td><td className="num">{r.n}</td><td className="num">{r.km.toFixed(1)}</td><td className="num">{r.pace ? fmtPace(r.pace) : "–"}</td><td className="num">{r.hr ? Math.round(r.hr) : "–"}</td></tr>)}</tbody>
            </table>
          )}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Stat label="Runs completed" value={pct(done, due.length)} sub={`${done} of ${due.length} planned`} />
            <Stat label="Strength completed" value={pct(strengthDone, strengthDue.length)} sub={`${strengthDone} of ${strengthDue.length}`} />
          </div>
        </Panel>
        <Panel title="Recent runs" sub="Efficiency is metres covered per heartbeat.">
          {recentRuns.length === 0 ? <p className="text-sm text-muted">No runs yet.</p> : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr><th>Date</th><th>Planned as</th><th className="num">km</th><th className="num">Time</th><th className="num">Pace /km</th><th className="num">HR</th><th className="num">Eff.</th></tr></thead>
                <tbody>
                  {recentRuns.map((a) => { const s = sessionOf.get(a.id); const e = efficiencyOf(a); const p = paceOf(a); return (
                    <tr key={a.id}>
                      <td className="whitespace-nowrap">{s ? <Link href={`/session/${s.id}`} className="underline underline-offset-4">{fmtDate(a.local_date)}</Link> : fmtDate(a.local_date)}</td>
                      <td>{s ? EFFORT[effortOf(s)].label : "extra run"}</td><td className="num">{(a.distance_m / 1000).toFixed(1)}</td>
                      <td className="num">{a.manual === "ticked" ? "marked done" : fmtDuration(a.moving_time_s)}</td><td className="num">{a.manual === "ticked" || !p ? "–" : fmtPace(p)}</td>
                      <td className="num">{a.avg_hr ? Math.round(a.avg_hr) : "–"}</td><td className="num">{e ? e.toFixed(2) : "–"}</td>
                    </tr>
                  ); })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

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
