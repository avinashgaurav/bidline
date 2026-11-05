/** Display helpers for cell states, money and supplier colours. */
import type { CellStatus } from "./calc/normalise";

const LEGAL_FORM =
  /\s+(pvt\.?|private|public|ltd\.?|limited|llp|inc\.?|incorporated|co\.?|company|corp\.?|corporation|gmbh|plc|s\.?a\.?|b\.?v\.?)\b\.?/gi;

export function shortName(full: string): string {
  const bare = full.replace(LEGAL_FORM, "").replace(/[,.]\s*$/, "").trim();
  const words = bare.split(/\s+/).filter(Boolean);
  if (!words.length) return full;
  const start = /^(the|m\/s\.?)$/i.test(words[0]) ? 1 : 0;
  const rest = words.slice(start);
  if (!rest.length) return words.join(" ");
  return rest.length >= 3 ? rest[0] : rest.join(" ");
}

export type DisplayState = "trusted" | "review" | "caveat" | "empty";

export function displayState(status: CellStatus): DisplayState {
  switch (status) {
    case "comparable":
      return "trusted";
    case "comparable_with_caveat":
      return "caveat";
    case "resolved_from_reference":
    case "needs_review":
    case "unreadable":
      return "review";
    default:
      return "empty";
  }
}

export const EMPTY_GLYPH: Partial<Record<CellStatus, { glyph: string; short: string }>> = {
  unreadable: { glyph: "?", short: "Unreadable" },
  declined: { glyph: "NQ", short: "Not quoted" },
  omitted: { glyph: "·", short: "Missing" },
  non_comparable: { glyph: "~", short: "No firm price" },
  unresolvable: { glyph: "~", short: "No price basis" },
  needs_review: { glyph: "!", short: "Needs review" },
  unmapped: { glyph: "+", short: "No matching line" },
  not_read: { glyph: "", short: "Not read" },
};

export const CELL_CLASS: Record<DisplayState, string> = {
  trusted: "",
  review: "cell-review",
  caveat: "cell-caveat",
  empty: "cell-empty",
};

export const STATUS_ACTION: Record<CellStatus, { label: string; action: string }> = {
  comparable: {
    label: "Ready",
    action: "No action needed. Included in the comparison.",
  },
  comparable_with_caveat: {
    label: "Off-spec",
    action: "The supplier quoted a different item or specification. Decide if it is acceptable.",
  },
  resolved_from_reference: {
    label: "From previous PO",
    action: "Ask the supplier to confirm this price. Excluded from totals until confirmed.",
  },
  needs_review: {
    label: "Needs review",
    action: "Bidline cannot convert this price to the requested unit. Review it. Excluded from totals.",
  },
  unreadable: {
    label: "Unreadable",
    action: "The document shows a price that cannot be read. Open the original document.",
  },
  declined: {
    label: "Not quoted",
    action: "The supplier declined to quote this line. No follow-up needed.",
  },
  not_read: {
    label: "Not read",
    action:
      "No documents from this supplier have been read yet, so this is not a missing price. " +
      "Upload their quote, or ask Claude to read it.",
  },
  omitted: {
    label: "Missing",
    action: "The supplier did not quote this line. Send a follow-up.",
  },
  non_comparable: {
    label: "No firm price",
    action: "The quote has no firm price for this line, so it cannot be compared. Ask for one.",
  },
  unresolvable: {
    label: "No price basis",
    action: "The price refers to a document Bidline does not have. Ask the supplier for a firm price.",
  },
  unmapped: {
    label: "No matching line",
    action: "This item does not match any line item in the event. Choose a line or exclude it.",
  },
};

export const perUnit = (uom?: string | null) => {
  const u = String(uom ?? "").trim();
  if (!u) return "";
  return /^per\b/i.test(u) ? u : `per ${u}`;
};

export const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export const num = (n: number) => Math.round(n).toLocaleString("en-IN");

export function inrShort(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e7) return `₹${(n / 1e7).toFixed(2)} cr`;
  if (a >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  return inr(n);
}

export function inrDelta(n: number): string {
  const s = inrShort(Math.abs(n));
  return n >= 0 ? `+${s}` : `-${s}`;
}

export const pct = (n: number, dp = 1) => `${n >= 0 ? "" : "-"}${Math.abs(n).toFixed(dp)}%`;

export const VENDOR_TINT = [
  "oklch(0.55 0.13 250)",
  "oklch(0.55 0.13 160)",
  "oklch(0.58 0.13 300)",
  "oklch(0.58 0.14 40)",
  "oklch(0.55 0.10 200)",
];
