/** One sourcing event's steps, in working order. Same keys as the event page's tabs. */
export const EVENT_STEPS = [
  { tab: "overview", label: "Overview", help: "Charts: prices against budget, lines won, quote quality and spend by category." },
  { tab: "lines", label: "Line items", help: "What you are buying: each item, quantity, unit and budget." },
  { tab: "suppliers", label: "Suppliers", help: "Who you asked to quote, their contact details and how far each has got." },
  { tab: "documents", label: "Documents", help: "Supplier quotes and certificates. Upload them here, then ask Claude to read them." },
  { tab: "comparison", label: "Compare quotes", help: "Every supplier's price per line, converted like for like. Click a price to see where it came from." },
  { tab: "questionnaire", label: "Questionnaire", help: "Qualification questions and each supplier's answers, checked by rules: pass, fail or not assessed." },
  { tab: "chase", label: "Follow-ups", help: "What each supplier still owes you, the money affected, and a drafted email." },
  { tab: "award", label: "Award", help: "Award options priced like for like, the award note and the approval link." },
  { tab: "assumptions", label: "Rates & units", help: "Exchange rates, unit conversions and prior-order rates the comparison relies on." },
  { tab: "activity", label: "Activity", help: "Every change by Claude, you or the approver, in order." },
] as const;
