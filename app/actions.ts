"use server";

import { redirect } from "next/navigation";
import { refresh, revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { after } from "next/server";
import {
  checkLogin, clearLoginFailures, createUser, endSession, newMcpToken, normaliseEmail, recordLoginAttempt, requireUser, startSession,
} from "@/lib/auth";
import { one, q } from "@/lib/db";
import { logEvent } from "@/lib/events";
import { BadInput, NotFound, resolveRfx } from "@/lib/rfx";
import * as A from "@/lib/actions";
import * as T from "@/lib/team";
import * as W from "@/lib/workspace";
import { toolCatalog } from "@/lib/mcp/server";
import { LOCKED_TOOLS } from "@/lib/mcp/catalog";
import { NOTIFY_KINDS, saveNotify, type NotifyKind } from "@/lib/notify";
import { setTodo } from "@/lib/todo-state";
import { readPrefs } from "@/lib/prefs";
import { createFromTemplate, deleteTemplate, listTemplates, saveTemplate } from "@/lib/templates";
import * as C from "@/lib/channels";
import { DEMO_TITLE, seedDemoRfx } from "@/lib/demo";
import { seedExtraDemos } from "@/lib/demo-extra";
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
  revalidatePath("/", "layout");
  const next = str(f, "next");
  redirect(/^\/invite\/[A-Za-z0-9_-]{8,64}$/.test(next) ? next : "/");
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
  const user = await createUser({ email, name, password, invite: str(f, "invite") || null });
  await startSession(user.id);
  await logEvent({ userId: user.id, actor: "user", kind: "signup", summary: `Created account ${user.email}.` });
  revalidatePath("/", "layout");
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

/** Remember that this person answered the first-run question, so it is asked once per person. */
const markStarted = (userId: string) =>
  q(`update users set prefs = prefs || '{"started": true}'::jsonb where id = $1`, [userId]);

export async function markStartedUI(): Promise<void> {
  const user = await requireUser();
  await markStarted(user.id);
}

export async function loadDemoAction(): Promise<FormState> {
  const user = await requireUser();
  try {
    await A.requireWorkspacePerm(user.id, "edit");
    // Once per workspace, like the two smaller demos: a teammate who picks the demo just joins it.
    const have = await one(
      "select 1 from rfx where workspace_id = (select workspace_id from users where id = $1) and created_via = 'demo' and title = $2 and archived_at is null limit 1",
      [user.id, DEMO_TITLE]);
    if (!have) await seedDemoRfx(user.id);
    await markStarted(user.id);
    // Two smaller events beside it, added just after the page opens; the dashboard updates itself when they land.
    after(() => seedExtraDemos(user.id).catch((e) => console.error("[demo-extra]", e)));
  } catch (e) {
    if (e instanceof BadInput) return { error: e.message };
    console.error(e);
    return { error: `Could not load the demo event: ${(e as Error).message}` };
  }
  // First run continues on the organisation dashboard, where the connect step follows.
  // The sidebar lives in the layout, so it is refreshed too.
  revalidatePath("/", "layout");
  redirect("/?welcome=demo");
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
    await markStarted(ctx.userId);
  });
  if (res.error) return res;
  revalidatePath("/", "layout");
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
    if (!r.issued && r.missing.length) return { error: `Not sent yet. Still to do: ${r.missing.map((m) => m.fix.replace(/\.$/, "").toLowerCase()).join("; ")}.` };
    if (!r.issued) return { error: `Not sent: ${r.gate.length} line item${r.gate.length === 1 ? " is" : "s are"} not specific enough. Fix them, or give a reason to send anyway.` };
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
  const own = await resolveRfx(user.id, rfxId).catch(() => null);
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
  revalidatePath("/", "layout");
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

// ---------------------------------------------------------------------------
// Team, access, workspace (admins), and the things every member can do
// ---------------------------------------------------------------------------

async function guarded(fn: (userId: string) => Promise<unknown>, message?: string): Promise<FormState> {
  try {
    const user = await requireUser();
    await fn(user.id);
    refresh();
    return { ok: true, message };
  } catch (e) {
    if (e instanceof BadInput || e instanceof NotFound) return { error: e.message };
    console.error(e);
    return { error: `Something went wrong: ${(e as Error).message}` };
  }
}

export async function switchWorkspaceAction(f: FormData) {
  const user = await requireUser();
  await T.switchWorkspace(user.id, str(f, "workspace"));
  revalidatePath("/", "layout");
  redirect("/");
}

