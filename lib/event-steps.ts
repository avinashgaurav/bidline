/** One sourcing event's steps, in working order. Same keys as the event page's tabs. */
export const EVENT_STEPS = [
  { tab: "lines", label: "Line items" },
  { tab: "suppliers", label: "Suppliers" },
  { tab: "documents", label: "Documents" },
  { tab: "comparison", label: "Compare quotes" },
  { tab: "questionnaire", label: "Questionnaire" },
  { tab: "chase", label: "Follow-ups" },
  { tab: "award", label: "Award" },
  { tab: "assumptions", label: "Rates & units" },
  { tab: "activity", label: "Activity" },
] as const;
