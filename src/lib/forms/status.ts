export type ModuleStatusValue = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "NOT_RELEVANT";

export const STATUS_LABELS: Record<ModuleStatusValue, string> = {
  NOT_STARTED: "Ikke startet",
  IN_PROGRESS: "I gang",
  COMPLETED: "Færdig",
  NOT_RELEVANT: "Ikke relevant",
};

export const STATUS_TONE = { NOT_STARTED: "neutral", IN_PROGRESS: "amber", COMPLETED: "green", NOT_RELEVANT: "neutral" } as const;
