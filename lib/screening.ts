import { z } from "zod";
import type { ActSummary, Experience, Profile } from "./types";
import { addDays, diffDays, isDate, safeTz } from "./util/dates";
import { parseDuration } from "./util/format";
import { riegel } from "./zones";

/** Health questions, in our own words. Any "yes" leads to "check with a doctor first" (see /about for the source model). */
export const HEALTH_QUESTIONS: { id: string; text: string }[] = [
  { id: "cardio", text: "Has a doctor ever told you that you have a heart condition, diabetes, kidney disease, or high blood pressure that is not under control?" },
  { id: "symptoms", text: "Do you get chest pain or pressure, unusual breathlessness, dizziness, fainting, or a racing or irregular heartbeat, at rest or when you exercise?" },
  { id: "advised", text: "Has a doctor told you to exercise only under medical supervision, or are you recovering from surgery or a serious illness?" },
  { id: "pregnancy", text: "Are you pregnant, or have you given birth in the last six months?" },
  { id: "joint", text: "Do you have a bone, joint or muscle problem that gets worse when you run?" },
];
export const NIGGLES = ["knee", "shin", "calf or Achilles", "foot", "hip", "lower back"] as const;
export const niggleId = (n: string) => n.split(" ")[0];

export interface Suggestion {
  weekly_km: number; longest_km: number; runs_per_week: number; max_hr: number | null;
  ref: { distance_km: number; time_s: number; date: string; name: string } | null; run_count: number;
}

/** What Strava already tells us, to pre-fill the questionnaire. */
export function suggestFromActs(acts: ActSummary[], today: string): Suggestion {
  const within = (a: ActSummary, days: number) => { const g = diffDays(a.local_date, today); return g >= 0 && g <= days; };
  const last28 = acts.filter((a) => within(a, 28));
  const weekly = last28.reduce((t, a) => t + a.distance_m, 0) / 1000 / 4;
  const longest = Math.max(0, ...acts.filter((a) => within(a, 30)).map((a) => a.distance_m / 1000));
  const hrs = acts.filter((a) => within(a, 120) && a.max_hr).map((a) => a.max_hr!);
  const maxHr = hrs.length >= 3 && Math.max(...hrs) >= 150 && Math.max(...hrs) <= 220 ? Math.round(Math.max(...hrs)) : null;
  // Fastest recent run, compared on a 10K-equivalent basis. Training runs understate race fitness, so this is a floor.
  let best: Suggestion["ref"] = null, bestEq = Infinity;
  for (const a of acts.filter((x) => within(x, 90))) {
    const km = a.distance_m / 1000;
    if (km < 3 || km > 45 || a.moving_time_s <= 0) continue;
    const pace = a.moving_time_s / km;
    if (pace < 150 || pace > 720) continue; // implausible (GPS error) or mostly walking
    const eq = riegel(a.moving_time_s, km, 10);
    if (eq < bestEq) { bestEq = eq; best = { distance_km: Math.round(km * 100) / 100, time_s: a.moving_time_s, date: a.local_date, name: a.name }; }
  }
  return { weekly_km: Math.round(weekly), longest_km: Math.round(longest * 2) / 2, runs_per_week: Math.round((last28.length / 4) * 10) / 10, max_hr: maxHr, ref: best, run_count: acts.filter((a) => within(a, 120)).length };
}

const ESTIMATE_10K: Record<Experience, number> = { new: 75 * 60, regular: 62 * 60, experienced: 50 * 60 };
const REF_KM: Record<string, number> = { "5k": 5, "10k": 10, hm: 21.0975, fm: 42.195 };

const Form = z.object({
  tz: z.string().max(64),
  race_key: z.enum(["5k", "10k", "hm", "fm"]),
  race_date: z.string().refine(isDate, "Enter the race date."),
  race_name: z.string().max(80),
  goal: z.enum(["finish", "time"]),
  goal_time: z.string().max(12),
  ref_kind: z.enum(["race", "strava", "none"]),
  ref_distance: z.string().max(12),
  ref_time: z.string().max(12),
  weekly_km: z.coerce.number().min(0).max(250),
  longest_km: z.coerce.number().min(0).max(80),
  experience: z.enum(["new", "regular", "experienced"]),
  can_run_30: z.enum(["yes", "no"]),
  run_days: z.array(z.coerce.number().int().min(0).max(6)).min(3, "Choose at least 3 running days.").max(6, "Keep at least one rest day: choose at most 6 running days."),
  long_day: z.coerce.number().int().min(0).max(6),
  strength: z.coerce.number().int().min(0).max(2),
  equipment: z.enum(["gym", "dumbbells", "bodyweight"]),
  adult: z.literal("yes", { message: "This app is for adults (18 or older)." }),
  ack: z.literal("yes", { message: "Please confirm you have read the health note." }),
  age: z.string().max(3),
  max_hr: z.string().max(3),
  flags: z.array(z.string().max(20)).max(10),
  niggles: z.array(z.string().max(20)).max(10),
});

