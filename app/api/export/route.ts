import { NextResponse, type NextRequest } from "next/server";
import { efficiencyOf, paceOf } from "@/lib/analysis";
import { currentUser } from "@/lib/session";
import { loadCtx } from "@/lib/server/view";

/** Everything stored about the signed-in runner, minus Strava tokens and keys. */
const cell = (v: unknown) => { const t = v == null ? "" : String(v); const safe = /^[=+\-@\t\r]/.test(t) ? `'${t}` : t; return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe; };
const csv = (name: string, head: string[], rows: unknown[][]) => new NextResponse("\ufeff" + [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n", {
  headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
});
const hms = (s: number) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const pace = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/**
 * ?format=csv  every stored run, one row each, with the planned session it was matched to
 * ?format=plan every planned session with its status and what was actually run
 * default      everything as JSON
 */
export async function GET(req: NextRequest) {
  const uid = await currentUser();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const c = await loadCtx(uid);
  const format = req.nextUrl.searchParams.get("format");
  if (format === "csv") {
    const sessionOf = new Map([...c.actFor.entries()].map(([sid, a]) => [a.id, c.sessions.find((s) => s.id === sid)]));
    return csv("runbabyrun-runs.csv", ["date", "start_time_local", "name", "source", "distance_km", "moving_time", "moving_time_s", "pace_per_km", "avg_hr", "max_hr", "efficiency_m_per_beat", "planned_session", "planned_type", "planned_km", "plan_week"],
      c.acts.map((a) => { const s = sessionOf.get(a.id), p = paceOf(a), e = efficiencyOf(a), ticked = a.manual === "ticked"; return [
        a.local_date, a.start_date_local.slice(11, 19), a.name, a.manual ? (ticked ? "marked done (planned distance)" : "entered by hand") : "strava", (a.distance_m / 1000).toFixed(2),
        ticked ? "" : hms(a.moving_time_s), ticked ? "" : a.moving_time_s, ticked || !p ? "" : pace(p), a.avg_hr != null ? Math.round(a.avg_hr) : "", a.max_hr != null ? Math.round(a.max_hr) : "", e ? e.toFixed(3) : "",
        s?.title ?? "", s?.kind ?? "", s?.distance_km ?? "", s?.week ?? "",
      ]; }));
  }
  if (format === "plan") {
    return csv("runbabyrun-plan.csv", ["date", "week", "phase", "category", "type", "title", "planned_km", "planned_min", "status", "actual_km", "actual_time", "actual_pace_per_km", "actual_avg_hr"],
      c.sessions.map((s) => { const a = c.actFor.get(s.id), p = a ? paceOf(a) : null, timed = a && a.manual !== "ticked"; return [
        s.date, s.week, s.phase, s.category, s.kind ?? "", s.title, s.distance_km ?? "", s.est_duration_min ?? "", s.skipped ? "skipped" : (c.status.get(s.id) ?? "pending"),
        a ? (a.distance_m / 1000).toFixed(2) : "", timed ? hms(a.moving_time_s) : "", timed && p ? pace(p) : "", a?.avg_hr != null ? Math.round(a.avg_hr) : "",
      ]; }));
  }
  const account = c.user && { email: c.user.email, name: c.user.name, runs_from: c.user.source, created_at: c.user.created_at };
  const strava = c.account && { athlete_id: c.account.athlete_id, firstname: c.account.firstname, lastname: c.account.lastname, created_at: c.account.created_at, mode: c.account.mode };
  return new NextResponse(JSON.stringify({ exported_at: new Date().toISOString(), account, strava, profile: c.profile, plan: c.plan, activities: c.acts, logs: c.logs }, null, 1), {
    headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="runbabyrun-export.json"', "Cache-Control": "no-store" },
  });
}
