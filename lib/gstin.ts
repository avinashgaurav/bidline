/**
 * GSTIN check that works offline: the shape (state code, PAN, entity number,
 * the letter Z) and the check digit. It cannot say whether the registration is
 * active; that needs a GST data provider (planned for V2).
 */
const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const SHAPE = /^(\d{2})([A-Z]{5}\d{4}[A-Z])([1-9A-Z])Z([0-9A-Z])$/;

export function gstinCheckDigit(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const p = CHARS.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36];
}

export type GstinResult = { status: "missing" } | { status: "invalid"; why: string } | { status: "valid"; state: string; pan: string };

export function checkGstin(raw: string | null | undefined): GstinResult {
  const g = (raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (!g) return { status: "missing" };
  if (g.length !== 15) return { status: "invalid", why: `A GSTIN has 15 characters; this has ${g.length}.` };
  const m = SHAPE.exec(g);
  if (!m) return { status: "invalid", why: "It does not follow the GSTIN pattern: state code, PAN, entity number, Z, check digit." };
  const state = Number(m[1]);
  if (!((state >= 1 && state <= 38) || state === 97 || state === 99)) return { status: "invalid", why: `${m[1]} is not an Indian state code.` };
  if (gstinCheckDigit(g.slice(0, 14)) !== g[14]) return { status: "invalid", why: "The last character (check digit) does not match. There may be a typing mistake." };
  return { status: "valid", state: m[1], pan: m[2] };
}
