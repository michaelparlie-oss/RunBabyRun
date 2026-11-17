import { describe, it, expect } from "vitest";
import { generatePlan, PlanError, SPEC, spikeCap } from "@/lib/plan/generate";
import { computeZones, maxHrFromAge, riegel } from "@/lib/zones";
import { addDays, diffDays, dow } from "@/lib/util/dates";
import type { Experience, Plan, Profile, RaceKey } from "@/lib/types";
import { profile } from "./helpers";

const TODAY = "2026-11-17"; // a Tuesday

function check(p: Profile, plan: Plan) {
  const runs = plan.sessions.filter((s) => s.category === "run");
  const ids = plan.sessions.map((s) => s.id);
  expect(new Set(ids).size).toBe(ids.length);
  // inside the window, one run a day, on chosen days (race day and the optional shake-out excepted)
  for (const s of plan.sessions) {
    expect(s.date >= TODAY && s.date <= p.race.date).toBe(true);
    if (s.category === "run" && s.kind !== "race" && !s.optional) expect(p.schedule.run_days).toContain(dow(s.date));
  }
  expect(new Set(runs.map((r) => r.date)).size).toBe(runs.length);
  // exactly one race, on race day, with the right distance
  const race = runs.filter((r) => r.kind === "race");
  expect(race).toHaveLength(1);
  expect(race[0].date).toBe(p.race.date);
  expect(race[0].distance_km).toBeCloseTo(SPEC[p.race.key] && plan.summary.race_km, 0);
  // segments add up to the session distance; durations are positive
  const zones = computeZones(p);
  for (const r of runs) {
    let km = 0;
    for (const g of r.segments) {
      expect((g.distance_km == null) !== (g.duration_s == null)).toBe(true);
      const z = zones[g.zone];
      const mid = z.pace_min_s_per_km != null ? (z.pace_min_s_per_km + z.pace_max_s_per_km!) / 2 : 420;
      if (g.kind !== "strides") km += (g.distance_km ?? g.duration_s! / mid) * g.repeat + (g.recovery ? ((g.repeat - 1) * g.recovery.duration_s) / ((zones.REC.pace_min_s_per_km! + zones.REC.pace_max_s_per_km!) / 2) : 0);
    }
    if (!r.optional) expect(Math.abs(km - r.distance_km!)).toBeLessThan(0.35);
    expect(r.est_duration_min!).toBeGreaterThan(0);
  }
  // long-run cap: never more than 10% (or 1 km under 10 km) beyond the longest run of the previous 30 days
  const hist = [{ date: addDays(plan.start, -3), km: Math.max(3, p.fitness.longest_km) }];
  for (const r of runs) {
    if (r.kind !== "race" && !r.optional) {
      const longest = Math.max(0, ...hist.filter((h) => diffDays(h.date, r.date) > 0 && diffDays(h.date, r.date) <= 30).map((h) => h.km));
      if (longest > 0) expect(r.distance_km!, `${r.date} ${r.title} vs longest ${longest}`).toBeLessThanOrEqual(Math.max(spikeCap(longest) + 0.26, r.kind === "long" ? 0 : 6));
    }
    hist.push({ date: r.date, km: r.distance_km! });
  }
  // weekly volume never jumps more than ~15% above the highest earlier week (rounding included)
  let hi = Math.max(p.fitness.weekly_km, 14);
  for (const w of plan.weeks.slice(0, -1)) {
    if (w.start >= TODAY) expect(w.planned_km, `week ${w.n}`).toBeLessThanOrEqual(hi * 1.15 + 2.5);
    hi = Math.max(hi, w.planned_km);
  }
  // taper weeks sit below the peak
  for (const w of plan.weeks) if (w.phase === "Taper") expect(w.planned_km).toBeLessThan(plan.summary.peak_km);
  // strength never on the day before the long run or the race
  const hard = new Set(runs.filter((r) => r.kind === "long" || r.kind === "race").map((r) => r.date));
  for (const s of plan.sessions.filter((x) => x.category === "strength")) {
    expect(hard.has(addDays(s.date, 1)), `strength on ${s.date}`).toBe(false);
    expect(plan.templates[s.template!]).toBeTruthy();
  }
}

