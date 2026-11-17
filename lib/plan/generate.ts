import type { Experience, Notice, Phase, Plan, Profile, RaceKey, Segment, Session, WeekInfo, ZoneCode, Zones } from "@/lib/types";
import { addDays, diffDays, dow, fmtDate, mondayOf } from "@/lib/util/dates";
import { fmtDuration, fmtPace } from "@/lib/util/format";
import { buildTemplates } from "@/lib/strength/library";
import { computeZones, midPace, predictedRaceS, RACES, racePaceS } from "@/lib/zones";

/**
 * Plan generator. The structure (taper size, the long-run cap, mostly-easy running, strength work)
 * follows published research where it exists; the specific distances and sessions are coaching
 * conventions. See /about in the app and DECISIONS.md for the sources and the judgement calls.
 */

export class PlanError extends Error {}

interface Spec {
  minWeeks: number;
  /** Weekly volume in taper weeks before race week, as a fraction of peak volume. */
  taper: number[];
  /** Long run in those taper weeks, as a fraction of the peak long run. */
  taperLong: number[];
  /** Running before the race in race week, as a fraction of peak volume. */
  raceWeekFrac: number;
  peak: Record<Experience, number>; // km per week at 5 run days
  longPeak: Record<Experience, number>; // km
  longUsual: number; // what preparation for this distance commonly reaches (for the warning)
  longMin: number;
  longShare: number; // long run ≤ this share of the week
  longMaxMin: number; // long run time cap, minutes
  longStep: number; // km added per build week
  qMax: number; // longest quality session, km
}

export const SPEC: Record<RaceKey, Spec> = {
  "5k": { minWeeks: 6, taper: [], taperLong: [], raceWeekFrac: 0.5, peak: { new: 25, regular: 40, experienced: 55 }, longPeak: { new: 10, regular: 12, experienced: 14 }, longUsual: 8, longMin: 5, longShare: 0.42, longMaxMin: 90, longStep: 1, qMax: 10 },
  "10k": { minWeeks: 8, taper: [0.8], taperLong: [0.75], raceWeekFrac: 0.45, peak: { new: 30, regular: 45, experienced: 60 }, longPeak: { new: 12, regular: 16, experienced: 18 }, longUsual: 11, longMin: 6, longShare: 0.45, longMaxMin: 110, longStep: 1, qMax: 12 },
  hm: { minWeeks: 10, taper: [0.7], taperLong: [0.6], raceWeekFrac: 0.35, peak: { new: 35, regular: 50, experienced: 65 }, longPeak: { new: 18, regular: 20, experienced: 22 }, longUsual: 16, longMin: 8, longShare: 0.5, longMaxMin: 150, longStep: 2, qMax: 14 },
  fm: { minWeeks: 16, taper: [0.75, 0.6], taperLong: [0.65, 0.45], raceWeekFrac: 0.3, peak: { new: 50, regular: 65, experienced: 85 }, longPeak: { new: 28, regular: 30, experienced: 32 }, longUsual: 26, longMin: 10, longShare: 0.65, longMaxMin: 210, longStep: 2, qMax: 16 },
};
const DAYS_FACTOR: Record<number, number> = { 3: 0.8, 4: 0.9, 5: 1, 6: 1.1 };
export const MIN_WEEKS_HARD = 3;
export const MAX_WEEKS = 52;
/** A long run may not exceed the longest run of the previous 30 days by more than 10% (or 1 km when under 10 km). */
export const spikeCap = (longest30: number) => (longest30 < 10 ? longest30 + 1 : longest30 * 1.1);

const r05 = (x: number) => Math.round(x * 2) / 2;
const r1 = (x: number) => Math.round(x * 10) / 10;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export function isConservative(p: Profile): boolean {
  return p.health.flags.length > 0 || p.health.niggles.length > 0 || (p.health.age ?? 0) >= 55 || p.fitness.experience === "new";
}

// ---------- session building blocks ----------
const WU_NOTE = "Then 3–5 min of drills: leg swings, walking lunges, skips.";
const RP_NOTE = "If your heart rate passes the ceiling early, ease off and finish the block by feel.";

