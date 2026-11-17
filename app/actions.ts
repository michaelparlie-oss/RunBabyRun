"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { generatePlan, PlanError } from "@/lib/plan/generate";
import { profileFromForm, ScreeningError, suggestFromActs } from "@/lib/screening";
import { analyse, applyEvidence } from "@/lib/analysis";
import { publishChange } from "@/lib/live";
import { loadCtx } from "@/lib/server/view";
import { endSession, requireUser } from "@/lib/session";
import { getStore } from "@/lib/storage";
import { deleteLogin, signIn } from "@/lib/auth";
import { deauthorize, loadAccount } from "@/lib/strava/oauth";
import { purgeStravaData, syncUser, type SyncResult } from "@/lib/strava/sync";
import type { ActSummary, Plan, Profile } from "@/lib/types";
import { loadUser, saveUser, uidForAuth, unlinkAuth, unlinkStrava } from "@/lib/users";
import { diffDays, isDate, todayLocal } from "@/lib/util/dates";
import { parseDuration } from "@/lib/util/format";

export type ActionState = { ok: boolean; message: string } | null;
const str = (f: FormData, k: string) => ((f.get(k) as string | null) ?? "").trim();
/** Re-render this request, and ping the runner's other open tabs and devices (Supabase Realtime, when configured). */
const changed = async (uid: number) => { revalidatePath("/", "layout"); await publishChange(uid); };

/** Keep sessions from before today as history when the plan is replaced. */
function withHistory(next: Plan, prev: Plan | null, today: string): Plan {
  if (!prev) return next;
  const past = [...(prev.past ?? []), ...prev.sessions].filter((s) => s.date < today).slice(-600);
  return { ...next, past };
}

/** Every plan is held to the runner's recorded history before it is generated: it may start lower than they said, never higher. */
async function savePlan(uid: number, answers: Profile, prev: Plan | null, today: string, acts: ActSummary[]) {
  const { profile, notes } = applyEvidence(answers, analyse(acts, today));
  const made = generatePlan(profile, today);
  const plan = withHistory({ ...made, notices: [...notes, ...made.notices] }, prev, today);
  const store = await getStore();
  await store.set(String(uid), "profile", profile);
  await store.set(String(uid), "plan", plan);
}

/** Screening questionnaire → profile → plan. */
export async function createPlan(_: ActionState, f: FormData): Promise<ActionState> {
  const uid = await requireUser();
  const c = await loadCtx(uid);
  const today = todayLocal(str(f, "tz") || c.profile?.tz);
  try {
    const profile = profileFromForm(f, suggestFromActs(c.acts, today), today);
    await savePlan(uid, profile, c.plan, today, c.acts);
  } catch (e) {
    if (e instanceof ScreeningError || e instanceof PlanError) return { ok: false, message: e.message };
    throw e;
  }
  await changed(uid);
  redirect("/plan?new=1");
}

/** Regenerate from today using what Strava shows about the last four weeks. Answers are kept. */
export async function rebuildPlan(): Promise<void> {
  const uid = await requireUser();
  const c = await loadCtx(uid);
  if (!c.profile) redirect("/start");
  const sug = suggestFromActs(c.acts, c.today);
  const profile: Profile = sug.run_count
    ? { ...c.profile, fitness: { ...c.profile.fitness, weekly_km: sug.weekly_km, longest_km: sug.longest_km, can_run_30: c.profile.fitness.can_run_30 || sug.longest_km >= 5 } }
    : c.profile;
  let ok = true;
  try { await savePlan(uid, profile, c.plan, c.today, c.acts); } catch (e) { if (!(e instanceof PlanError)) throw e; ok = false; }
  await changed(uid);
  redirect(ok ? "/plan?rebuilt=1" : "/settings?error=rebuild");
}

export async function syncNow(): Promise<SyncResult> {
  const uid = await requireUser();
  const r = await syncUser(uid, { force: true });
  await changed(uid);
  return r;
}

/** Quiet periodic check from an open tab: respects rate-limit pauses and only re-renders when a run arrived. */
export async function syncBackground(): Promise<number> {
  const uid = await requireUser();
  const r = await syncUser(uid);
  if (r.added > 0) await changed(uid);
  return r.added;
}

async function editLogs(uid: number, fn: (l: Awaited<ReturnType<typeof loadCtx>>["logs"]) => void) {
  const c = await loadCtx(uid);
  fn(c.logs);
  await (await getStore()).set(String(uid), "logs", c.logs);
  await changed(uid);
  return c;
}

