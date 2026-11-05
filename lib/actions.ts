import { randomBytes } from "node:crypto";
import { json, newId, one, q, type Row } from "./db";
import { logEvent, type Actor } from "./events";
import {
  BadInput, NotFound, addSupplier, createRfx, getLines, getQuestions, getSuppliers, qualityGate, removeLines,
  resolveRfx, resolveSupplier, setAssumption, upsertLines, upsertQuestions,
  type LineInput, type QuestionInput, type RfxRow, type SupplierInput, type SupplierRow,
} from "./rfx";
import { extractionSchema, validateExtraction, type Extraction } from "./extract/contract";
import { getDocument, storeDocument, storeTextDocument, type DocumentRow } from "./files";
import { cellKey, loadComparison } from "./comparison";
import { VAGUE, chaseMessage, type ChaseItem, type ChaseKind } from "./calc/chase";
import type { RawQuote } from "./calc/normalise";
import type { ReadAnswer } from "./calc/questionnaire";
import { buildAwardSnapshot, awardMarkdown, type ScenarioKey } from "./award";
import { getEmailAccount, sendMail } from "./mail";

/** Who is acting, and on whose behalf. Every action is logged with this. */
export interface ActionCtx {
  userId: string;
  actor: Actor;
  tool?: string;
  userRequest?: string | null;
}

async function log(ctx: ActionCtx, rfxId: string | null, kind: string, summary: string, detail: Record<string, unknown> = {}) {
  await logEvent({
    userId: ctx.userId, rfxId, actor: ctx.actor, kind, tool: ctx.tool ?? null,
    userRequest: ctx.userRequest ?? null, summary, detail,
  });
}

// ---------------------------------------------------------------------------
// Enquiries
// ---------------------------------------------------------------------------

export async function createRfxAction(ctx: ActionCtx, input: {
  title: string; eventType?: string | null; dueDate?: string | null; buyer?: Record<string, unknown>; approver?: Record<string, unknown>;
  termsAsked?: Record<string, unknown>; notes?: string | null; lines: LineInput[]; questions?: QuestionInput[];
  suppliers?: SupplierInput[];
}) {
  const approver = (input.approver ?? {}) as { name?: string | null; email?: string | null };
  if (!approver.name) {
    const me = await one<{ default_approver_name: string | null; default_approver_email: string | null }>(
      "select default_approver_name, default_approver_email from users where id = $1", [ctx.userId]);
    if (me?.default_approver_name) input = { ...input, approver: { name: me.default_approver_name, email: approver.email ?? me.default_approver_email } };
  }
  const rfx = await createRfx(ctx.userId, { ...input, createdVia: ctx.actor === "claude" ? "claude" : "app" });
  for (const s of input.suppliers ?? []) await addSupplier(rfx.id, s);
  const lines = await getLines(rfx.id);
  const gate = qualityGate(lines);
  await log(ctx, rfx.id, "rfx_created",
    `Created ${rfx.code} "${rfx.title}" with ${lines.length} line${lines.length === 1 ? "" : "s"}` +
    `${input.suppliers?.length ? ` and ${input.suppliers.length} supplier${input.suppliers.length === 1 ? "" : "s"}` : ""}` +
    `${gate.length ? `. ${gate.length} line${gate.length === 1 ? "" : "s"} flagged as vague` : ""}.`,
    { gate });
  return { rfx, lines, gate };
}

export async function updateRfxAction(ctx: ActionCtx, rfxRef: string | null | undefined, patch: {
  title?: string; eventType?: string; dueDate?: string | null; status?: string; notes?: string | null;
  buyer?: Record<string, unknown>; approver?: Record<string, unknown>; termsAsked?: Record<string, unknown>;
}) {
  const rfx = await resolveRfx(ctx.userId, rfxRef);
  const allowed = ["draft", "issued", "evaluating", "awarded", "closed"];
  if (patch.status && !allowed.includes(patch.status)) throw new BadInput(`Status must be one of ${allowed.join(", ")}.`);
  const eventType = patch.eventType?.toUpperCase();
  if (eventType && !["RFQ", "RFP", "RFI", "TENDER"].includes(eventType)) throw new BadInput("Event type must be RFQ, RFP, RFI or TENDER.");
  if (eventType) await q(`update rfx set event_type = $2 where id = $1`, [rfx.id, eventType]);
  await q(
    `update rfx set
       title = coalesce($2, title), due_at = case when $3::text = '__keep' then due_at else $3::timestamptz end,
       status = coalesce($4, status), notes = coalesce($5, notes),
       buyer = case when $6::jsonb is null then buyer else buyer || $6::jsonb end,
       approver = case when $7::jsonb is null then approver else approver || $7::jsonb end,
       terms_asked = case when $8::jsonb is null then terms_asked else terms_asked || $8::jsonb end,
       updated_at = now()
     where id = $1`,
    [
      rfx.id, patch.title ?? null, patch.dueDate === undefined ? "__keep" : patch.dueDate,
      patch.status ?? null, patch.notes ?? null,
      patch.buyer ? json(patch.buyer) : null, patch.approver ? json(patch.approver) : null,
      patch.termsAsked ? json(patch.termsAsked) : null,
    ],
  );
  const changed = Object.keys(patch).filter((k) => (patch as Record<string, unknown>)[k] !== undefined);
  await log(ctx, rfx.id, "rfx_updated", `Updated ${rfx.code}: ${changed.join(", ")}.`, { before: pick(rfx, changed), after: patch });
  return resolveRfx(ctx.userId, rfx.id);
}

function pick(rfx: RfxRow, keys: string[]) {
  const map: Record<string, unknown> = {
    title: rfx.title, dueDate: rfx.due_at, status: rfx.status, notes: rfx.notes,
    buyer: rfx.buyer, approver: rfx.approver, termsAsked: rfx.terms_asked,
  };
  return Object.fromEntries(keys.map((k) => [k, map[k]]));
}

export async function upsertLinesAction(ctx: ActionCtx, rfxRef: string | null | undefined, lines: LineInput[]) {
  const rfx = await resolveRfx(ctx.userId, rfxRef);
  const before = await getLines(rfx.id);
  const touched = await upsertLines(rfx.id, lines);
  const after = await getLines(rfx.id);
  // Say exactly what changed, field by field, so the audit trail needs no diffing.
  const FIELDS: Array<[keyof (typeof after)[number], string]> = [
    ["sku", "SKU"], ["group", "category"], ["desc", "description"], ["spec", "specification"], ["uom", "unit"],
    ["pack_size", "pack size"], ["qty", "quantity"], ["hsn", "HSN"], ["baseline_inr", "budget per unit"],
  ];
  const show = (v: unknown) => {
    const t = v && typeof v === "object" ? JSON.stringify(v) : String(v ?? "");
    return !t || t === "{}" ? "none" : t.length > 80 ? `${t.slice(0, 77)}...` : t;
  };
  const changes = touched.map((no) => {
    const b = before.find((l) => l.no === no);
    const a = after.find((l) => l.no === no);
    if (!a) return null;
    if (!b) return `added line ${no} (${show(a.desc)}, ${a.qty} ${a.uom})`;
    const diff = FIELDS.filter(([k]) => show(b[k]) !== show(a[k])).map(([k, label]) => `${label} ${show(b[k])} -> ${show(a[k])}`);
    return diff.length ? `line ${no}: ${diff.join(", ")}` : null;
  }).filter(Boolean);
  const pick = (l: (typeof after)[number]) => ({
    no: l.no, sku: l.sku, group: l.group, desc: l.desc, spec: l.spec, uom: l.uom, packSize: l.pack_size, qty: l.qty, hsn: l.hsn, budgetInr: l.baseline_inr,
  });
  // A save that changed nothing (the app's Save pressed twice) is not a change.
  // Anything else is always logged, even if the diff above misses a field.
  const sameAsBefore = touched.every((no) => {
    const b = before.find((l) => l.no === no);
    const a = after.find((l) => l.no === no);
    return b && a && JSON.stringify(pick(b)) === JSON.stringify(pick(a));
  });
  if (sameAsBefore) return { rfx, touched, gate: qualityGate(after) };
  await log(ctx, rfx.id, "lines_changed",
    changes.length
      ? `${changes.join("; ").replace(/^\w/, (c) => c.toUpperCase())} on ${rfx.code}.`
      : `Updated line${touched.length === 1 ? "" : "s"} ${touched.join(", ")} on ${rfx.code}.`,
    {
      before: before.filter((l) => touched.includes(l.no)).map(pick),
      after: after.filter((l) => touched.includes(l.no)).map(pick),
    });
  return { rfx, touched, gate: qualityGate(after) };
}

