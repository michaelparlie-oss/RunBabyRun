import Link from "next/link";
import { redirect } from "next/navigation";
import { Flash, Kpi, NoticeBox, PageTitle, Panel } from "@/app/_c/ui";
import { loadCtx } from "@/lib/server/view";
import { requireUser } from "@/lib/session";
import { ZONE_CODES } from "@/lib/types";
import { addDays, fmtDate, mondayOf } from "@/lib/util/dates";
import { fmtDuration, fmtHrRange, fmtPace, fmtPaceRange } from "@/lib/util/format";

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ new?: string; rebuilt?: string }> }) {
  const c = await loadCtx(await requireUser());
  if (!c.plan || !c.zones || !c.profile) redirect("/start");
  const q = await searchParams;
  const { plan, zones } = c;
  const s = plan.summary;
  const thisMon = mondayOf(c.today);
  const ref = c.profile.fitness;
  return (
    <>
      <PageTitle title="Your plan" sub={s.race_label} />
      {q.new && <div className="mb-4"><Flash ok>Your plan is ready. Read the notes below once, then head to Today.</Flash></div>}
      {q.rebuilt && <div className="mb-4"><Flash ok>Plan rebuilt from today using your recent training.</Flash></div>}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Length" value={s.weeks} unit="weeks" />
        <Kpi label="Biggest week" value={s.peak_km} unit="km" />
        <Kpi label="Longest run" value={s.peak_long_km} unit="km" />
        <Kpi label={s.goal_time_s ? "Goal" : "Predicted today"} value={fmtDuration(s.goal_time_s ?? s.predicted_time_s)} sub={`${fmtPace(s.goal_pace_s_per_km)} /km training race pace`} />
      </div>
      {plan.notices.length > 0 && <div className="mb-4 space-y-3">{plan.notices.map((n, i) => <NoticeBox key={i} n={n} />)}</div>}

      <Panel title="Your paces and heart-rate ranges" sub={`From ${ref.ref_source === "estimate" ? "a starting estimate" : `${ref.ref_distance_km} km in ${fmtDuration(ref.ref_time_s)}`}${ref.ref_source === "strava" ? " (your fastest recent Strava run)" : ""}. Update them in Settings after a race or time trial.`} className="mb-4">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Effort</th><th>Pace /km</th><th>Heart rate</th><th>How it feels</th></tr></thead>
            <tbody>
              {ZONE_CODES.filter((z) => z !== "RACE").map((z) => (
                <tr key={z}><td className="font-semibold">{zones[z].name}</td><td>{fmtPaceRange(zones[z].pace_min_s_per_km, zones[z].pace_max_s_per_km)?.replace(" /km", "") ?? "by effort"}</td><td>{fmtHrRange(zones[z].hr_min, zones[z].hr_max) ?? "–"}</td><td className="min-w-56 text-ink-2">{zones[z].feel}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Week by week">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Week</th><th>Starts</th><th>Phase</th><th className="num">Planned km</th><th className="num">Long run</th><th className="num">Run km</th></tr></thead>
            <tbody>
              {plan.weeks.map((w) => {
                const actual = c.acts.filter((a) => a.local_date >= w.start && a.local_date < addDays(w.start, 7)).reduce((t, a) => t + a.distance_m / 1000, 0);
                return (
                  <tr key={w.n} className={w.start === thisMon ? "bg-accent-soft" : ""}>
                    <td><Link href={`/week?w=${w.n}`} className="font-semibold text-accent hover:underline">Week {w.n}</Link>{w.start === thisMon ? " (now)" : ""}</td>
                    <td>{fmtDate(w.start)}</td><td>{w.phase}{w.deload ? " · easier" : ""}</td>
                    <td className="num">{w.planned_km}</td><td className="num">{w.long_km || "–"}</td><td className="num">{w.start <= c.today ? actual.toFixed(1) : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
