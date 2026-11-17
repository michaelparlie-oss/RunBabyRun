import type { Session } from "@/lib/types";

/** One colour and one word per kind of session, used by every card, strip and legend. */
export const EFFORT = {
  easy: { label: "Easy", color: "var(--color-easy)", ink: "var(--color-easy-ink)" },
  long: { label: "Long", color: "var(--color-long)", ink: "var(--color-long-ink)" },
  quality: { label: "Hard", color: "var(--color-hard)", ink: "var(--color-hard-ink)" },
  test: { label: "Test", color: "var(--color-test)", ink: "var(--color-test-ink)" },
  race: { label: "Race", color: "var(--color-race)", ink: "var(--color-race-ink)" },
  strength: { label: "Strength", color: "var(--color-strength)", ink: "var(--color-strength-ink)" },
} as const;
export type EffortKey = keyof typeof EFFORT;
export const effortOf = (s: Pick<Session, "category" | "kind">): EffortKey => (s.category !== "run" ? "strength" : (s.kind ?? "easy"));