export async function removeLinesAction(ctx: ActionCtx, rfxRef: string | null | undefined, nos: number[], reason: string) {
  const rfx = await resolveRfx(ctx.userId, rfxRef);
  await removeLines(rfx.id, nos);
  await q(`delete from line_notes where rfx_id = $1 and line_no = any($2::int[])`, [rfx.id, nos]);
  await log(ctx, rfx.id, "lines_removed", `Removed line${nos.length === 1 ? "" : "s"} ${nos.join(", ")} from ${rfx.code}.`, { reason });
  return { rfx };
}

export async function addQuestionsAction(ctx: ActionCtx, rfxRef: string | null | undefined, qs: QuestionInput[]) {
  const rfx = await resolveRfx(ctx.userId, rfxRef);
  await upsertQuestions(rfx.id, qs);
  await log(ctx, rfx.id, "questions_changed", `Added or changed ${qs.length} questionnaire question${qs.length === 1 ? "" : "s"} on ${rfx.code}.`);
  return { rfx };
}

/**
 * Issue the enquiry. Held while any line is vague, unless someone overrides
 * with a reason. The reason is kept and printed in the award note, so the
 * override is on the record instead of being worked around silently.
 */
export async function issueRfxAction(ctx: ActionCtx, rfxRef: string | null | undefined, overrideReason?: string | null) {
  const rfx = await resolveRfx(ctx.userId, rfxRef);
  const gate = qualityGate(await getLines(rfx.id));
  if (gate.length && !overrideReason?.trim()) {
    return { issued: false, rfx, gate };
  }
  await q(
    `update rfx set status = case when status = 'draft' then 'issued' else status end,
       issued_at = coalesce(issued_at, now()), gate = $2, updated_at = now() where id = $1`,
    [rfx.id, gate.length ? json({ overrideReason: overrideReason!.trim(), overriddenAt: new Date().toISOString(), issues: gate }) : null],
  );
  await q(`update suppliers set invited_at = coalesce(invited_at, now()) where rfx_id = $1`, [rfx.id]);
  await log(ctx, rfx.id, "rfx_issued",
    `Issued ${rfx.code} to its suppliers${gate.length ? `, overriding ${gate.length} quality warning${gate.length === 1 ? "" : "s"}: "${overrideReason}"` : ""}. Delivery is recorded, not sent.`,
    { gate });
  return { issued: true, rfx: await resolveRfx(ctx.userId, rfx.id), gate };
}

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------

export async function addSuppliersAction(ctx: ActionCtx, rfxRef: string | null | undefined, list: SupplierInput[]) {
  const rfx = await resolveRfx(ctx.userId, rfxRef);
  const added: SupplierRow[] = [];
  for (const s of list) added.push(await addSupplier(rfx.id, s));
  await log(ctx, rfx.id, "suppliers_added", `Added ${added.map((s) => `${s.code} ${s.name}`).join(", ")} to ${rfx.code}.`);
  return { rfx, added };
}

