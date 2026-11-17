import { describe, expect, it } from "vitest";
import { analyse, applyEvidence } from "@/lib/analysis";
import { generatePlan } from "@/lib/plan/generate";
import type { ActSummary, Profile } from "@/lib/types";
import { addDays } from "@/lib/util/dates";

const TODAY = "2026-11-17";
let n = 0;
const run = (ago: number, km: number, pace = 400, hr: number | null = 150): ActSummary => ({
  id: ++n, name: "Run", sport_type: "Run", start_date_local: `${addDays(TODAY, -ago)}T06:00:00`, local_date: addDays(TODAY, -ago),
  distance_m: km * 1000, moving_time_s: km * pace, elapsed_time_s: km * pace, avg_hr: hr, max_hr: null, avg_speed: 1000 / pace,
});
/** `weeks` of history, each with the given runs (days-ago offset within the week, km). */
const steady = (weeks: number, perWeek: [number, number][]) => Array.from({ length: weeks }, (_, w) => perWeek.map(([d, km]) => run(w * 7 + d, km))).flat();
const profile = (weekly: number, longest: number, experience: Profile["fitness"]["experience"] = "regular"): Profile => ({
  tz: "Asia/Jakarta", race: { key: "hm", date: addDays(TODAY, 16 * 7 + 5), name: "Test Half", goal: "finish", goal_time_s: null },
  fitness: { ref_distance_km: 10, ref_time_s: 3900, ref_source: "race", weekly_km: weekly, longest_km: longest, experience, can_run_30: true },
  schedule: { run_days: [1, 3, 5, 6], long_day: 6, strength_per_week: 0, equipment: "bodyweight" },
  health: { adult: true, age: 30, max_hr: null, max_hr_source: "age", flags: [], niggles: [] },
} as unknown as Profile);

describe("training history", () => {
  it("measures weekly volume, longest run and load ratio from recorded runs", () => {
    const a = analyse(steady(10, [[1, 5], [3, 6], [5, 9]]), TODAY);
    expect(a.enough).toBe(true);
    expect(a.mean4).toBeCloseTo(20);
    expect(a.sustainable_km).toBeCloseTo(20);
    expect(a.longest30).toBe(9);
    expect(a.runs_per_week).toBe(3);
    expect(a.active_weeks8).toBe(8);
    expect(a.load_ratio).toBeCloseTo(1);
    expect(a.pace28).toBe(400);
    expect(a.blocks).toHaveLength(12);
  });

  it("does not overrule the runner on thin history", () => {
    const a = analyse([run(2, 5), run(5, 5)], TODAY);
    expect(a.enough).toBe(false);
    const { profile: p, notes } = applyEvidence(profile(40, 18), a);
    expect(p.fitness.weekly_km).toBe(40);
    expect(notes).toHaveLength(0);
  });

  it("treats a recent ramp as not yet a base", () => {
    const acts = [...steady(4, [[1, 10], [3, 10], [5, 10]]), ...steady(4, [[1, 4], [3, 4], [5, 4]]).map((a) => ({ ...a, local_date: addDays(a.local_date, -28) }))];
    const a = analyse(acts, TODAY);
    expect(a.mean4).toBeCloseTo(30);
    expect(a.sustainable_km).toBeCloseTo(21); // mean of the last eight weeks
  });

  it("starts the plan from what was run, not from an optimistic answer", () => {
    const acts = steady(10, [[1, 5], [3, 6], [5, 9]]);
    const { profile: p, notes } = applyEvidence(profile(45, 20, "experienced"), analyse(acts, TODAY));
    expect(p.fitness.weekly_km).toBe(20);
    expect(p.fitness.longest_km).toBe(9);
    expect(p.fitness.experience).toBe("regular");
    expect(notes[0].text).toContain("instead of the 45 km you entered");
    const honest = generatePlan(p, TODAY), hopeful = generatePlan(profile(45, 20, "experienced"), TODAY);
    expect(honest.weeks[0].planned_km).toBeLessThan(hopeful.weeks[0].planned_km);
    expect(honest.weeks[0].planned_km).toBeLessThanOrEqual(22);
  });

  it("never raises what the runner entered", () => {
    const { profile: p } = applyEvidence(profile(12, 6), analyse(steady(10, [[1, 8], [3, 8], [5, 14]]), TODAY));
    expect(p.fitness.weekly_km).toBe(12);
    expect(p.fitness.longest_km).toBe(6);
  });

  it("switches to the gentler build-up after a gap, a spike or patchy weeks", () => {
    const gap = applyEvidence(profile(20, 9), analyse(steady(10, [[1, 5], [3, 6], [5, 9]]).filter((a) => a.local_date <= addDays(TODAY, -12)), TODAY));
    expect(gap.profile.fitness.cautious).toBe(true);
    expect(gap.notes.some((x) => x.title === "Gentler build-up")).toBe(true);
    const spike = applyEvidence(profile(20, 9), analyse([...steady(10, [[1, 5], [3, 6], [5, 9]]), run(0, 12), run(2, 10)], TODAY));
    expect(spike.profile.fitness.cautious).toBe(true);
    const fine = applyEvidence(profile(20, 9), analyse(steady(10, [[1, 5], [3, 6], [5, 9]]), TODAY));
    expect(fine.profile.fitness.cautious).toBe(false);
  });

  it("keeps the biggest week within reach of today's volume and growth under 10% a week", () => {
    const plan = generatePlan(profile(15, 7), TODAY);
    expect(plan.summary.peak_km).toBeLessThanOrEqual(Math.max(15 * 1.8, 15 + 12) + 3); // sessions round to the half kilometre
    expect(plan.notices.some((x) => x.title === "Peak kept within reach")).toBe(true);
    const build = plan.weeks.filter((w) => w.phase !== "Taper" && w.phase !== "Race week");
    let high = build[0].planned_km;
    for (const w of build.slice(1)) { expect(w.planned_km).toBeLessThanOrEqual(high * 1.1 + 2); high = Math.max(high, w.planned_km); }
  });
});
