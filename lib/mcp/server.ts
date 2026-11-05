import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { signExport, type User } from "../auth";
import { toolAllowed, type ToolInfo } from "./catalog";
import { getEmailAccount } from "../mail";
import { q } from "../db";
import { logEvent, listEvents, transcriptMarkdown } from "../events";
import {
  BadInput, NotFound, getLineNotes, getLines, getQuestions, listRfxs, qualityGate, resolveRfx, resolveSupplier,
} from "../rfx";
import { documentBytes, getDocument, listDocuments } from "../files";
import { documentContent, type McpContent } from "../extract/for-claude";
import { QUESTIONNAIRE_READING_RULES, QUOTE_READING_RULES, lineCatalogText, questionCatalogText } from "../extract/prompt";
import { RAW_STATUSES } from "../extract/contract";
import { cellKey, loadComparison } from "../comparison";
import {
  addQuestionsAction, addSuppliersAction, addUnitAliasAction, addUnitRuleAction, clearCorrectionAction,
  correctCellAction, createAwardAction, createRfxAction, draftFollowUp, issueRfxAction, noteAssumptionAction,
  updateChaseAction, updateDocumentAction,
  recordChaseAction, removeLinesAction, resolveUnmappedAction, saveTextDocumentAction, setFxRateAction,
  setPriorPoAction, submitQuestionnaireAction, submitQuoteAction, submitSecondReadAction,
  updateRfxAction, updateSupplierAction, upsertLinesAction, type ActionCtx,
  addLineNoteAction, duplicateRfxAction, removeQuestionsAction, withdrawAwardAction,
  addCellCommentAction, archiveRfxAction, setBudgetAction,
} from "../actions";
import { searchAll } from "../search";
import { supplierDirectory } from "../directory";
import { spend } from "../analytics";
import { findOutliers } from "../calc/outliers";
import { cheapestPerLine, likeForLike } from "../calc/normalise";
import {
  cellText, gridText, inr, lineText, needsAttentionText, overview, rfxHeader, statusWords, supplierText,
} from "./format";

type Content = McpContent;
type ToolResult = { content: Content[]; isError?: boolean };

const USER_REQUEST = z.string().optional().describe(
  "The user's message that led to this call, quoted as closely as you can. Bidline records it in the event's activity log.",
);
const RFX = z.string().optional().describe(
  "Sourcing event code (e.g. RFX-2026-0142) or id. Leave out to use the most recently updated event.",
);

const text = (t: string): ToolResult => ({ content: [{ type: "text", text: t }] });

/**
 * Build an MCP server bound to one Bidline user. Created per request: the
 * endpoint is stateless, so any Vercel instance can answer any call.
 */