export async function updateSupplierAction(ctx: ActionCtx, rfxRef: string | null | undefined, supplierRef: string, patch: {
  name?: string; city?: string | null; gstin?: string | null; contactName?: string | null; email?: string | null;
  phone?: string | null; channel?: string | null; status?: string; notes?: string | null;
}) {
  const rfx = await resolveRfx(ctx.userId, rfxRef);
  const s = await resolveSupplier(rfx.id, supplierRef);
  const contact = { ...(s.contact ?? {}) } as Record<string, unknown>;
  if (patch.contactName !== undefined) contact.name = patch.contactName;
  if (patch.email !== undefined) contact.email = patch.email;
  if (patch.phone !== undefined) contact.phone = patch.phone;
  const allowed = ["invited", "responded", "declined", "removed"];
  if (patch.status && !allowed.includes(patch.status)) throw new BadInput(`Supplier status must be one of ${allowed.join(", ")}.`);
  await q(
    `update suppliers set name = coalesce($2, name), city = coalesce($3, city), gstin = coalesce($4, gstin),
       contact = $5, channel = coalesce($6, channel), status = coalesce($7, status), notes = coalesce($8, notes)
     where id = $1`,
    [s.id, patch.name ?? null, patch.city ?? null, patch.gstin ?? null, json(contact), patch.channel ?? null, patch.status ?? null, patch.notes ?? null],
  );
  await log(ctx, rfx.id, "supplier_updated", `Updated supplier ${s.code} ${s.name}.`, { before: s, after: patch });
  return resolveSupplier(rfx.id, s.id);
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export async function uploadDocumentAction(ctx: ActionCtx, rfxRef: string, file: {
  filename: string; bytes: Buffer; mimeType?: string | null; supplierRef?: string | null; kind?: string | null;
}) {
  const rfx = await resolveRfx(ctx.userId, rfxRef);
  const { guessSupplier } = await import("./files");
  const suppliers = await getSuppliers(rfx.id);
  const supplier = file.supplierRef
    ? await resolveSupplier(rfx.id, file.supplierRef)
    : guessSupplier(file.filename, suppliers);
  const doc = await storeDocument({
    rfxId: rfx.id, filename: file.filename, bytes: file.bytes, mimeType: file.mimeType,
    supplierId: supplier?.id ?? null, kind: file.kind ?? null, source: ctx.actor === "claude" ? "claude" : "upload",
  });
  await log(ctx, rfx.id, "document_uploaded",
    `Uploaded ${doc.filename} (${Math.round(doc.byte_size / 1024)} KB)${supplier ? ` from ${supplier.code} ${supplier.name}` : ", supplier not yet known"}. Waiting to be read in Claude.`,
    { documentId: doc.id, kind: doc.kind });
  return { rfx, doc, supplier };
}

export async function saveTextDocumentAction(ctx: ActionCtx, rfxRef: string | null | undefined, input: {
  filename: string; text: string; supplierRef?: string | null; kind?: string | null;
}) {
  const rfx = await resolveRfx(ctx.userId, rfxRef);
  const supplier = input.supplierRef ? await resolveSupplier(rfx.id, input.supplierRef).catch(() => null) : null;
  if (!input.text?.trim()) throw new BadInput("There is no text to save.");
  const doc = await storeTextDocument({ rfxId: rfx.id, filename: input.filename, text: input.text, supplierId: supplier?.id ?? null, kind: input.kind });
  await log(ctx, rfx.id, "document_saved", `Saved ${doc.filename} from the chat as a source document${supplier ? ` for ${supplier.name}` : ""}.`, { documentId: doc.id });
  return { rfx, doc };
}

export async function updateDocumentAction(ctx: ActionCtx, rfxRef: string, documentRef: string, patch: {
  supplierRef?: string | null; kind?: string | null; status?: string | null;
}) {
  const rfx = await resolveRfx(ctx.userId, rfxRef);
  const doc = await getDocument(rfx.id, documentRef);
  if (!doc) throw new NotFound(`No document '${documentRef}' on ${rfx.code}.`);
  const supplier = patch.supplierRef ? await resolveSupplier(rfx.id, patch.supplierRef) : null;
  await q(
    `update documents set supplier_id = coalesce($2, supplier_id), kind = coalesce($3, kind), status = coalesce($4, status) where id = $1`,
    [doc.id, supplier?.id ?? null, patch.kind ?? null, patch.status ?? null],
  );
  await log(ctx, rfx.id, "document_updated", `Updated ${doc.filename}: ${Object.keys(patch).join(", ")}.`, { before: { supplier: doc.supplier_id, kind: doc.kind, status: doc.status }, after: patch });
  return getDocument(rfx.id, doc.id);
}

// ---------------------------------------------------------------------------
// Reading a quotation: Claude reports what the document says; code does the rest.
// ---------------------------------------------------------------------------

export async function submitQuoteAction(ctx: ActionCtx, input: {
  rfx?: string | null;
  supplier: string;
  newSupplier?: SupplierInput | null;
  documentId?: string | null;
  extraction: unknown;
}) {
  const rfx = await resolveRfx(ctx.userId, input.rfx);
  let supplier: SupplierRow;
  try {
    supplier = await resolveSupplier(rfx.id, input.supplier);
  } catch (e) {
    if (!(e instanceof NotFound)) throw e;
    supplier = await addSupplier(rfx.id, { ...(input.newSupplier ?? {}), name: input.newSupplier?.name || input.supplier }, "responded");
    await log(ctx, rfx.id, "supplier_added", `Added ${supplier.code} ${supplier.name}, who replied without being on the invite list.`);
  }
  if (supplier.status === "removed") {
    await q(`update suppliers set status = 'responded' where id = $1`, [supplier.id]);
    supplier = { ...supplier, status: "responded" };
  }

  const parsed = extractionSchema.safeParse(input.extraction);
  if (!parsed.success) {
    throw new BadInput(
      "The extraction did not match the contract: " +
      parsed.error.issues.slice(0, 8).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; "),
    );
  }
  const extraction: Extraction = parsed.data;
  const lines = await getLines(rfx.id);
  if (!lines.length) throw new BadInput(`${rfx.code} has no lines yet, so there is nothing to map a quotation onto.`);
  const { issues, rows } = validateExtraction(extraction, new Set(lines.map((l) => l.no)));

  let doc: DocumentRow | null = null;
  if (input.documentId) {
    doc = await getDocument(rfx.id, input.documentId);
    if (!doc) throw new NotFound(`No document '${input.documentId}' on ${rfx.code}. Use list_documents.`);
  }

  // Re-reading the same document replaces the earlier reading of it.
  const prior = await q<Row>(
    `select id, revision, vendor_ref from submissions where supplier_id = $1 order by revision, created_at`,
    [supplier.id],
  );
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const replaced = prior.filter((p) =>
    Boolean(extraction.vendorRef && p.vendor_ref && norm(String(p.vendor_ref)) === norm(extraction.vendorRef)),
  );
  if (doc) {
    const sameDoc = await q<Row>(`select id from submissions where document_id = $1 and supplier_id = $2`, [doc.id, supplier.id]);
    replaced.push(...sameDoc.filter((s) => !replaced.some((r) => r.id === s.id)));
  }
  const replacedIds = replaced.map((r) => String(r.id));
  const keptRevisions = prior.filter((p) => !replacedIds.includes(String(p.id)));

  let revision = keptRevisions.reduce((m, p) => Math.max(m, Number(p.revision ?? 1)), 1);
  let supersedesId: string | null = null;
  const claimed = extraction.supersedesRef?.trim();
  if (claimed) {
    const target = keptRevisions.find((p) => p.vendor_ref && norm(String(p.vendor_ref)) === norm(claimed));
    revision = target ? Number(target.revision ?? 1) + 1 : Math.max(2, revision + 1);
    supersedesId = target ? String(target.id) : null;
  } else if (replaced.length) {
    revision = Number(replaced[0].revision ?? revision);
  }
  const submissionId = newId("sub");
  await q(
    `insert into submissions (id, rfx_id, supplier_id, document_id, source, vendor_ref, supersedes_ref, supersedes_id,
       revision, revision_note, terms, conditional_discounts, stated_total, unreadable_regions, blanket_fallback, issues)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [
      submissionId, rfx.id, supplier.id, doc?.id ?? null, ctx.actor === "claude" ? "claude" : "fixture",
      extraction.vendorRef, extraction.supersedesRef, supersedesId, revision, extraction.revisionNote,
      json(extraction.terms), json(extraction.conditionalDiscounts), json(extraction.statedTotal),
      json(extraction.unreadableRegions), extraction.blanketFallback ? json(extraction.blanketFallback) : null, json(issues),
    ],
  );

  let cells = 0, unmapped = 0;
  const seenLines = new Set<number>();
  try {
  for (const row of rows) {
    // The same RFx line twice in one reading: keep the first, hold the rest aside.
    if (row.rfxLineNo !== null && seenLines.has(row.rfxLineNo)) {
      issues.push({ severity: "downgrade", rowIndex: rows.indexOf(row), reason: `a second row was reported for line ${row.rfxLineNo}; it was held aside as an unmatched item for review` });
      row.rfxLineNo = null;
    }
    if (row.rfxLineNo !== null) seenLines.add(row.rfxLineNo);
    if (row.rfxLineNo === null) {
      await q(
        `insert into unmapped_items (id, rfx_id, submission_id, supplier_id, vendor_ref, description, price, uom, currency, qty, note, provenance)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          newId("unm"), rfx.id, submissionId, supplier.id, extraction.vendorRef, row.vendorDescription,
          row.price, row.uom, row.currency, row.qty, row.note, json(row.provenance),
        ],
      );
      unmapped++;
      continue;
    }
    await q(
      `insert into quote_cells (id, submission_id, rfx_id, supplier_id, line_no, vendor_desc, raw_status, raw_price, raw_uom,
         raw_currency, raw_qty, printed_price, handwritten, offered, note, reference, confidence, provenance)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       on conflict (submission_id, line_no) do update set
         raw_status = excluded.raw_status, raw_price = excluded.raw_price, raw_uom = excluded.raw_uom,
         raw_currency = excluded.raw_currency, note = excluded.note, provenance = excluded.provenance`,
      [
        `${submissionId}:${row.rfxLineNo}`, submissionId, rfx.id, supplier.id, row.rfxLineNo, row.vendorDescription,
        row.status, row.price, row.uom, row.currency ? row.currency.trim().toUpperCase() : null, row.qty,
        row.printedPrice, row.handwritten, row.offeredMakeModel, row.note,
        row.reference || row.scopeUpliftRef
          ? json({
              ...(row.reference ?? {}),
              ...(row.scopeUpliftRef ? { scopeUpliftRef: row.scopeUpliftRef, scopeUpliftNote: row.scopeUpliftNote ?? null } : {}),
            })
          : null,
        row.confidence, json(row.provenance),
      ],
    );
    cells++;
  }

  } catch (e) {
    // Leave nothing half-written: the earlier reading is still in place.
    await q(`delete from submissions where id = $1`, [submissionId]);
    throw e;
  }
  if (issues.length) await q(`update submissions set issues = $2 where id = $1`, [submissionId, json(issues)]);
  if (replacedIds.length) await q(`delete from submissions where id = any($1::text[])`, [replacedIds]);

  // A newer reading of a line supersedes a person's correction of the older one.
  if (seenLines.size) {
    const setAside = await q<Row>(
      `update cell_overrides set active = false
        where supplier_id = $1 and active and line_no = any($2::int[]) returning line_no, reason`,
      [supplier.id, [...seenLines]],
    );
    if (setAside.length) {
      await log(ctx, rfx.id, "correction_superseded",
        `Set aside ${setAside.length} earlier correction${setAside.length === 1 ? "" : "s"} for ${supplier.code} ${supplier.name} (line${setAside.length === 1 ? "" : "s"} ${setAside.map((r) => r.line_no).join(", ")}): the supplier's newer quotation now applies. Re-apply them if they still hold.`,
        { lines: setAside.map((r) => Number(r.line_no)) });
    }
  }

  // A supplier's own stated exchange rate becomes the ledger rate when there is none.
  const foreign = [...new Set(rows.map((r) => (r.currency ?? "INR").trim().toUpperCase()).filter((c) => c && c !== "INR"))];
  const fxNotes: string[] = [];
  for (const ccy of foreign) {
    const have = await one(`select 1 from assumptions where rfx_id = $1 and key = $2`, [rfx.id, `fx:${ccy}`]);
    if (have) continue;
    if (extraction.terms.fxReference && foreign.length === 1) {
      await setAssumption(rfx.id, {
        key: `fx:${ccy}`, value: extraction.terms.fxReference,
        source: `${supplier.name}'s own stated reference rate${extraction.vendorRef ? `, quotation ${extraction.vendorRef}` : ""}`,
        alternative: "the central bank reference rate on the bid due date",
        note: extraction.terms.fxNote ?? null, confidence: "stated by the supplier, not independently verified", setBy: "system",
      });
      fxNotes.push(`${ccy} rate set to ${extraction.terms.fxReference} from ${supplier.name}'s own stated rate. Change it with set_fx_rate if you want a different basis.`);
    } else {
      fxNotes.push(`Prices in ${ccy} cannot be compared until a ${ccy} to INR rate is set. Use set_fx_rate.`);
    }
  }

  if (doc) {
    await q(`update documents set status = 'read', read_at = now(), supplier_id = coalesce(supplier_id, $2),
               kind = case when kind = 'other' then 'quotation' else kind end where id = $1`, [doc.id, supplier.id]);
  }
  await q(`update suppliers set status = 'responded' where id = $1 and status in ('invited','declined')`, [supplier.id]);
  await closeAnsweredFollowUps(supplier.id);
  await q(`update rfx set status = 'evaluating' where id = $1 and status in ('draft','issued')`, [rfx.id]);

  await log(ctx, rfx.id, "quote_read",
    `Read ${doc ? doc.filename : "a quotation"} from ${supplier.code} ${supplier.name}: ${cells} priced line${cells === 1 ? "" : "s"} stored` +
    `${unmapped ? `, ${unmapped} item${unmapped === 1 ? "" : "s"} matching no RFx line` : ""}` +
    `${revision > 1 ? `, revision ${revision}` : ""}` +
    `${issues.length ? `, ${issues.length} row${issues.length === 1 ? "" : "s"} routed to review by the contract checks` : ""}.`,
    { submissionId, documentId: doc?.id ?? null, issues });

  const cmp = await loadComparison(rfx);
  return { rfx, supplier: (await resolveSupplier(rfx.id, supplier.id)), submissionId, revision, cells, unmapped, issues, fxNotes, cmp };
}

