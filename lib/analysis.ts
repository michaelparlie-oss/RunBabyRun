import type { ActSummary, Experience, Notice, Profile } from "@/lib/types";
import { addDays, diffDays } from "@/lib/util/dates";

/**
 * What the runner's own history says, in rolling 7-day blocks ending today (block 0 = the last 7 days).
 * Used twice: to hold the plan to what has actually been sustained, and to draw the analysis page.
 */
export interface Block { end: string; km: number; runs: number; longest: number; time_s: number; pace: number | null; hr: number | null; ratio: number | null }
export interface Analysis {
  blocks: Block[]; // oldest first, 12 blocks
  history_days: number; // days since the oldest stored run (capped at 84)
  runs56: number;
  enough: boolean; // at least 3 weeks of history and 4 runs: enough to overrule a self-estimate
  mean4: number; mean8: number;
  sustainable_km: number; // weekly volume the runner has actually held
  longest30: number;
  runs_per_week: number;
  active_weeks8: number;
  acute7: number;
  load_ratio: number | null; // last 7 days against the average week of the last 28
  days_since_last: number | null;
  pace28: number | null; hr28: number | null; // medians, s/km and bpm
  efficiency28: number | null; efficiency_prev: number | null; // metres per heartbeat, last 28 days vs the 28 before
}

const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const paceOf = (a: ActSummary) => (a.distance_m > 0 && a.moving_time_s > 0 ? a.moving_time_s / (a.distance_m / 1000) : null);
/** Runs whose pace and heart rate can be trusted for analysis: real timing, plausible running pace. */
export const measured = (a: ActSummary) => { const p = paceOf(a); return a.manual !== "ticked" && p != null && p >= 150 && p <= 720 && a.distance_m >= 1500; };
/** Metres covered per heartbeat: higher means more speed for the same effort. */
export const efficiencyOf = (a: ActSummary) => (measured(a) && a.avg_hr && a.avg_hr >= 80 ? a.distance_m / ((a.moving_time_s / 60) * a.avg_hr) : null);

export function analyse(acts: ActSummary[], today: string): Analysis {
  const age = (a: ActSummary) => diffDays(a.local_date, today);
  const past = acts.filter((a) => age(a) >= 0);
  const inBlock = (i: number) => past.filter((a) => { const g = age(a); return g >= i * 7 && g < (i + 1) * 7; });
  const raw = Array.from({ length: 12 }, (_, i) => {
    const xs = inBlock(i), ms = xs.filter(measured);
    return {
      end: addDays(today, -i * 7), km: xs.reduce((t, a) => t + a.distance_m, 0) / 1000, runs: xs.length, longest: Math.max(0, ...xs.map((a) => a.distance_m / 1000)),
      time_s: xs.reduce((t, a) => t + a.moving_time_s, 0), pace: median(ms.map((a) => paceOf(a)!)), hr: median(ms.filter((a) => a.avg_hr).map((a) => a.avg_hr!)), ratio: null as number | null,
    };
  });
  const history_days = Math.min(84, Math.max(0, ...past.map(age)));
  for (let i = 0; i < 12; i++) {
    const chronic = (raw[i].km + (raw[i + 1]?.km ?? 0) + (raw[i + 2]?.km ?? 0) + (raw[i + 3]?.km ?? 0)) / 4;
    raw[i].ratio = i + 3 < 12 && history_days >= (i + 4) * 7 - 7 && chronic >= 3 ? raw[i].km / chronic : null;
  }
  const mean = (n: number) => raw.slice(0, n).reduce((t, b) => t + b.km, 0) / n;
  const mean4 = mean(4), mean8 = mean(8);
  const runs56 = past.filter((a) => age(a) < 56).length;
  const last28 = past.filter((a) => age(a) < 28), prev28 = past.filter((a) => age(a) >= 28 && age(a) < 56);
  const eff = (xs: ActSummary[]) => { const v = xs.map(efficiencyOf).filter((x): x is number => x != null); return v.length >= 3 ? median(v) : null; };
  const m28 = last28.filter(measured);
  return {
    blocks: raw.reverse(), history_days, runs56,
    enough: history_days >= 21 && runs56 >= 4,
    mean4, mean8,
    // Under eight weeks of history only the last four can speak. Otherwise the lower of the two: a recent ramp is not yet a base.
    sustainable_km: history_days >= 49 ? Math.min(mean4, mean8) : mean4,
    longest30: Math.max(0, ...past.filter((a) => age(a) <= 30).map((a) => a.distance_m / 1000)),
    runs_per_week: last28.length / 4,
    active_weeks8: raw.slice(-8).filter((b) => b.runs > 0).length,
    acute7: raw[raw.length - 1].km,
    load_ratio: mean4 >= 3 && history_days >= 21 ? raw[raw.length - 1].km / mean4 : null,
    days_since_last: past.length ? Math.min(...past.map(age)) : null,
    pace28: median(m28.map((a) => paceOf(a)!)), hr28: median(m28.filter((a) => a.avg_hr).map((a) => a.avg_hr!)),
    efficiency28: eff(last28), efficiency_prev: eff(prev28),
  };
}

