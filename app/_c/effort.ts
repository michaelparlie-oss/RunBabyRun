import type { Session } from "@/lib/types";

/** One colour and one word per kind of session, used by every card, strip and legend. */
export const EFFORT = {
  easy: { label: "Easy", color: "var(--color-easy)" },
  long: { label: "Long", color: "var(--color-long)" },
  quality: { label: "Hard", color: "var(--color-hard)" },
  test: { label: "Test", color: "var(--color-test)" },
  race: { label: "Race", color: "var(--color-ink)" },
  strength: { label: "Strength", color: "var(--color-strength)" },
} as const;
export type EffortKey = keyof typeof EFFORT;
export const effortOf = (s: Pick<Session, "category" | "kind">): EffortKey => (s.category !== "run" ? "strength" : (s.kind ?? "easy"));