// ---------------------------------------------------------------------------
// Questionnaire answers: Claude reports facts, the verdict is decided in code.
// ---------------------------------------------------------------------------

export async function submitQuestionnaireAction(ctx: ActionCtx, input: {
  rfx?: string | null; supplier: string; documentId?: string | null; answers: ReadAnswer[];
}) {
  const rfx = await resolveRfx(ctx.userId, input.rfx);
  const supplier = await resolveSupplier(rfx.id, input.supplier);
  if (supplier.status === "removed") throw new BadInput(`${supplier.name} was removed from this event. Restore them on the Suppliers tab first.`);
  const doc = input.documentId ? await getDocument(rfx.id, input.documentId) : null;
  await q(
    `insert into questionnaire_reads (id, rfx_id, supplier_id, document_id, answers, source) values ($1,$2,$3,$4,$5,$6)`,
    [newId("qr"), rfx.id, supplier.id, doc?.id ?? null, json(input.answers), ctx.actor === "claude" ? "claude" : ctx.actor],
  );
  if (doc) await q(`update documents set status = 'read', read_at = now(), supplier_id = coalesce(supplier_id, $2) where id = $1`, [doc.id, supplier.id]);
  const cmp = await loadComparison(rfx);
  const verdict = cmp.supplierInfo[supplier.code].verdict;
  await log(ctx, rfx.id, "questionnaire_read",
    `Read ${input.answers.length} questionnaire answer${input.answers.length === 1 ? "" : "s"} for ${supplier.code} ${supplier.name}` +
    `${doc ? ` from ${doc.filename}` : ""}. Verdict: ${verdict.qualified ? "qualified" : verdict.assessed ? `not qualified (failed ${verdict.failedMandatory.join(", ") || "a mandatory question"})` : "not assessed"}.`,
    { documentId: doc?.id ?? null });
  await closeAnsweredFollowUps(supplier.id);
  return { rfx, supplier, verdict, cmp };
}

/**
 * A follow-up is answered only when every item it asked about now has an
 * answer from this supplier, judged item by item: a missing or disputed price
 * is answered by a firm price in any reading so far (or an
 * explicit "not quoting"), a term by a stated, non-vague value in the latest
 * quote, a question by
 * an answer, a missing certificate by an attached document. Prices carried
 * forward from an earlier revision need the supplier's confirmation, so a
 * person closes those.
 */
