"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { headers } from "next/headers";
import {
  checkLogin, clearLoginFailures, createUser, endSession, newMcpToken, normaliseEmail, recordLoginAttempt, requireUser, startSession,
} from "@/lib/auth";
import { one, q } from "@/lib/db";
import { logEvent } from "@/lib/events";
import { BadInput, NotFound } from "@/lib/rfx";
import * as A from "@/lib/actions";
import { seedDemoRfx } from "@/lib/demo";
import { disconnectEmail, getEmailAccount, saveEmailAccount, sendMail } from "@/lib/mail";

export interface FormState { ok?: boolean; error?: string; message?: string; data?: Record<string, unknown> }

const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v.trim() : "";
};
const numOrNull = (f: FormData, k: string) => {
  const v = str(f, k).replace(/[,₹\s]/g, "");
  return v === "" ? null : Number(v);
};

async function userCtx(): Promise<A.ActionCtx> {
  const user = await requireUser();
  return { userId: user.id, actor: "user" };
}

/** Run a UI mutation: same actions as the MCP tools, logged as the buyer. */
async function act(fn: (ctx: A.ActionCtx) => Promise<unknown>, message?: string): Promise<FormState> {
  try {
    const ctx = await userCtx();
    await fn(ctx);
    refresh();
    return { ok: true, message };
  } catch (e) {
    if (e instanceof BadInput || e instanceof NotFound) return { error: e.message };
    if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
    console.error(e);
    return { error: `Something went wrong: ${(e as Error).message}` };
  }
}

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

export async function loginAction(_: FormState, f: FormData): Promise<FormState> {
  const email = str(f, "email");
  const password = String(f.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };
  // Vercel sets x-vercel-forwarded-for itself; elsewhere there may be no
  // trustworthy address, and then only the per-email limit applies.
  const h = await headers();
  const ip = h.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || null;
  if (await recordLoginAttempt(email, ip)) return { error: "Too many sign-in attempts. Wait 15 minutes and try again." };
  const user = await checkLogin(email, password);
  if (!user) return { error: "Incorrect email or password." };
  await clearLoginFailures(email);
  await startSession(user.id);
  await logEvent({ userId: user.id, actor: "user", kind: "login", summary: `Signed in as ${user.email}.` });
  redirect("/");
}

export async function signupAction(_: FormState, f: FormData): Promise<FormState> {
  const email = str(f, "email");
  const name = str(f, "name");
  const password = String(f.get("password") ?? "");
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter a valid email address." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  if (await one("select 1 from users where email = $1", [normaliseEmail(email)])) {
    return { error: "An account with that email already exists. Sign in instead." };
  }
  const user = await createUser({ email, name, password });
  await startSession(user.id);
  await logEvent({ userId: user.id, actor: "user", kind: "signup", summary: `Created account ${user.email}.` });
  redirect("/");
}

export async function logoutAction() {
  await endSession();
  redirect("/login");
}

export async function regenerateTokenAction(): Promise<FormState> {
  const user = await requireUser();
  await q("update users set mcp_token = $2, last_mcp_at = null where id = $1", [user.id, newMcpToken()]);
  await logEvent({ userId: user.id, actor: "user", kind: "token_regenerated", summary: "Replaced the Claude connector link. The old link no longer works." });
  refresh();
  return { ok: true, message: "New connector link created. Update it in Claude." };
}

export async function loadDemoAction(): Promise<FormState> {
  const user = await requireUser();
  let rfxId: string;
  try {
    rfxId = await seedDemoRfx(user.id);
  } catch (e) {
    console.error(e);
    return { error: `Could not load the demo event: ${(e as Error).message}` };
  }
  redirect(`/rfx/${rfxId}?tab=overview`);
}


// ---------------------------------------------------------------------------
// Enquiry edits made by a person in the app
// ---------------------------------------------------------------------------

export async function createRfxUI(_: FormState, f: FormData): Promise<FormState> {
  const title = str(f, "title");
  if (!title) return { error: "Enter a title for the event." };
  let id = "";
  const res = await act(async (ctx) => {
    const me = await one<{ default_approver_name: string | null; default_approver_email: string | null }>(
      "select default_approver_name, default_approver_email from users where id = $1", [ctx.userId]);
    const r = await A.createRfxAction(ctx, {
      title, eventType: str(f, "eventType") || "RFQ", dueDate: str(f, "dueDate") || null, lines: [],
      approver: { name: str(f, "approver") || me?.default_approver_name || null, email: me?.default_approver_email ?? null },
    });
    id = r.rfx.id;
  });
  if (res.error) return res;
  redirect(`/rfx/${id}?tab=lines`);
}

