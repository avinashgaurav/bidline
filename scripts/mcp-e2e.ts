/**
 * End-to-end test of the MCP server, the way Claude uses it, with no AI.
 *
 * A scripted MCP client plays Claude: it creates the demo enquiry, submits
 * the five supplier quotations (from the fixture, standing in for what Claude
 * would read), answers the questionnaires, then exercises every other tool.
 * Afterwards it reloads the comparison from the database and checks every
 * cell and total against the reference snapshot.
 *
 *   npx tsx --env-file=.env.local scripts/mcp-e2e.ts            (against http://localhost:3000)
 *   BIDLINE_URL=https://... npx tsx --env-file=.env.local scripts/mcp-e2e.ts
 *   KEEP=1 ...   keeps the test user and enquiry for inspection
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import catalog from "../lib/data/demo-rfx.json";
import fixture from "./fixture-raw-quotes.json";
import expected from "./fixture-expected.json";
import { createUser } from "../lib/auth";
import { q } from "../lib/db";
import { resolveRfx } from "../lib/rfx";
import { loadComparison } from "../lib/comparison";
import type { RawQuote } from "../lib/calc/normalise";

const BASE = (process.env.BIDLINE_URL ?? "http://localhost:3000").replace(/\/$/, "");
let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `: ${detail}` : ""}`);
};

type ToolOut = { content: Array<{ type: string; text?: string }>; isError?: boolean };

async function main() {
  const email = `e2e+${Date.now()}@bidline.test`;
  const user = await createUser({ email, name: "E2E Tester", password: "e2e-password-123" });
  const client = new Client({ name: "bidline-e2e", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/mcp/${user.mcp_token}`)));

  const call = async (name: string, args: Record<string, unknown>, expectError = false): Promise<string> => {
    // Local runs reach the database over the internet (~300 ms a query), so allow
    // slow tools more than the SDK's 60 s default.
    const res = (await client.callTool({ name, arguments: { user_request: `e2e: ${name}`, ...args } }, undefined, { timeout: 300_000 })) as ToolOut;
    const text = res.content.map((c) => c.text ?? `[${c.type}]`).join("\n");
    check(`${name}${expectError ? " (expected refusal)" : ""}`, Boolean(res.isError) === expectError, res.isError && !expectError ? text.slice(0, 300) : "");
    return text;
  };

  try {
    const tools = await client.listTools();
    check("lists tools", tools.tools.length >= 25, `${tools.tools.length} tools`);

    await call("get_started", {});

    // 1. Create the demo enquiry exactly as Claude would from a conversation.
    const created = await call("create_rfx", {
      title: catalog.rfx.title,
      dueDate: catalog.rfx.due,
      buyerName: catalog.rfx.buyer_contact.name,
      approverName: catalog.rfx.approver.name,
      termsAsked: { incoterm: catalog.rfx.incoterm_asked, tax: catalog.rfx.tax_basis_asked, payment: catalog.rfx.payment_asked },
      lines: catalog.lines.map((l) => ({
        no: l.no, sku: l.sku, group: l.group, description: l.desc, spec: l.spec, uom: l.uom,
        packSize: l.pack_size, qty: l.qty, hsn: l.hsn, baselineInr: l.baseline_inr,
      })),
      suppliers: catalog.vendors.map((v) => ({ name: v.name, city: v.city, contactName: v.contact, email: v.email })),
      questions: catalog.questionnaire.map((x) => ({ no: x.no, question: x.q, mandatory: x.kind === "M", documentRequired: x.doc_required })),
    });
    const code = /RFX-\d{4}-\d+/.exec(created)?.[0];
    check("create_rfx returns a code", Boolean(code), code);
    const rfx = await resolveRfx(user.id, code);

    await call("issue_rfx", { rfx: code });
    await call("set_prior_po_rates", {
      rfx: code, poNumber: catalog.prior_po.po_number, poDate: catalog.prior_po.po_date,
      vendor: catalog.prior_po.vendor, rates: catalog.prior_po.rates,
    });
    await call("add_unit_rule", { rfx: code, fromUom: "per DIMM", toUom: "kit", factor: 2, basis: "One asked kit = 2x 16GB DIMMs, from the RFx line spec" });

    // 2. Submit each supplier's quotation (fixture = what Claude would have read).
    const quotes = (fixture as { quotes: Record<string, Record<string, RawQuote>> }).quotes;
    for (const [vcode, rows] of Object.entries(quotes)) {
      const extraction = toExtraction(vcode, rows);
      const out = await call("submit_quote", { rfx: code, supplier: vcode, ...extraction });
      if (vcode === "V2") check("USD rate taken from the supplier's stated rate", /USD rate set to 88.4/.test(out));
    }

    // 3. Questionnaires: facts in, verdicts out.
    const qa = catalog.questionnaire_answers as Record<string, Record<string, { answer: string | null; doc: string | null }>>;
    const verdicts: Record<string, string> = {};
    for (const [vcode, answers] of Object.entries(qa)) {
      const out = await call("submit_questionnaire", {
        rfx: code, supplier: vcode,
        answers: Object.entries(answers).map(([no, a]) => ({
          questionNo: no, answer: a.answer, attachedDocument: a.doc,
          evidence: a.doc ? evidenceFrom(a.doc) : null, confidence: 0.9,
        })),
      });
      verdicts[vcode] = out.split("\n")[0];
    }
    console.log("      verdicts:", JSON.stringify(verdicts));

    // 4. Every read tool answers.
    await call("get_rfx", { rfx: code });
    const overview = await call("get_comparison", { rfx: code, includeGrid: true });
    check("comparison mentions the award options", /Cheapest per line, all suppliers/.test(overview));
    await call("get_line", { rfx: code, lineNo: 13 });
    const explained = await call("explain_cell", { rfx: code, supplier: "V4", lineNo: 20 });
    check("explain_cell shows the unit conversion", /Unit conversion x10/.test(explained));
    await call("get_supplier", { rfx: code, supplier: "Cygnus" });
    await call("list_needs_attention", { rfx: code });
    await call("compare_award_options", { rfx: code });
    const whatIf = await call("what_if", { rfx: code, fxRates: { USD: 90 } });
    check("what_if prices a different FX rate", /What if: exchange rates/.test(whatIf));
    await call("get_chase_list", { rfx: code });

    // 5. After the round trip through MCP and the database, every cell matches the snapshot.
    const cmp = await loadComparison(rfx);
    let cellMismatch = 0;
    for (const [key, want] of Object.entries(expected.cells as Record<string, { status: string; unitInr: number | null }>)) {
      const [v, no] = key.split(":");
      const got = cmp.matrix[v]?.[Number(no)];
      if (!got || got.status !== want.status || got.unitInr !== want.unitInr) {
        cellMismatch++;
        if (cellMismatch <= 8) console.log(`      mismatch ${key}: got ${got?.status} ${got?.unitInr}, want ${want.status} ${want.unitInr}`);
      }
    }
    check("all 150 cells match the reference snapshot after the MCP round trip", cellMismatch === 0, `${cellMismatch} mismatches`);
    check("cheapest per line, all suppliers", Math.round(cmp.compliance.naive.totalInr) === expected.naive, String(cmp.compliance.naive.totalInr));
    for (const [v, want] of Object.entries(expected.singles)) {
      check(`single supplier ${v}`, Math.round(cmp.supplierInfo[v].single.totalInr) === want.total);
    }
    check("V1 stated 2.5% discount applied", Math.round(cmp.supplierInfo.V1.single.totalAfterStatedDiscountInr) === expected.singles.V1.afterDiscount);

    // 6. Changes from Claude land in the app's data.
    await call("correct_price", { rfx: code, supplier: "V4", lineNo: 2, price: 98000, reason: "Supplier confirmed 98,000 by phone" });
    let after = await loadComparison(rfx);
    check("correction changes the landed price", after.matrix.V4[2].unitInr === 98000);
    check("correction keeps the original reading", after.cellInfo["V4:2"].reading?.price === 99500);
    await call("correct_price", { rfx: code, supplier: "V4", lineNo: 2, reason: "undo", undo: true });
    after = await loadComparison(rfx);
    check("undo restores the reading", after.matrix.V4[2].unitInr === 99500);
    await call("correct_price", { rfx: code, supplier: "V4", lineNo: 2, reason: "missing price", undo: false, price: null, status: "bogus" }, true);

    await call("submit_second_read", { rfx: code, supplier: "V4", readings: [{ lineNo: 3, price: 84000 }, { lineNo: 4, price: 61800 }] });
    after = await loadComparison(rfx);
    check("agreeing second read keeps the price", after.matrix.V4[3].unitInr === 84000);
    check("disagreeing second read excludes the price", after.matrix.V4[4].status === "needs_review");

    await call("set_fx_rate", { rfx: code, currency: "USD", rate: 90, source: "e2e test rate" });
    after = await loadComparison(rfx);
    check("FX change recalculates USD lines", after.matrix.V2[12].unitInr === Math.round(6180 * 90));
    await call("set_fx_rate", { rfx: code, currency: "USD", rate: 88.4, source: "back to the supplier's stated rate" });

    const doc = await call("save_document_text", { rfx: code, filename: "pasted-email.txt", text: "Hi, line 5 monitors at Rs 9,700 each. Regards, Helios", supplier: "V5" });
    const docId = /document (doc_[a-z0-9]+)/.exec(doc)?.[1];
    check("save_document_text returns an id", Boolean(docId));
    await call("list_documents", { rfx: code });
    const opened = await call("read_document", { rfx: code, document: docId });
    check("read_document returns the text and the catalog", /RFX LINE CATALOG/.test(opened) && /9,700/.test(opened));

    const chase = await call("record_chase", { rfx: code, supplier: "V5" });
    check("chase drafts a message", /Subject:/.test(chase));
    const award = await call("create_award", { rfx: code, scenario: "cheapest_qualified", commentary: "Recommend the qualified split; V4's apparent savings are not available." });
    const token = /\/share\/([A-Za-z0-9_-]+)/.exec(award)?.[1];
    check("create_award returns an approval link", Boolean(token));
    const share = await fetch(`${BASE}/share/${token}`);
    check("approval page loads", share.status === 200, String(share.status));
    await call("get_award_status", { rfx: code });
    const exp = await call("get_export_link", { rfx: code, format: "xlsx" });
    const xlsxUrl = /(https?:\/\/\S+\?t=\S+)/.exec(exp)?.[1];
    const xlsx = xlsxUrl ? await fetch(xlsxUrl) : null;
    check("export link downloads the Excel workbook without a login", xlsx?.status === 200 && /spreadsheetml/.test(xlsx.headers.get("content-type") ?? ""), String(xlsx?.status));
    const tampered = xlsxUrl ? await fetch(xlsxUrl.replace("/xlsx?", "/csv?")) : null;
    check("an export link only works for the file it was made for", tampered?.status === 401);
    const md = await call("get_activity", { rfx: code, format: "markdown" });
    check("transcript records what was asked", /e2e: create_rfx/.test(md) && /Tool `correct_price`/.test(md));

    // Edits added later: withdraw an award, remove a question, notes, repeat purchases.
    await call("withdraw_award", { rfx: code, reason: "e2e: revised quote expected" });
    const shareAfter = await fetch(`${BASE}/share/${token}`).then((r) => r.text());
    check("a withdrawn award's link says so", /withdrew this award/.test(shareAfter));
    await call("withdraw_award", { rfx: code, reason: "again" }, true);
    const qno = catalog.questionnaire.at(-1)!.no;
    const removed = await call("remove_questions", { rfx: code, questionNos: [qno], reason: "e2e: not needed" });
    check("remove_questions drops the question", removed.includes("QUESTIONNAIRE") && !removed.includes(`\n${qno} [`));
    await call("add_line_note", { rfx: code, lineNo: 1, note: "e2e: confirm warranty" });
    check("get_rfx shows line notes", /LINE NOTES[\s\S]*e2e: confirm warranty/.test(await call("get_rfx", { rfx: code })));
    const copy = await call("duplicate_rfx", { rfx: code, title: "e2e repeat purchase" });
    const copyCode = /Created (RFX-\d{4}-\d{4})/.exec(copy)?.[1];
    const listed = (await call("list_rfxs", {})).split("\n").find((l) => copyCode && l.startsWith(copyCode)) ?? "";
    check("duplicate_rfx copies lines and suppliers but no quotes", Boolean(copyCode) && /30 line items/.test(listed) && /0\/5 quoted/.test(listed) && /0 unread docs/.test(listed), listed);

    const hist = await call("price_history", { query: catalog.lines[0].sku });
    check("price_history finds the item with prices", hist.includes(code ?? "none") && /₹/.test(hist));
    check("list_open_work lists the open events", (await call("list_open_work", {})).includes(copyCode ?? "none"));

    // Search, suppliers, spend, unusual prices, budgets, comments, archive.
    check("search_bidline finds the event", (await call("search_bidline", { query: code ?? "" })).includes(code ?? "none"));
    check("supplier_scorecard covers a supplier", /Cygnus/.test(await call("supplier_scorecard", { supplier: "Cygnus" })));
    check("spend_summary answers", /Awarded \(approved\)/.test(await call("spend_summary", {})));
    await call("flag_unusual_prices", { rfx: code });
    check("set_budget changes a line budget", /Updated the budget on 1 line/.test(await call("set_budget", { rfx: code, items: [{ lineNo: 1, budgetInr: 12345 }] })));
    check("comment_on_price adds a comment", /Comment added/.test(await call("comment_on_price", { rfx: code, supplier: "V1", lineNo: 1, comment: "Confirmed by phone" })));
    check("archive_rfx archives the copy", /archived/.test(await call("archive_rfx", { rfx: copyCode, archive: true, reason: "e2e" })));
    check("archive_rfx restores it", /restored/.test(await call("archive_rfx", { rfx: copyCode, archive: false })));
    const toolCount = (await client.listTools()).tools.length;
    check("all 51 tools are offered to an admin", toolCount === 51, `${toolCount}`);

    await call("get_line", { rfx: "RFX-0000-0000", lineNo: 1 }, true);
    const bad = await fetch(`${BASE}/mcp/bl_not_a_real_token`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
    check("an invalid token is refused", bad.status === 404);
  } finally {
    await client.close().catch(() => {});
    if (!process.env.KEEP) await q("delete from users where id = $1", [user.id]);
    else console.log(`Kept test user ${email} (password e2e-password-123)`);
  }
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll end-to-end checks pass.");
  process.exit(failures ? 1 : 0);
}

/** A fixture vendor reply as the extraction Claude would submit. */
function toExtraction(vcode: string, rows: Record<string, RawQuote>) {
  const terms = (catalog.terms as Record<string, Record<string, unknown>>)[vcode] ?? {};
  const out: Record<string, unknown> = {
    vendorRef: `${vcode}-FIXTURE`,
    rows: [] as unknown[],
    terms: {
      gst: terms.gst ?? null, freight: terms.freight ?? null, payment: terms.payment ?? null,
      validity: terms.validity ?? null, delivery: terms.delivery ?? null,
      fxReference: vcode === "V2" ? 88.4 : null,
      totalLevelDiscountPercent: (terms.total_level_discount_pct as number | undefined) ?? null,
    },
  };
  for (const [key, r] of Object.entries(rows)) {
    const prov = { locator: `fixture ${vcode} ${key}`, citedText: `fixture value for ${key}`, method: "other" };
    if (key === "_default") {
      out.blanketFallback = { status: r.status, note: r.note ?? "blanket statement", rival: r.rival ?? null, provenance: prov };
      continue;
    }
    const lineNo = /^\d+$/.test(key) ? Number(key) : null;
    const reference = r.status === "relative"
      ? { basis: r.basis ?? "prior_po", refSku: r.ref_sku ?? null, upliftPct: r.uplift_pct ?? null }
      : r.status === "match_rival" ? { basis: "match_rival", rival: r.rival ?? null } : null;
    (out.rows as unknown[]).push({
      rfxLineNo: lineNo,
      vendorDescription: lineNo ? `fixture line ${key}` : `${key} ${r.desc ?? r.note ?? "supplier's own line"}`,
      status: r.status === "unmapped" ? "quoted" : r.status,
      price: r.price ?? null, uom: r.uom ?? null, currency: r.ccy ?? null, qty: r.qty_override ?? null,
      printedPrice: r.printed_price ?? null, handwritten: r.handwritten ?? false, offeredMakeModel: r.offered ?? null,
      note: r.note ?? null, scopeUpliftRef: r.scope_uplift_ref ?? null, scopeUpliftNote: r.scope_uplift_note ?? null,
      reference, confidence: 0.95, provenance: prov,
    });
  }
  return out;
}

function evidenceFrom(doc: string) {
  const std = /(ISO(?:\/IEC)?\s*\d{4,5}\s*:\s*\d{4})/i.exec(doc)?.[1] ?? null;
  const until = /valid (?:to|until) (\d{4}-\d{2}-\d{2})/i.exec(doc)?.[1] ?? null;
  return { standard: std, validUntil: until, issuedTo: null, summary: doc };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