export function buildServer(user: User, appUrl: string, opts: { disabled?: string[]; collect?: ToolInfo[] } = {}): McpServer {
  const server = new McpServer(
    { name: "bidline", version: "1.0.0", title: "Bidline" },
    {
      instructions:
        "Bidline is a procurement workspace. A sourcing event is one purchase (an RFQ by default, or an RFP, RFI or tender); users may simply call it an RFQ. " +
        "Bidline compares supplier quotes for a sourcing event. You read the supplier documents and submit what they say. Bidline stores everything, " +
        "does every calculation (units, currency, totals, award options, questionnaire results) and updates the web app the buyer uses. " +
        "Never calculate totals or conversions yourself. Use get_comparison, compare_award_options or what_if and quote Bidline's figures. " +
        "To read supplier documents: list_documents, then read_document, then submit_quote (quotes) or submit_questionnaire (questionnaires and certificates). " +
        "Files the user attaches in chat can be read directly and submitted the same way. If unsure, start with get_started.",
    },
  );

  // Offer Claude only the tools this workspace has switched on and this person's role allows.
  // With `collect`, nothing is registered: the definitions are listed for the Tools page.
  const register = server.registerTool.bind(server) as (...a: unknown[]) => unknown;
  (server as unknown as { registerTool: (...a: unknown[]) => unknown }).registerTool = (name: unknown, config: unknown, cb: unknown) => {
    const c = config as { title?: string; description?: string; annotations?: { readOnlyHint?: boolean } };
    const info: ToolInfo = { name: String(name), title: c.title ?? String(name), description: c.description ?? "", readOnly: Boolean(c.annotations?.readOnlyHint) };
    if (opts.collect) return void opts.collect.push(info);
    if (!toolAllowed(info, user.role, opts.disabled ?? [])) return undefined;
    return register(name, config, cb);
  };

  async function run(tool: string, args: { user_request?: string }, fn: (ctx: ActionCtx) => Promise<ToolResult | string>, opts: { query?: string; rfx?: string } = {}): Promise<ToolResult> {
    const ctx: ActionCtx = { userId: user.id, actor: "claude", tool, userRequest: args.user_request ?? null };
    try {
      await q("update users set last_mcp_at = now() where id = $1", [user.id]);
      const out = await fn(ctx);
      if (opts.query) {
        const rfxId = opts.rfx !== undefined ? await resolveRfx(user.id, opts.rfx).then((r) => r.id).catch(() => null) : null;
        await logEvent({ userId: user.id, rfxId, actor: "claude", kind: "query", tool, userRequest: ctx.userRequest, summary: opts.query });
      }
      return typeof out === "string" ? text(out) : out;
    } catch (e) {
      const known = e instanceof BadInput || e instanceof NotFound;
      if (!known) console.error(`[mcp:${tool}]`, e);
      return { content: [{ type: "text", text: known ? (e as Error).message : `Bidline error: ${(e as Error).message}` }], isError: true };
    }
  }

  const ro = { readOnlyHint: true, openWorldHint: false } as const;
  const rw = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

  // -------------------------------------------------------------------------
  // Orientation
  // -------------------------------------------------------------------------

  server.registerTool("get_started", {
    title: "Bidline overview and workspace",
    description: "Explains Bidline, lists the sourcing events in this workspace and suggests next steps. Call this first if the user asks what Bidline can do.",
    inputSchema: { user_request: USER_REQUEST },
    annotations: ro,
  }, async (args) => run("get_started", args, async () => {
    const rfxs = await listRfxs(user.id);
    return [
      `Bidline workspace of ${user.name} (${user.email}). App: ${appUrl}`,
      "",
      "Bidline turns supplier quotes in any format into one like-for-like comparison. Every price links back to the supplier's document. The buyer can edit any price with a reason, record follow-ups for missing items, and send the award note to the approver as a link. You read the documents. Bidline does the calculations.",
      "",
      rfxs.length
        ? "RFQS\n" + rfxs.map((r) => `- ${r.code} "${r.title}" [${r.status}]: ${r.line_count} line items, ${r.responded}/${r.supplier_count} suppliers quoted, ${r.unread_docs} unread documents. ${appUrl}/rfx/${r.id}`).join("\n")
        : "No sourcing events yet. Create one with create_rfx, or the user can load the demo event from the dashboard.",
      "",
      "TYPICAL FLOW",
      "1. create_rfx (lines, suppliers, questionnaire) and issue_rfx",
      "2. Suppliers send quotes: the user uploads files in the app or attaches them here. list_documents, read_document, then submit_quote / submit_questionnaire",
      "3. get_comparison, list_needs_attention, explain_cell, correct_price, set_fx_rate",
      "4. get_chase_list and record_chase for follow-ups on missing items",
      "5. compare_award_options or what_if, then create_award. The approver approves through the link it returns",
    ].join("\n");
  }, { query: "Opened Bidline (get_started)." }));

  server.registerTool("list_rfxs", {
    title: "List sourcing events",
    description: "Every sourcing event in this workspace with its type (RFQ, RFP, RFI, tender), status, suppliers who have quoted and unread documents.",
    inputSchema: { user_request: USER_REQUEST },
    annotations: ro,
  }, async (args) => run("list_rfxs", args, async () => {
    const rfxs = await listRfxs(user.id);
    if (!rfxs.length) return "No sourcing events yet.";
    return rfxs.map((r) => `${r.code} | ${r.event_type} | ${r.title} | ${r.status} | ${r.line_count} line items | ${r.responded}/${r.supplier_count} quoted | ${r.unread_docs} unread docs | ${appUrl}/rfx/${r.id}`).join("\n");
  }));

  server.registerTool("list_open_work", {
    title: "What is waiting, across all events",
    description: "One list of everything waiting on the buyer across all open sourcing events: unread documents, prices that need review, overdue follow-ups and awards awaiting approval. Use it for 'what should I do today?'.",
    inputSchema: { user_request: USER_REQUEST },
    annotations: ro,
  }, async (args) => run("list_open_work", args, async () => {
    const rfxs = (await listRfxs(user.id)).filter((r) => !["awarded", "closed"].includes(r.status)).slice(0, 15);
    if (!rfxs.length) return "Nothing open. Every sourcing event is awarded or closed.";
    const overdue = await q<{ rfx_id: string; n: number }>(
      `select c.rfx_id, count(*)::int as n from chases c join rfx r on r.id = c.rfx_id
        where r.user_id = $1 and c.answered_at is null and c.closed_reason is null and c.due_at < now() group by c.rfx_id`, [user.id]);
    const cmps = await Promise.all(rfxs.map((r) => loadComparison(r)));
    const out: string[] = [];
    for (const [i, r] of rfxs.entries()) {
      const cmp = cmps[i];
      const review = cmp.trust.needsHuman + cmp.unmapped.filter((u) => !u.resolution).length;
      const late = overdue.find((o) => o.rfx_id === r.id)?.n ?? 0;
      const items = [
        r.unread_docs ? `${r.unread_docs} unread document${r.unread_docs === 1 ? "" : "s"} (read them with read_document)` : "",
        review ? `${review} price${review === 1 ? "" : "s"} need review (list_needs_attention)` : "",
        late ? `${late} overdue follow-up${late === 1 ? "" : "s"} (get_chase_list)` : "",
        r.award_status === "sent" ? "award awaiting approval (get_award_status)" : "",
        !r.line_count ? "no line items yet (upsert_lines)" : "",
      ].filter(Boolean);
      out.push(`${r.code} ${r.title} [${r.status}]: ${items.length ? items.join("; ") : "nothing waiting"}. ${appUrl}/rfx/${r.id}`);
    }
    return out.join("\n");
  }, { query: "Checked what is waiting across all events." }));

  server.registerTool("price_history", {
    title: "Price history for an item",
    description: "What suppliers quoted for an item across all past sourcing events, matched by SKU or words in the description (e.g. 'docking station'). Landed per-unit prices in INR from Bidline's calculation, lowest first. Use it to sanity-check a new quote or set a budget.",
    inputSchema: { query: z.string().describe("SKU or words from the item description."), user_request: USER_REQUEST },
    annotations: ro,
  }, async (args) => run("price_history", args, async () => {
    const words = args.query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) throw new BadInput("Say which item, by SKU or description.");
    const rows: string[] = [];
    const events = (await listRfxs(user.id)).slice(0, 30);
    const matched = (await Promise.all(events.map(async (r) => ({
      r,
      lines: (await getLines(r.id)).filter((l) => {
        const hay = `${l.sku} ${l.desc}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      }),
    })))).filter((m) => m.lines.length);
    const cmps = await Promise.all(matched.map((m) => loadComparison(m.r)));
    for (const [i, { r, lines }] of matched.entries()) {
      const cmp = cmps[i];
      for (const l of lines) {
        const prices = cmp.suppliers
          .map((sup) => ({ sup, c: cmp.matrix[sup.code]?.[l.no] }))
          .filter((x) => x.c && x.c.unitInr !== null && (x.c.status === "comparable" || x.c.status === "comparable_with_caveat"))
          .sort((a, b) => (a.c!.unitInr ?? 0) - (b.c!.unitInr ?? 0));
        rows.push(
          `${r.code} (${r.created_at.slice(0, 10)}) L${l.no} ${l.sku} ${l.desc} | ${l.qty} x ${l.uom} | budget ${l.baseline_inr ? inr(l.baseline_inr) : "none"} | ` +
          (prices.length ? prices.map((x) => `${x.sup.code} ${x.sup.name} ${inr(x.c!.unitInr)}`).join(", ") : "no comparable prices yet"),
        );
      }
    }
    return rows.length ? `Price history for "${args.query}" (per unit, landed, INR):\n${rows.join("\n")}` : `No line items matching "${args.query}" in any sourcing event.`;
  }, { query: `Looked up price history for "${args.query}".` }));

  server.registerTool("get_rfx", {
    title: "Event details",
    description: "The Event details, every line item (item, specification, unit, pack size, quantity), the suppliers and their status, the questionnaire and any unclear line items.",
    inputSchema: { rfx: RFX, user_request: USER_REQUEST },
    annotations: ro,
  }, async (args) => run("get_rfx", args, async () => {
    const rfx = await resolveRfx(user.id, args.rfx);
    const cmp = await loadComparison(rfx);
    const gate = qualityGate(cmp.lines);
    const notes = await getLineNotes(rfx.id);
    const terms = Object.entries(rfx.terms_asked ?? {}).map(([k, v]) => `- ${k}: ${v}`);
    return [
      rfxHeader(cmp, appUrl),
      `Buyer: ${JSON.stringify(rfx.buyer)}. Approver: ${JSON.stringify(rfx.approver)}.`,
      terms.length ? "Terms requested:\n" + terms.join("\n") : "",
      "",
      "LINE ITEMS",
      ...cmp.lines.map((l) => `L${l.no} ${l.sku} | ${l.desc} | ${l.qty} x ${l.uom}${l.pack_size > 1 ? ` (${l.pack_size} per ${l.uom})` : ""} | budget ${inr(l.baseline_inr)}`),
      "",
      "SUPPLIERS",
      ...cmp.suppliers.map((s) => `${s.code} ${s.name} [${s.status}] ${JSON.stringify(s.contact)}`),
      "",
      questionCatalogText(cmp.questions),
      gate.length ? "\nUNCLEAR LINE ITEMS\n" + gate.map((g) => `L${g.lineNo}: ${g.issue}`).join("\n") : "",
      notes.length ? "\nLINE NOTES\n" + notes.map((n) => `L${n.line_no} (${n.actor === "claude" ? "Claude" : "buyer"}, ${n.created_at.slice(0, 10)}): ${n.text}`).join("\n") : "",
    ].filter((x) => x !== "").join("\n");
  }, { query: "Viewed the Event details.", rfx: args.rfx ?? "" }));

  // -------------------------------------------------------------------------
  // Creating and editing an enquiry
  // -------------------------------------------------------------------------

  const LINE = z.object({
    no: z.number().int().positive().optional().describe("Line number. Leave out to add a new line at the end."),
    sku: z.string().optional().describe("Short item code, e.g. LT-BUS-14."),
    group: z.string().optional().describe("Category heading, e.g. Enduser Compute."),
    description: z.string().describe("What is being bought, with the key specification."),
    spec: z.record(z.string(), z.any()).optional().describe("Spec as key/value pairs, e.g. {ram_gb: 16}."),
    uom: z.string().describe("The unit of measure being priced: 'nos', 'box of 10', 'kit', 'pack of 5'. State the pack size for any box or pack."),
    packSize: z.number().int().positive().optional().describe("Pack size: billable units in one uom. 10 for 'box of 10'."),
    qty: z.number().int().positive().describe("Quantity required, in uom."),
    hsn: z.string().optional(),
    baselineInr: z.number().optional().describe("Budget or last-paid price per uom in INR, if known."),
  });
  const SUPPLIER = z.object({
    name: z.string(),
    city: z.string().optional(),
    contactName: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    channel: z.string().optional().describe("email, WhatsApp, portal..."),
    gstin: z.string().optional(),
    notes: z.string().optional(),
  });
  const QUESTION = z.object({
    no: z.string().optional().describe("e.g. Q3. Leave out to number automatically."),
    question: z.string(),
    mandatory: z.boolean().optional().describe("True if a supplier that fails it is not qualified, whatever the price. Default true."),
    documentRequired: z.boolean().optional().describe("True if a supporting document (certificate, letter) must be attached."),
  });

  server.registerTool("create_rfx", {
    title: "Create a sourcing event",
    description: "Create a new sourcing event (an RFQ by default; RFP, RFI or tender if the user says so) from what the user needs to buy: title, line items, and optionally suppliers to invite and a supplier questionnaire. Returns the event code, any unclear line items, and the link to open it in the app.",
    inputSchema: {
      title: z.string(),
      eventType: z.enum(["RFQ", "RFP", "RFI", "TENDER"]).optional().describe("Default RFQ."),
      dueDate: z.string().optional().describe("Quote due date, YYYY-MM-DD."),
      buyerName: z.string().optional(),
      buyerEmail: z.string().optional(),
      approverName: z.string().optional().describe("Who approves the award, e.g. the CFO."),
      approverEmail: z.string().optional(),
      termsAsked: z.record(z.string(), z.string()).optional().describe("Commercial terms requested from suppliers, e.g. {delivery: 'FOR destination', payment: 'Net 30'}."),
      notes: z.string().optional(),
      lines: z.array(LINE).min(1),
      suppliers: z.array(SUPPLIER).optional(),
      questions: z.array(QUESTION).optional(),
      user_request: USER_REQUEST,
    },
    annotations: rw,
  }, async (args) => run("create_rfx", args, async (ctx) => {
    const { rfx, lines, gate } = await createRfxAction(ctx, {
      title: args.title, eventType: args.eventType ?? "RFQ", dueDate: args.dueDate ?? null,
      buyer: { name: args.buyerName ?? user.name, email: args.buyerEmail ?? user.email },
      approver: { name: args.approverName ?? null, email: args.approverEmail ?? null },
      termsAsked: args.termsAsked ?? {}, notes: args.notes ?? null,
      lines: args.lines, suppliers: args.suppliers, questions: args.questions,
    });
    return [
      `Created ${rfx.code} "${rfx.title}" with ${lines.length} line items${args.suppliers?.length ? ` and ${args.suppliers.length} suppliers` : ""}.`,
      `Open in Bidline: ${appUrl}/rfx/${rfx.id}`,
      gate.length
        ? `\nBidline found ${gate.length} unclear line item${gate.length === 1 ? "" : "s"} that suppliers could price differently:\n${gate.map((g) => `- L${g.lineNo}: ${g.issue}. Fix: ${g.fix}`).join("\n")}\nFix them with upsert_lines, or issue anyway with a reason.`
        : "\nAll line items are specific enough to issue. Use issue_rfx when the user is ready.",
    ].join("\n");
  }));

  server.registerTool("update_rfx", {
    title: "Update Event details",
    description: "Change the title, due date, status, buyer, approver, terms requested or notes of a sourcing event.",
    inputSchema: {
      rfx: RFX,
      title: z.string().optional(),
      eventType: z.enum(["RFQ", "RFP", "RFI", "TENDER"]).optional(),
      dueDate: z.string().optional().describe("YYYY-MM-DD"),
      status: z.enum(["draft", "issued", "evaluating", "awarded", "closed"]).optional(),
      approverName: z.string().optional(),
      approverEmail: z.string().optional(),
      termsAsked: z.record(z.string(), z.string()).optional(),
      notes: z.string().optional(),
      user_request: USER_REQUEST,
    },
    annotations: rw,
  }, async (args) => run("update_rfx", args, async (ctx) => {
    const r = await updateRfxAction(ctx, args.rfx, {
      title: args.title, eventType: args.eventType, dueDate: args.dueDate, status: args.status, notes: args.notes, termsAsked: args.termsAsked,
      approver: args.approverName || args.approverEmail ? { ...(args.approverName ? { name: args.approverName } : {}), ...(args.approverEmail ? { email: args.approverEmail } : {}) } : undefined,
    });
    return `Updated ${r.code}. ${appUrl}/rfx/${r.id}`;
  }));

  server.registerTool("upsert_lines", {
    title: "Add, change or remove line items",
    description: "Add new line items, change existing ones (give their line number), or remove line items. Returns any unclear line items.",
    inputSchema: {
      rfx: RFX,
      lines: z.array(LINE).optional(),
      remove: z.array(z.number().int()).optional().describe("Line numbers to remove."),
      reason: z.string().optional().describe("Reason for removing the lines."),
      user_request: USER_REQUEST,
    },
    annotations: { ...rw, destructiveHint: true },
  }, async (args) => run("upsert_lines", args, async (ctx) => {
    const out: string[] = [];
    if (args.lines?.length) {
      const r = await upsertLinesAction(ctx, args.rfx, args.lines);
      out.push(`Saved line${r.touched.length === 1 ? "" : "s"} ${r.touched.join(", ")} on ${r.rfx.code}.`);
      if (r.gate.length) out.push(`Unclear line items:\n${r.gate.map((g) => `- L${g.lineNo}: ${g.issue}`).join("\n")}`);
    }
    if (args.remove?.length) {
      const r = await removeLinesAction(ctx, args.rfx, args.remove, args.reason ?? "removed in Claude");
      out.push(`Removed line${args.remove.length === 1 ? "" : "s"} ${args.remove.join(", ")} from ${r.rfx.code}.`);
    }
    return out.join("\n") || "No changes made.";
  }));

  server.registerTool("add_questions", {
    title: "Add questionnaire questions",
    description: "Add or change supplier questionnaire questions. A supplier that fails a mandatory question is not qualified, whatever the price.",
    inputSchema: { rfx: RFX, questions: z.array(QUESTION).min(1), user_request: USER_REQUEST },
    annotations: rw,
  }, async (args) => run("add_questions", args, async (ctx) => {
    const r = await addQuestionsAction(ctx, args.rfx, args.questions);
    return `Saved ${args.questions.length} question${args.questions.length === 1 ? "" : "s"} on ${r.rfx.code}.\n${questionCatalogText(await getQuestions(r.rfx.id))}`;
  }));

  server.registerTool("remove_questions", {
    title: "Remove questionnaire questions",
    description: "Delete questionnaire questions by number (e.g. Q3), with a reason kept in the audit trail. Qualification is recalculated without them.",
    inputSchema: { rfx: RFX, questionNos: z.array(z.string()).min(1).describe("Question numbers, e.g. [\"Q3\"]."), reason: z.string(), user_request: USER_REQUEST },
    annotations: { ...rw, destructiveHint: true },
  }, async (args) => run("remove_questions", args, async (ctx) => {
    const r = await removeQuestionsAction(ctx, args.rfx, args.questionNos, args.reason);
    return `Removed ${r.removed.map((x) => x.no).join(", ")} from ${r.rfx.code}.\n${questionCatalogText(await getQuestions(r.rfx.id))}`;
  }));

  server.registerTool("duplicate_rfx", {
    title: "Duplicate a sourcing event",
    description: "Start a new draft from an earlier event for a repeat purchase: copies line items, budgets, suppliers and the questionnaire. No quotes, documents, follow-ups, awards, exchange rates or unit rules are copied; set rates again with set_fx_rate if needed.",
    inputSchema: { rfx: RFX, title: z.string().optional().describe("Title for the copy. Default: the original title with (copy)."), dueDate: z.string().optional().describe("YYYY-MM-DD"), user_request: USER_REQUEST },
    annotations: rw,
  }, async (args) => run("duplicate_rfx", args, async (ctx) => {
    const r = await duplicateRfxAction(ctx, args.rfx, { title: args.title, dueDate: args.dueDate });
    return `Created ${r.rfx.code} "${r.rfx.title}" from ${r.from.code}: ${r.lines} line items, ${r.suppliers} suppliers, ${r.questions} questions. It is a draft with no quotes.\nOpen in Bidline: ${appUrl}/rfx/${r.rfx.id}`;
  }));

  server.registerTool("add_line_note", {
    title: "Add a note to a line item",
    description: "Attach a note to one line item, e.g. 'confirm the warranty with Vector before award'. Notes are shown on the Line items step and kept in the audit trail. They never change a price.",
    inputSchema: { rfx: RFX, lineNo: z.number().int().positive(), note: z.string(), user_request: USER_REQUEST },
    annotations: rw,
  }, async (args) => run("add_line_note", args, async (ctx) => {
    const r = await addLineNoteAction(ctx, args.rfx, args.lineNo, args.note);
    return `Noted on ${r.rfx.code} line ${args.lineNo} (${r.line.desc}).`;
  }));

  server.registerTool("issue_rfx", {
    title: "Issue the event",
    description: "Mark the event as issued to its suppliers. Bidline holds it while any line item is unclear, unless a reason is given. The reason is shown in the award note. Bidline records the issue but does not send emails.",
    inputSchema: { rfx: RFX, overrideReason: z.string().optional(), user_request: USER_REQUEST },
    annotations: rw,
  }, async (args) => run("issue_rfx", args, async (ctx) => {
    const r = await issueRfxAction(ctx, args.rfx, args.overrideReason);
    if (!r.issued) {
      return `Not issued: ${r.gate.length} line item${r.gate.length === 1 ? " is" : "s are"} unclear.\n${r.gate.map((g) => `- L${g.lineNo}: ${g.issue}. Fix: ${g.fix}`).join("\n")}\nFix with upsert_lines, or call issue_rfx again with overrideReason.`;
    }
    return `${r.rfx.code} is issued. Suppliers are marked as invited. Bidline does not send emails, so send the event to suppliers yourself. ${appUrl}/rfx/${r.rfx.id}`;
  }));

  server.registerTool("add_suppliers", {
    title: "Add suppliers",
    description: "Add suppliers to a sourcing event. Each gets a code (V1, V2...) used in all other tools.",
    inputSchema: { rfx: RFX, suppliers: z.array(SUPPLIER).min(1), user_request: USER_REQUEST },
    annotations: rw,
  }, async (args) => run("add_suppliers", args, async (ctx) => {
    const r = await addSuppliersAction(ctx, args.rfx, args.suppliers);
    return `Added to ${r.rfx.code}: ${r.added.map((s) => `${s.code} ${s.name}`).join(", ")}.`;
  }));

  server.registerTool("update_supplier", {
    title: "Update a supplier",
    description: "Change a supplier's details or status (invited, responded, declined, removed).",
    inputSchema: {
      rfx: RFX, supplier: z.string().describe("Code (V2), name or id."),
      name: z.string().optional(), city: z.string().optional(), contactName: z.string().optional(),
      email: z.string().optional(), phone: z.string().optional(), channel: z.string().optional(),
      status: z.enum(["invited", "responded", "declined", "removed"]).optional(), notes: z.string().optional(),
      user_request: USER_REQUEST,
    },
    annotations: rw,
  }, async (args) => run("update_supplier", args, async (ctx) => {
    const { rfx: _r, supplier, user_request: _u, ...patch } = args;
    void _r; void _u;
    const s = await updateSupplierAction(ctx, args.rfx, supplier, patch);
    return `Updated ${s.code} ${s.name} [${s.status}].`;
  }));

  // -------------------------------------------------------------------------
  // Documents and reading
  // -------------------------------------------------------------------------

  server.registerTool("list_documents", {
    title: "List supplier documents",
    description: "Files on a sourcing event (uploaded in the app or saved from chat): id, file name, supplier, type (quotation, questionnaire, certificate) and read status.",
    inputSchema: { rfx: RFX, unreadOnly: z.boolean().optional(), user_request: USER_REQUEST },
    annotations: ro,
  }, async (args) => run("list_documents", args, async () => {
    const rfx = await resolveRfx(user.id, args.rfx);
    const docs = (await listDocuments(rfx.id)).filter((d) => !args.unreadOnly || d.status === "unread");
    if (!docs.length) return `${rfx.code} has no ${args.unreadOnly ? "unread " : ""}documents. The user can upload files at ${appUrl}/rfx/${rfx.id}?tab=documents or attach them in this chat.`;
    return `${rfx.code} documents (newest first):\n` + docs.map((d) =>
      `- ${d.id} | ${d.filename} | ${d.kind} | ${d.supplier_code ? `${d.supplier_code} ${d.supplier_name}` : "supplier unknown"} | ${d.status} | ${Math.round(d.byte_size / 1024)} KB`).join("\n") +
      "\nRead one with read_document.";
  }, { query: "Listed the event's documents.", rfx: args.rfx ?? "" }));

  server.registerTool("read_document", {
    title: "Open a supplier document",
    description: "Returns a stored document's contents for you to read (spreadsheet cells with addresses, PDF text with page and line numbers, Word paragraphs, email body, or the photo), with the line item catalog and the reading rules. Then call submit_quote or submit_questionnaire with its documentId.",
    inputSchema: {
      rfx: RFX,
      document: z.string().optional().describe("Document id or filename. Leave out to open the oldest unread document."),
      user_request: USER_REQUEST,
    },
    annotations: ro,
  }, async (args) => run("read_document", args, async () => {
    const rfx = await resolveRfx(user.id, args.rfx);
    let doc = args.document ? await getDocument(rfx.id, args.document) : null;
    if (!args.document) {
      const unread = (await listDocuments(rfx.id)).filter((d) => d.status === "unread").reverse();
      doc = unread[0] ?? null;
      if (!doc) return `No unread documents on ${rfx.code}.`;
    }
    if (!doc) throw new NotFound(`No document '${args.document}' on ${rfx.code}. Use list_documents.`);
    const supplier = doc.supplier_id ? await resolveSupplier(rfx.id, doc.supplier_id).catch(() => null) : null;
    const bytes = await documentBytes(doc);
    const { format, content } = await documentContent(bytes, doc.filename, doc.mime_type);
    const isQ = doc.kind === "questionnaire" || doc.kind === "certificate";
    const header = [
      `DOCUMENT ${doc.id}: ${doc.filename} (${format}, ${doc.kind}) on ${rfx.code}`,
      supplier ? `From supplier ${supplier.code} ${supplier.name}.` : "Supplier not known yet: identify it from the letterhead and pass it as `supplier` (a new name is added as a new supplier).",
      isQ ? `Submit with submit_questionnaire, documentId "${doc.id}".` : `Submit with submit_quote, documentId "${doc.id}". If it turns out to be a questionnaire or certificate, use submit_questionnaire instead.`,
      "",
      isQ ? QUESTIONNAIRE_READING_RULES : QUOTE_READING_RULES,
      "",
      isQ ? questionCatalogText(await getQuestions(rfx.id)) : lineCatalogText(await getLines(rfx.id)),
      "",
      "=== DOCUMENT CONTENT ===",
    ].join("\n");
    await logEvent({ userId: user.id, rfxId: rfx.id, actor: "claude", kind: "query", tool: "read_document", userRequest: args.user_request ?? null, summary: `Opened ${doc.filename} to read it.` });
    return { content: [{ type: "text", text: header }, ...content] };
  }));

  server.registerTool("save_document_text", {
    title: "Save chat text as a document",
    description: "Save text from this chat (for example an email the user pasted) as a document on the event, so prices read from it link back to it. Returns a documentId to pass to submit_quote.",
    inputSchema: {
      rfx: RFX, filename: z.string().describe("A short name, e.g. helios-email-17-sep.txt"), text: z.string(),
      supplier: z.string().optional(), kind: z.enum(["quotation", "questionnaire", "certificate", "other"]).optional(),
      user_request: USER_REQUEST,
    },
    annotations: rw,
  }, async (args) => run("save_document_text", args, async (ctx) => {
    const r = await saveTextDocumentAction(ctx, args.rfx, { filename: args.filename, text: args.text, supplierRef: args.supplier, kind: args.kind });
    return `Saved as document ${r.doc.id} (${r.doc.filename}) on ${r.rfx.code}. Pass documentId "${r.doc.id}" when you submit what you read from it.`;
  }));

  const PROVENANCE = z.object({
    locator: z.string().describe("Excel 'Sheet!G14', PDF 'p2 L14', Word 'para 7', email 'body line 4', photo 'bbox x0,y0,x1,y1'."),
    citedText: z.string().describe("The supplier's exact text for this value. Never empty."),
    method: z.enum(["xlsx_cell", "pdf_text", "docx_prose", "email_text", "vision_bbox", "other"]),
    page: z.number().int().positive().nullish(),
  });
  const ROW = z.object({
    rfxLineNo: z.number().int().positive().nullable().describe("The line item this matches, or null if none. Do not match it to the nearest line."),
    vendorDescription: z.string().describe("How the supplier described the item."),
    status: z.enum(RAW_STATUSES).describe("quoted | substituted (different make) | downgraded (lower spec) | uom_mismatch | bundled | moq_adjusted | relative (refers to a previous order) | match_rival | illegible | not_quoted (explicit decline). Use illegible rather than guessing."),
    price: z.number().nullish().describe("As written, in the supplier's unit and currency. Do not convert, multiply by pack size or apply discounts."),
    uom: z.string().nullish().describe("The unit they priced in, in their words: 'per pc', 'box of 10', 'per DIMM'."),
    currency: z.string().nullish().describe("ISO code, INR or USD..."),
    qty: z.number().int().nullish().describe("Quantity the supplier quoted, if different from the request."),
    printedPrice: z.number().nullish().describe("A printed price crossed out and replaced by hand."),
    handwritten: z.boolean().nullish(),
    offeredMakeModel: z.string().nullish(),
    note: z.string().nullish().describe("MOQs, free goods, warranty scope, conditions, 'ex-works'."),
    scopeUpliftRef: z.string().nullish().describe("If this price excludes something the event asked for, which the supplier priced on another of their lines, that line's label (e.g. '30A')."),
    scopeUpliftNote: z.string().nullish(),
    reference: z.object({
      basis: z.enum(["prior_po", "prior_po_uplift", "match_rival", "other"]),
      refSku: z.string().nullish(), upliftPct: z.number().nullish(), rival: z.string().nullish(),
    }).nullish().describe("Only when the price refers to another price instead of stating one."),
    confidence: z.number().min(0).max(1).describe("Your confidence that you read it correctly."),
    provenance: PROVENANCE,
  });

  server.registerTool("submit_quote", {
    title: "Submit a quote",
    description: "Store what you read from one supplier quote: one row per item, each with the price exactly as written and the supplier's text. Bidline validates it, converts units and currency, calculates landed prices, and updates the comparison and the app. Returns the result for each line and what needs review.",
    inputSchema: {
      rfx: RFX,
      supplier: z.string().describe("Supplier code (V2), name, or id. A name not on the event is added as a new supplier."),
      documentId: z.string().optional().describe("The document you read, from list_documents or save_document_text. Leave out only if the user attached the file in chat and there is no stored copy."),
      vendorRef: z.string().nullish().describe("The supplier's quote number."),
      supersedesRef: z.string().nullish().describe("If this replaces an earlier quote, that quote's number."),
      revisionNote: z.string().nullish(),
      rows: z.array(ROW),
      blanketFallback: z.object({
        status: z.enum(RAW_STATUSES), note: z.string(), rival: z.string().nullish(), provenance: PROVENANCE,
      }).nullish().describe("One statement that covers every line the supplier did not price individually, e.g. 'rest we will match Zenith'."),
      terms: z.object({
        gst: z.string().nullish(), freight: z.string().nullish(), payment: z.string().nullish(),
        validity: z.string().nullish(), delivery: z.string().nullish(),
        fxReference: z.number().nullish().describe("An exchange rate the supplier states for their own conversion."),
        fxNote: z.string().nullish(),
        totalLevelDiscountPercent: z.number().nullish().describe("A discount on the grand total only."),
        notes: z.string().nullish(),
      }).nullish(),
      conditionalDiscounts: z.array(z.object({
        percent: z.number().nullish(), amountInr: z.number().nullish(), scope: z.string(), condition: z.string(), provenance: PROVENANCE,
      })).nullish(),
      statedTotal: z.object({ amount: z.number().nullish(), currency: z.string().nullish(), basis: z.string().nullish() }).nullish(),
      unreadableRegions: z.array(z.string()).nullish(),
      user_request: USER_REQUEST,
    },
    annotations: rw,
  }, async (args) => run("submit_quote", args, async (ctx) => {
    const { rfx: rfxRef, supplier, documentId, user_request: _u, ...extraction } = args;
    void _u;
    const r = await submitQuoteAction(ctx, { rfx: rfxRef, supplier, documentId, extraction });
    const code = r.supplier.code;
    const counts: Record<string, number> = {};
    for (const l of r.cmp.lines) {
      const s = r.cmp.matrix[code]?.[l.no]?.status ?? "not_read";
      counts[s] = (counts[s] ?? 0) + 1;
    }
    const attention = r.cmp.lines
      .map((l) => ({ l, c: r.cmp.matrix[code]?.[l.no] }))
      .filter(({ c }) => c && ["needs_review", "unreadable", "unresolvable", "resolved_from_reference", "non_comparable"].includes(c.status))
      .map(({ l, c }) => `- L${l.no}: ${statusWords(c!.status)}. ${c!.flags[0] ?? ""}`);
    const single = r.cmp.supplierInfo[code].single;
    return [
      `Stored ${r.cells} line${r.cells === 1 ? "" : "s"} from ${code} ${r.supplier.name}${r.revision > 1 ? ` as revision ${r.revision}` : ""}${r.unmapped ? `, plus ${r.unmapped} item${r.unmapped === 1 ? "" : "s"} with no matching line item (listed separately, not matched to a line)` : ""}.`,
      r.issues.length ? `Validation changed ${r.issues.length} row${r.issues.length === 1 ? "" : "s"}:\n${r.issues.map((i) => `- row ${i.rowIndex + 1}: ${i.reason}`).join("\n")}` : "",
      ...r.fxNotes,
      `Line results: ${Object.entries(counts).map(([k, v]) => `${v} ${statusWords(k)}`).join(", ")}.`,
      `Total of comparable lines: ${inr(single.totalInr)} (${single.linesPriced}/${r.cmp.lines.length} lines).`,
      attention.length ? `Needs review:\n${attention.slice(0, 15).join("\n")}` : "",
      `Updated in the app: ${appUrl}/rfx/${r.rfx.id}`,
    ].filter(Boolean).join("\n");
  }));

  server.registerTool("submit_questionnaire", {
    title: "Submit questionnaire answers and evidence",
    description: "Store a supplier's questionnaire answers and what their supporting documents say. Facts only: Bidline decides pass, fail or not assessed (for example, an expired certificate or the wrong version of a standard fails). Answers are merged with earlier ones for the same supplier.",
    inputSchema: {
      rfx: RFX,
      supplier: z.string(),
      documentId: z.string().optional(),
      answers: z.array(z.object({
        questionNo: z.string().describe("e.g. Q2"),
        answer: z.string().nullish().describe("The supplier's answer, exactly as written. Null if this document is only a supporting document."),
        attachedDocument: z.string().nullish().describe("The document the supplier says they attached, as they name it."),
        evidence: z.object({
          standard: z.string().nullish().describe("Standard named on the document, e.g. ISO/IEC 27001:2013."),
          validUntil: z.string().nullish().describe("Expiry date, YYYY-MM-DD."),
          issuedTo: z.string().nullish(),
          summary: z.string().nullish(),
        }).nullish(),
        confidence: z.number().min(0).max(1).optional(),
      })).min(1),
      user_request: USER_REQUEST,
    },
    annotations: rw,
  }, async (args) => run("submit_questionnaire", args, async (ctx) => {
    const r = await submitQuestionnaireAction(ctx, {
      rfx: args.rfx, supplier: args.supplier, documentId: args.documentId,
      answers: args.answers.map((a) => ({
        questionNo: a.questionNo, answer: a.answer ?? null, attachedDocument: a.attachedDocument ?? null,
        evidence: a.evidence ? { standard: a.evidence.standard ?? null, validUntil: a.evidence.validUntil ?? null, issuedTo: a.evidence.issuedTo ?? null, summary: a.evidence.summary ?? null } : null,
        confidence: a.confidence ?? 0.8,
      })),
    });
    const v = r.verdict;
    return [
      `${r.supplier.code} ${r.supplier.name}: ${v.qualified ? "Qualified" : v.assessed ? `Not qualified (failed mandatory ${v.failedMandatory.join(", ")})` : "Not assessed"}.`,
      ...v.assessments.map((a) => `- ${a.questionNo}${a.mandatory ? " (M)" : ""}: ${a.status.replace(/_/g, " ")}. ${a.why}`),
    ].join("\n");
  }));

  server.registerTool("submit_second_read", {
    title: "Second read of prices from a photo",
    description: "For a photo or hard-to-read document: read the largest prices again, separately, and submit them. If the second read disagrees with the first, Bidline excludes that price from all totals until the buyer reviews it.",
    inputSchema: {
      rfx: RFX, supplier: z.string(),
      readings: z.array(z.object({ lineNo: z.number().int(), price: z.number().nullable().describe("What you read this time, or null if unreadable.") })).min(1),
      user_request: USER_REQUEST,
    },
    annotations: rw,
  }, async (args) => run("submit_second_read", args, async (ctx) => {
    const r = await submitSecondReadAction(ctx, args);
    return r.results.map((x) => `L${x.lineNo}: first ${x.first ?? "none"}, second ${x.second ?? "unreadable"}: ${x.agreed ? "agree" : "DISAGREE, excluded from totals until reviewed"}`).join("\n") || "No matching prices.";
  }));

  // -------------------------------------------------------------------------
  // Analysis (read-only): every number comes from Bidline's calculator
  // -------------------------------------------------------------------------

  server.registerTool("get_comparison", {
    title: "Comparison",
    description: "Suppliers, coverage, qualification, headline award options and, optionally, the landed unit price grid for selected lines or suppliers. Bidline calculates every figure: quote them, do not recalculate.",
    inputSchema: {
      rfx: RFX,
      includeGrid: z.boolean().optional().describe("Include the line-by-supplier grid of landed unit prices."),
      lines: z.array(z.number().int()).optional(),
      suppliers: z.array(z.string()).optional().describe("Supplier codes to include in the grid."),
      user_request: USER_REQUEST,
    },
    annotations: ro,
  }, async (args) => run("get_comparison", args, async () => {
    const rfx = await resolveRfx(user.id, args.rfx);
    const cmp = await loadComparison(rfx);
    const out = [overview(cmp, appUrl)];
    if (args.includeGrid || args.lines?.length || args.suppliers?.length) out.push("", gridText(cmp, { lines: args.lines, suppliers: args.suppliers }));
    return out.join("\n");
  }, { query: "Viewed the comparison.", rfx: args.rfx ?? "" }));

  server.registerTool("get_line", {
    title: "One line item across suppliers",
    description: "One line item: each supplier's landed unit price, what they quoted, flags and the source of each price.",
    inputSchema: { rfx: RFX, lineNo: z.number().int(), user_request: USER_REQUEST },
    annotations: ro,
  }, async (args) => run("get_line", args, async () => {
    const cmp = await loadComparison(await resolveRfx(user.id, args.rfx));
    return lineText(cmp, args.lineNo);
  }, { query: `Viewed line ${args.lineNo}.`, rfx: args.rfx ?? "" }));

  server.registerTool("explain_cell", {
    title: "Explain one price",
    description: "For one supplier and line: what the supplier quoted and where, each step from the quoted price to the landed unit price, any edit and its reason, and the change history.",
    inputSchema: { rfx: RFX, supplier: z.string(), lineNo: z.number().int(), user_request: USER_REQUEST },
    annotations: ro,
  }, async (args) => run("explain_cell", args, async () => {
    const rfx = await resolveRfx(user.id, args.rfx);
    const s = await resolveSupplier(rfx.id, args.supplier);
    const cmp = await loadComparison(rfx);
    const key = cellKey(s.code, args.lineNo);
    const history = await q<{ created_at: string; actor: string; summary: string }>(
      `select created_at::text, actor, summary from events where rfx_id = $1 and (detail->>'cell' = $2 or (kind in ('quote_read','second_read') and summary like $3)) order by id desc limit 20`,
      [rfx.id, key, `%${s.code} %`],
    );
    return cellText(cmp, s.code, args.lineNo, history);
  }, { query: `Asked how ${args.supplier} line ${args.lineNo} was calculated.`, rfx: args.rfx ?? "" }));

  server.registerTool("get_supplier", {
    title: "One supplier",
    description: "One supplier: contact, quote reference, totals and stated discount, terms, conditional discounts, questionnaire result by question, open follow-up items and follow-up history.",
    inputSchema: { rfx: RFX, supplier: z.string(), user_request: USER_REQUEST },
    annotations: ro,
  }, async (args) => run("get_supplier", args, async () => {
    const rfx = await resolveRfx(user.id, args.rfx);
    const s = await resolveSupplier(rfx.id, args.supplier);
    return supplierText(await loadComparison(rfx), s.code);
  }, { query: `Viewed supplier ${args.supplier}.`, rfx: args.rfx ?? "" }));

  server.registerTool("list_needs_attention", {
    title: "What needs review",
    description: "Everything excluded from totals or worth checking: prices where two reads disagree, unreadable prices, low-confidence reads, prices taken from previous POs, items with no matching line item, unclear line items and unread documents.",
    inputSchema: { rfx: RFX, user_request: USER_REQUEST },
    annotations: ro,
  }, async (args) => run("list_needs_attention", args, async () => {
    return needsAttentionText(await loadComparison(await resolveRfx(user.id, args.rfx)));
  }, { query: "Asked what needs review.", rfx: args.rfx ?? "" }));

  server.registerTool("compare_award_options", {
    title: "Award options",
    description: "Every award option Bidline can price: lowest price per line across all suppliers, across qualified suppliers only, and all lines to each single supplier (with their stated discount where it applies). Also the like-for-like totals when options cover different lines, and the premium for qualified suppliers.",
    inputSchema: { rfx: RFX, user_request: USER_REQUEST },
    annotations: ro,
  }, async (args) => run("compare_award_options", args, async () => {
    const cmp = await loadComparison(await resolveRfx(user.id, args.rfx));
    const c = cmp.compliance;
    const out = [
      `Award options for ${cmp.rfx.code} (INR, ex-GST, landed):`,
      `- Cheapest per line, all suppliers: ${inr(c.naive.totalInr)} on ${c.naive.linesAwarded}/${cmp.lines.length} lines${c.naive.unfilledLines.length ? `; no comparable price for ${c.naive.unfilledLines.join(", ")}` : ""}.`,
      `- Cheapest per line, qualified suppliers only (${c.qualifiedVendors.join(", ") || "none qualified yet"}): ${inr(c.compliant.totalInr)} on ${c.compliant.linesAwarded}/${cmp.lines.length} lines.`,
      `- Premium for qualified suppliers (qualified total minus all-supplier total): ${inr(c.deltaInr)} (${c.deltaPct.toFixed(1)}%).`,
    ];
    if (c.likeForLike.warning) {
      out.push(`- WARNING: ${c.likeForLike.warning}`);
      for (const s of c.likeForLike.scenarios) out.push(`  ${s.label}: ${inr(s.likeForLikeTotalInr)} on the ${c.likeForLike.linesInCommonBasis} lines quoted by both.`);
    }
    out.push("", "All lines to one supplier:");
    for (const s of cmp.suppliers) {
      const x = cmp.supplierInfo[s.code].single;
      out.push(`- ${s.code} ${s.name}: ${inr(x.totalInr)} on ${x.linesPriced}/${cmp.lines.length} lines${x.complete ? " (complete)" : `, missing ${x.missingLines.length}`}` +
        `${x.totalLevelDiscountPct ? `; stated discount ${x.totalLevelDiscountPct}% ${x.totalLevelDiscountApplied ? `applied: ${inr(x.totalAfterStatedDiscountInr)}` : "not applied because the quote does not cover all lines"}` : ""}.`);
    }
    return out.join("\n");
  }, { query: "Compared award options.", rfx: args.rfx ?? "" }));

  server.registerTool("what_if", {
    title: "What if",
    description: "Price a scenario without saving it: exclude suppliers, use a different exchange rate, include prices taken from previous POs, exclude off-spec or conditional offers, or limit to some lines. Returns the lowest-price-per-line award under those conditions next to the current one.",
    inputSchema: {
      rfx: RFX,
      excludeSuppliers: z.array(z.string()).optional(),
      onlySuppliers: z.array(z.string()).optional(),
      fxRates: z.record(z.string(), z.number()).optional().describe("e.g. {USD: 90}"),
      includeUnconfirmed: z.boolean().optional(),
      excludeCaveats: z.boolean().optional(),
      lines: z.array(z.number().int()).optional(),
      user_request: USER_REQUEST,
    },
    annotations: ro,
  }, async (args) => run("what_if", args, async () => {
    const cmp = await loadComparison(await resolveRfx(user.id, args.rfx));
    const codes = new Set(cmp.suppliers.map((s) => s.code));
    const resolveCodes = async (list?: string[]) => Promise.all((list ?? []).map(async (x) => (await resolveSupplier(cmp.rfx.id, x)).code));
    const only = await resolveCodes(args.onlySuppliers);
    const excl = await resolveCodes(args.excludeSuppliers);
    const pool = [...codes].filter((c) => (!only.length || only.includes(c)) && !excl.includes(c));
    let matrix = cmp.matrix;
    let ctx = cmp.ctx;
    const changes: string[] = [];
    if (args.fxRates && Object.keys(args.fxRates).length) {
      const fx = { ...cmp.rules.fx };
      for (const [k, v] of Object.entries(args.fxRates)) fx[k.toUpperCase()] = { rate: v, source: "what-if rate, not saved" };
      const alt = await loadComparison(cmp.rfx, { rules: { ...cmp.rules, fx } });
      matrix = alt.matrix;
      ctx = alt.ctx;
      changes.push(`exchange rates ${JSON.stringify(args.fxRates)}`);
    }
    if (args.lines?.length) {
      ctx = { ...ctx, lines: ctx.lines.filter((l) => args.lines!.includes(l.no)) };
      changes.push(`lines ${args.lines.join(", ")} only`);
    }
    if (excl.length) changes.push(`without ${excl.join(", ")}`);
    if (only.length) changes.push(`only ${only.join(", ")}`);
    if (args.includeUnconfirmed) changes.push("including prices taken from previous POs");
    if (args.excludeCaveats) changes.push("excluding off-spec or conditional offers");
    const base = cheapestPerLine(cmp.matrix, [...codes], { ctx: { ...cmp.ctx, lines: ctx.lines }, label: "Current, cheapest per line" });
    const alt = cheapestPerLine(matrix, pool, { ctx, includeUnconfirmed: args.includeUnconfirmed, excludeCaveats: args.excludeCaveats, label: `What if: ${changes.join("; ") || "no change"}` });
    const lfl = likeForLike([base, alt]);
    const winners = (s: typeof alt) => {
      const by: Record<string, number> = {};
      for (const p of Object.values(s.picks)) by[p.vendor] = (by[p.vendor] ?? 0) + p.extendedInr;
      return Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${inr(v)}`).join(", ");
    };
    return [
      `${base.label}: ${inr(base.totalInr)} on ${base.linesAwarded} lines (${winners(base)}).`,
      `${alt.label}: ${inr(alt.totalInr)} on ${alt.linesAwarded} lines (${winners(alt)}).`,
      `Difference: ${inr(alt.totalInr - base.totalInr)}.`,
      lfl.warning ? `Warning: ${lfl.warning}` : "",
      "Nothing was saved. Use set_fx_rate or the other tools to make a permanent change.",
    ].filter(Boolean).join("\n");
  }, { query: "Ran a what-if scenario.", rfx: args.rfx ?? "" }));

  // -------------------------------------------------------------------------
  // Changes
  // -------------------------------------------------------------------------

  server.registerTool("correct_price", {
    title: "Edit one price",
    description: "Edit what was read for one supplier and line (price, unit, currency or status), with a reason. The original value is kept and shown next to the edit. Set undo to true to remove an edit.",
    inputSchema: {
      rfx: RFX, supplier: z.string(), lineNo: z.number().int(),
      price: z.number().nullish(), uom: z.string().nullish(), currency: z.string().nullish(),
      status: z.enum(["quoted", "substituted", "downgraded", "uom_mismatch", "not_quoted", "illegible", "omitted", "match_rival", "relative"]).nullish(),
      note: z.string().nullish(),
      reason: z.string().describe("Reason for the edit. Shown on the price and in the award note."),
      undo: z.boolean().optional(),
      user_request: USER_REQUEST,
    },
    annotations: rw,
  }, async (args) => run("correct_price", args, async (ctx) => {
    if (args.undo) {
      const r = await clearCorrectionAction(ctx, { rfx: args.rfx, supplier: args.supplier, lineNo: args.lineNo, reason: args.reason });
      return `Removed the edit on line ${args.lineNo} for ${r.supplier.name}. The original value applies again.`;
    }
    const r = await correctCellAction(ctx, { ...args });
    const b = r.before, a = r.after;
    return `Line ${args.lineNo} for ${r.supplier.code} ${r.supplier.name}: ${b?.unitInr !== null && b?.unitInr !== undefined ? inr(b.unitInr) : statusWords(b?.status ?? "not_read")} -> ${a?.unitInr !== null && a?.unitInr !== undefined ? inr(a.unitInr) : statusWords(a?.status ?? "")} per ${r.line.uom}. Reason recorded. The app and all totals are updated.`;
  }));

  server.registerTool("set_fx_rate", {
    title: "Set an exchange rate",
    description: "Set the exchange rate used to convert a currency to INR, with its source. All prices in that currency are recalculated.",
    inputSchema: { rfx: RFX, currency: z.string(), rate: z.number().positive(), source: z.string().describe("Where the rate comes from, e.g. 'RBI reference rate 18 Sep 2026'."), user_request: USER_REQUEST },
    annotations: rw,
  }, async (args) => run("set_fx_rate", args, async (ctx) => {
    await setFxRateAction(ctx, args);
    return `${args.currency.toUpperCase()} exchange rate set to ${args.rate} (${args.source}). All prices in ${args.currency.toUpperCase()} are recalculated.`;
  }));

  server.registerTool("add_unit_rule", {
    title: "Add a unit conversion",
    description: "Tell Bidline how a supplier's unit of measure relates to the requested unit. Factor 1 means the same unit under another name (e.g. 'nos' = 'each'). Any other factor converts, e.g. one event 'kit' = 2 x 'per DIMM'.",
    inputSchema: {
      rfx: RFX, fromUom: z.string().describe("The supplier's unit, e.g. 'per DIMM'."), toUom: z.string().describe("The unit on the line item, e.g. 'kit'."),
      factor: z.number().positive().describe("How many of fromUom make one toUom."), basis: z.string().describe("Reason, e.g. 'one kit = two 16GB DIMMs per the line spec'."),
      user_request: USER_REQUEST,
    },
    annotations: rw,
  }, async (args) => run("add_unit_rule", args, async (ctx) => {
    if (args.factor === 1) {
      await addUnitAliasAction(ctx, { rfx: args.rfx, askedUom: args.toUom, alias: args.fromUom });
      return `'${args.fromUom}' now counts as the same unit as '${args.toUom}'. Prices updated.`;
    }
    await addUnitRuleAction(ctx, args);
    return `One '${args.toUom}' = ${args.factor} x '${args.fromUom}'. Prices updated.`;
  }));

  server.registerTool("set_prior_po_rates", {
    title: "Record previous PO rates",
    description: "Record rates from the buyer's earlier purchase order, so a supplier's 'same as last time' or '6% over last year' can be priced. Rates are per event SKU, in INR per requested unit.",
    inputSchema: {
      rfx: RFX, poNumber: z.string(), poDate: z.string(), vendor: z.string(),
      rates: z.record(z.string(), z.number()).describe("SKU to INR rate, e.g. {'MON-24': 10100}"),
      user_request: USER_REQUEST,
    },
    annotations: rw,
  }, async (args) => run("set_prior_po_rates", args, async (ctx) => {
    await setPriorPoAction(ctx, args);
    return `Recorded ${Object.keys(args.rates).length} rate${Object.keys(args.rates).length === 1 ? "" : "s"} from ${args.poNumber}. Prices that refer to them are now calculated. The supplier must still confirm them before award.`;
  }));

  server.registerTool("record_assumption", {
    title: "Record an assumption",
    description: "Record an assumption on the event (e.g. how GST or freight is treated), with its source. Shown to the buyer and in the award note.",
    inputSchema: { rfx: RFX, key: z.string(), value: z.string(), source: z.string(), note: z.string().optional(), user_request: USER_REQUEST },
    annotations: rw,
  }, async (args) => run("record_assumption", args, async (ctx) => {
    await noteAssumptionAction(ctx, args);
    return `Recorded '${args.key}'.`;
  }));

  server.registerTool("resolve_unmatched_item", {
    title: "Match or exclude an unmatched item",
    description: "Decide what to do with an item a supplier quoted that matches no line item (ids from list_needs_attention): match it to a line, or exclude it, with a reason.",
    inputSchema: { rfx: RFX, itemId: z.string(), lineNo: z.number().int().optional(), dismiss: z.boolean().optional(), reason: z.string(), user_request: USER_REQUEST },
    annotations: rw,
  }, async (args) => run("resolve_unmatched_item", args, async (ctx) => {
    await resolveUnmappedAction(ctx, args);
    return args.dismiss || !args.lineNo ? "Excluded and recorded." : `Matched to line ${args.lineNo} as an edit, with your reason.`;
  }));

  // -------------------------------------------------------------------------
  // Chasing suppliers
  // -------------------------------------------------------------------------

  server.registerTool("get_chase_list", {
    title: "Open follow-up items",
    description: "For each supplier (or one): every missing item (prices, questionnaire answers, certificates, commercial terms) and every discrepancy (unreadable prices or prices taken from previous POs), with the value at stake, and what Bidline resolved without asking.",
    inputSchema: { rfx: RFX, supplier: z.string().optional(), user_request: USER_REQUEST },
    annotations: ro,
  }, async (args) => run("get_chase_list", args, async () => {
    const rfx = await resolveRfx(user.id, args.rfx);
    const cmp = await loadComparison(rfx);
    const codes = args.supplier ? [(await resolveSupplier(rfx.id, args.supplier)).code] : cmp.suppliers.map((s) => s.code);
    return codes.map((code) => {
      const g = cmp.supplierInfo[code].gaps;
      return [
        `${code} ${g.vendorName}: ${g.gapCount} open item${g.gapCount === 1 ? "" : "s"}, ${g.disputeCount} discrepanc${g.disputeCount === 1 ? "y" : "ies"}, about ${inr(g.totalAtRiskInr)} at stake.${g.lastChase ? ` Last follow-up ${g.lastChase.sentAt.slice(0, 10)}${g.lastChase.answeredAt ? ", answered" : g.lastChase.overdue ? ", overdue" : ", awaiting reply"}.` : ""}`,
        ...g.items.map((i) => `- [${i.family}] ${i.ask}`),
        g.resolvedWithoutAsking.length ? `  Resolved by Bidline: ${g.resolvedWithoutAsking.map((r) => `${r.what} (lines ${r.lineNos.join(", ")})`).join("; ")}` : "",
      ].filter(Boolean).join("\n");
    }).join("\n\n");
  }, { query: "Asked for open follow-up items.", rfx: args.rfx ?? "" }));

  server.registerTool("record_chase", {
    title: "Record a follow-up without emailing it",
    description: "Record a follow-up to one supplier for missing items, with a due date, without sending it. Bidline drafts the message from the open items unless you give your own wording. To email it from the buyer's mailbox, use email_supplier instead.",
    inputSchema: {
      rfx: RFX, supplier: z.string(), dueDate: z.string().optional().describe("YYYY-MM-DD. Default: the buyer's follow-up period."),
      subject: z.string().optional(), message: z.string().optional().describe("Your own wording. Leave out to use Bidline's draft."),
      onlyLines: z.array(z.number().int()).optional(), onlyQuestions: z.array(z.string()).optional(),
      channel: z.string().optional(),
      user_request: USER_REQUEST,
    },
    annotations: rw,
  }, async (args) => run("record_chase", args, async (ctx) => {
    const r = await recordChaseAction(ctx, { ...args, send: false });
    return `Recorded a follow-up to ${r.supplier.code} ${r.supplier.name} for ${r.items.length} item${r.items.length === 1 ? "" : "s"}, reply due ${r.due}. Not emailed.\n\nSubject: ${r.subject}\n\n${r.message}`;
  }));

  server.registerTool("email_supplier", {
    title: "Draft or send a follow-up email to a supplier",
    description: "Write the follow-up email for what a supplier still owes. With send false (the default) Bidline returns the draft only: show it to the user. With send true it is emailed from the buyer's connected mailbox (Settings > Email) and recorded. Only send after the user has seen the draft and asked you to send it. On demo events the email goes to the buyer's own address, because demo suppliers are fictional.",
    inputSchema: {
      rfx: RFX, supplier: z.string(),
      send: z.boolean().optional().describe("Default false: draft only."),
      to: z.string().optional().describe("Recipient. Default: the supplier's email on file."),
      subject: z.string().optional().describe("Your subject line. Leave out to use Bidline's."),
      body: z.string().optional().describe("Your wording. Leave out to use Bidline's draft, which lists exactly what is missing."),
      dueDate: z.string().optional().describe("Reply-by date, YYYY-MM-DD."),
      onlyLines: z.array(z.number().int()).optional(), onlyQuestions: z.array(z.string()).optional(),
      user_request: USER_REQUEST,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, async (args) => run("email_supplier", args, async (ctx) => {
    if (!args.send) {
      const d = await draftFollowUp(ctx, args);
      if (!d.drafted.items.length && !args.body) return `${d.supplier.name} has nothing outstanding on ${d.rfx.code}.`;
      const account = await getEmailAccount(user.id);
      return [
        `DRAFT (not sent) to ${d.supplier.code} ${d.supplier.name}${d.demo ? " (demo event: would be sent to the buyer's own address)" : d.to ? ` at ${d.to}` : " (no email on file: add one, or pass 'to')"}`,
        `From: ${account ? `${account.from_name} <${account.from_email}>` : "no mailbox connected yet: the buyer can connect one in Settings > Email"}`,
        `Subject: ${args.subject ?? d.drafted.subject}`,
        "",
        args.body ?? d.drafted.body,
        "",
        "Ask the user to confirm before calling email_supplier again with send: true.",
      ].join("\n");
    }
    const r = await recordChaseAction(ctx, { ...args, message: args.body, send: true });
    return `Sent to ${r.to} from the buyer's mailbox and recorded on ${r.rfx.code}. Reply due ${r.due}.${r.note}\n\nSubject: ${r.subject}`;
  }));

  server.registerTool("update_follow_up", {
    title: "Mark a follow-up answered or closed",
    description: "Mark a recorded follow-up as answered (or not), or close it with a reason. Follow-up ids come from get_supplier or get_activity.",
    inputSchema: {
      rfx: RFX, followUpId: z.string(), answered: z.boolean().optional(), closedReason: z.string().optional(),
      user_request: USER_REQUEST,
    },
    annotations: rw,
  }, async (args) => run("update_follow_up", args, async (ctx) => {
    await updateChaseAction(ctx, args.rfx ?? "", args.followUpId, { answered: args.answered, closedReason: args.closedReason ?? null });
    return "Follow-up updated.";
  }));

  server.registerTool("update_document", {
    title: "Change a document's supplier, type or status",
    description: "Say which supplier a document came from, what kind it is (quotation, questionnaire, certificate, rfx_pack, other), or mark it read or unread.",
    inputSchema: {
      rfx: RFX, document: z.string().describe("Document id or file name."),
      supplier: z.string().optional(), kind: z.enum(["quotation", "questionnaire", "certificate", "rfx_pack", "other"]).optional(),
      status: z.enum(["unread", "read"]).optional(),
      user_request: USER_REQUEST,
    },
    annotations: rw,
  }, async (args) => run("update_document", args, async (ctx) => {
    const rfx = await resolveRfx(user.id, args.rfx);
    const d = await updateDocumentAction(ctx, rfx.id, args.document, { supplierRef: args.supplier ?? null, kind: args.kind ?? null, status: args.status ?? null });
    return `Updated ${d?.filename ?? args.document}.`;
  }));

  // -------------------------------------------------------------------------
  // Award and approval
  // -------------------------------------------------------------------------

  server.registerTool("create_award", {
    title: "Draft award and request approval",
    description: "Turn an award option into an award note (all figures from Bidline) with your commentary, and get a link the approver uses to approve, reject or request changes. scenario: cheapest_all, cheapest_qualified, or single_supplier (with supplier).",
    inputSchema: {
      rfx: RFX,
      scenario: z.enum(["cheapest_all", "cheapest_qualified", "single_supplier"]),
      supplier: z.string().optional(),
      commentary: z.string().optional().describe("Your recommendation in words. Only use figures from Bidline."),
      user_request: USER_REQUEST,
    },
    annotations: rw,
  }, async (args) => run("create_award", args, async (ctx) => {
    const r = await createAwardAction(ctx, args);
    const s = r.snapshot;
    return [
      `Award drafted: ${s.label}. ${inr(s.totalInr)} ex-GST across ${s.linesAwarded}/${s.linesInRfx} lines.`,
      ...s.bySupplier.map((b) => `- ${b.code} ${b.name}: ${b.lines} lines, ${inr(b.totalInr)}`),
      s.comparison?.warning ? `Warning included in the note: ${s.comparison.warning}` : "",
      `Approval link for the approver (no login needed): ${appUrl}/share/${r.token}`,
      `In the app: ${appUrl}/rfx/${r.rfx.id}?tab=award`,
    ].filter(Boolean).join("\n");
  }));

  server.registerTool("withdraw_award", {
    title: "Withdraw an award",
    description: "Pull back an award that is still awaiting approval, with a reason. Its approval link stops accepting a decision and shows that it was withdrawn. Draft a new award afterwards with create_award.",
    inputSchema: { rfx: RFX, reason: z.string(), awardId: z.string().optional().describe("Default: the latest award awaiting approval."), user_request: USER_REQUEST },
    annotations: { ...rw, destructiveHint: true },
  }, async (args) => run("withdraw_award", args, async (ctx) => {
    const r = await withdrawAwardAction(ctx, args.rfx, args.reason, args.awardId);
    return `Withdrew the award on ${r.rfx.code}. The approval link no longer accepts a decision. Draft a new one with create_award when ready.`;
  }));

  server.registerTool("get_award_status", {
    title: "Award and approval status",
    description: "Awards drafted on a sourcing event and whether the approver has approved, rejected or requested changes.",
    inputSchema: { rfx: RFX, user_request: USER_REQUEST },
    annotations: ro,
  }, async (args) => run("get_award_status", args, async () => {
    const rfx = await resolveRfx(user.id, args.rfx);
    const rows = await q<{ scenario_key: string; status: string; decided_by: string | null; decided_at: string | null; decision_note: string | null; share_token: string; created_at: string; snapshot: { totalInr: number; label: string } }>(
      `select scenario_key, status, decided_by, decided_at::text, decision_note, share_token, created_at::text, snapshot from awards where rfx_id = $1 order by created_at desc`, [rfx.id],
    );
    if (!rows.length) return `No award drafted on ${rfx.code} yet.`;
    return rows.map((a) => `- ${a.created_at.slice(0, 16)} ${a.snapshot.label}, ${inr(a.snapshot.totalInr)}: ${a.status.replace(/_/g, " ")}${a.decided_by ? ` by ${a.decided_by}` : ""}${a.decision_note ? ` ("${a.decision_note}")` : ""}. ${appUrl}/share/${a.share_token}`).join("\n");
  }, { query: "Checked the award status.", rfx: args.rfx ?? "" }));

  // -------------------------------------------------------------------------
  // History
  // -------------------------------------------------------------------------

  server.registerTool("get_export_link", {
    title: "Download link for an export",
    description: "Get a download link, valid for 24 hours and needing no login, for this event's comparison as Excel (with a supplier sheet and an audit-trail sheet) or CSV, or the activity log as Markdown. Give the link to the user.",
    inputSchema: {
      rfx: RFX,
      format: z.enum(["xlsx", "csv", "transcript"]).describe("xlsx = Excel workbook, csv = comparison table, transcript = activity log (.md)"),
      user_request: USER_REQUEST,
    },
    annotations: ro,
  }, async (args) => run("get_export_link", args, async () => {
    const rfx = await resolveRfx(user.id, args.rfx);
    const link = `${appUrl}/api/rfx/${rfx.id}/export/${args.format}?t=${signExport(user.id, rfx.id, args.format)}`;
    const label = args.format === "xlsx" ? "Excel workbook" : args.format === "csv" ? "CSV file" : "activity log";
    return `Download the ${label} for ${rfx.code} (link valid for 24 hours): ${link}`;
  }, { query: `Asked for a ${args.format} export.`, rfx: args.rfx ?? "" }));

  server.registerTool("get_activity", {
    title: "Activity log",
    description: "Recent activity on a sourcing event, newest first: requests made in Claude, actions taken through Bidline's tools, and every edit the buyer made in the app (so you see changes made outside this chat). format 'markdown' returns the full activity log.",
    inputSchema: {
      rfx: RFX, limit: z.number().int().positive().max(500).optional(),
      onlyAppEdits: z.boolean().optional().describe("Only changes made in the app."),
      format: z.enum(["list", "markdown"]).optional(),
      user_request: USER_REQUEST,
    },
    annotations: ro,
  }, async (args) => run("get_activity", args, async () => {
    const rfx = await resolveRfx(user.id, args.rfx);
    let events = await listEvents({ rfxId: rfx.id, limit: args.format === "markdown" ? 2000 : args.limit ?? 40 });
    if (args.onlyAppEdits) events = events.filter((e) => e.actor === "user" || e.actor === "approver");
    if (args.format === "markdown") return transcriptMarkdown({ title: `${rfx.code} ${rfx.title}`, events });
    if (!events.length) return "No activity yet.";
    return events.map((e) => `${String(e.created_at).slice(0, 16).replace("T", " ")} | ${e.actor} | ${e.tool ?? e.kind} | ${e.summary}`).join("\n");
  }));

  // -------------------------------------------------------------------------
  // Across events: search, suppliers, spend, unusual prices, budgets, archive, comments
  // -------------------------------------------------------------------------

  server.registerTool("search_bidline", {
    title: "Search everything",
    description: "Find sourcing events, suppliers, documents and line items by words, a code, a GSTIN or a file name, across every event the user can see. Returns links into the app.",
    inputSchema: { query: z.string(), user_request: USER_REQUEST },
    annotations: ro,
  }, async (args) => run("search_bidline", args, async () => {
    const hits = await searchAll(user.id, args.query);
    if (!hits.length) return `Nothing matches "${args.query}".`;
    return hits.map((h) => `${h.type.toUpperCase()} | ${h.title} | ${h.sub} | ${appUrl}${h.href}`).join("\n");
  }, { query: `Searched for "${args.query}"` }));

  server.registerTool("supplier_scorecard", {
    title: "Supplier scorecard",
    description: "How one supplier (or all, if no name is given) has done across sourcing events: how often asked, reply rate, declines, lines and value won on approved awards, prices that had to be corrected, follow-ups and overdue replies.",
    inputSchema: { supplier: z.string().optional().describe("Name or GSTIN. Leave out for every supplier."), user_request: USER_REQUEST },
    annotations: ro,
  }, async (args) => run("supplier_scorecard", args, async () => {
    const all = await supplierDirectory(user.id);
    const t = args.supplier?.trim().toLowerCase();
    const rows = t ? all.filter((r) => `${r.name} ${r.gstin ?? ""}`.toLowerCase().includes(t)) : all;
    if (!rows.length) return t ? `No supplier matches "${args.supplier}".` : "No suppliers yet.";
    return rows.slice(0, 25).map((r) =>
      `${r.name}${r.gstin ? ` (GSTIN ${r.gstin})` : ""}: asked in ${r.events} event${r.events === 1 ? "" : "s"}, quoted in ${r.responded}, declined ${r.declined}; ` +
      `won ${r.lines_won} line${r.lines_won === 1 ? "" : "s"} worth ${inr(r.won_inr)} on approved awards; ${r.corrections} price correction${r.corrections === 1 ? "" : "s"}; ` +
      `${r.follow_ups} follow-up${r.follow_ups === 1 ? "" : "s"}, ${r.overdue} overdue. Events: ${r.rfx.map((x) => x.code).join(", ")}`).join("\n");
  }, { query: args.supplier ? `Scorecard for ${args.supplier}` : "Supplier scorecards" }));

  server.registerTool("spend_summary", {
    title: "Spend summary",
    description: "Committed spend from approved awards against budget, by category, supplier, event and month, plus budget still planned on open events. Bidline's figures from each award's snapshot; quote them, do not recalculate.",
    inputSchema: { user_request: USER_REQUEST },
    annotations: ro,
  }, async (args) => run("spend_summary", args, async () => {
    const sp = await spend(user.id);
    const awarded = sp.byEvent.reduce((a, e) => a + (e.awarded ?? 0), 0);
    const baseline = sp.byEvent.reduce((a, e) => a + (e.awarded !== null ? e.baseline ?? 0 : 0), 0);
    return [
      `Awarded (approved): ${inr(awarded)}. Budget for those lines: ${baseline ? inr(baseline) : "not set"}. Saved against budget: ${baseline ? inr(baseline - awarded) : "n/a"}.`,
      "", "BY CATEGORY", ...sp.byCategory.map((c) => `- ${c.category}: ${inr(c.awarded)} awarded, budget ${inr(c.baseline)}, ${c.lines} lines`),
      "", "BY SUPPLIER", ...sp.bySupplier.map((x) => `- ${x.supplier}: ${inr(x.awarded)}, ${x.lines} lines, ${x.events} events`),
      "", "BY EVENT", ...sp.byEvent.map((e) => `- ${e.code} ${e.title}: budget ${inr(e.budget)}, ${e.awarded === null ? "no approved award" : `awarded ${inr(e.awarded)}`}`),
      "", "BY MONTH", ...sp.byMonth.map((m) => `- ${m.month}: ${inr(m.awarded)} across ${m.awards} award${m.awards === 1 ? "" : "s"}`),
    ].join("\n");
  }, { query: "Spend summary" }));

  server.registerTool("flag_unusual_prices", {
    title: "Flag unusual prices",
    description: "Prices on an event that are far below or above the other suppliers' middle price for the same line, or far from the budget. Each is a prompt to check the model, unit or reading, not a verdict.",
    inputSchema: { rfx: RFX, user_request: USER_REQUEST },
    annotations: ro,
  }, async (args) => run("flag_unusual_prices", args, async () => {
    const rfx = await resolveRfx(user.id, args.rfx);
    const cmp = await loadComparison(rfx);
    const prices = cmp.suppliers.flatMap((sup) => cmp.lines.map((l) => {
      const c = cmp.matrix[sup.code]?.[l.no];
      return { lineNo: l.no, supplier: sup.code, unitInr: c?.unitInr ?? null, comparable: c?.status === "comparable" || c?.status === "comparable_with_caveat" };
    }));
    const flags = findOutliers(cmp.lines, prices);
    if (!flags.length) return `No unusual prices on ${rfx.code}.`;
    return `${flags.length} unusual price${flags.length === 1 ? "" : "s"} on ${rfx.code}:\n` + flags.map((f) => `- L${f.lineNo} ${f.supplier}: ${inr(f.unitInr)} per unit, unusually ${f.kind}. ${f.note}`).join("\n");
  }, { query: "Checked for unusual prices", rfx: args.rfx ?? undefined }));

  server.registerTool("set_budget", {
    title: "Set line budgets",
    description: "Set or change the budget unit price (INR, ex-GST) on one or more lines. Use null to clear. Budgets drive savings figures and the unusual-price flags. Logged with before and after.",
    inputSchema: {
      rfx: RFX,
      items: z.array(z.object({ lineNo: z.number().int().positive(), budgetInr: z.number().nonnegative().nullable() })).min(1),
      user_request: USER_REQUEST,
    },
    annotations: rw,
  }, async (args) => run("set_budget", args, async (ctx) => {
    const r = await setBudgetAction(ctx, args.rfx, args.items);
    return r.changed ? `Updated the budget on ${r.changed} line${r.changed === 1 ? "" : "s"} of ${r.rfx.code}.` : "Nothing changed: those budgets were already set.";
  }));

  server.registerTool("archive_rfx", {
    title: "Archive or restore an event",
    description: "Archive a finished or abandoned sourcing event so it leaves the lists (its record is kept in full), or restore an archived one. Nothing is deleted.",
    inputSchema: { rfx: RFX, archive: z.boolean().default(true).describe("false to restore"), reason: z.string().optional(), user_request: USER_REQUEST },
    annotations: rw,
  }, async (args) => run("archive_rfx", args, async (ctx) => {
    const r = await archiveRfxAction(ctx, args.rfx, args.archive ?? true, args.reason);
    return args.archive === false ? `${r.code} is restored.` : `${r.code} is archived. Restore it any time.`;
  }));

  server.registerTool("comment_on_price", {
    title: "Comment on a price",
    description: "Add a comment to one supplier's price on one line, e.g. 'Vector confirmed this includes 3 years warranty on the phone'. Shown beside the price in the app and kept in the audit trail. Never changes the price.",
    inputSchema: { rfx: RFX, supplier: z.string(), lineNo: z.number().int().positive(), comment: z.string(), user_request: USER_REQUEST },
    annotations: rw,
  }, async (args) => run("comment_on_price", args, async (ctx) => {
    const r = await addCellCommentAction(ctx, { rfx: args.rfx, supplier: args.supplier, lineNo: args.lineNo, text: args.comment });
    return `Comment added to ${r.supplier.code} line ${args.lineNo} on ${r.rfx.code}.`;
  }));

  return server;
}

/** Every tool Bidline defines, for the Tools page. */
export function toolCatalog(): ToolInfo[] {
  const out: ToolInfo[] = [];
  buildServer({ id: "", email: "", name: "", mcp_token: "", last_mcp_at: null, workspace_id: "", workspace_name: "", role: "admin" }, "", { collect: out });
  return out;
}