export async function updateRfxUI(rfxId: string, _: FormState, f: FormData) {
  return act((ctx) => A.updateRfxAction(ctx, rfxId, {
    title: str(f, "title") || undefined,
    eventType: str(f, "eventType") || undefined,
    dueDate: f.has("dueDate") ? str(f, "dueDate") || null : undefined,
    status: str(f, "status") || undefined,
    approver: f.has("approverName") ? { name: str(f, "approverName") || null, email: str(f, "approverEmail") || null } : undefined,
  }), "Saved.");
}

export async function saveLineUI(rfxId: string, _: FormState, f: FormData) {
  const no = numOrNull(f, "no");
  return act((ctx) => A.upsertLinesAction(ctx, rfxId, [{
    no: no ?? undefined,
    sku: str(f, "sku") || undefined,
    group: str(f, "group") || undefined,
    description: str(f, "description"),
    uom: str(f, "uom"),
    packSize: numOrNull(f, "packSize") ?? undefined,
    qty: Number(numOrNull(f, "qty") ?? 0),
    baselineInr: numOrNull(f, "baselineInr"),
  }]), no ? `Line ${no} saved.` : "Line added.");
}

export async function removeLineUI(rfxId: string, no: number) {
  return act((ctx) => A.removeLinesAction(ctx, rfxId, [no], "removed in the app"));
}