async function closeAnsweredFollowUps(supplierId: string) {
  const open = await q<{ id: string; items: ChaseItem[] }>(
    `select id, items from chases where supplier_id = $1 and answered_at is null and closed_reason is null`, [supplierId]);
  if (!open.length) return;
  const [cells, latest, reads] = await Promise.all([
    q<{ line_no: number; raw_status: string; raw_price: number | null }>(
      `select line_no, raw_status, raw_price from quote_cells where supplier_id = $1`, [supplierId]),
    one<{ terms: Record<string, unknown> }>(
      `select terms from submissions where supplier_id = $1 order by revision desc, created_at desc limit 1`, [supplierId]),
    q<{ answers: Array<{ questionNo?: string; answer?: string | null; attachedDocument?: string | null }> }>(
      `select answers from questionnaire_reads where supplier_id = $1 order by created_at`, [supplierId]),
  ]);
  const firm = new Set(cells.filter((c) => c.raw_price !== null && !["omitted", "not_quoted", "illegible", "match_rival", "relative"].includes(c.raw_status)).map((c) => Number(c.line_no)));
  const declined = new Set(cells.filter((c) => c.raw_status === "not_quoted").map((c) => Number(c.line_no)));
  const terms = latest?.terms ?? {};
  // Later readings fill in earlier ones, question by question.
  const answer = new Map<string, { answer: boolean; doc: boolean }>();
  for (const r of reads) for (const a of r.answers ?? []) {
    const k = String(a.questionNo);
    const prev = answer.get(k) ?? { answer: false, doc: false };
    answer.set(k, { answer: prev.answer || Boolean(a.answer), doc: prev.doc || Boolean(a.attachedDocument) });
  }
  const isAnswered = (i: ChaseItem): boolean => {
    switch (i.kind) {
      case "price_missing": return (i.lineNos ?? []).length > 0 && i.lineNos!.every((n) => firm.has(n) || declined.has(n));
      case "price_unreadable":
      case "price_not_a_price":
      case "price_derived_unconfirmed": return (i.lineNos ?? []).length > 0 && i.lineNos!.every((n) => firm.has(n));
      case "price_carried_forward": return false;
      case "term_not_stated": {
        const v = i.termKey ? terms[i.termKey] : undefined;
        return v !== undefined && v !== null && !VAGUE.test(String(v));
      }
      case "questionnaire_unanswered": return Boolean(i.questionNo && answer.get(i.questionNo)?.answer);
      case "questionnaire_no_document": return Boolean(i.questionNo && answer.get(i.questionNo)?.doc);
      default: return false;
    }
  };
  const done = open.filter((c) => (c.items ?? []).length > 0 && (c.items ?? []).every(isAnswered)).map((c) => c.id);
  if (done.length) await q(`update chases set answered_at = now() where id = any($1::text[])`, [done]);
}


/**
 * A second, separate read of the largest prices on a photographed document.
 * Where it disagrees with the first, the price is contested and kept out of
 * every total until a person settles it.
 */
export async function submitSecondReadAction(ctx: ActionCtx, input: {
  rfx?: string | null; supplier: string; readings: Array<{ lineNo: number; price: number | null }>;
}) {
  const rfx = await resolveRfx(ctx.userId, input.rfx);
  const supplier = await resolveSupplier(rfx.id, input.supplier);
  if (supplier.status === "removed") throw new BadInput(`${supplier.name} was removed from this event. Restore them on the Suppliers tab first.`);
  const cmp = await loadComparison(rfx);
  const results: Array<{ lineNo: number; first: number | null; second: number | null; agreed: boolean }> = [];
  for (const r of input.readings) {
    const info = cmp.cellInfo[cellKey(supplier.code, r.lineNo)];
    if (!info?.submissionId) continue;
    const cell = await one<Row>(`select raw_price from quote_cells where submission_id = $1 and line_no = $2`, [info.submissionId, r.lineNo]);
    if (!cell) continue;
    const first = cell.raw_price === null ? null : Number(cell.raw_price);
    await q(`update quote_cells set verification = $3 where submission_id = $1 and line_no = $2`,
      [info.submissionId, r.lineNo, json({ second: r.price, by: ctx.actor, at: new Date().toISOString() })]);
    results.push({ lineNo: r.lineNo, first, second: r.price, agreed: first !== null && r.price !== null && Number(first) === Number(r.price) });
  }
  const disagreed = results.filter((r) => !r.agreed);
  await log(ctx, rfx.id, "second_read",
    `Second read of ${results.length} price${results.length === 1 ? "" : "s"} from ${supplier.code} ${supplier.name}: ` +
    `${results.length - disagreed.length} agreed${disagreed.length ? `, ${disagreed.length} disagreed and are now kept out of every total (lines ${disagreed.map((d) => d.lineNo).join(", ")})` : ""}.`,
    { results });
  return { rfx, supplier, results };
}

// ---------------------------------------------------------------------------
// Corrections: a person's (or Claude's, at a person's request) fix to one cell.
// ---------------------------------------------------------------------------

export async function correctCellAction(ctx: ActionCtx, input: {
  rfx?: string | null; supplier: string; lineNo: number; reason: string;
  price?: number | null; uom?: string | null; currency?: string | null; status?: string | null; note?: string | null;
}) {
  if (!input.reason?.trim()) throw new BadInput("A correction needs a reason. It is shown next to the number and in the award note.");
  const rfx = await resolveRfx(ctx.userId, input.rfx);
  const supplier = await resolveSupplier(rfx.id, input.supplier);
  const lines = await getLines(rfx.id);
  const line = lines.find((l) => l.no === input.lineNo);
  if (!line) throw new NotFound(`${rfx.code} has no line ${input.lineNo}.`);
  const cmp = await loadComparison(rfx);
  const key = cellKey(supplier.code, input.lineNo);
  const info = cmp.cellInfo[key];
  const base: RawQuote = info?.override?.raw ?? info?.reading ?? { status: "quoted" };
  const statuses = ["quoted", "substituted", "downgraded", "uom_mismatch", "not_quoted", "illegible", "omitted", "match_rival", "relative"];
  if (input.status && !statuses.includes(input.status)) throw new BadInput(`Status must be one of ${statuses.join(", ")}.`);
  if (input.price !== undefined && input.price !== null && !(Number.isFinite(input.price) && input.price > 0)) {
    throw new BadInput("A corrected price must be a number above zero. To record that the supplier declined, set the status instead.");
  }
  if (supplier.status === "removed") throw new BadInput(`${supplier.name} was removed from this event. Restore them on the Suppliers tab first.`);
  const raw: RawQuote = {
    ...base,
    contested: undefined,
    unsourced: undefined,
    status: input.status ?? (input.price !== undefined && input.price !== null ? (base.status === "illegible" || base.status === "omitted" || base.status === "not_quoted" ? "quoted" : base.status) : base.status),
    price: input.price === undefined ? base.price : input.price ?? undefined,
    uom: input.uom ?? base.uom ?? line.uom,
    ccy: (input.currency ?? base.ccy ?? "INR").toUpperCase(),
    note: input.note ?? base.note,
  };
  const before = cmp.matrix[supplier.code]?.[input.lineNo];
  await q(`update cell_overrides set active = false where supplier_id = $1 and line_no = $2 and active`, [supplier.id, input.lineNo]);
  await q(
    `insert into cell_overrides (id, rfx_id, supplier_id, line_no, raw, reason, actor) values ($1,$2,$3,$4,$5,$6,$7)`,
    [newId("ovr"), rfx.id, supplier.id, input.lineNo, json(stripUndefined(raw)), input.reason.trim(), ctx.actor],
  );
  const after = (await loadComparison(rfx)).matrix[supplier.code]?.[input.lineNo];
  await log(ctx, rfx.id, "cell_corrected",
    `Corrected line ${input.lineNo} for ${supplier.code} ${supplier.name}: ` +
    `${describeCell(before)} -> ${describeCell(after)}.`,
    { cell: key, before: base, after: stripUndefined(raw), reason: input.reason.trim() });
  return { rfx, supplier, line, before, after };
}

