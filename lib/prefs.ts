/**
 * Display preferences (Settings, Preferences): how numbers, money and dates
 * read. Pure, safe on server and client. Comparisons always run in INR.
 */
export interface Prefs { currency: "INR"; numberFormat: "indian" | "international"; dateFormat: "d MMM yyyy" | "dd/mm/yyyy" | "yyyy-mm-dd"; timeZone: string }

export const DEFAULT_PREFS: Prefs = { currency: "INR", numberFormat: "indian", dateFormat: "d MMM yyyy", timeZone: "Asia/Kolkata" };

export const TIME_ZONES = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "America/New_York", "UTC"];
export const DATE_FORMATS: Array<{ key: Prefs["dateFormat"]; label: string }> = [
  { key: "d MMM yyyy", label: "5 Nov 2026" },
  { key: "dd/mm/yyyy", label: "05/11/2026" },
  { key: "yyyy-mm-dd", label: "2026-11-05" },
];

export function readPrefs(raw: unknown): Prefs {
  const p = (raw ?? {}) as Partial<Prefs>;
  return {
    currency: "INR",
    numberFormat: p.numberFormat === "international" ? "international" : "indian",
    dateFormat: DATE_FORMATS.some((d) => d.key === p.dateFormat) ? p.dateFormat! : DEFAULT_PREFS.dateFormat,
    timeZone: TIME_ZONES.includes(p.timeZone ?? "") ? p.timeZone! : DEFAULT_PREFS.timeZone,
  };
}

const locale = (p: Prefs) => (p.numberFormat === "indian" ? "en-IN" : "en-US");

/** Whole rupees with grouping: 12,34,567 or 1,234,567. */
export function money(v: number, p: Prefs = DEFAULT_PREFS): string {
  return `₹${Math.round(v).toLocaleString(locale(p))}`;
}

/** Short money: ₹3.88 cr and ₹39.2 L, or ₹38.8M and ₹3.9M. */
export function moneyShort(v: number, p: Prefs = DEFAULT_PREFS): string {
  const a = Math.abs(v);
  if (p.numberFormat === "international") {
    if (a >= 1e9) return `₹${(v / 1e9).toFixed(2)}B`;
    if (a >= 1e6) return `₹${(v / 1e6).toFixed(1)}M`;
    if (a >= 1e4) return `₹${(v / 1e3).toFixed(0)}K`;
    return money(v, p);
  }
  if (a >= 1e7) return `₹${(v / 1e7).toFixed(2)} cr`;
  if (a >= 1e5) return `₹${(v / 1e5).toFixed(1)} L`;
  return money(v, p);
}

export function date(iso: string, p: Prefs = DEFAULT_PREFS): string {
  const d = new Date(iso);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: p.timeZone, day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(d).map((x) => [x.type, x.value]));
  if (p.dateFormat === "dd/mm/yyyy") return `${parts.day}/${parts.month}/${parts.year}`;
  if (p.dateFormat === "yyyy-mm-dd") return `${parts.year}-${parts.month}-${parts.day}`;
  return d.toLocaleDateString("en-IN", { timeZone: p.timeZone, day: "numeric", month: "short", year: "numeric" });
}

export function time(iso: string, p: Prefs = DEFAULT_PREFS, seconds = false): string {
  return new Date(iso).toLocaleTimeString("en-IN", { timeZone: p.timeZone, hour: "2-digit", minute: "2-digit", ...(seconds ? { second: "2-digit" } : {}) });
}
