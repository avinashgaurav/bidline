import { json, newId, one, q, type Row } from "./db";
import type { CalcRules, PriorPo, RfxLine, UomConversion } from "./calc/normalise";
import type { QuestionSpec } from "./calc/questionnaire";

// ---------------------------------------------------------------------------
// Types as the rest of the app sees them
// ---------------------------------------------------------------------------

export interface RfxRow {
  id: string;
  user_id: string;
  code: string;
  title: string;
  status: string;
  /** RFQ, RFP, RFI or TENDER: shown beside the event name. */
  event_type: string;
  buyer: Record<string, unknown>;
  approver: Record<string, unknown>;
  terms_asked: Record<string, unknown>;
  notes: string | null;
  gate: { overrideReason?: string; overriddenAt?: string } | null;
  issued_at: string | null;
  due_at: string | null;
  created_via: string;
  created_at: string;
  updated_at: string;
}

export interface SupplierRow {
  id: string;
  rfx_id: string;
  code: string;
  name: string;
  city: string | null;
  gstin: string | null;
  contact: Record<string, unknown>;
  channel: string;
  status: string;
  invited_at: string | null;
  notes: string | null;
}

export interface AssumptionRow {
  id: string;
  key: string;
  value: unknown;
  source: string;
  alternative: string | null;
  note: string | null;
  confidence: string | null;
  set_by: string;
  version: number;
  updated_at: string;
}

export class NotFound extends Error {}
export class BadInput extends Error {}

// ---------------------------------------------------------------------------
// Lookup. Every read is scoped to the signed-in user (or the MCP token's user).
// ---------------------------------------------------------------------------

/**
 * Find an RFx by id or by its code ("RFX-2026-0142"). With no reference, the
 * one most recently touched: what someone means by "the RFx" in a chat.
 */
export async function resolveRfx(userId: string, ref?: string | null): Promise<RfxRow> {
  const r = ref?.trim();
  const row = r
    ? await one<RfxRow>(
        `select * from rfx where user_id = $1 and (id = $2 or lower(code) = lower($2)) limit 1`,
        [userId, r],
      )
    : await one<RfxRow>(
        `select * from rfx where user_id = $1 and status <> 'closed' order by updated_at desc limit 1`,
        [userId],
      );
  if (!row) {
    throw new NotFound(
      r
        ? `No enquiry '${r}' in this workspace. Use list_rfxs to see what exists.`
        : "This workspace has no enquiries yet. Create one with create_rfx, or load the demo from the dashboard.",
    );
  }
  return row;
}

export async function listRfxs(userId: string) {
  return q<RfxRow & { line_count: number; supplier_count: number; responded: number; unread_docs: number; award_status: string | null }>(
    `select r.*,
       (select count(*)::int from rfx_lines l where l.rfx_id = r.id) as line_count,
       (select count(*)::int from suppliers s where s.rfx_id = r.id and s.status <> 'removed') as supplier_count,
       (select count(*)::int from suppliers s where s.rfx_id = r.id and s.status = 'responded') as responded,
       (select count(*)::int from documents d where d.rfx_id = r.id and d.status = 'unread') as unread_docs,
       (select a.status from awards a where a.rfx_id = r.id order by a.created_at desc limit 1) as award_status
     from rfx r where r.user_id = $1 order by r.updated_at desc`,
    [userId],
  );
}

export async function getLines(rfxId: string): Promise<RfxLine[]> {
  const rows = await q<Row>(`select * from rfx_lines where rfx_id = $1 order by no`, [rfxId]);
  return rows.map(toLine);
}

export function toLine(r: Row): RfxLine {
  return {
    no: Number(r.no),
    sku: String(r.sku),
    group: String(r.group_name ?? ""),
    desc: String(r.description),
    spec: (r.spec ?? {}) as Record<string, unknown>,
    uom: String(r.uom),
    pack_size: Number(r.pack_size ?? 1),
    qty: Number(r.qty),
    hsn: r.hsn ? String(r.hsn) : "",
    baseline_inr: r.baseline_inr === null || r.baseline_inr === undefined ? 0 : Number(r.baseline_inr),
    trap: null,
  };
}