function durationMin(segs: Segment[], zones: Zones): number {
  let s = 0;
  for (const g of segs) {
    const one = g.distance_km != null ? g.distance_km * midPace(zones[g.zone]) : (g.duration_s ?? 0);
    s += one * g.repeat + (g.recovery ? g.recovery.duration_s * (g.repeat - (g.kind === "strides" ? 0 : 1)) : 0);
  }
  return Math.round(s / 60);
}

interface RunDraft { kind: Session["kind"]; title: string; km: number; segments: Segment[]; summary: string; optional?: boolean }

function easy(km: number, strides = 0, note = ""): RunDraft {
  const segs: Segment[] = [{ kind: "steady", zone: "E", repeat: 1, distance_km: r05(km), ...(note ? { note } : {}) }];
  if (strides) segs.push({ kind: "strides", zone: "ST", repeat: strides, duration_s: 20, recovery: { zone: "REC", duration_s: 50 }, note: "On flat ground, inside the last kilometre." });
  const title = `Easy ${r05(km)} km${strides ? ` + ${strides} strides` : ""}`;
  return { kind: "easy", title, km: r05(km), segments: segs, summary: "Heart rate decides the pace today. Slow down or walk briefly if it drifts above the range." };
}

function long(km: number, rpKm = 0, note = ""): RunDraft {
  km = r05(km);
  rpKm = Math.round(rpKm);
  if (rpKm >= 2 && km - rpKm >= 3) {
    return {
      kind: "long", title: `Long ${km} km, last ${rpKm} at race pace`, km,
      segments: [{ kind: "steady", zone: "L", repeat: 1, distance_km: r05(km - rpKm), ...(note ? { note } : {}) }, { kind: "work", zone: "RP", repeat: 1, distance_km: rpKm, note: RP_NOTE }],
      summary: "Easy first, then practise race rhythm on tired legs. Carry water; take fuel on runs over 75 minutes.",
    };
  }
  return { kind: "long", title: `Long ${km} km easy`, km, segments: [{ kind: "steady", zone: "L", repeat: 1, distance_km: km, ...(note ? { note } : {}) }], summary: "Easy all the way. Carry water; take fuel on runs over 75 minutes." };
}

/** Warm-up, n reps with jog recoveries, cool-down, fitted into roughly `q` km. */
function reps(label: string, zone: ZoneCode, rep: { km?: number; s?: number }, recS: number, minN: number, maxN: number, q: number, zones: Zones, scale = 1): RunDraft {
  maxN = Math.max(minN, Math.round(maxN * scale));
  const wu = q >= 8 ? 2 : 1.5;
  const repKm = rep.km ?? (rep.s! / (zone === "H" ? 420 : midPace(zones[zone]))) ;
  const recKm = recS / midPace(zones.REC);
  const n = clamp(Math.floor((q - wu - 1 + recKm) / (repKm + recKm)), minN, maxN);
  const used = wu + n * repKm + (n - 1) * recKm;
  const cd = Math.max(1, r1(q - used));
  const km = r1(used + cd);
  const repTxt = rep.km != null ? `${rep.km} km` : rep.s! >= 60 ? `${rep.s! / 60} min` : `${rep.s} s`;
  const recTxt = recS >= 60 && recS % 60 === 0 ? `${recS / 60} min` : `${recS} s`;
  const what = zone === "H" ? "hard uphill" : zone === "RP" ? "race pace" : zone === "I" ? "10K pace" : "tempo";
  const work: Segment = { kind: "work", zone, repeat: n, ...(rep.km != null ? { distance_km: rep.km } : { duration_s: rep.s! }), recovery: { zone: "REC", duration_s: recS }, ...(zone === "RP" ? { note: RP_NOTE } : {}) };
  return {
    kind: "quality", title: `${label}: ${n} × ${repTxt} @ ${what} / ${recTxt} ${zone === "H" ? "jog down" : "jog"}`, km,
    segments: [{ kind: "warmup", zone: "E", repeat: 1, distance_km: wu, note: WU_NOTE }, work, { kind: "cooldown", zone: "E", repeat: 1, distance_km: cd }],
    summary: "Pace is the target on the reps; heart rate is a ceiling. Cut a rep short if anything hurts.",
  };
}