describe("plan generator", () => {
  const races: [RaceKey, string][] = [["5k", "2027-01-17"], ["10k", "2027-02-07"], ["hm", "2027-03-14"], ["fm", "2027-06-13"]];
  const levels: [Experience, number, number][] = [["new", 8, 4], ["regular", 25, 10], ["experienced", 55, 20]];
  const days: [number[], number][] = [[[1, 3, 6], 6], [[0, 2, 4, 5], 5], [[0, 1, 3, 4, 6], 6], [[0, 1, 2, 3, 4, 5], 5]];

  it("produces a valid, safe plan for every race, level and schedule", () => {
    let n = 0;
    for (const [key, date] of races)
      for (const [experience, weekly_km, longest_km] of levels)
        for (const [run_days, long_day] of days)
          for (const strength of [0, 1, 2] as const) {
            const p = profile({ race: { key, date, goal: "finish", goal_time_s: null }, fitness: { experience, weekly_km, longest_km, can_run_30: experience !== "new" }, schedule: { run_days, long_day, strength_per_week: strength, equipment: strength === 1 ? "bodyweight" : "gym" } });
            check(p, generatePlan(p, TODAY));
            n++;
          }
    expect(n).toBe(144);
  });

  it("handles race days that are not the long-run day, and mid-week starts", () => {
    for (const date of ["2027-03-13", "2027-03-14", "2027-03-10", "2027-03-08"]) {
      const p = profile({ race: { date } });
      for (const today of ["2026-11-16", "2026-11-19", "2026-11-22"]) {
        const plan = generatePlan(p, today);
        expect(plan.sessions.at(-1)!.date).toBe(date);
        expect(plan.sessions.every((s) => s.date >= today)).toBe(true);
      }
    }
  });

  it("marathon for a regular runner: 3-week taper, long run reaches 28–30 km, deload every 4th week", () => {
    const p = profile({ race: { key: "fm", date: "2027-06-13", goal_time_s: 4 * 3600 + 30 * 60 }, fitness: { weekly_km: 35, longest_km: 18 } });
    const plan = generatePlan(p, TODAY);
    expect(plan.weeks.filter((w) => w.phase === "Taper")).toHaveLength(2);
    expect(plan.weeks.at(-1)!.phase).toBe("Race week");
    expect(plan.summary.peak_long_km).toBeGreaterThanOrEqual(28);
    expect(plan.summary.peak_long_km).toBeLessThanOrEqual(30);
    expect(plan.weeks.filter((w) => w.deload).length).toBeGreaterThanOrEqual(5);
    expect(plan.sessions.some((s) => s.kind === "test")).toBe(true);
    expect(plan.sessions.some((s) => s.kind === "long" && s.segments.some((g) => g.zone === "RP"))).toBe(true);
  });

  it("is more careful with health flags, sore areas and newer runners", () => {
    const base = generatePlan(profile(), TODAY);
    const careful = generatePlan(profile({ health: { niggles: ["knee"] } }), TODAY);
    expect(careful.weeks.filter((w) => w.deload).length).toBeGreaterThan(base.weeks.filter((w) => w.deload).length);
    expect(careful.templates.A_base.items.some((i) => i.exercise === "step_up")).toBe(true);
    const flagged = generatePlan(profile({ health: { flags: ["chest_pain"] } }), TODAY);
    expect(flagged.notices[0]).toMatchObject({ level: "stop" });
    const beginner = generatePlan(profile({ race: { key: "5k", date: "2027-02-14", goal: "finish", goal_time_s: null }, fitness: { experience: "new", weekly_km: 0, longest_km: 0, can_run_30: false, ref_source: "estimate" } }), TODAY);
    const firstWeeks = beginner.sessions.filter((s) => s.week <= 2 && s.category === "run");
    expect(firstWeeks.every((s) => s.kind === "easy" || s.kind === "long")).toBe(true);
    expect(firstWeeks.every((s) => s.distance_km! <= 5)).toBe(true);
  });

  it("warns honestly about short build-ups and stretch goals, and refuses impossible dates", () => {
    const short = generatePlan(profile({ race: { key: "fm", date: "2027-01-10", goal_time_s: 3 * 3600 } }), TODAY);
    const titles = short.notices.map((n) => n.title);
    expect(titles).toContain("Short build-up");
    expect(titles).toContain("Very ambitious goal");
    expect(titles).toContain("Long run stays short");
    expect(() => generatePlan(profile({ race: { date: "2026-11-24" } }), TODAY)).toThrow(PlanError);
    expect(() => generatePlan(profile({ race: { date: "2028-06-01" } }), TODAY)).toThrow(PlanError);
    expect(() => generatePlan(profile({ schedule: { run_days: [0, 2], long_day: 2 } }), TODAY)).toThrow(PlanError);
  });

  it("bodyweight runners get no barbell exercises", () => {
    const plan = generatePlan(profile({ schedule: { equipment: "bodyweight" } }), TODAY);
    const used = new Set(Object.values(plan.templates).flatMap((t) => t.items.map((i) => i.exercise)));
    for (const x of ["back_squat", "trap_bar_dl", "box_jump", "pallof", "calf_seated", "goblet_squat"]) expect(used.has(x)).toBe(false);
  });
});

describe("zones", () => {
  it("reproduces the reference runner (10K 1:09:02): easy 7:50–8:40, tempo 7:00–7:10", () => {
    const z = computeZones(profile({ fitness: { ref_distance_km: 10, ref_time_s: 4142 }, health: { max_hr: 200, max_hr_source: "entered" }, race: { key: "fm", goal_time_s: 4 * 3600 + 59 * 60 } }));
    expect([z.E.pace_min_s_per_km, z.E.pace_max_s_per_km]).toEqual([470, 520]);
    expect([z.T.pace_min_s_per_km, z.T.pace_max_s_per_km]).toEqual([420, 430]);
    expect([z.RP.pace_min_s_per_km, z.RP.pace_max_s_per_km]).toEqual([420, 430]);
    expect([z.E.hr_min, z.E.hr_max]).toEqual([136, 156]);
  });
  it("converts a 5K result with Riegel and estimates max HR from age", () => {
    expect(riegel(1500, 5, 10)).toBeCloseTo(1500 * 2 ** 1.06, 5);
    expect(maxHrFromAge(40)).toBe(180);
    const z = computeZones(profile({ health: { age: 40, max_hr: null } }));
    expect(z.E.hr_max).toBe(Math.round(180 * 0.78));
  });
});