export async function getQuestions(rfxId: string): Promise<QuestionSpec[]> {
  const rows = await q<Row>(`select * from rfx_questions where rfx_id = $1 order by ord, no`, [rfxId]);
  return rows.map((r) => ({
    no: String(r.no), kind: String(r.kind), q: String(r.q), doc_required: Boolean(r.doc_required),
  }));
}

export interface LineNote { id: string; line_no: number; text: string; actor: string; created_at: string }

export async function getLineNotes(rfxId: string): Promise<LineNote[]> {
  return q<LineNote>(`select id, line_no, text, actor, created_at from line_notes where rfx_id = $1 order by created_at`, [rfxId]);
}

export async function getSuppliers(rfxId: string, includeRemoved = false): Promise<SupplierRow[]> {
  return q<SupplierRow>(
    `select * from suppliers where rfx_id = $1 ${includeRemoved ? "" : "and status <> 'removed'"}
     order by length(code), code`,
    [rfxId],
  );
}

/**
 * Find a supplier by id, code ("V2") or name ("Cygnus"). Names match loosely,
 * because a person says "Cygnus" and the record says "Cygnus Technologies
 * India Pvt Ltd". An ambiguous name is refused rather than guessed.
 */
export async function resolveSupplier(rfxId: string, ref: string): Promise<SupplierRow> {
  const suppliers = await getSuppliers(rfxId, true);
  const r = ref.trim().toLowerCase();
  const exact = suppliers.find((s) => s.id === ref || s.code.toLowerCase() === r || s.name.toLowerCase() === r);
  if (exact) return exact;
  const loose = r.length < 3 ? [] : suppliers.filter((s) => {
    const word = firstWord(s.name);
    return s.name.toLowerCase().includes(r) || (word.length >= 4 && new RegExp(`\\b${word}\\b`).test(r));
  });
  if (loose.length === 1) return loose[0];
  if (loose.length > 1) {
    throw new BadInput(`'${ref}' matches more than one supplier: ${loose.map((s) => `${s.code} ${s.name}`).join(", ")}. Use the code.`);
  }
  throw new NotFound(
    `No supplier '${ref}' on this enquiry. Suppliers: ${suppliers.map((s) => `${s.code} ${s.name}`).join(", ") || "none yet"}. Use add_suppliers to add one.`,
  );
}

const STOP_WORDS = new Set(["the", "m/s", "and", "of", "for", "new", "india", "indian", "global", "united"]);
const firstWord = (name: string) =>
  name.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w))[0] ?? "";

export async function getAssumptions(rfxId: string): Promise<AssumptionRow[]> {
  return q<AssumptionRow>(`select * from assumptions where rfx_id = $1 order by key`, [rfxId]);
}

/** The calculator's rules for this enquiry, read off the assumption ledger. */
export function rulesFrom(assumptions: AssumptionRow[]): CalcRules {
  const byKey = new Map(assumptions.map((a) => [a.key, a]));
  const fx: CalcRules["fx"] = {};
  for (const a of assumptions) {
    const m = /^fx:([A-Z]{3})$/.exec(a.key);
    if (m && Number(a.value) > 0) fx[m[1]] = { rate: Number(a.value), source: a.source };
  }
  return {
    uomAliases: (byKey.get("uom_aliases")?.value ?? {}) as Record<string, string[]>,
    uomConversions: (byKey.get("uom_conversions")?.value ?? []) as UomConversion[],
    fx,
    priorPo: (byKey.get("prior_po")?.value ?? null) as PriorPo | null,
  };
}

// ---------------------------------------------------------------------------
// Creating and changing an enquiry
// ---------------------------------------------------------------------------

export interface LineInput {
  no?: number;
  sku?: string;
  group?: string;
  description: string;
  spec?: Record<string, unknown>;
  uom: string;
  packSize?: number;
  qty: number;
  hsn?: string;
  baselineInr?: number | null;
}

export interface QuestionInput {
  no?: string;
  question: string;
  mandatory?: boolean;
  documentRequired?: boolean;
}