export async function issueRfxUI(rfxId: string, _: FormState, f: FormData): Promise<FormState> {
  try {
    const ctx = await userCtx();
    const r = await A.issueRfxAction(ctx, rfxId, str(f, "overrideReason") || null);
    refresh();
    if (!r.issued) return { error: `Not issued: ${r.gate.length} line item${r.gate.length === 1 ? " is" : "s are"} not specific enough. Fix them, or give a reason to issue anyway.` };
    return { ok: true, message: "Issued. Suppliers are marked as invited." };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function addSupplierUI(rfxId: string, _: FormState, f: FormData) {
  return act((ctx) => A.addSuppliersAction(ctx, rfxId, [{
    name: str(f, "name"), city: str(f, "city") || null, contactName: str(f, "contactName") || null,
    email: str(f, "email") || null, phone: str(f, "phone") || null, channel: str(f, "channel") || null,
  }]), "Supplier added.");
}

export async function updateSupplierUI(rfxId: string, supplierId: string, _: FormState, f: FormData) {
  return act((ctx) => A.updateSupplierAction(ctx, rfxId, supplierId, {
    name: str(f, "name") || undefined, city: str(f, "city") || undefined,
    contactName: f.has("contactName") ? str(f, "contactName") : undefined,
    email: f.has("email") ? str(f, "email") : undefined,
    phone: f.has("phone") ? str(f, "phone") : undefined,
    status: str(f, "status") || undefined,
  }), "Supplier saved.");
}

export async function updateDocumentUI(rfxId: string, documentId: string, _: FormState, f: FormData) {
  return act((ctx) => A.updateDocumentAction(ctx, rfxId, documentId, {
    supplierRef: str(f, "supplier") || null, kind: str(f, "kind") || null, status: str(f, "status") || null,
  }), "Document saved.");
}

export async function correctCellUI(rfxId: string, supplier: string, lineNo: number, _: FormState, f: FormData) {
  const reason = str(f, "reason");
  if (!reason) return { error: "Enter a reason. It is shown on the price and in the award note." };
  return act((ctx) => A.correctCellAction(ctx, {
    rfx: rfxId, supplier, lineNo, reason,
    price: f.has("price") ? numOrNull(f, "price") : undefined,
    uom: str(f, "uom") || null, currency: str(f, "currency") || null, status: str(f, "status") || null,
    note: str(f, "note") || null,
  }), "Saved. Totals updated.");
}

export async function undoCorrectionUI(rfxId: string, supplier: string, lineNo: number) {
  return act((ctx) => A.clearCorrectionAction(ctx, { rfx: rfxId, supplier, lineNo, reason: "undone in the app" }), "Edit removed.");
}

export async function setFxUI(rfxId: string, _: FormState, f: FormData) {
  return act((ctx) => A.setFxRateAction(ctx, {
    rfx: rfxId, currency: str(f, "currency"), rate: Number(numOrNull(f, "rate") ?? 0), source: str(f, "source") || "set by the buyer",
  }), "Exchange rate saved. Prices updated.");
}

export async function addUnitRuleUI(rfxId: string, _: FormState, f: FormData) {
  const factor = Number(numOrNull(f, "factor") ?? 0);
  return act((ctx) => factor === 1
    ? A.addUnitAliasAction(ctx, { rfx: rfxId, askedUom: str(f, "toUom"), alias: str(f, "fromUom") })
    : A.addUnitRuleAction(ctx, { rfx: rfxId, fromUom: str(f, "fromUom"), toUom: str(f, "toUom"), factor, basis: str(f, "basis") || "set by the buyer" }),
  "Conversion saved. Prices updated.");
}

export async function resolveUnmappedUI(rfxId: string, itemId: string, _: FormState, f: FormData) {
  const lineNo = numOrNull(f, "lineNo");
  return act((ctx) => A.resolveUnmappedAction(ctx, {
    rfx: rfxId, itemId, lineNo, dismiss: !lineNo, reason: str(f, "reason") || (lineNo ? "matched by the buyer" : "not part of this event"),
  }), "Saved.");
}

export async function recordChaseUI(rfxId: string, supplier: string, _: FormState, f: FormData) {
  const send = str(f, "intent") === "send";
  return act((ctx) => A.recordChaseAction(ctx, {
    rfx: rfxId, supplier, dueDate: str(f, "dueDate") || null, subject: str(f, "subject") || null,
    message: str(f, "message") || null, send, to: str(f, "to") || null,
  }), send ? "Follow-up emailed and recorded." : "Follow-up recorded. Copy the message to send it.");
}

export async function markChaseUI(rfxId: string, chaseId: string, answered: boolean) {
  return act((ctx) => A.updateChaseAction(ctx, rfxId, chaseId, { answered }));
}

export async function createAwardUI(rfxId: string, _: FormState, f: FormData) {
  const scenario = str(f, "scenario") as "cheapest_all" | "cheapest_qualified" | "single_supplier";
  return act((ctx) => A.createAwardAction(ctx, {
    rfx: rfxId, scenario, supplier: str(f, "supplier") || null, commentary: str(f, "commentary") || null,
  }), "Award drafted. Share the approval link.");
}

export async function decideAwardUI(token: string, _: FormState, f: FormData): Promise<FormState> {
  const decision = str(f, "decision") as "approved" | "rejected" | "changes_requested";
  if (!["approved", "rejected", "changes_requested"].includes(decision)) return { error: "Choose a decision." };
  try {
    await A.decideAwardAction({ token, decision, name: str(f, "name"), note: str(f, "note") || null });
    refresh();
    return { ok: true, message: "Decision recorded. The buyer can now see it." };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function cellHistory(rfxId: string, key: string) {
  const user = await requireUser();
  const own = await one("select 1 from rfx where id = $1 and user_id = $2", [rfxId, user.id]);
  if (!own) return [];
  const code = key.split(":")[0];
  return q<{ id: string; created_at: string; actor: string; summary: string; user_request: string | null }>(
    `select id::text, created_at, actor, summary, user_request from events
      where rfx_id = $1 and (detail->>'cell' = $2 or (kind in ('quote_read','second_read') and summary like $3))
      order by id desc limit 20`,
    [rfxId, key, `%${code} %`],
  );
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function saveProfileUI(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  const name = str(f, "name");
  if (!name) return { error: "Enter your name." };
  await q("update users set name = $2, company = $3, job_title = $4 where id = $1", [user.id, name, str(f, "company") || null, str(f, "jobTitle") || null]);
  refresh();
  return { ok: true, message: "Profile saved." };
}

export async function saveDefaultsUI(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  const days = Math.round(Number(str(f, "followupDays") || 3));
  if (!(days >= 1 && days <= 30)) return { error: "Follow-up period must be between 1 and 30 days." };
  const approverEmail = str(f, "approverEmail");
  if (approverEmail && !/^\S+@\S+\.\S+$/.test(approverEmail)) return { error: "Enter a valid approver email, or leave it empty." };
  await q("update users set followup_days = $2, default_approver_name = $3, default_approver_email = $4 where id = $1",
    [user.id, days, str(f, "approverName") || null, approverEmail || null]);
  refresh();
  return { ok: true, message: "Defaults saved." };
}

export async function saveEmailUI(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  try {
    await saveEmailAccount(user.id, {
      provider: str(f, "provider") || "custom",
      fromName: str(f, "fromName"), fromEmail: str(f, "fromEmail"), replyTo: str(f, "replyTo") || null,
      host: str(f, "host"), port: Number(str(f, "port")), secure: str(f, "security") === "ssl",
      user: str(f, "user"), password: String(f.get("password") ?? "") || null,
      signature: String(f.get("signature") ?? "") || null, bccSelf: f.get("bccSelf") === "on",
    });
    await logEvent({ userId: user.id, actor: "user", kind: "email_connected", summary: `Connected ${str(f, "fromEmail")} for supplier follow-ups.` });
    refresh();
    return { ok: true, message: "Connected. The mail server accepted your details." };
  } catch (e) {
    if (e instanceof BadInput) return { error: e.message };
    return { error: `Could not save: ${(e as Error).message}` };
  }
}

export async function sendTestEmailUI(): Promise<FormState> {
  const user = await requireUser();
  const account = await getEmailAccount(user.id);
  if (!account) return { error: "Connect your email first." };
  try {
    await sendMail(user.id, {
      to: account.from_email,
      subject: "Bidline test email",
      text: "This is a test from Bidline. Supplier follow-ups will be sent from this mailbox, and replies will come back to you.",
    });
    return { ok: true, message: `Test email sent to ${account.from_email}.` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function disconnectEmailUI(): Promise<FormState> {
  const user = await requireUser();
  await disconnectEmail(user.id);
  await logEvent({ userId: user.id, actor: "user", kind: "email_disconnected", summary: "Disconnected the email used for supplier follow-ups." });
  refresh();
  return { ok: true, message: "Email disconnected. Bidline no longer has your app password." };
}

/** Instant answers for the Ask box: worked out in code, no AI. */
export async function askBidline(rfxId: string, question: string) {
  const user = await requireUser();
  const { resolveRfx } = await import("@/lib/rfx");
  const { loadComparison } = await import("@/lib/comparison");
  const { answer } = await import("@/lib/insights");
  const rfx = await resolveRfx(user.id, rfxId);
  const result = answer(await loadComparison(rfx), question);
  await logEvent({ userId: user.id, rfxId: rfx.id, actor: "user", kind: "query", userRequest: question, summary: result ? `Asked in the app: ${result.title}.` : "Asked in the app; passed to Claude." });
  return result;
}

// ---------------------------------------------------------------------------
// Repeat purchases, questionnaire clean-up, withdrawn awards, line notes
// ---------------------------------------------------------------------------

export async function duplicateRfxUI(rfxId: string, _: FormState, f: FormData): Promise<FormState> {
  let id = "";
  const res = await act(async (ctx) => {
    const r = await A.duplicateRfxAction(ctx, rfxId, { title: str(f, "title") || null });
    id = r.rfx.id;
  });
  if (res.error) return res;
  redirect(`/rfx/${id}?tab=lines`);
}

export async function removeQuestionUI(rfxId: string, no: string, _: FormState, f: FormData): Promise<FormState> {
  return act((ctx) => A.removeQuestionsAction(ctx, rfxId, [no], str(f, "reason")), `Question ${no} removed.`);
}

export async function withdrawAwardUI(rfxId: string, awardId: string, _: FormState, f: FormData): Promise<FormState> {
  return act((ctx) => A.withdrawAwardAction(ctx, rfxId, str(f, "reason"), awardId), "Award withdrawn. The approval link no longer accepts a decision.");
}

export async function addLineNoteUI(rfxId: string, _: FormState, f: FormData): Promise<FormState> {
  const lineNo = Number(str(f, "lineNo"));
  if (!lineNo) return { error: "Choose a line." };
  return act((ctx) => A.addLineNoteAction(ctx, rfxId, lineNo, str(f, "text")), "Note added.");
}
