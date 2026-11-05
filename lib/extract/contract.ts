/**
 * The extraction contract: the shape of what Claude reports from one supplier
 * document, and the checks it must pass before anything is stored.
 */
import { z } from "zod";

const maybe = <T extends z.ZodTypeAny>(schema: T) =>
  schema.nullish().transform((v) => (v === undefined ? null : v));

export const RAW_STATUSES = [
  "quoted",        // a plain explicit price
  "substituted",   // priced, but against a different make or model
  "downgraded",    // priced, but against a lower spec than asked
  "uom_mismatch",  // priced in a different unit than asked
  "bundled",       // priced, but qty differs due to free goods
  "moq_adjusted",  // priced, but qty raised to the vendor's minimum
  "relative",      // no absolute price: refers to a prior PO or an uplift
  "match_rival",   // no price: offers to match another bidder
  "illegible",     // a price is present on the source and cannot be read
  "not_quoted",    // the vendor explicitly declined
  "omitted",       // silently absent, no mention anywhere
] as const;

export type RawStatus = (typeof RAW_STATUSES)[number];

export const provenanceSchema = z.object({
  locator: z.string().min(1),
  citedText: z.string().min(1),
  method: z.string().transform((m) =>
    ["xlsx_cell", "pdf_text", "docx_prose", "email_text", "vision_bbox", "test_fixture"]
      .includes(m) ? m : "other"),
  page: maybe(z.number().int().positive()),
});

export type Provenance = z.infer<typeof provenanceSchema>;

const rowProvenanceSchema = provenanceSchema.extend({
  citedText: z.string().nullish().transform((v) => v ?? ""),
});

export const extractedRowSchema = z.object({
  rfxLineNo: z.number().int().positive().nullable(),
  vendorDescription: z.string(),
  status: z.enum(RAW_STATUSES),

  price: maybe(z.number()),
  uom: maybe(z.string()),
  currency: maybe(z.string()),
  qty: maybe(z.number().int()),

  printedPrice: maybe(z.number()),
  handwritten: z.boolean().nullish().transform((v) => Boolean(v)),

  offeredMakeModel: maybe(z.string()),
  note: maybe(z.string()),

  scopeUpliftRef: maybe(z.string()),
  scopeUpliftNote: maybe(z.string()),

  reference: maybe(z.object({
    basis: z.enum(["prior_po", "prior_po_uplift", "match_rival", "other"]),
    refSku: maybe(z.string()),
    upliftPct: maybe(z.number()),
    rival: maybe(z.string()),
  })),

  confidence: z.number().min(0).max(1).nullish().transform((v) => v ?? 0.5),

  provenance: rowProvenanceSchema,
});

export type ExtractedRow = z.infer<typeof extractedRowSchema>;

export const conditionalDiscountSchema = z.object({
  percent: maybe(z.number()),
  amountInr: maybe(z.number()),
  scope: z.string(),
  condition: z.string(),
  provenance: provenanceSchema,
});

export const extractionSchema = z.object({
  vendorRef: maybe(z.string()),
  supersedesRef: maybe(z.string()),
  revisionNote: maybe(z.string()),

  rows: z.array(extractedRowSchema).nullish().transform((v) => v ?? []),

  blanketFallback: maybe(z.object({
    status: z.enum(RAW_STATUSES),
    note: z.string(),
    rival: maybe(z.string()),
    provenance: provenanceSchema,
  })),

  terms: z.object({
    gst: maybe(z.string()),
    freight: maybe(z.string()),
    payment: maybe(z.string()),
    validity: maybe(z.string()),
    delivery: maybe(z.string()),
    fxReference: maybe(z.number()),
    fxNote: maybe(z.string()),
    totalLevelDiscountPercent: maybe(z.number()),
    notes: maybe(z.string()),
  }).nullish().transform((v) => v ?? {
    gst: null, freight: null, payment: null, validity: null, delivery: null,
    fxReference: null, fxNote: null, totalLevelDiscountPercent: null, notes: null,
  }),

  conditionalDiscounts: z.array(conditionalDiscountSchema).nullish()
    .transform((v) => v ?? []),

  statedTotal: z.object({
    amount: maybe(z.number()),
    currency: maybe(z.string()),
    basis: maybe(z.string()),
  }).nullish().transform((v) => v ?? { amount: null, currency: null, basis: null }),

  unreadableRegions: z.array(z.string()).nullish().transform((v) => v ?? []),
});

export type Extraction = z.infer<typeof extractionSchema>;

export interface ValidationIssue {
  severity: "reject" | "downgrade";
  rowIndex: number;
  reason: string;
}

export function validateExtraction(
  extraction: Extraction,
  validLineNos: ReadonlySet<number>,
): { issues: ValidationIssue[]; rows: ExtractedRow[] } {
  const issues: ValidationIssue[] = [];
  const rows: ExtractedRow[] = [];

  const PRICED: RawStatus[] = [
    "quoted", "substituted", "downgraded", "uom_mismatch", "bundled", "moq_adjusted",
  ];

  extraction.rows.forEach((input, i) => {
    let row = input;

    if (!row.provenance.citedText.trim()) {
      issues.push({
        severity: "downgrade",
        rowIndex: i,
        reason:
          "returned with no cited text, so nothing on this row shows the vendor's own " +
          "words. Kept for review at its locator and excluded from totals.",
      });
      row = { ...row, confidence: Math.min(row.confidence, 0.4) };
    }

    if (row.rfxLineNo !== null && !validLineNos.has(row.rfxLineNo)) {
      issues.push({
        severity: "downgrade",
        rowIndex: i,
        reason:
          `reported RFx line ${row.rfxLineNo}, which does not exist in this RFx. ` +
          `Moved to the unmapped tray.`,
      });
      rows.push({ ...row, rfxLineNo: null });
      return;
    }

    if (PRICED.includes(row.status)) {
      if (row.price === null) {
        issues.push({
          severity: "downgrade",
          rowIndex: i,
          reason: `status '${row.status}' implies a price but none was returned. Treated as illegible.`,
        });
        rows.push({ ...row, status: "illegible" });
        return;
      }
      if (row.uom === null) {
        issues.push({
          severity: "downgrade",
          rowIndex: i,
          reason:
            `a price of ${row.price} was returned with no unit. A price without a unit ` +
            `cannot be compared, so this is routed to review rather than assumed.`,
        });
        rows.push({ ...row, confidence: Math.min(row.confidence, 0.4) });
        return;
      }
      if (row.price < 0) {
        issues.push({ severity: "reject", rowIndex: i, reason: `negative price ${row.price}` });
        return;
      }
      if (row.price === 0) {
        issues.push({
          severity: "downgrade",
          rowIndex: i,
          reason:
            `a price of zero was reported. Zero is almost always a scope ` +
            `statement ("included", "no charge") rather than a rate, and ranking ` +
            `it would make it the cheapest bid on this line automatically. ` +
            `Routed for review instead.`,
        });
        rows.push({ ...row, price: null, confidence: 0.2 });
        return;
      }
    }

    if (
      (row.status === "illegible" || row.status === "omitted" ||
        row.status === "not_quoted" || row.status === "match_rival") &&
      row.price !== null
    ) {
      issues.push({
        severity: "downgrade",
        rowIndex: i,
        reason:
          `status '${row.status}' means there is no usable price, but ${row.price} was ` +
          `returned. The price is discarded and the status kept.`,
      });
      rows.push({ ...row, price: null });
      return;
    }

    rows.push(row);
  });

  return { issues, rows };
}