export async function inviteMemberUI(_: FormState, f: FormData): Promise<FormState> {
  let inv = { id: "", existing: false };
  const email = str(f, "email");
  const res = await guarded(async (uid) => { inv = await T.inviteMember(uid, email, str(f, "role")); });
  if (res.error) return res;
  const link = await inviteLink(inv.id, email, inv.existing);
  return { ok: true, message: `Invite saved. Send ${email} this link: ${link}` };
}

async function inviteLink(id: string, email: string, existing: boolean) {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return existing ? `${proto}://${host}/invite/${id}` : `${proto}://${host}/signup?invite=${id}&email=${encodeURIComponent(email)}`;
}

export async function changeRoleUI(memberId: string, _: FormState, f: FormData): Promise<FormState> {
  return guarded((uid) => T.changeRole(uid, memberId, str(f, "role")), "Role changed.");
}

export async function removeMemberUI(memberId: string): Promise<FormState> {
  return guarded((uid) => T.removeMember(uid, memberId), "Removed from the workspace.");
}

export async function cancelInviteUI(inviteId: string): Promise<FormState> {
  return guarded((uid) => T.cancelInvite(uid, inviteId), "Invite cancelled.");
}

export async function renameWorkspaceUI(_: FormState, f: FormData): Promise<FormState> {
  return guarded((uid) => T.renameWorkspace(uid, str(f, "name")), "Workspace renamed.");
}

export async function setEventAccessUI(rfxId: string, _: FormState, f: FormData): Promise<FormState> {
  const restricted = str(f, "restricted") === "yes";
  const people = f.getAll("people").map(String);
  return guarded((uid) => T.setEventAccess(uid, rfxId, restricted, people), restricted ? "Access limited to the people chosen." : "Everyone in the workspace can see this event.");
}

export async function setToolUI(tool: string, enabled: boolean): Promise<FormState> {
  return guarded(async (uid) => {
    const catalog = toolCatalog().map((t) => t.name);
    await T.setToolEnabled(uid, tool, enabled, catalog, LOCKED_TOOLS);
  }, enabled ? "Tool switched on." : "Tool switched off for everyone in this workspace.");
}

export async function saveWorkspaceSettingsUI(_: FormState, f: FormData): Promise<FormState> {
  return guarded((uid) => W.saveSettings(uid, {
    reminders: { enabled: str(f, "remindersEnabled") === "on", everyDays: Number(str(f, "remindersEveryDays")) || 3 },
    approvalSteps: [0, 1, 2].map((i) => ({
      aboveInr: numOrNull(f, `step${i}Above`), name: str(f, `step${i}Name`), email: str(f, `step${i}Email`),
    })).filter((x) => x.name && x.aboveInr !== null) as Array<{ aboveInr: number; name: string; email: string }>,
    maxSupplierSharePct: numOrNull(f, "maxSupplierSharePct"),
    approvalExpiryDays: numOrNull(f, "approvalExpiryDays") ?? 0,
  }), "Settings saved.");
}

export async function archiveRfxUI(rfxId: string, archive: boolean, _: FormState, f: FormData): Promise<FormState> {
  const res = await act((ctx) => A.archiveRfxAction(ctx, rfxId, archive, str(f, "reason")), archive ? "Archived. Find it under Sourcing events, Archived." : "Restored.");
  if (res.error || !archive) return res;
  revalidatePath("/", "layout");
  redirect("/events");
}

export async function decideAwardInAppUI(rfxId: string, awardId: string, _: FormState, f: FormData): Promise<FormState> {
  const decision = str(f, "decision") as "approved" | "rejected" | "changes_requested";
  if (!["approved", "rejected", "changes_requested"].includes(decision)) return { error: "Choose a decision." };
  if (decision !== "approved" && !str(f, "note")) return { error: "Say why, so the buyer knows what to change." };
  return act((ctx) => A.decideAwardInAppAction(ctx, rfxId, awardId, decision, str(f, "note") || null), "Decision recorded.");
}

export async function addCellCommentUI(rfxId: string, supplier: string, lineNo: number, _: FormState, f: FormData): Promise<FormState> {
  return act((ctx) => A.addCellCommentAction(ctx, { rfx: rfxId, supplier, lineNo, text: str(f, "text") }), "Comment added.");
}

/** The conversation on one price, oldest first. Empty when the person cannot see the event. */
export async function cellComments(rfxId: string, supplier: string, lineNo: number) {
  const user = await requireUser();
  const rfx = await resolveRfx(user.id, rfxId).catch(() => null);
  if (!rfx) return [];
  return q<{ id: string; text: string; created_at: string; actor: string; name: string | null }>(
    `select c.id, c.text, c.created_at, c.actor, u.name from cell_comments c join suppliers s on s.id = c.supplier_id
       left join users u on u.id = c.user_id
      where c.rfx_id = $1 and s.code = $2 and c.line_no = $3 order by c.created_at`,
    [rfx.id, supplier, lineNo],
  );
}