function continuous(label: string, zone: ZoneCode, maxKm: number, q: number): RunDraft {
  const wu = q >= 8 ? 2 : 1.5;
  const work = clamp(Math.round(q - wu - 1), 2, maxKm);
  const cd = Math.max(1, r1(q - wu - work));
  return {
    kind: "quality", title: `${label}: ${work} km @ ${zone === "RP" ? "race pace" : "tempo"}`, km: r1(wu + work + cd),
    segments: [{ kind: "warmup", zone: "E", repeat: 1, distance_km: wu, note: WU_NOTE }, { kind: "work", zone, repeat: 1, distance_km: work, ...(zone === "RP" ? { note: RP_NOTE } : {}) }, { kind: "cooldown", zone: "E", repeat: 1, distance_km: cd }],
    summary: "One steady block at the target pace. Start at the slow end of the range.",
  };
}

function timeTrial(): RunDraft {
  return {
    kind: "test", title: "5K time trial (fitness check)", km: 8,
    segments: [
      { kind: "warmup", zone: "E", repeat: 1, distance_km: 2, note: `${WU_NOTE} Add 3 strides.` },
      { kind: "race", zone: "RACE", repeat: 1, distance_km: 5, note: "Flat route. Start at tempo effort for the first kilometre, then run as evenly as you can to the finish." },
      { kind: "cooldown", zone: "E", repeat: 1, distance_km: 1 },
    ],
    summary: "An even, honest 5 km. Afterwards, enter your time under Settings → Update fitness so your paces stay accurate.",
  };
}

/** `f` scales the number of reps down for newer runners. */
type Maker = (q: number, z: Zones, f: number) => RunDraft;
const BASE: Maker[] = [
  (q, z, f) => reps("Hills", "H", { s: 45 }, 90, 6, 10, q, z, f),
  (q, z, f) => reps("Fartlek", "T", { s: 120 }, 60, 4, 8, q, z, f),
  (q, z, f) => reps("Tempo kilometres", "T", { km: 1 }, 60, 3, 5, q, z, f),
];
const BUILD: Record<RaceKey, Maker[]> = {
  "5k": [(q, z, f) => reps("10K-pace reps", "I", { km: 1 }, 120, 3, 5, q, z, f), (q, z, f) => reps("Race-pace reps", "RP", { km: 0.6 }, 90, 5, 8, q, z, f), (q, z, f) => reps("Cruise intervals", "T", { km: 1.6 }, 90, 2, 3, q, z, f)],
  "10k": [(q, z, f) => reps("10K-pace reps", "I", { km: 1 }, 120, 4, 7, q, z, f), (q, z, f) => reps("Race-pace reps", "RP", { km: 2 }, 120, 2, 4, q, z, f), (q, z, f) => reps("Cruise intervals", "T", { km: 1.6 }, 90, 2, 4, q, z, f)],
  hm: [(q, z, f) => reps("Tempo", "T", { km: 2 }, 120, 2, 5, q, z, f), (q) => continuous("Race-pace run", "RP", 10, q), (q, z, f) => reps("10K-pace reps", "I", { km: 1 }, 120, 4, 6, q, z, f), (q, z, f) => reps("Cruise intervals", "T", { km: 1.6 }, 90, 3, 5, q, z, f)],
  fm: [(q, z, f) => reps("Tempo", "T", { km: 3 }, 180, 2, 4, q, z, f), (q) => continuous("Race-pace run", "RP", 13, q), (q, z, f) => reps("Cruise intervals", "T", { km: 1.6 }, 90, 3, 6, q, z, f), (q) => continuous("Race-pace run", "RP", 13, q)],
};
/** Newer runners: threshold-type work only, no 10K-pace intervals. */
const BUILD_NEW: Maker[] = [(q, z, f) => reps("Tempo kilometres", "T", { km: 1 }, 60, 3, 5, q, z, f), (q, z, f) => reps("Fartlek", "T", { s: 120 }, 60, 4, 8, q, z, f), (q) => continuous("Race-pace run", "RP", 6, q)];
const sharpen = (key: RaceKey, q: number, z: Zones, n: number) =>
  reps("Race-pace sharpener", "RP", { km: key === "5k" ? 0.6 : key === "fm" || key === "hm" ? 2 : 1 }, 120, 2, n, q, z);