export async function nextRfxCode(userId: string): Promise<string> {
  const year = new Date().getFullYear();
  for (let i = 0; i < 20; i++) {
    const code = `RFX-${year}-${String(Math.floor(1000 + Math.random() * 9000))}`;
    const clash = await one("select 1 from rfx where user_id = $1 and code = $2", [userId, code]);
    if (!clash) return code;
  }
  return `RFX-${year}-${Date.now() % 100000}`;
}

export const EVENT_TYPES = ["RFQ", "RFP", "RFI", "TENDER"] as const;

export async function createRfx(userId: string, input: {
  title: string;
  eventType?: string | null;
  code?: string;
  dueDate?: string | null;
  buyer?: Record<string, unknown>;
  approver?: Record<string, unknown>;
  termsAsked?: Record<string, unknown>;
  notes?: string | null;
  lines: LineInput[];
  questions?: QuestionInput[];
  createdVia: string;
}): Promise<RfxRow> {
  if (!input.title?.trim()) throw new BadInput("An enquiry needs a title.");
  const id = newId("rfx");
  const code = input.code?.trim() || (await nextRfxCode(userId));
  const type = (input.eventType ?? "RFQ").toUpperCase();
  if (!(EVENT_TYPES as readonly string[]).includes(type)) throw new BadInput(`Event type must be one of ${EVENT_TYPES.join(", ")}.`);
  await q(
    `insert into rfx (id, user_id, code, title, event_type, buyer, approver, terms_asked, notes, due_at, created_via)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      id, userId, code, input.title.trim(), type, json(input.buyer ?? {}), json(input.approver ?? {}),
      json(input.termsAsked ?? {}), input.notes ?? null, input.dueDate || null, input.createdVia,
    ],
  );
  if (input.lines?.length) await upsertLines(id, input.lines);
  if (input.questions?.length) await upsertQuestions(id, input.questions);
  await ensureDefaultAssumptions(id);
  return (await one<RfxRow>("select * from rfx where id = $1", [id]))!;
}

export async function upsertLines(rfxId: string, lines: LineInput[]): Promise<number[]> {
  const existing = await getLines(rfxId);
  let next = existing.reduce((m, l) => Math.max(m, l.no), 0) + 1;
  const touched: number[] = [];
  for (const l of lines) {
    if (!l.description?.trim()) throw new BadInput("Every line needs a description.");
    if (!l.uom?.trim()) throw new BadInput(`Line '${l.description}' needs a unit of measure (uom).`);
    if (!(Number(l.qty) > 0) || Number(l.qty) > 1e9) throw new BadInput(`Line '${l.description}' needs a quantity above zero.`);
    const no = l.no ?? next++;
    const pack = Math.max(1, Math.round(Number(l.packSize ?? packFromUom(l.uom) ?? 1)));
    await q(
      `insert into rfx_lines (id, rfx_id, no, sku, group_name, description, spec, uom, pack_size, qty, hsn, baseline_inr)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       on conflict (rfx_id, no) do update set
         sku = excluded.sku, description = excluded.description, uom = excluded.uom,
         pack_size = excluded.pack_size, qty = excluded.qty, baseline_inr = excluded.baseline_inr,
         group_name = case when $13 then excluded.group_name else rfx_lines.group_name end,
         spec = case when $14 then excluded.spec else rfx_lines.spec end,
         hsn = case when $15 then excluded.hsn else rfx_lines.hsn end`,
      [
        `${rfxId}:${no}`, rfxId, no, l.sku?.trim() || `L${no}`, l.group?.trim() || "", l.description.trim(),
        json(l.spec ?? {}), l.uom.trim(), pack, Math.round(Number(l.qty)), l.hsn ?? null,
        l.baselineInr === undefined || l.baselineInr === null ? null : Number(l.baselineInr),
        // Only overwrite what the caller actually sent. Editing a quantity in
        // the app must not erase the spec Claude used to judge "below spec".
        l.group !== undefined, l.spec !== undefined, l.hsn !== undefined,
      ],
    );
    touched.push(no);
  }
  await refreshGeneratedUnitRules(rfxId);
  return touched;
}

export async function removeLines(rfxId: string, nos: number[]) {
  await q(`delete from rfx_lines where rfx_id = $1 and no = any($2::int[])`, [rfxId, nos]);
  await refreshGeneratedUnitRules(rfxId);
}

export async function upsertQuestions(rfxId: string, qs: QuestionInput[]) {
  const existing = await getQuestions(rfxId);
  let n = existing.length;
  for (const item of qs) {
    n += item.no ? 0 : 1;
    const no = item.no?.trim() || `Q${n}`;
    await q(
      `insert into rfx_questions (id, rfx_id, no, kind, q, doc_required, ord)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (rfx_id, no) do update set kind = excluded.kind, q = excluded.q, doc_required = excluded.doc_required`,
      [`${rfxId}:${no}`, rfxId, no, item.mandatory === false ? "D" : "M", item.question.trim(), Boolean(item.documentRequired), Number(no.replace(/\D/g, "")) || n],
    );
  }
}

/** "box of 10" -> 10. Null when the unit names no count. */
export function packFromUom(uom: string): number | null {
  const m = /(\d+)/.exec(uom);
  return m && /(box|pack|pkt|packet|carton|bundle|case|set|kit|roll|bag|tray|reel|of)/i.test(uom) ? Number(m[1]) : null;
}

const CONTAINER = /\b(box|pack|pkt|packet|carton|bundle|case|set|kit|roll|bag|tray|reel|lot)\b/i;

export interface GateIssue { lineNo: number; issue: string; fix: string }

/**
 * Hold the enquiry until every line is unambiguous.
 *
 * Almost every mess in a quote comparison starts with a vague line. Ask for a
 * "box" without saying how many are inside and three suppliers price three
 * different things, all correctly. No amount of reading fixes that afterwards.
 */
export function qualityGate(lines: RfxLine[]): GateIssue[] {
  const issues: GateIssue[] = [];
  for (const l of lines) {
    const n = packFromUom(l.uom);
    if (CONTAINER.test(l.uom) && !/\d/.test(l.uom) && l.pack_size <= 1) {
      issues.push({
        lineNo: l.no,
        issue: `asks per '${l.uom}' without saying how many are inside, so suppliers can price different things`,
        fix: `say how many, e.g. '${l.uom} of 10', and set packSize`,
      });
    } else if (n !== null && n !== l.pack_size) {
      issues.push({
        lineNo: l.no,
        issue: `the unit says ${n} per '${l.uom}' but the pack size is ${l.pack_size}`,
        fix: `make the pack size ${n}, or correct the unit`,
      });
    }
    if (l.desc.trim().length < 8) {
      issues.push({ lineNo: l.no, issue: `the description '${l.desc}' is too short to price against`, fix: "describe the item and its key spec" });
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------

export interface SupplierInput {
  name: string;
  code?: string;
  city?: string | null;
  gstin?: string | null;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  channel?: string | null;
  notes?: string | null;
}

export async function addSupplier(rfxId: string, s: SupplierInput, status = "invited"): Promise<SupplierRow> {
  if (!s.name?.trim()) throw new BadInput("A supplier needs a name.");
  const all = await getSuppliers(rfxId, true);
  const dup = all.find((x) => x.name.toLowerCase() === s.name.trim().toLowerCase());
  if (dup) {
    if (dup.status === "removed") await q("update suppliers set status = 'invited' where id = $1", [dup.id]);
    return dup;
  }
  const used = new Set(all.map((x) => x.code));
  let code = s.code?.trim();
  if (!code || used.has(code)) {
    let i = all.length + 1;
    while (used.has(`V${i}`)) i++;
    code = `V${i}`;
  }
  const id = newId("sup");
  await q(
    `insert into suppliers (id, rfx_id, code, name, city, gstin, contact, channel, status, invited_at, notes)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),$10)`,
    [
      id, rfxId, code, s.name.trim(), s.city ?? null, s.gstin ?? null,
      json({ name: s.contactName ?? null, email: s.email ?? null, phone: s.phone ?? null }),
      s.channel?.trim() || "email", status, s.notes ?? null,
    ],
  );
  return (await one<SupplierRow>("select * from suppliers where id = $1", [id]))!;
}

// ---------------------------------------------------------------------------
// Assumption ledger
// ---------------------------------------------------------------------------

const BASE_ALIASES: Record<string, string[]> = {
  nos: ["ea", "each", "no", "pc", "pcs", "piece", "pieces", "unit", "units", "number", "item"],
};

const BASE_UNIT_WORDS = ["pc", "piece", "unit", "each", "nos", "no"];

export async function setAssumption(rfxId: string, a: {
  key: string; value: unknown; source: string; alternative?: string | null;
  note?: string | null; confidence?: string | null; setBy: string;
}) {
  await q(
    `insert into assumptions (id, rfx_id, key, value, source, alternative, note, confidence, set_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     on conflict (rfx_id, key) do update set
       value = excluded.value, source = excluded.source,
       alternative = coalesce(excluded.alternative, assumptions.alternative),
       note = coalesce(excluded.note, assumptions.note),
       confidence = coalesce(excluded.confidence, assumptions.confidence),
       set_by = excluded.set_by, version = assumptions.version + 1, updated_at = now()`,
    [newId("asm"), rfxId, a.key, json(a.value), a.source, a.alternative ?? null, a.note ?? null, a.confidence ?? null, a.setBy],
  );
}

async function ensureDefaultAssumptions(rfxId: string) {
  const have = new Set((await getAssumptions(rfxId)).map((a) => a.key));
  if (!have.has("compare_qty")) {
    await setAssumption(rfxId, {
      key: "compare_qty",
      value: "RFx asked quantity",
      source: "RFx line table",
      note: "Where a supplier quotes a different quantity, the unit rate is applied to the asked quantity so lines stay comparable. The difference is shown as a flag, not absorbed.",
      setBy: "system",
    });
  }
  if (!have.has("uom_aliases") || !have.has("uom_conversions")) await refreshGeneratedUnitRules(rfxId);
}

/**
 * Unit rules that follow from the enquiry itself.
 *
 * If a line is asked per "box of 10" with a pack size of 10, then a supplier
 * pricing per piece is pricing a tenth of the asked unit. That conversion is
 * ours to do because the pack size is in our own enquiry, so it is generated
 * here rather than asked of the supplier. Rules a person or Claude added by
 * hand (set_by not 'system') are kept.
 */
export async function refreshGeneratedUnitRules(rfxId: string) {
  const lines = await getLines(rfxId);
  const current = new Map((await getAssumptions(rfxId)).map((a) => [a.key, a]));

  const aliasRow = current.get("uom_aliases");
  if (!aliasRow || aliasRow.set_by === "system") {
    const aliases: Record<string, string[]> = { ...BASE_ALIASES };
    for (const l of lines) {
      if (l.pack_size > 1 && !aliases[l.uom]) {
        const n = l.pack_size;
        aliases[l.uom] = [`${n}-pack`, `pack of ${n}`, `box of ${n}`, `box (${n} nos)`, `pkt of ${n}`, `pack (${n} nos)`]
          .filter((x) => x.toLowerCase() !== l.uom.toLowerCase());
      }
    }
    await setAssumption(rfxId, {
      key: "uom_aliases", value: aliases, setBy: "system",
      source: "Generated from the RFx units: different words for the same unit. An alias never changes a number.",
    });
  }

  const convRow = current.get("uom_conversions");
  if (!convRow || convRow.set_by === "system") {
    const conversions: UomConversion[] = [];
    for (const l of lines) {
      if (l.pack_size <= 1) continue;
      for (const w of BASE_UNIT_WORDS) {
        if (!conversions.some((c) => c.from_uom === `per ${w}` && c.to_uom === l.uom)) {
          conversions.push({
            from_uom: `per ${w}`, to_uom: l.uom, factor: l.pack_size,
            basis: `One asked '${l.uom}' = ${l.pack_size} units, from the RFx line spec`,
          });
        }
      }
    }
    await setAssumption(rfxId, {
      key: "uom_conversions", value: conversions, setBy: "system",
      source: "Generated from the RFx pack sizes: a genuinely different unit, which always changes the number.",
    });
  }
}