export async function clearCorrectionAction(ctx: ActionCtx, input: { rfx?: string | null; supplier: string; lineNo: number; reason?: string | null }) {
  const rfx = await resolveRfx(ctx.userId, input.rfx);
  const supplier = await resolveSupplier(rfx.id, input.supplier);
  const rows = await q<Row>(`update cell_overrides set active = false where supplier_id = $1 and line_no = $2 and active returning raw`, [supplier.id, input.lineNo]);
  if (!rows.length) throw new NotFound(`Line ${input.lineNo} for ${supplier.name} has no correction to undo.`);
  await log(ctx, rfx.id, "correction_undone", `Undid the correction on line ${input.lineNo} for ${supplier.code} ${supplier.name}; the original reading applies again.`,
    { cell: cellKey(supplier.code, input.lineNo), before: rows[0].raw, after: "original reading", reason: input.reason ?? null });
  return { rfx, supplier };
}

function stripUndefined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

function describeCell(c: { status: string; unitInr: number | null } | undefined) {
  if (!c) return "nothing";
  return c.unitInr === null ? c.status.replace(/_/g, " ") : `₹${Math.round(c.unitInr).toLocaleString("en-IN")} (${c.status.replace(/_/g, " ")})`;
}

// ---------------------------------------------------------------------------
// Assumption ledger
// ---------------------------------------------------------------------------

export async function setFxRateAction(ctx: ActionCtx, input: { rfx?: string | null; currency: string; rate: number; source: string }) {
  const rfx = await resolveRfx(ctx.userId, input.rfx);
  const ccy = input.currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(ccy) || ccy === "INR") throw new BadInput("Give a three-letter currency code other than INR, e.g. USD.");
  if (!(input.rate > 0)) throw new BadInput("The rate must be above zero.");
  const prev = await one<Row>(`select value, source from assumptions where rfx_id = $1 and key = $2`, [rfx.id, `fx:${ccy}`]);
  await setAssumption(rfx.id, { key: `fx:${ccy}`, value: input.rate, source: input.source || "set by the buyer", setBy: ctx.actor });
  await log(ctx, rfx.id, "assumption_changed", `Set the ${ccy} to INR rate to ${input.rate} (${input.source}). Every ${ccy} price is recalculated.`,
    { before: prev?.value ?? null, after: input.rate, reason: input.source });
  return { rfx };
}

export async function addUnitRuleAction(ctx: ActionCtx, input: { rfx?: string | null; fromUom: string; toUom: string; factor: number; basis: string }) {
  const rfx = await resolveRfx(ctx.userId, input.rfx);
  if (!(input.factor > 0)) throw new BadInput("The factor must be above zero.");
  const row = await one<Row>(`select value from assumptions where rfx_id = $1 and key = 'uom_conversions'`, [rfx.id]);
  const list = ((row?.value ?? []) as Array<{ from_uom: string; to_uom: string; factor: number; basis: string }>)
    .filter((c) => !(c.from_uom.toLowerCase() === input.fromUom.toLowerCase() && c.to_uom.toLowerCase() === input.toUom.toLowerCase()));
  list.push({ from_uom: input.fromUom, to_uom: input.toUom, factor: input.factor, basis: input.basis });
  await setAssumption(rfx.id, { key: "uom_conversions", value: list, source: "unit rules, edited", setBy: ctx.actor });
  await log(ctx, rfx.id, "assumption_changed", `Added a unit rule: one '${input.toUom}' = ${input.factor} x '${input.fromUom}' (${input.basis}).`, { after: input });
  return { rfx };
}

export async function addUnitAliasAction(ctx: ActionCtx, input: { rfx?: string | null; askedUom: string; alias: string }) {
  const rfx = await resolveRfx(ctx.userId, input.rfx);
  const row = await one<Row>(`select value from assumptions where rfx_id = $1 and key = 'uom_aliases'`, [rfx.id]);
  const map = { ...((row?.value ?? {}) as Record<string, string[]>) };
  map[input.askedUom] = [...new Set([...(map[input.askedUom] ?? []), input.alias])];
  await setAssumption(rfx.id, { key: "uom_aliases", value: map, source: "unit aliases, edited", setBy: ctx.actor });
  await log(ctx, rfx.id, "assumption_changed", `Added '${input.alias}' as another word for '${input.askedUom}'.`, { after: input });
  return { rfx };
}

export async function setPriorPoAction(ctx: ActionCtx, input: {
  rfx?: string | null; poNumber: string; poDate: string; vendor: string; rates: Record<string, number>;
}) {
  const rfx = await resolveRfx(ctx.userId, input.rfx);
  const row = await one<Row>(`select value from assumptions where rfx_id = $1 and key = 'prior_po'`, [rfx.id]);
  const prev = (row?.value ?? null) as { rates?: Record<string, number> } | null;
  const value = { po_number: input.poNumber, po_date: input.poDate, vendor: input.vendor, rates: { ...(prev?.rates ?? {}), ...input.rates } };
  await setAssumption(rfx.id, { key: "prior_po", value, source: `Prior purchase order ${input.poNumber} dated ${input.poDate}`, setBy: ctx.actor });
  await log(ctx, rfx.id, "assumption_changed", `Recorded prior-order rates from ${input.poNumber} for ${Object.keys(input.rates).join(", ")}.`, { before: prev, after: value });
  return { rfx };
}

export async function noteAssumptionAction(ctx: ActionCtx, input: { rfx?: string | null; key: string; value: string; source: string; note?: string | null }) {
  const rfx = await resolveRfx(ctx.userId, input.rfx);
  if (/^(fx:|uom_|prior_po)/.test(input.key)) throw new BadInput("Use set_fx_rate, add_unit_rule or set_prior_po_rates for rules the calculator uses.");
  await setAssumption(rfx.id, { key: input.key, value: input.value, source: input.source, note: input.note ?? null, setBy: ctx.actor });
  await log(ctx, rfx.id, "assumption_changed", `Recorded assumption '${input.key}': ${input.value}.`, { after: input });
  return { rfx };
}

// ---------------------------------------------------------------------------
// Items a supplier invented that match no RFx line
// ---------------------------------------------------------------------------

export async function resolveUnmappedAction(ctx: ActionCtx, input: {
  rfx?: string | null; itemId: string; lineNo?: number | null; dismiss?: boolean; reason: string;
}) {
  const rfx = await resolveRfx(ctx.userId, input.rfx);
  const item = await one<Row>(`select u.*, s.code, s.name from unmapped_items u join suppliers s on s.id = u.supplier_id where u.id = $1 and u.rfx_id = $2`, [input.itemId, rfx.id]);
  if (!item) throw new NotFound(`No unmatched item '${input.itemId}' on ${rfx.code}.`);
  if (input.dismiss || !input.lineNo) {
    await q(`update unmapped_items set resolution = $2 where id = $1`, [item.id, `dismissed: ${input.reason}`]);
    await log(ctx, rfx.id, "unmapped_resolved", `Kept "${item.description}" from ${item.name} out of the comparison: ${input.reason}.`);
    return { rfx };
  }
  await correctCellAction(ctx, {
    rfx: rfx.id, supplier: String(item.code), lineNo: input.lineNo,
    price: item.price === null ? null : Number(item.price), uom: (item.uom as string) ?? null, currency: (item.currency as string) ?? "INR",
    status: "quoted", reason: `mapped from the supplier's own item "${item.description}": ${input.reason}`,
  });
  await q(`update unmapped_items set resolution = $2, resolved_to_line_no = $3 where id = $1`, [item.id, `mapped: ${input.reason}`, input.lineNo]);
  return { rfx };
}