export async function saveNotifyUI(_: FormState, f: FormData): Promise<FormState> {
  return guarded(async (uid) => {
    const prefs = Object.fromEntries(NOTIFY_KINDS.map((k) => [k.key, f.get(k.key) === "on"])) as Record<NotifyKind, boolean>;
    await saveNotify(uid, prefs);
  }, "Notification choices saved.");
}

export async function starRfxUI(rfxId: string, on: boolean): Promise<FormState> {
  return guarded(async (uid) => {
    const rfx = await resolveRfx(uid, rfxId);
    if (on) await q("insert into rfx_stars (user_id, rfx_id) values ($1,$2) on conflict do nothing", [uid, rfx.id]);
    else await q("delete from rfx_stars where user_id = $1 and rfx_id = $2", [uid, rfx.id]);
  });
}

export async function setTodoUI(input: { key: string; rfxId: string; text: string; assignTo?: string | null; snoozeDays?: number | null }): Promise<FormState> {
  return guarded((uid) => setTodo(uid, input), input.assignTo !== undefined ? "Assigned." : input.snoozeDays ? "Snoozed." : "Back on the list.");
}

export async function readOnlyLinkUI(create: boolean): Promise<FormState> {
  return guarded(async (uid) => {
    await q("update users set mcp_token_ro = $2 where id = $1", [uid, create ? newMcpToken() : null]);
    await logEvent({ userId: uid, actor: "user", kind: "token_regenerated", summary: create ? "Created a read-only Claude connector link." : "Turned off the read-only Claude connector link.", detail: {} });
  }, create ? "Read-only link created." : "Read-only link turned off.");
}

export async function addChannelUI(_: FormState, f: FormData): Promise<FormState> {
  return guarded((uid) => C.addChannel(uid, { kind: str(f, "kind"), name: str(f, "name"), url: str(f, "url"), events: f.getAll("events").map(String) }), "Channel added. Send a test to check it.");
}

export async function removeChannelUI(id: string): Promise<FormState> {
  return guarded((uid) => C.removeChannel(uid, id), "Channel removed.");
}

export async function testChannelUI(id: string): Promise<FormState> {
  return guarded((uid) => C.testChannel(uid, id), "Test message sent.");
}

/** Teammates who can see an event, for @mentions. */
export async function mentionablePeople(rfxId: string) {
  const user = await requireUser();
  const rfx = await resolveRfx(user.id, rfxId).catch(() => null);
  if (!rfx) return [];
  return q<{ id: string; name: string }>(
    `select u.id, u.name from workspace_members m join users u on u.id = m.user_id
      where m.workspace_id = $1 and m.user_id <> $2
        and (not $3 or m.role = 'admin' or u.id = $4 or exists (select 1 from rfx_access a where a.rfx_id = $5 and a.user_id = u.id))
      order by u.name`, [rfx.workspace_id, user.id, rfx.restricted, rfx.user_id, rfx.id]);
}

export async function saveTemplateUI(rfxId: string, _: FormState, f: FormData): Promise<FormState> {
  let name = "";
  const res = await act(async (ctx) => { name = (await saveTemplate(ctx, rfxId, str(f, "name") || null)).name; });
  return res.error ? res : { ok: true, message: `Saved as the template "${name}". Start from it under New sourcing event.` };
}

export async function listTemplatesUI() {
  const user = await requireUser();
  return listTemplates(user.id);
}

export async function createFromTemplateUI(_: FormState, f: FormData): Promise<FormState> {
  let id = "";
  const res = await act(async (ctx) => {
    id = (await createFromTemplate(ctx, str(f, "template"), { title: str(f, "title") || null, dueDate: str(f, "dueDate") || null })).rfx.id;
    await markStarted(ctx.userId);
  });
  if (res.error) return res;
  revalidatePath("/", "layout");
  redirect(`/rfx/${id}?tab=lines`);
}

export async function deleteTemplateUI(id: string): Promise<FormState> {
  return guarded((uid) => deleteTemplate(uid, id), "Template deleted.");
}

export async function savePrefsUI(_: FormState, f: FormData): Promise<FormState> {
  return guarded(async (uid) => {
    const prefs = readPrefs({ numberFormat: str(f, "numberFormat"), dateFormat: str(f, "dateFormat"), timeZone: str(f, "timeZone") });
    await q("update users set prefs = prefs || $2::jsonb where id = $1", [uid, JSON.stringify(prefs)]);
  }, "Preferences saved.");
}
