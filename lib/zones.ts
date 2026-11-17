import type { Profile, RaceKey, Zone, ZoneCode, Zones } from "./types";

export const RACES: Record<RaceKey, { km: number; label: string; short: string }> = {
  "5k": { km: 5, label: "5K", short: "5K" },
  "10k": { km: 10, label: "10K", short: "10K" },
  hm: { km: 21.0975, label: "Half marathon", short: "HM" },
  fm: { km: 42.195, label: "Marathon", short: "FM" },
};

/** Riegel (1981): T2 = T1 × (D2 / D1)^1.06. An estimate; optimistic for the marathon on low weekly mileage. */
export const RIEGEL_EXP = 1.06;
export function riegel(timeS: number, fromKm: number, toKm: number): number {
  return timeS * Math.pow(toKm / fromKm, RIEGEL_EXP);
}

/** Tanaka, Monahan & Seals (2001): HRmax ≈ 208 − 0.7 × age. Individual values vary by about ±10 bpm. */
export const maxHrFromAge = (age: number) => Math.round(208 - 0.7 * age);
export const DEFAULT_MAX_HR = 190;

/**
 * Pace offsets in s/km from the runner's current 10K-equivalent pace (p10), and heart-rate bands as a
 * fraction of maximum heart rate. These bands are coaching conventions, not individually validated
 * thresholds; easy and long runs are steered by heart rate, harder work by pace with HR as a ceiling.
 */
const RULES: Record<Exclude<ZoneCode, "RP" | "RACE">, { name: string; lo: number | null; hi: number | null; hr: [number | null, number | null]; boss: Zone["primary_target"]; feel: string }> = {
  E: { name: "Easy", lo: 56, hi: 106, hr: [0.68, 0.78], boss: "HR", feel: "Conversational: you can speak full sentences. Effort 3–4 out of 10." },
  L: { name: "Long run", lo: 66, hi: 96, hr: [0.7, 0.78], boss: "HR", feel: "Easy and steady. Effort 4 out of 10; walking at water stops is fine." },
  REC: { name: "Recovery jog", lo: 116, hi: 176, hr: [null, 0.75], boss: "HR", feel: "Very easy jog or walk between reps." },
  T: { name: "Tempo", lo: 6, hi: 16, hr: [0.84, 0.89], boss: "pace", feel: "Comfortably hard: 3–4 words at a time. Effort 7 out of 10." },
  I: { name: "10K-pace intervals", lo: -9, hi: 1, hr: [0.88, 0.93], boss: "pace", feel: "Hard but controlled: you could not hold a conversation. Effort 8 out of 10." },
  ST: { name: "Strides", lo: -84, hi: -54, hr: [null, null], boss: "feel", feel: "20 seconds smooth and fast at about 85–90% effort, never a sprint. Walk 40–60 seconds between." },
  H: { name: "Hill reps", lo: null, hi: null, hr: [null, null], boss: "feel", feel: "Hard uphill effort, 8 out of 10, on a gentle slope (4–6%). Jog or walk back down." },
};

export function resolveMaxHr(p: Profile): number {
  return p.health.max_hr ?? (p.health.age ? maxHrFromAge(p.health.age) : DEFAULT_MAX_HR);
}

export function tenKEquivalentS(p: Profile): number {
  return riegel(p.fitness.ref_time_s, p.fitness.ref_distance_km, 10);
}

/** Predicted time for the goal race from the current reference result. */
export function predictedRaceS(p: Profile): number {
  return riegel(p.fitness.ref_time_s, p.fitness.ref_distance_km, RACES[p.race.key].km);
}

/** Pace to train for: the goal pace, or (for a "just finish" goal) 3% slower than the current prediction. */
export function racePaceS(p: Profile): number {
  const km = RACES[p.race.key].km;
  if (p.race.goal === "time" && p.race.goal_time_s) return p.race.goal_time_s / km;
  return (predictedRaceS(p) * 1.03) / km;
}

export function computeZones(p: Profile): Zones {
  const p10 = tenKEquivalentS(p) / 10;
  const mhr = resolveMaxHr(p);
  const hr = (f: number | null) => (f == null ? null : Math.round(mhr * f));
  const out = {} as Zones;
  for (const [code, r] of Object.entries(RULES) as [keyof typeof RULES, (typeof RULES)[keyof typeof RULES]][]) {
    out[code] = {
      code, name: r.name,
      pace_min_s_per_km: r.lo == null ? null : Math.round(p10 + r.lo),
      pace_max_s_per_km: r.hi == null ? null : Math.round(p10 + r.hi),
      hr_min: hr(r.hr[0]), hr_max: hr(r.hr[1]), primary_target: r.boss, feel: r.feel,
    };
  }
  const rp = racePaceS(p);
  const km = RACES[p.race.key].km;
  // Expected HR at race pace rises as the race gets shorter (coaching convention).
  const band: [number, number] = km > 40 ? [0.78, 0.84] : km > 20 ? [0.82, 0.89] : km > 9 ? [0.87, 0.93] : [0.9, 0.96];
  out.RP = {
    code: "RP", name: `${RACES[p.race.key].short} race pace`,
    pace_min_s_per_km: Math.round(rp - 5), pace_max_s_per_km: Math.round(rp + 5),
    hr_min: hr(band[0]), hr_max: hr(band[1]), primary_target: "pace",
    feel: "Your goal race rhythm: controlled and repeatable. Learn how it feels.",
  };
  out.RACE = { code: "RACE", name: "Race / all-out test", pace_min_s_per_km: null, pace_max_s_per_km: null, hr_min: null, hr_max: null, primary_target: "plan", feel: "Follow the pacing notes for this session." };
  return out;
}

export const midPace = (z: Zone, fallback = 450) =>
  z.pace_min_s_per_km != null && z.pace_max_s_per_km != null ? (z.pace_min_s_per_km + z.pace_max_s_per_km) / 2 : fallback;