// ---------------------------------------------------------------------------
// Chasing suppliers for what they still owe
// ---------------------------------------------------------------------------

/** The follow-up Bidline would send a supplier, without recording or sending anything. */
export async function draftFollowUp(ctx: ActionCtx, input: {
  rfx?: string | null; supplier: string; dueDate?: string | null;
  onlyLines?: number[] | null; onlyQuestions?: string[] | null; kinds?: ChaseKind[] | null;
}) {
  const rfx = await resolveRfx(ctx.userId, input.rfx);
  const supplier = await resolveSupplier(rfx.id, input.supplier);
  const user = await one<{ name: string; followup_days: number }>("select name, followup_days from users where id = $1", [ctx.userId]);
  const cmp = await loadComparison(rfx);
  const gaps = cmp.supplierInfo[supplier.code]?.gaps;
  if (!gaps) throw new BadInput(`${supplier.name} is not active on ${rfx.code}.`);
  const due = input.dueDate || new Date(Date.now() + (user?.followup_days ?? 3) * 86_400_000).toISOString().slice(0, 10);
  const drafted = chaseMessage({
    gaps, rfxId: rfx.code, rfxTitle: rfx.title,
    buyerName: String((rfx.buyer as Record<string, unknown>).name ?? user?.name ?? "Procurement"),
    dueAt: due, selected: input.kinds ?? undefined, onlyLines: input.onlyLines ?? undefined, onlyQuestions: input.onlyQuestions ?? undefined,
  });
  const contact = (supplier.contact ?? {}) as { email?: string | null };
  const demo = rfx.created_via === "demo";
  return { rfx, supplier, due, drafted, to: contact.email ?? null, demo };
}

/**
 * Record a follow-up to one supplier, and send it from the buyer's own mailbox
 * when asked. Demo suppliers are fictional, so a demo follow-up goes to the
 * buyer's own address instead.
 */