export class ScreeningError extends Error {}

export function profileFromForm(f: FormData, sug: Suggestion, today: string): Profile {
  const s = (k: string) => ((f.get(k) as string | null) ?? "").trim();
  const parsed = Form.safeParse({
    tz: s("tz"), race_key: s("race_key"), race_date: s("race_date"), race_name: s("race_name"), goal: s("goal") || "finish", goal_time: s("goal_time"),
    ref_kind: s("ref_kind") || "none", ref_distance: s("ref_distance"), ref_time: s("ref_time"), weekly_km: s("weekly_km") || "0", longest_km: s("longest_km") || "0",
    experience: s("experience"), can_run_30: s("can_run_30") || "yes", run_days: f.getAll("run_days"), long_day: s("long_day"), strength: s("strength") || "0",
    equipment: s("equipment") || "bodyweight", adult: s("adult"), ack: s("ack"), age: s("age"), max_hr: s("max_hr"), flags: f.getAll("flags"), niggles: f.getAll("niggles"),
  });
  if (!parsed.success) throw new ScreeningError(parsed.error.issues[0]?.message ?? "Please check your answers.");
  const v = parsed.data;
  if (!v.run_days.includes(v.long_day)) throw new ScreeningError("Your long-run day must be one of your running days.");
  if (diffDays(today, v.race_date) < 14) throw new ScreeningError("Pick a race at least two weeks away.");
  if (v.race_date > addDays(today, 365)) throw new ScreeningError("Pick a race within the next 12 months.");

  let goal_time_s: number | null = null;
  if (v.goal === "time") {
    goal_time_s = parseDuration(v.goal_time.includes(":") ? v.goal_time : "");
    const km = REF_KM[v.race_key];
    if (!goal_time_s || goal_time_s / km < 150 || goal_time_s / km > 900) throw new ScreeningError("Enter your goal time as h:mm:ss or mm:ss, for example 2:05:00.");
  }

  let ref: Profile["fitness"]["ref_distance_km"], refT: number, src: Profile["fitness"]["ref_source"];
  if (v.ref_kind === "race") {
    const km = REF_KM[v.ref_distance] ?? Number(v.ref_distance);
    const t = parseDuration(v.ref_time);
    if (!km || km < 1 || km > 50 || !t || t / km < 150 || t / km > 900) throw new ScreeningError("Enter your recent result as a distance and a time (h:mm:ss or mm:ss).");
    ref = km; refT = t; src = "race";
  } else if (v.ref_kind === "strava" && sug.ref) {
    ref = sug.ref.distance_km; refT = sug.ref.time_s; src = "strava";
  } else {
    ref = 10; refT = ESTIMATE_10K[v.experience]; src = "estimate";
  }

  const age = v.age ? Number(v.age) : null;
  if (age != null && (!Number.isInteger(age) || age < 18 || age > 99)) throw new ScreeningError("Age must be between 18 and 99, or leave it empty.");
  const mh = v.max_hr ? Number(v.max_hr) : null;
  if (mh != null && (!Number.isInteger(mh) || mh < 120 || mh > 230)) throw new ScreeningError("Maximum heart rate must be between 120 and 230, or leave it empty.");
  const flagIds = new Set(HEALTH_QUESTIONS.map((q) => q.id));
  const nigIds = new Set(NIGGLES.map(niggleId));

  return {
    version: 1, created_at: new Date().toISOString(), tz: safeTz(v.tz),
    race: { key: v.race_key, date: v.race_date, name: v.race_name, goal: v.goal, goal_time_s },
    fitness: { ref_distance_km: ref, ref_time_s: refT, ref_source: src, weekly_km: v.weekly_km, longest_km: v.longest_km, experience: v.experience, can_run_30: v.can_run_30 === "yes" },
    schedule: { run_days: [...new Set(v.run_days)].sort((a, b) => a - b), long_day: v.long_day, strength_per_week: v.strength as 0 | 1 | 2, equipment: v.equipment },
    health: {
      adult: true, age, max_hr: mh ?? sug.max_hr ?? null, max_hr_source: mh ? "entered" : sug.max_hr ? "strava" : age ? "age" : "default",
      flags: v.flags.filter((x) => flagIds.has(x)), ack: true, niggles: v.niggles.filter((x) => nigIds.has(x)),
    },
  };
}