export async function logPain(_: ActionState, f: FormData): Promise<ActionState> {
  const uid = await requireUser();
  const pain = Number(str(f, "pain"));
  const area = str(f, "area").slice(0, 30) || "general";
  const date = str(f, "date");
  if (!Number.isInteger(pain) || pain < 0 || pain > 10) return { ok: false, message: "Choose a pain score from 0 to 10." };
  const c = await loadCtx(uid);
  const d = isDate(date) && diffDays(date, c.today) >= 0 && diffDays(date, c.today) <= 30 ? date : c.today;
  c.logs.wellbeing = [...c.logs.wellbeing.filter((w) => !(w.date === d && w.area === area)), { date: d, area, pain, note: str(f, "note").slice(0, 200) }].slice(-200);
  await (await getStore()).set(String(uid), "logs", c.logs);
  await changed(uid);
  return { ok: true, message: pain > 3 ? "Logged. Above 3 out of 10: make your next run easy or rest, and see the note on Today." : "Logged." };
}

export async function toggleStrength(f: FormData): Promise<void> {
  const uid = await requireUser();
  const id = str(f, "id");
  await editLogs(uid, (l) => { if (l.strength_done[id]) delete l.strength_done[id]; else if (/^[\w-]{5,40}$/.test(id)) l.strength_done[id] = new Date().toISOString().slice(0, 10); });
}

export async function toggleSkip(f: FormData): Promise<void> {
  const uid = await requireUser();
  const id = str(f, "id");
  const c = await loadCtx(uid);
  if (!c.sessions.some((s) => s.id === id)) return;
  if (c.logs.skipped[id]) delete c.logs.skipped[id];
  else c.logs.skipped[id] = str(f, "reason").slice(0, 120) || "Skipped";
  await (await getStore()).set(String(uid), "logs", c.logs);
  await changed(uid);
}

/** A new race or time-trial result: paces update everywhere; sessions stay as planned. */
export async function updateFitness(_: ActionState, f: FormData): Promise<ActionState> {
  const uid = await requireUser();
  const c = await loadCtx(uid);
  if (!c.profile) return { ok: false, message: "Create a plan first." };
  const km = { "5k": 5, "10k": 10, hm: 21.0975, fm: 42.195 }[str(f, "distance")] ?? Number(str(f, "distance"));
  const t = parseDuration(str(f, "time"));
  if (!km || km < 1 || km > 50 || !t || t / km < 150 || t / km > 900) return { ok: false, message: "Enter a distance and a time such as 27:40 or 1:02:15." };
  const profile: Profile = { ...c.profile, fitness: { ...c.profile.fitness, ref_distance_km: km, ref_time_s: t, ref_source: "race" } };
  c.logs.results = [...c.logs.results, { date: c.today, distance_km: km, time_s: t, note: str(f, "note").slice(0, 80) }].slice(-50);
  const store = await getStore();
  await store.set(String(uid), "profile", profile);
  await store.set(String(uid), "logs", c.logs);
  await changed(uid);
  return { ok: true, message: "Saved. Your paces are updated across the plan." };
}

export async function updateMaxHr(_: ActionState, f: FormData): Promise<ActionState> {
  const uid = await requireUser();
  const c = await loadCtx(uid);
  if (!c.profile) return { ok: false, message: "Create a plan first." };
  const v = Number(str(f, "max_hr"));
  if (!Number.isInteger(v) || v < 120 || v > 230) return { ok: false, message: "Enter a maximum heart rate between 120 and 230." };
  await (await getStore()).set(String(uid), "profile", { ...c.profile, health: { ...c.profile.health, max_hr: v, max_hr_source: "entered" } } satisfies Profile);
  await changed(uid);
  return { ok: true, message: "Saved. Heart-rate ranges are updated." };
}

/* ---------- Runs entered by hand ---------- */

function manualAct(date: string, km: number, timeS: number, hr: number | null, kind: "logged" | "ticked"): ActSummary {
  return {
    id: -(Date.now() * 1000 + Math.floor(Math.random() * 1000)), name: kind === "logged" ? "Logged run" : "Marked as done", sport_type: "Run",
    start_date_local: `${date}T07:00:00`, local_date: date, distance_m: Math.round(km * 1000), moving_time_s: Math.round(timeS), elapsed_time_s: Math.round(timeS),
    avg_hr: hr, max_hr: null, avg_speed: timeS > 0 ? (km * 1000) / timeS : null, manual: kind,
  };
}
async function saveActs(uid: number, acts: ActSummary[]) {
  await (await getStore()).set(String(uid), "acts", [...acts].sort((a, b) => a.start_date_local.localeCompare(b.start_date_local)).slice(-600));
  await changed(uid);
}