export async function recordChaseAction(ctx: ActionCtx, input: {
  rfx?: string | null; supplier: string; dueDate?: string | null; channel?: string | null;
  subject?: string | null; message?: string | null; onlyLines?: number[] | null; onlyQuestions?: string[] | null;
  kinds?: ChaseKind[] | null; send?: boolean; to?: string | null;
}) {
  const d = await draftFollowUp(ctx, input);
  const { rfx, supplier, due, drafted } = d;
  if (!drafted.items.length && !input.message) throw new BadInput(`${supplier.name} has nothing outstanding on ${rfx.code} to follow up.`);
  const subject = input.subject?.trim() || drafted.subject;
  const body = input.message?.trim() || drafted.body;

  let to: string | null = null;
  let messageId: string | null = null;
  let sendError: string | null = null;
  let note = "";
  if (input.send) {
    const account = await getEmailAccount(ctx.userId);
    if (!account) throw new BadInput("Connect your email in Settings to send follow-ups from Bidline.");
    to = d.demo ? account.from_email : (input.to?.trim() || d.to);
    if (!to) throw new BadInput(`There is no email address for ${supplier.name}. Add one on the Suppliers tab, or pass the address.`);
    if (d.demo) note = " This is a demo event with fictional suppliers, so it was sent to your own address.";
    try {
      messageId = await sendMail(ctx.userId, { to, subject, text: body });
    } catch (e) {
      sendError = (e as Error).message;
    }
  }

  const id = newId("chs");
  await q(
    `insert into chases (id, rfx_id, supplier_id, items, message, subject, to_email, sent_via, message_id, send_error, channel, due_at, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      id, rfx.id, supplier.id, json(drafted.items), `Subject: ${subject}\n\n${body}`, subject, to,
      messageId ? "email" : "recorded", messageId, sendError, input.channel || supplier.channel || "email", due, ctx.actor,
    ],
  );
  await log(ctx, rfx.id, messageId ? "follow_up_sent" : "chase_recorded",
    messageId
      ? `Emailed a follow-up to ${supplier.code} ${supplier.name} at ${to} for ${drafted.items.length} item${drafted.items.length === 1 ? "" : "s"}, reply due ${due}.${note}`
      : `Recorded a follow-up to ${supplier.code} ${supplier.name} for ${drafted.items.length} item${drafted.items.length === 1 ? "" : "s"}, reply due ${due}.${sendError ? ` Sending failed: ${sendError}` : " Not emailed."}`,
    { chaseId: id, items: drafted.items.map((i) => i.kind), to });
  if (sendError) throw new BadInput(`Follow-up recorded, but the email failed: ${sendError}`);
  return { rfx, supplier, chaseId: id, subject, message: body, items: drafted.items, due, sent: Boolean(messageId), to, note };
}

export async function updateChaseAction(ctx: ActionCtx, rfxRef: string, chaseId: string, patch: { message?: string; answered?: boolean; closedReason?: string | null }) {
  const rfx = await resolveRfx(ctx.userId, rfxRef);
  const c = await one<Row>(`select * from chases where id = $1 and rfx_id = $2`, [chaseId, rfx.id]);
  if (!c) throw new NotFound("No such chase.");
  await q(
    `update chases set message = coalesce($2, message),
       answered_at = case when $3::boolean is true then coalesce(answered_at, now()) when $3::boolean is false then null else answered_at end,
       closed_reason = coalesce($4, closed_reason) where id = $1`,
    [chaseId, patch.message ?? null, patch.answered ?? null, patch.closedReason ?? null],
  );
  await log(ctx, rfx.id, "chase_updated", `Updated a chase: ${Object.keys(patch).join(", ")}.`, { before: { message: c.message }, after: patch });
}

// ---------------------------------------------------------------------------
// Award and approval
// ---------------------------------------------------------------------------

export async function createAwardAction(ctx: ActionCtx, input: {
  rfx?: string | null; scenario: ScenarioKey; supplier?: string | null; commentary?: string | null;
  includeUnconfirmed?: boolean;
}) {
  const rfx = await resolveRfx(ctx.userId, input.rfx);
  const cmp = await loadComparison(rfx);
  const supplierCode = input.supplier ? (await resolveSupplier(rfx.id, input.supplier)).code : null;
  const snapshot = buildAwardSnapshot(cmp, input.scenario, supplierCode);
  const note = awardMarkdown(cmp, snapshot, input.commentary ?? null);
  const token = randomBytes(18).toString("base64url");
  const id = newId("awd");
  await q(
    `insert into awards (id, rfx_id, scenario_key, snapshot, note_md, commentary, share_token, status, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,'sent',$8)`,
    [id, rfx.id, snapshot.key, json(snapshot), note, input.commentary ?? null, token, ctx.actor],
  );
  await log(ctx, rfx.id, "award_drafted",
    `Drafted the award (${snapshot.label}): ₹${Math.round(snapshot.totalInr).toLocaleString("en-IN")} across ${snapshot.linesAwarded} line${snapshot.linesAwarded === 1 ? "" : "s"}. Shared for approval.`,
    { awardId: id, scenario: snapshot.key });
  return { rfx, awardId: id, token, snapshot, note };
}

export async function decideAwardAction(input: { token: string; decision: "approved" | "rejected" | "changes_requested"; name: string; note?: string | null }) {
  const award = await one<Row>(`select a.*, r.user_id, r.code from awards a join rfx r on r.id = a.rfx_id where a.share_token = $1`, [input.token]);
  if (!award) throw new NotFound("This approval link is not valid.");
  if (!input.name?.trim()) throw new BadInput("Please give your name.");
  // One decision per award. A second visit to the link cannot overturn it.
  const done = await q(
    `update awards set status = $2, decided_by = $3, decided_at = now(), decision_note = $4 where id = $1 and status = 'sent' returning id`,
    [award.id, input.decision, input.name.trim().slice(0, 120), input.note ? input.note.slice(0, 2000) : null],
  );
  if (!done.length) throw new BadInput(`This award was already ${String(award.status).replace(/_/g, " ")}${award.decided_by ? ` by ${award.decided_by}` : ""}.`);
  if (input.decision === "approved") await q(`update rfx set status = 'awarded' where id = $1 and status <> 'closed'`, [award.rfx_id]);
  await logEvent({
    userId: String(award.user_id), rfxId: String(award.rfx_id), actor: "approver", kind: "award_decided",
    summary: `${input.name.trim()} ${input.decision === "approved" ? "approved" : input.decision === "rejected" ? "rejected" : "asked for changes to"} the award on ${award.code}${input.note ? `: "${input.note}"` : "."}`,
    detail: { awardId: award.id, decision: input.decision, name: input.name.trim().slice(0, 120) },
  });
}

// ---------------------------------------------------------------------------
// Repeat purchases, questionnaire clean-up, withdrawn awards, line notes
// ---------------------------------------------------------------------------

/**
 * Start a new draft from an earlier event: same line items, suppliers and
 * questionnaire, none of the quotes, documents or decisions.
 */
export async function duplicateRfxAction(ctx: ActionCtx, rfxRef: string | null | undefined, opts: { title?: string | null; dueDate?: string | null } = {}) {
  const src = await resolveRfx(ctx.userId, rfxRef);
  const [lines, suppliers, questions] = await Promise.all([getLines(src.id), getSuppliers(src.id), getQuestions(src.id)]);
  const rfx = await createRfx(ctx.userId, {
    title: opts.title?.trim() || `${src.title} (copy)`, eventType: src.event_type, dueDate: opts.dueDate ?? null,
    buyer: src.buyer, approver: src.approver, termsAsked: src.terms_asked, notes: src.notes,
    lines: lines.map((l) => ({
      sku: l.sku, group: l.group, description: l.desc, spec: l.spec, uom: l.uom, packSize: l.pack_size, qty: l.qty, hsn: l.hsn || undefined,
      baselineInr: l.baseline_inr || null,
    })),
    questions: questions.map((x) => ({ no: x.no, question: x.q, mandatory: x.kind === "M", documentRequired: x.doc_required })),
    // A copy of the demo keeps its fictional suppliers, so it keeps the demo
    // rule that follow-ups go to the buyer's own address.
    createdVia: src.created_via === "demo" ? "demo" : ctx.actor === "claude" ? "claude" : "app",
  });
  for (const s of suppliers) {
    const c = (s.contact ?? {}) as { name?: string | null; email?: string | null; phone?: string | null };
    await addSupplier(rfx.id, { name: s.name, code: s.code, city: s.city, gstin: s.gstin, contactName: c.name ?? null, email: c.email ?? null, phone: c.phone ?? null, channel: s.channel, notes: s.notes });
  }
  await log(ctx, rfx.id, "rfx_duplicated",
    `Created ${rfx.code} "${rfx.title}" as a copy of ${src.code}: ${lines.length} line${lines.length === 1 ? "" : "s"}, ${suppliers.length} supplier${suppliers.length === 1 ? "" : "s"}, ${questions.length} question${questions.length === 1 ? "" : "s"}. No quotes copied.`,
    { from: src.code });
  await log(ctx, src.id, "rfx_copied", `Copied to a new draft, ${rfx.code}.`, { to: rfx.code });
  return { rfx, from: src, lines: lines.length, suppliers: suppliers.length, questions: questions.length };
}

export async function removeQuestionsAction(ctx: ActionCtx, rfxRef: string | null | undefined, nos: string[], reason: string) {
  const rfx = await resolveRfx(ctx.userId, rfxRef);
  if (!reason?.trim()) throw new BadInput("Give a reason for removing the question. It is kept in the audit trail.");
  const existing = await getQuestions(rfx.id);
  const gone = existing.filter((x) => nos.map((n) => n.trim().toUpperCase()).includes(x.no.toUpperCase()));
  if (!gone.length) throw new NotFound(`No question ${nos.join(", ")} on ${rfx.code}. Questions are ${existing.map((x) => x.no).join(", ") || "none"}.`);
  await q(`delete from rfx_questions where rfx_id = $1 and no = any($2::text[])`, [rfx.id, gone.map((x) => x.no)]);
  await log(ctx, rfx.id, "questions_removed",
    `Removed question${gone.length === 1 ? "" : "s"} ${gone.map((x) => `${x.no} ("${x.q}")`).join(", ")} from ${rfx.code}. Qualification is recalculated without ${gone.length === 1 ? "it" : "them"}.`,
    { reason: reason.trim().slice(0, 2000), before: gone.map((x) => ({ no: x.no, question: x.q, mandatory: x.kind === "M" })) });
  return { rfx, removed: gone };
}

/** Pull back an award that is still awaiting approval. Its link stops accepting decisions. */
export async function withdrawAwardAction(ctx: ActionCtx, rfxRef: string | null | undefined, reason: string, awardId?: string | null) {
  const rfx = await resolveRfx(ctx.userId, rfxRef);
  if (!reason?.trim()) throw new BadInput("Give a reason for withdrawing the award. It is kept in the audit trail and shown on the approval link.");
  const award = await one<Row>(
    awardId ? `select * from awards where rfx_id = $1 and id = $2` : `select * from awards where rfx_id = $1 and status = 'sent' order by created_at desc limit 1`,
    awardId ? [rfx.id, awardId] : [rfx.id],
  );
  if (!award) throw new NotFound(`${rfx.code} has no award awaiting approval.`);
  const done = await q(
    `update awards set status = 'withdrawn', decided_at = now(), decision_note = $2 where id = $1 and status = 'sent' returning id`,
    [award.id, reason.trim().slice(0, 2000)],
  );
  if (!done.length) throw new BadInput(`That award was already ${String(award.status).replace(/_/g, " ")}. Only an award awaiting approval can be withdrawn.`);
  await log(ctx, rfx.id, "award_withdrawn", `Withdrew the award on ${rfx.code}. The approval link no longer accepts a decision.`, { awardId: award.id, reason: reason.trim().slice(0, 2000) });
  return { rfx, awardId: String(award.id) };
}

export async function addLineNoteAction(ctx: ActionCtx, rfxRef: string | null | undefined, lineNo: number, text: string) {
  const rfx = await resolveRfx(ctx.userId, rfxRef);
  const body = text?.trim();
  if (!body) throw new BadInput("The note is empty.");
  const line = (await getLines(rfx.id)).find((l) => l.no === lineNo);
  if (!line) throw new NotFound(`${rfx.code} has no line ${lineNo}.`);
  const id = newId("note");
  await q(`insert into line_notes (id, rfx_id, line_no, text, actor) values ($1,$2,$3,$4,$5)`, [id, rfx.id, lineNo, body.slice(0, 2000), ctx.actor]);
  await log(ctx, rfx.id, "line_note_added", `Note on line ${lineNo} (${line.desc}): "${body.slice(0, 300)}"`, { lines: [lineNo] });
  return { rfx, id, line };
}