const DOWN: Record<Experience, Experience> = { experienced: "regular", regular: "new", new: "new" };

/**
 * Hold a profile to the evidence. The plan may start lower than the runner said, never higher than they have shown:
 * recorded training overrules a hopeful estimate, and warning signs switch the build-up to its gentler setting.
 */
export function applyEvidence(p: Profile, a: Analysis): { profile: Profile; notes: Notice[] } {
  if (!a.enough) return { profile: { ...p, fitness: { ...p.fitness, cautious: false, evidence: null } }, notes: [] };
  const f = { ...p.fitness };
  const changes: string[] = [], reasons: string[] = [];
  const shown = Math.round(a.sustainable_km);
  if (f.weekly_km > shown) { changes.push(`weekly distance starts from ${shown} km (your recorded average) instead of the ${f.weekly_km} km you entered`); f.weekly_km = shown; }
  const long = Math.round(a.longest30 * 2) / 2;
  if (long > 0 && f.longest_km > long) { changes.push(`the long run builds from ${long} km, your longest in the last 30 days, instead of ${f.longest_km} km`); f.longest_km = long; }
  let exp = f.experience;
  if (exp === "experienced" && a.mean8 < 25) exp = DOWN[exp];
  if (exp === "regular" && a.mean8 < 8) exp = DOWN[exp];
  if (exp !== f.experience) { changes.push("peak distance and hard sessions are set one level gentler, to match your recent volume"); f.experience = exp; }

  if (a.active_weeks8 < 6 && a.history_days >= 49) reasons.push(`you ran in ${a.active_weeks8} of the last 8 weeks`);
  if (a.load_ratio != null && a.load_ratio > 1.3) reasons.push(`your last 7 days (${a.acute7.toFixed(0)} km) were well above your recent average week (${a.mean4.toFixed(0)} km)`);
  if (a.days_since_last != null && a.days_since_last > 10) reasons.push(`your last run was ${a.days_since_last} days ago`);
  f.cautious = reasons.length > 0;
  f.evidence = { weekly_km: shown, longest_km: long, runs_per_week: Math.round(a.runs_per_week * 10) / 10, runs: a.runs56 };

  const notes: Notice[] = [{
    level: "info", title: "Built from your running history",
    text: `Based on ${a.runs56} runs in the last 8 weeks: about ${shown} km a week over ${f.evidence.runs_per_week} runs, longest ${long} km.` + (changes.length ? ` To avoid doing too much too soon, ${changes.join("; ")}.` : " Your answers match what you have been running, so the plan starts there."),
  }];
  if (reasons.length) notes.push({ level: "warn", title: "Gentler build-up", text: `Because ${reasons.join(" and ")}, weekly distance grows by about 6% instead of 8%, with an easier week every third week instead of every fourth.` });
  return { profile: { ...p, fitness: f }, notes };
}
