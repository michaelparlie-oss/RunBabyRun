import { matchRuns } from "@/lib/match/match";
import type { Act, MatchStatus } from "@/lib/match/types";
import { spikeCap } from "@/lib/plan/generate";
import { getStore } from "@/lib/storage";
import { emptyLogs, type Account, type ActSummary, type User, type Logs, type Notice, type Plan, type Profile, type Session, type Zones } from "@/lib/types";
import { addDays, diffDays, fmtDate, mondayOf, todayLocal } from "@/lib/util/dates";
import { computeZones } from "@/lib/zones";

export interface Ctx {
  uid: number;
  user: User | null;
  account: Account | null;
  profile: Profile | null;
  plan: Plan | null;
  acts: ActSummary[];
  logs: Logs;
  today: string;
  zones: Zones | null;
  sessions: Session[]; // past + current, with skips applied
  status: Map<string, MatchStatus["status"]>;
  actFor: Map<string, ActSummary>;
  extras: ActSummary[];
}

export const toAct = (a: ActSummary): Act => ({ ...a, laps: null, streams: null });

export async function loadCtx(uid: number): Promise<Ctx> {
  const store = await getStore();
  const o = String(uid);
  const [user, account, profile, plan, acts, logs] = await Promise.all([
    store.get<User>(o, "user"), store.get<Account>(o, "account"), store.get<Profile>(o, "profile"), store.get<Plan>(o, "plan"), store.get<ActSummary[]>(o, "acts"), store.get<Logs>(o, "logs"),
  ]);
  const lg = { ...emptyLogs(), ...(logs ?? {}) };
  const today = todayLocal(profile?.tz);
  const all = plan ? [...(plan.past ?? []), ...plan.sessions].map((s) => ({ ...s, skipped: !!lg.skipped[s.id] })) : [];
  const status = new Map<string, MatchStatus["status"]>();
  const actFor = new Map<string, ActSummary>();
  let extras: ActSummary[] = [];
  const list = acts ?? [];
  if (plan && all.length) {
    const first = all[0].date;
    const inPlan = list.filter((a) => a.local_date >= first);
    const m = matchRuns(all, inPlan.map(toAct), today);
    const byId = new Map(inPlan.map((a) => [a.id, a]));
    for (const st of m.statuses) {
      status.set(st.plan_session_id, st.status);
      if (st.strava_activity_id != null) actFor.set(st.plan_session_id, byId.get(st.strava_activity_id)!);
    }
    extras = m.extras.map((id) => byId.get(id)!);
    for (const s of all.filter((x) => x.category === "strength"))
      status.set(s.id, lg.strength_done[s.id] ? "done" : s.skipped ? "skipped" : diffDays(s.date, today) >= 2 ? "missed" : "pending");
  }
  return { uid, user, account, profile, plan, acts: list, logs: lg, today, zones: profile ? computeZones(profile) : null, sessions: all, status, actFor, extras };
}

export interface Alert extends Notice { action?: "rebuild" | "log" }

/** Safety checks on what the runner actually did. Computed on every page load; nothing is changed without a tap. */
export function alerts(c: Ctx): Alert[] {
  const out: Alert[] = [];
  if (!c.plan) return out;
  const runs = c.acts;
  const longestBefore = (d: string) => Math.max(0, ...runs.filter((a) => { const g = diffDays(a.local_date, d); return g > 0 && g <= 30; }).map((a) => a.distance_m / 1000));

  // Pain log
  const recent = c.logs.wellbeing.filter((w) => diffDays(w.date, c.today) >= 0 && diffDays(w.date, c.today) <= 14 && w.pain > 3);
  if (recent.length >= 2) out.push({ level: "stop", title: "Pain keeps coming back", text: `You logged pain above 3 out of 10 ${recent.length} times in two weeks. Please have it assessed by a physiotherapist or doctor before your next hard or long run.` });
  else if (recent.length === 1 && diffDays(recent[0].date, c.today) <= 3) out.push({ level: "warn", title: "Pain above 3 out of 10", text: "Make your next run 30 minutes easy, or rest. If it is worse the next day or you are limping, stop and get it assessed." });

  // A recent run that jumped past the cap
  for (const a of runs.filter((x) => diffDays(x.local_date, c.today) >= 0 && diffDays(x.local_date, c.today) <= 7)) {
    const km = a.distance_m / 1000, before = longestBefore(a.local_date);
    const session = [...c.actFor.entries()].find(([, v]) => v.id === a.id)?.[0];
    const isRace = c.sessions.find((s) => s.id === session)?.kind === "race";
    if (before >= 3 && km > spikeCap(before) + 0.3 && !isRace)
      out.push({ level: "warn", title: "Big jump in distance", text: `Your ${km.toFixed(1)} km run on ${fmtDate(a.local_date)} was ${Math.round((km / before - 1) * 100)}% longer than your longest run of the 30 days before it (${before.toFixed(1)} km). Jumps over 10% are linked to more overuse injuries, so keep the next few days easy.` });
  }

  // The next long run, compared with what was actually run lately
  const next = c.sessions.find((s) => s.kind === "long" && !s.skipped && s.date >= c.today && diffDays(c.today, s.date) <= 7);
  if (next?.distance_km) {
    const before = Math.max(longestBefore(next.date), 3);
    if (runs.length && next.distance_km > spikeCap(before) + 0.5)
      out.push({ level: "warn", action: "rebuild", title: "Next long run is too big a step", text: `${next.title} on ${fmtDate(next.date)} is more than 10% above your longest run in the last 30 days (${before.toFixed(1)} km). Cap it at about ${(Math.floor(spikeCap(before) * 2) / 2).toFixed(1)} km, or rebuild the plan from your recent training.` });
  }

  // Missed most of last week
  const lastMon = addDays(mondayOf(c.today), -7);
  const lastWeek = c.sessions.filter((s) => s.category === "run" && !s.optional && s.date >= lastMon && s.date < addDays(lastMon, 7));
  const missed = lastWeek.filter((s) => c.status.get(s.id) === "missed").length;
  if (lastWeek.length >= 3 && missed >= Math.ceil(lastWeek.length / 2) + (lastWeek.length % 2 === 0 ? 0 : 0) && missed >= 2)
    out.push({ level: "info", action: "rebuild", title: "Last week went off plan", text: `You missed ${missed} of ${lastWeek.length} runs. That happens. Don't try to catch up; rebuild the plan from your recent training so the next weeks fit where you are now.` });

  if (c.account?.sync_message && /revoked|rate limit/i.test(c.account.sync_message)) out.push({ level: "info", title: "Strava sync", text: c.account.sync_message });
  return out;
}