function raceSession(key: RaceKey, name: string, goalPace: number): RunDraft {
  const km = RACES[key].km;
  const parts: [number, number, number] = key === "fm" ? [5, 25, 12.2] : key === "hm" ? [3, 15, 3.1] : key === "10k" ? [1, 7, 2] : [1, 3, 1];
  const slow = `${fmtPace(goalPace + 5)}–${fmtPace(goalPace + 10)} /km`;
  return {
    kind: "race", title: `RACE DAY: ${name || RACES[key].label}`, km: r1(km),
    segments: [
      { kind: "race", zone: "RACE", repeat: 1, distance_km: parts[0], note: `Hold back: about ${slow}. It should feel too easy.` },
      { kind: "race", zone: "RP", repeat: 1, distance_km: parts[1], note: "Settle into goal pace. In heat, go by effort rather than pace." },
      { kind: "race", zone: "RACE", repeat: 1, distance_km: parts[2], note: "Hold your pace; push only if you feel strong." },
    ],
    summary: km > 20 ? "Start slower than goal pace, drink at aid stations and take carbohydrate from early on, as you practised on long runs." : "Warm up for 10–15 minutes with a few strides, then start under control.",
  };
}

// ---------- the generator ----------
export function generatePlan(p: Profile, today: string): Plan {
  const key = p.race.key;
  const spec = SPEC[key];
  const zones = computeZones(p);
  const exp = p.fitness.experience;
  const runDays = [...new Set(p.schedule.run_days)].sort((a, b) => a - b);
  const R = runDays.length;
  if (R < 3 || R > 6) throw new PlanError("Choose between 3 and 6 running days.");
  if (!runDays.includes(p.schedule.long_day)) throw new PlanError("Your long-run day must be one of your running days.");
  if (diffDays(today, p.race.date) < 0) throw new PlanError("The race date is in the past.");

  const start = mondayOf(today);
  const W = diffDays(start, mondayOf(p.race.date)) / 7 + 1;
  if (W < MIN_WEEKS_HARD) throw new PlanError("Your race is less than two full weeks away, which is too close to build a plan. Run easy, rest well and enjoy the race.");
  if (W > MAX_WEEKS) throw new PlanError("Your race is more than a year away. Come back within 12 months of race day, or pick a nearer race first.");

  const taper = spec.taper.slice(Math.max(0, spec.taper.length - Math.max(0, W - 2)));
  const taperLong = spec.taperLong.slice(spec.taperLong.length - taper.length);
  const T = W - 1 - taper.length; // training weeks before the taper
  const conservative = isConservative(p) || !!p.fitness.cautious;
  const growth = conservative ? 1.06 : 1.08;
  const cycle = conservative ? 3 : 4;
  const isDeload = (i: number) => i > 0 && i < T - 1 && (T - 1 - i) % cycle === cycle - 1;

  const v0 = Math.max(0, p.fitness.weekly_km);
  let peakTarget = Math.round(spec.peak[exp] * DAYS_FACTOR[R]);
  if (v0 > peakTarget) peakTarget = Math.min(v0, spec.peak.experienced * 1.2);
  const vStart = clamp(v0, 3 * R, Math.max(peakTarget, 3 * R));
  peakTarget = Math.max(peakTarget, vStart);
  // However far the race, the biggest week stays within reach of today's volume (coaching judgement, not a research finding).
  const reach = Math.max(Math.round(vStart * 1.8), vStart + 12);
  const reachCapped = peakTarget > reach;
  if (reachCapped) peakTarget = reach;
  const longPeak = r05(Math.min(spec.longPeak[exp], (spec.longMaxMin * 60) / midPace(zones.L)));
  const foundationWeeks = !p.fitness.can_run_30 || (exp === "new" && v0 < 12) ? Math.min(4, Math.max(1, Math.floor(T / 3))) : 0;
  const walkNote = !p.fitness.can_run_30 ? "Run-walk is fine: for example 4 min running, 1 min walking." : "";

  // Day roles
  const longDay = p.schedule.long_day;
  const after = (d: number) => (d - longDay + 7) % 7;
  const before = (d: number) => (longDay - d + 7) % 7;
  const others = runDays.filter((d) => d !== longDay);
  const qualityDay = [...others].sort((a, b) => Math.min(after(b), before(b)) - Math.min(after(a), before(a)) || after(a) - after(b))[0];
  const easyDays = others.filter((d) => d !== qualityDay);
  const strengthN = p.schedule.strength_per_week;
  const aCands = easyDays.filter((d) => before(d) >= 2).sort((a, b) => after(a) - after(b));
  const offCands = [0, 1, 2, 3, 4, 5, 6].filter((d) => !runDays.includes(d) && before(d) >= 2).sort((a, b) => after(a) - after(b));
  const strengthA = aCands[0] ?? offCands[0] ?? null;
  const strengthB = before(qualityDay) >= 2 ? qualityDay : null;

  const sessions: Session[] = [];
  const weeks: WeekInfo[] = [];
  const history: { date: string; km: number }[] = [{ date: addDays(start, -3), km: Math.max(3, Math.min(p.fitness.longest_km, 60)) }];
  const longest30 = (d: string) => Math.max(0, ...history.filter((h) => { const g = diffDays(h.date, d); return g > 0 && g <= 30; }).map((h) => h.km));

  // Volume and long run ramp evenly from where the runner is now to the peak, which is held for the last weeks before the taper.
  const buildWeeks = Array.from({ length: T }, (_, i) => i).filter((i) => !isDeload(i));
  const rampFrac = (i: number) => {
    const j = buildWeeks.indexOf(i), N = buildWeeks.length;
    return N <= 1 ? 1 : N <= 4 ? j / (N - 1) : Math.min(1, j / (N - 3));
  };
  let cap = vStart; // most this week may hold, given last week
  let lastV = vStart;
  let startLong = 0;
  let prevLong = 0; // longest planned long run so far (full-length weeks)
  let peakKm = 0, peakLong = 0, baseIdx = 0, buildIdx = 0, deloadCount = 0, rpToggle = 0, tested = false;
  const baseWeeks = Math.max(foundationWeeks, Math.min(T - 1, Math.max(2, Math.round(T * 0.4))));
  const repScale = exp === "new" ? 0.7 : 1;
  const needsEarlyTest = p.fitness.ref_source === "estimate" && p.fitness.can_run_30;

  const push = (weekN: number, phase: Phase, deload: boolean, date: string, d: RunDraft) => {
    if (date < today || date > p.race.date) return;
    sessions.push({
      id: `${date}-AM-run`, date, slot: "AM", week: weekN, phase, deload, category: "run", kind: d.kind, title: d.title, distance_km: d.km,
      est_duration_min: durationMin(d.segments, zones), segments: d.segments, summary: d.summary, optional: !!d.optional, skipped: false, template: null,
    });
    history.push({ date, km: d.km });
  };
  const pushStrength = (weekN: number, phase: Phase, deload: boolean, date: string, template: string, names: Record<string, { name: string; minutes: number }>) => {
    if (date < today || date >= addDays(p.race.date, -1)) return;
    sessions.push({
      id: `${date}-PM-strength`, date, slot: "PM", week: weekN, phase, deload, category: "strength", kind: null,
      title: names[template].name + (deload && template !== "mobility" && template !== "taper" ? " (deload: half the sets)" : ""),
      distance_km: null, est_duration_min: names[template].minutes, segments: [], summary: null, optional: false, skipped: false, template,
    });
  };
  const templates = buildTemplates(p.schedule.equipment, p.health.niggles);

  for (let i = 0; i < W; i++) {
    const weekN = i + 1;
    const monday = addDays(start, i * 7);
    const dayDate = (d: number) => addDays(monday, d);
    const raceWeek = i === W - 1;
    const taperIdx = i - T; // 0.. for taper weeks
    const inTaper = !raceWeek && taperIdx >= 0;
    const phase: Phase = raceWeek ? "Race week" : inTaper ? "Taper" : i < baseWeeks ? "Base" : "Build";
    const deload = !raceWeek && !inTaper && isDeload(i);
    const before0 = sessions.length;

    if (raceWeek) {
      const raceDow = dow(p.race.date);
      const pre = runDays.filter((d) => d <= raceDow - 2);
      const budget = spec.raceWeekFrac * Math.max(peakKm, vStart);
      const each = clamp(r05(budget / Math.max(1, pre.length)), 3, 8);
      // Race-pace sharpener at least three days out; the last run before the race is easy with strides.
      const sharpDay = pre.length >= 2 && foundationWeeks === 0 ? [...pre].reverse().find((d) => d <= raceDow - 3) : undefined;
      pre.forEach((d, k) => {
        const last = k === pre.length - 1;
        if (d === sharpDay) push(weekN, phase, false, dayDate(d), sharpen(key, Math.min(each + 1, 7), zones, 3));
        else push(weekN, phase, false, dayDate(d), easy(each, last ? 4 : 0, walkNote));
      });
      if (raceDow >= 1) push(weekN, phase, false, addDays(p.race.date, -1), { ...easy(2, 3), title: "Optional: rest or 15 min shake-out", optional: true, summary: "Rest is fine. If you feel stiff, jog 15 minutes with 3 strides." });
      push(weekN, phase, false, p.race.date, raceSession(key, p.race.name, racePaceS(p)));
      if (strengthN > 0 && strengthA != null) pushStrength(weekN, phase, false, dayDate(Math.min(strengthA, Math.max(0, raceDow - 3))), "mobility", templates);
    } else {
      // Weekly volume and long run
      let V: number, lr: number;
      if (inTaper) {
        V = taper[taperIdx] * peakKm;
        lr = taperLong[taperIdx] * peakLong;
      } else if (deload) {
        V = 0.75 * lastV;
        lr = 0.75 * prevLong;
        deloadCount++;
      } else {
        const f = rampFrac(i);
        V = Math.min(vStart + (peakTarget - vStart) * f, cap);
        lastV = V;
        // Next week may add 6–8%, or half a kilometre per run when the weekly total is still small.
        cap = Math.max(V * growth, V + 0.5 * R);
        if (prevLong === 0) startLong = clamp(Math.max(p.fitness.longest_km, 0.3 * V), Math.min(spec.longMin, Math.max(3, p.fitness.longest_km + 1)), longPeak);
        const target = prevLong === 0 ? startLong : Math.min(startLong + (longPeak - startLong) * f, prevLong + spec.longStep + 1);
        lr = Math.min(Math.max(target, prevLong === 0 ? 0 : Math.min(prevLong, longPeak)), Math.max(spec.longShare * V, 3));
      }
      const longDate = dayDate(longDay);
      lr = r05(Math.max(3, Math.min(lr, Math.floor(spikeCap(longest30(longDate)) * 2) / 2)));
      if (!deload && !inTaper) prevLong = Math.max(prevLong, lr);
      // Long runs that finish at race pace are shorter than the easy ones (half and full marathon, alternate build weeks).
      let rp = 0;
      const rpCap = key === "fm" ? 14 : 8;
      if ((key === "hm" || key === "fm") && i >= foundationWeeks) {
        if (inTaper && taperIdx === 0) rp = Math.min(lr * (exp === "new" ? 0.3 : 0.5), exp === "new" ? rpCap / 2 : rpCap + 2);
        else if (phase === "Build" && !deload && exp !== "new" && lr >= 14 && rpToggle++ % 2 === 1) { lr = r05(lr * 0.85); rp = Math.min(lr * 0.3, rpCap); }
      }

      // Split the rest
      const rest = Math.max(0, V - lr);
      const useQuality = i >= foundationWeeks;
      let q = clamp(r05((rest / Math.max(1, R - 1)) * 1.15), 5, spec.qMax);
      const nEasy = R - 2;
      let e = clamp(r05((rest - q) / nEasy), 3, 14);
      if (!useQuality) { q = clamp(r05(rest / (R - 1)), 3, 10); e = q; }
      // No run of the week is longer than the long run, which already respects the 30-day cap.
      q = Math.min(q, Math.max(lr, 4));
      e = Math.min(e, lr);

      // Quality day
      let qd: RunDraft;
      const roomForTest = spikeCap(longest30(dayDate(qualityDay))) >= 8;
      const testDue = roomForTest && !inTaper && useQuality && p.fitness.can_run_30 && ((deload && (deloadCount % 2 === 0 || (needsEarlyTest && !tested))) || (needsEarlyTest && !tested && i === 1));
      if (!useQuality) qd = easy(q, i >= 1 ? 4 : 0, walkNote);
      else if (testDue) { qd = timeTrial(); tested = true; }
      else if (deload) qd = reps("Light fartlek", "T", { s: 60 }, 60, 4, 6, Math.min(q, 7), zones);
      else if (inTaper) qd = sharpen(key, Math.min(q, 9), zones, 4);
      else if (phase === "Base") qd = BASE[baseIdx++ % BASE.length](q, zones, repScale);
      else { const list = exp === "new" ? BUILD_NEW : BUILD[key]; qd = list[buildIdx++ % list.length](q, zones, repScale); }
      push(weekN, phase, deload, dayDate(qualityDay), qd);

      // Easy days (strides on the first one, outside the foundation weeks)
      easyDays.forEach((d, k) => push(weekN, phase, deload, dayDate(d), easy(e, k === 0 && i >= 1 && !deload && useQuality ? 6 : 0, walkNote)));

      // Long run
      const longNote = [walkNote, inTaper && taperIdx === 0 && (key === "hm" || key === "fm") ? "Dress rehearsal: race shoes, race kit, race fuel, race start time." : ""].filter(Boolean).join(" ");
      push(weekN, phase, deload, longDate, long(lr, rp, longNote));

      // Strength
      if (strengthN > 0) {
        const tpl = (ab: "A" | "B") => (inTaper ? "taper" : `${ab}_${phase === "Base" ? "base" : "build"}`);
        if (strengthN === 2 && !inTaper) {
          if (strengthA != null) pushStrength(weekN, phase, deload, dayDate(strengthA), tpl("A"), templates);
          if (strengthB != null) pushStrength(weekN, phase, deload, dayDate(strengthB), tpl("B"), templates);
          else if (strengthA == null && offCands[1] != null) pushStrength(weekN, phase, deload, dayDate(offCands[1]), tpl("B"), templates);
        } else {
          const day = strengthA ?? strengthB;
          if (day != null) pushStrength(weekN, phase, deload, dayDate(day), tpl(i % 2 === 0 ? "A" : "B"), templates);
        }
      }
    }

    const mine = sessions.slice(before0).filter((s) => s.category === "run" && !s.optional);
    const km = r1(mine.reduce((t, s) => t + (s.distance_km ?? 0), 0));
    const lk = Math.max(0, ...mine.filter((s) => s.kind === "long").map((s) => s.distance_km ?? 0));
    if (!raceWeek && !inTaper) { peakKm = Math.max(peakKm, km); peakLong = Math.max(peakLong, lk); }
    weeks.push({ n: weekN, start: monday, phase, deload, planned_km: km, long_km: lk });
  }
  sessions.sort((a, b) => (a.date + a.slot).localeCompare(b.date + b.slot));

  // ---------- notices ----------
  const notices: Notice[] = [];
  const pred = predictedRaceS(p);
  const label = RACES[key].label;
  if (p.health.flags.length) notices.push({ level: "stop", title: "Check with a doctor first", text: "You answered yes to at least one health question. Please talk to a doctor before starting or progressing this plan, and stop any session if you get chest pain, unusual breathlessness, dizziness or fainting." });
  if (reachCapped) notices.push({ level: "info", title: "Peak kept within reach", text: `The biggest week is held to about ${peakKm} km so it stays close to what you run now (${Math.round(vStart)} km a week). Rebuild the plan after a few steady weeks and it will reach further.` });
  if (W < spec.minWeeks) notices.push({ level: "warn", title: "Short build-up", text: `You have ${W} weeks; this plan is designed around at least ${spec.minWeeks} for a ${label.toLowerCase()}. It will get you to the start line, not to your best fitness. Consider a later race or a gentler goal.` });
  if (peakLong < spec.longUsual - 0.5) notices.push({ level: "warn", title: "Long run stays short", text: `Your longest run reaches ${peakLong} km. Preparation for a ${label.toLowerCase()} commonly reaches about ${spec.longUsual} km or more. The plan will not raise a long run by more than 10% over your longest run of the previous 30 days, so there are not enough weeks to go further safely.` });
  if (key === "fm" && exp === "new" && (v0 < 20 || W < 20)) notices.push({ level: "warn", title: "A marathon is a big first step", text: "With your current weekly distance and time available, a half marathon first would carry less injury risk. If you keep the marathon, treat finishing as the goal." });
  if (p.race.goal === "time" && p.race.goal_time_s) {
    const gap = (pred - p.race.goal_time_s) / pred;
    const g = `Your recent result predicts about ${fmtDuration(pred)} today (Riegel formula); your goal is ${fmtDuration(p.race.goal_time_s)}.`;
    if (gap <= 0) notices.push({ level: "info", title: "Goal within current fitness", text: `${g} You could aim a little faster once training is going well.` });
    else if (gap <= 0.03) notices.push({ level: "info", title: "Realistic goal", text: `${g} That needs about ${(gap * 100).toFixed(1)}% improvement.` });
    else if (gap <= 0.08) notices.push({ level: "info", title: "Ambitious goal", text: `${g} That needs about ${(gap * 100).toFixed(0)}% improvement. The time trials in the plan will show whether you are on track.` });
    else notices.push({ level: "warn", title: "Very ambitious goal", text: `${g} That needs about ${(gap * 100).toFixed(0)}% improvement, which is a lot for ${W} weeks. Race-pace sessions may feel too hard at first; consider a goal near ${fmtDuration(pred * 0.95)} and revisit it after a time trial.` });
  }
  if (key === "fm") notices.push({ level: "info", title: "Marathon predictions run optimistic", text: "Predictions from shorter races tend to be too fast for the marathon when weekly distance is modest. Trust the long runs and the dress rehearsal more than the formula." });
  if (p.fitness.ref_source === "estimate") notices.push({ level: "info", title: "Paces are a first estimate", text: "You had no recent race or hard effort to go on, so your paces start as an estimate. The first 5K time trial in the plan will correct them." });
  if (p.health.max_hr_source !== "entered") notices.push({ level: "info", title: "Heart-rate ranges are estimated", text: p.health.max_hr_source === "strava" ? "Your maximum heart rate was taken from the highest value in your recent Strava runs. If you know your true maximum, enter it in Settings." : "Your maximum heart rate was estimated from your age (208 − 0.7 × age), which can be off by 10 beats or more. If you know your true maximum, enter it in Settings." });
  if (!p.fitness.can_run_30) notices.push({ level: "info", title: "Run-walk start", text: `The first ${foundationWeeks} week${foundationWeeks === 1 ? "" : "s"} are easy running only, and run-walk is encouraged. Harder sessions begin after that.` });
  if (p.health.niggles.length) notices.push({ level: "info", title: "Sore areas noted", text: "Your plan progresses more gently and takes an easier week every third week. Pain above 3 out of 10, a limp, or pain that is worse the next day means stop and get it assessed by a physiotherapist." });
  if (strengthN > 0 && strengthA == null && strengthB == null) notices.push({ level: "info", title: "No room for strength", text: "With these running days there is no day at least two days before your long run, so strength sessions were left out." });

  return {
    version: 1, generated_at: new Date().toISOString(), start, race_date: p.race.date, weeks, sessions, notices, templates,
    summary: {
      race_label: `${p.race.name || label} · ${fmtDate(p.race.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}`,
      race_km: RACES[key].km, weeks: W, peak_km: peakKm, peak_long_km: peakLong, predicted_time_s: Math.round(pred),
      goal_time_s: p.race.goal === "time" ? p.race.goal_time_s : null, goal_pace_s_per_km: Math.round(racePaceS(p)),
    },
  };
}
