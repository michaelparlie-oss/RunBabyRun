import exercisesJson from "@/data/exercises.json";
import type { Equipment, StrengthItem, StrengthTemplate } from "@/lib/types";

export interface Exercise {
  name: string; category: string; equipment: string; purpose: string;
  how: string[]; cues: string[]; mistakes: string[]; start: string; progress: string; easier: string; harder: string;
}
export const EXERCISES = exercisesJson as Record<string, Exercise>;

const it = (exercise: string, sets: number, reps: string, rest_s: number, rpe: number | null = null, note = ""): StrengthItem => {
  if (!EXERCISES[exercise]) throw new Error(`Unknown exercise ${exercise}`);
  return { exercise, sets, reps, rest_s, rpe, note };
};

const WARMUP = [it("glute_bridge", 1, "10", 0, null, "After 5 min of easy movement"), it("lateral_walk", 2, "10 steps each way", 30)];

/**
 * Strength templates for one runner. Menus depend on the equipment they have and on any sore areas
 * they reported. Loads follow RPE (reps in reserve), so the same menu fits different strength levels.
 */
export function buildTemplates(eq: Equipment, niggles: string[]): Record<string, StrengthTemplate> {
  const knee = niggles.includes("knee");
  const foot = niggles.includes("foot");
  const squat = eq === "gym" ? "back_squat" : eq === "dumbbells" ? "goblet_squat" : "bw_squat";
  const squatEasy = eq === "bodyweight" ? "bw_squat" : "goblet_squat";
  const hinge = eq === "bodyweight" ? "sl_rdl" : "rdl";
  const pull = eq === "gym" ? "trap_bar_dl" : eq === "dumbbells" ? "rdl" : "hip_thrust";
  const single = knee ? "step_up" : "split_squat";
  const jump = eq === "gym" ? "box_jump" : "squat_jump";
  const antiRot = eq === "gym" ? it("pallof", 3, "10 per side", 30) : it("dead_bug", 3, "8 per side", 30);
  const bentCalf = eq === "bodyweight" ? [] : [it("calf_seated", 3, "15", 60, 7)];
  const feet = foot ? [it("foot_drills", 2, "10 spreads + 3×10 s holds", 0)] : [];
  const kneeNote = knee ? "Pain-free range only" : "";
  const bw = eq === "bodyweight";
  const heavy = (gymReps: string) => (bw ? "12–15, slow lowering" : gymReps);

  return {
    A_base: {
      name: "Strength A: foundation", minutes: 45, intent: "Learn the movements with moderate effort: stop each set with about 3 reps left (RPE 7).",
      items: [...WARMUP, it(squatEasy, 3, heavy("10"), 90, 7, kneeNote), it(hinge, 3, bw ? "8 per leg" : "10", 90, 7), it(single, 3, "8 per leg", 90, 7, kneeNote),
        it("calf_standing", 3, "12", 60, 7, "3 s lowering"), ...bentCalf, it("hip_abduction", 3, "15 per side", 45), it("tibialis_raise", 2, "15", 45), it("dead_bug", 3, "8 per side", 45), it("side_plank", 3, "30 s per side", 30), ...feet],
    },
    B_base: {
      name: "Strength B: foundation", minutes: 35, intent: "Light jumps for springy ankles, then single-leg strength. RPE 7.",
      items: [it("a_skip", 2, "20 m", 60, null, "Jumps first, while fresh"), it("pogo", 2, "20", 60), it(pull, 3, bw ? "12" : "8", 120, 7), it("step_up", 3, "8 per leg", 60, 7),
        ...(hinge === "sl_rdl" ? [] : [it("sl_rdl", 3, "8 per leg", 60, 7)]), it("hip_thrust", 3, bw ? "12 per leg, single-leg" : "10", 60, 7), it("copenhagen", 3, "15 s per side", 30), antiRot, ...feet],
    },
    A_build: {
      name: "Strength A: build", minutes: 50, intent: bw ? "Harder single-leg and slow-lowering work. Stop with about 2 reps left (RPE 8)." : "Heavier, fewer reps. Stop with about 2 reps left (RPE 8).",
      items: [...WARMUP, it(squat, 4, heavy("5"), bw ? 90 : 180, 8, bw ? kneeNote : "Two lighter warm-up sets first"), it(hinge, 3, bw ? "8 per leg" : "6", 150, 8), it(single, 3, "6 per leg", 120, 8, kneeNote),
        it("calf_standing", 4, "8 per leg, single-leg", 90, 8), ...bentCalf.map((x) => ({ ...x, reps: "12", rpe: 8 })), it("hip_abduction", 3, "12 per side", 45), it("dead_bug", 3, "8 per side", 45), it("side_plank", 3, "40 s per side", 30), ...feet],
    },
    B_build: {
      name: "Strength B: power", minutes: 40, intent: "Jumps (60–80 ground contacts), then a strong pull. RPE 8.",
      items: [it("pogo", 3, "20", 60), it(jump, 4, "4", 90, null, eq === "gym" ? "Step down, don't jump down" : ""), it("bounds", 3, "20 m", 90), it(pull, 4, bw ? "10 per leg, single-leg" : "4", bw ? 90 : 180, 8),
        it("step_up", 3, "6 per leg", 90, 8), it("hip_thrust", 3, bw ? "10 per leg, single-leg" : "8", 90, 8), it("copenhagen", 3, "20 s per side", 30), antiRot],
    },
    taper: {
      name: "Strength: taper (short and fresh)", minutes: 25, intent: "Keep the feel of strength work without soreness. Half your usual sets.",
      items: [...WARMUP, it(squat, 2, bw ? "8" : "3", bw ? 60 : 180, 7, bw ? "" : "Usual working weight"), it(hinge, 2, bw ? "6 per leg" : "5", 120, 7), it("calf_standing", 2, "8", 60, 7), it("hip_abduction", 2, "12 per side", 45), it("pogo", 2, "10", 60)],
    },
    mobility: {
      name: "Mobility only (race week)", minutes: 12, intent: "Stay loose. No load, nothing that leaves you sore.",
      items: [it("glute_bridge", 2, "10", 30), it("lateral_walk", 1, "10 steps each way", 30), it("dead_bug", 2, "6 per side", 30), ...feet],
    },
  };
}
