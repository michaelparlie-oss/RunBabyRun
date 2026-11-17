import type { Profile } from "@/lib/types";

export function profile(over: {
  race?: Partial<Profile["race"]>; fitness?: Partial<Profile["fitness"]>; schedule?: Partial<Profile["schedule"]>; health?: Partial<Profile["health"]>;
} = {}): Profile {
  return {
    version: 1, created_at: "2026-11-17T00:00:00Z", tz: "Asia/Jakarta",
    race: { key: "hm", date: "2027-03-14", name: "Test Half", goal: "time", goal_time_s: 2 * 3600 + 10 * 60, ...over.race },
    fitness: { ref_distance_km: 10, ref_time_s: 60 * 60, ref_source: "race", weekly_km: 25, longest_km: 10, experience: "regular", can_run_30: true, ...over.fitness },
    schedule: { run_days: [0, 2, 4, 5], long_day: 5, strength_per_week: 2, equipment: "gym", ...over.schedule },
    health: { adult: true, age: 30, max_hr: null, max_hr_source: "age", flags: [], ack: true, niggles: [], ...over.health },
  };
}
