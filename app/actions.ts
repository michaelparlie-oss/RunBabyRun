"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { generatePlan, PlanError } from "@/lib/plan/generate";
import { profileFromForm, ScreeningError, suggestFromActs } from "@/lib/screening";
import { loadCtx } from "@/lib/server/view";
import { endSession, requireUser } from "@/lib/session";
import { getStore } from "@/lib/storage";
import { deauthorize } from "@/lib/strava/oauth";
import { syncUser, type SyncResult } from "@/lib/strava/sync";
import type { Plan, Profile } from "@/lib/types";
import { diffDays, isDate, todayLocal } from "@/lib/util/dates";
import { parseDuration } from "@/lib/util/format";

export type ActionState = { ok: boolean; message: string } | null;
const str = (f: FormData, k: string) => ((f.get(k) as string | null) ?? "").trim();
const refresh = () => revalidatePath("/", "layout");

/** Keep sessions from before today as history when the plan is replaced. */
function withHistory(next: Plan, prev: Plan | null, today: string): Plan {
  if (!prev) return next;
  const past = [...(prev.past ?? []), ...prev.sessions].filter((s) => s.date < today).slice(-600);
  return { ...next, past };
}

async function savePlan(uid: number, profile: Profile, prev: Plan | null, today: string) {
  const plan = withHistory(generatePlan(profile, today), prev, today);
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
    await savePlan(uid, profile, c.plan, today);
  } catch (e) {
    if (e instanceof ScreeningError || e instanceof PlanError) return { ok: false, message: e.message };
    throw e;
  }
  refresh();
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
  try { await savePlan(uid, profile, c.plan, c.today); } catch (e) { if (!(e instanceof PlanError)) throw e; ok = false; }
  refresh();
  redirect(ok ? "/plan?rebuilt=1" : "/settings?error=rebuild");
}

export async function syncNow(): Promise<SyncResult> {
  const uid = await requireUser();
  const r = await syncUser(uid, { force: true });
  refresh();
  return r;
}

async function editLogs(uid: number, fn: (l: Awaited<ReturnType<typeof loadCtx>>["logs"]) => void) {
  const c = await loadCtx(uid);
  fn(c.logs);
  await (await getStore()).set(String(uid), "logs", c.logs);
  refresh();
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
  refresh();
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
  refresh();
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
  refresh();
  return { ok: true, message: "Saved. Your paces are updated across the plan." };
}

export async function updateMaxHr(_: ActionState, f: FormData): Promise<ActionState> {
  const uid = await requireUser();
  const c = await loadCtx(uid);
  if (!c.profile) return { ok: false, message: "Create a plan first." };
  const v = Number(str(f, "max_hr"));
  if (!Number.isInteger(v) || v < 120 || v > 230) return { ok: false, message: "Enter a maximum heart rate between 120 and 230." };
  await (await getStore()).set(String(uid), "profile", { ...c.profile, health: { ...c.profile.health, max_hr: v, max_hr_source: "entered" } } satisfies Profile);
  refresh();
  return { ok: true, message: "Saved. Heart-rate ranges are updated." };
}

/** Revoke Strava access and delete everything stored for this runner. */
export async function deleteAccount(f: FormData): Promise<void> {
  const uid = await requireUser();
  if (str(f, "confirm").toUpperCase() !== "DELETE") redirect("/settings?error=confirm#delete");
  await deauthorize(uid);
  await (await getStore()).delAll(String(uid));
  await endSession();
  redirect("/?deleted=1");
}