/** Log a run with real numbers. Replaces a same-day "marked as done" placeholder. */
export async function logRun(_: ActionState, f: FormData): Promise<ActionState> {
  const uid = await requireUser();
  const c = await loadCtx(uid);
  const date = str(f, "date");
  const km = Number(str(f, "km").replace(",", "."));
  const t = parseDuration(str(f, "time"));
  const hrTxt = str(f, "hr"), hr = hrTxt ? Number(hrTxt) : null;
  if (!isDate(date) || date > c.today || diffDays(date, c.today) > 120) return { ok: false, message: "Choose a date from the last four months, not in the future." };
  if (!Number.isFinite(km) || km < 0.2 || km > 120) return { ok: false, message: "Enter the distance in kilometres, for example 6.5." };
  if (!t || t / km < 150 || t / km > 1200) return { ok: false, message: "Enter the time as minutes:seconds or hours:minutes:seconds, for example 42:30." };
  if (hr != null && (!Number.isInteger(hr) || hr < 60 || hr > 230)) return { ok: false, message: "Average heart rate should be between 60 and 230, or leave it empty." };
  await saveActs(uid, [...c.acts.filter((a) => !(a.manual === "ticked" && a.local_date === date)), manualAct(date, km, t, hr, "logged")]);
  return { ok: true, message: "Run logged." };
}

/** One-tap "done": counts the planned distance so the week, the progress chart and the safety checks still work. */
export async function tickRun(f: FormData): Promise<void> {
  const uid = await requireUser();
  const c = await loadCtx(uid);
  const s = c.sessions.find((x) => x.id === str(f, "id") && x.category === "run");
  if (!s || s.date > c.today || c.actFor.has(s.id) || !s.distance_km) return;
  await saveActs(uid, [...c.acts, manualAct(s.date, s.distance_km, (s.est_duration_min ?? s.distance_km * 7) * 60, null, "ticked")]);
}

export async function removeRun(f: FormData): Promise<void> {
  const uid = await requireUser();
  const id = Number(str(f, "id"));
  const c = await loadCtx(uid);
  if (!(id < 0) || !c.acts.some((a) => a.id === id && a.manual)) return;
  await saveActs(uid, c.acts.filter((a) => a.id !== id));
}

/* ---------- Where runs come from ---------- */

export async function chooseManual(): Promise<void> {
  const uid = await requireUser();
  const u = await loadUser(uid);
  if (!u) redirect("/");
  await saveUser({ ...u, source: "manual" });
  await changed(uid);
  redirect("/start");
}

/** Stop using Strava and log runs by hand. Runs already imported from Strava are removed, as Strava's terms ask. */
export async function disconnectStrava(): Promise<void> {
  const uid = await requireUser();
  const u = await loadUser(uid);
  if (!u) redirect("/");
  await deauthorize(uid);
  await purgeStravaData(uid);
  await saveUser({ ...u, source: "manual" });
  await changed(uid);
  redirect("/settings?disconnected=1");
}

/** Delete everything: Strava access, stored data, and the login itself. The password confirms it is really the runner. */
export async function deleteAccount(f: FormData): Promise<void> {
  const uid = await requireUser();
  const u = await loadUser(uid);
  if (!u) { await endSession(); redirect("/"); }
  if (str(f, "confirm").toUpperCase() !== "DELETE") redirect("/settings?error=confirm#delete");
  const who = await signIn(u.email, String(f.get("password") ?? ""));
  if (!who.ok || (await uidForAuth(who.value.user.id)) !== uid) redirect(`/settings?error=${who.ok || who.error === "invalid" ? "password" : "auth"}#delete`);
  const acc = await loadAccount(uid);
  await deauthorize(uid);
  if (acc) await unlinkStrava(acc.athlete_id, uid);
  await (await getStore()).delAll(String(uid));
  await deleteLogin(who.value.token);
  await unlinkAuth(who.value.user.id);
  await endSession();
  redirect("/?deleted=1");
}
