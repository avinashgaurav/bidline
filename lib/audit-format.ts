/**
 * How an audit entry reads to a person: the action in plain words and the item
 * it affected. Pure, so the audit panel, the audit page and exports agree.
 */

export const KIND_LABEL: Record<string, string> = {
  rfx_created: "Created event",
  rfx_updated: "Changed event details",
  rfx_issued: "Sent to suppliers",
  rfx_duplicated: "Duplicated event",
  rfx_copied: "Created from a copy",
  demo_loaded: "Loaded demo",
  rfx_archived: "Archived event",
  rfx_restored: "Restored event",
  cell_commented: "Commented on a price",
  reminder_sent: "Sent an automatic reminder",
  award_step_decided: "Decided an approval step",
  award_expired: "Approval request expired",
  todo_assigned: "Assigned a to-do",
  todo_snoozed: "Snoozed a to-do",
  rfx_starred: "Starred an event",
  settings_changed: "Changed workspace settings",
  audit_exported: "Exported the audit log",
  lines_changed: "Changed line items",
  lines_removed: "Removed line items",
  line_note_added: "Added a note",
  questions_changed: "Changed questions",
  questions_removed: "Removed questions",
  supplier_added: "Added supplier",
  suppliers_added: "Added suppliers",
  supplier_updated: "Changed supplier",
  document_uploaded: "Uploaded document",
  document_saved: "Saved document from chat",
  document_updated: "Changed document",
  quote_read: "Read a quote",
  second_read: "Checked a price twice",
  questionnaire_read: "Read questionnaire answers",
  cell_corrected: "Corrected a price",
  correction_undone: "Undid a correction",
  correction_superseded: "Replaced a correction",
  assumption_changed: "Changed a rate or unit rule",
  unmapped_resolved: "Placed an unmatched item",
  chase_recorded: "Recorded a follow-up",
  chase_sent: "Emailed a follow-up",
  chase_updated: "Updated a follow-up",
  award_drafted: "Drafted the award",
  award_decided: "Decided the award",
  award_withdrawn: "Withdrew the award",
  query: "Looked something up",
  login: "Signed in",
  signup: "Created account",
  token_regenerated: "Replaced the Claude link",
  email_connected: "Connected email",
  email_disconnected: "Disconnected email",
  member_invited: "Invited a person",
  member_added: "Added a person",
  member_role_changed: "Changed a role",
  member_removed: "Removed a person",
  invite_cancelled: "Cancelled an invite",
  access_changed: "Changed who can see an event",
  tools_changed: "Changed Claude tools",
  workspace_renamed: "Renamed the workspace",
};

export const kindLabel = (k: string) => KIND_LABEL[k] ?? k.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** Groups for the audit filters. */
export const KIND_GROUPS: Array<{ key: string; label: string; kinds: string[] }> = [
  { key: "event", label: "Event set-up", kinds: ["rfx_created", "rfx_updated", "rfx_issued", "rfx_duplicated", "rfx_copied", "demo_loaded", "rfx_archived", "rfx_restored", "todo_assigned", "todo_snoozed", "lines_changed", "lines_removed", "line_note_added", "questions_changed", "questions_removed"] },
  { key: "supplier", label: "Suppliers", kinds: ["supplier_added", "suppliers_added", "supplier_updated"] },
  { key: "document", label: "Documents", kinds: ["document_uploaded", "document_saved", "document_updated"] },
  { key: "quote", label: "Quotes and prices", kinds: ["quote_read", "second_read", "questionnaire_read", "cell_corrected", "correction_undone", "correction_superseded", "assumption_changed", "unmapped_resolved", "cell_commented"] },
  { key: "followup", label: "Follow-ups", kinds: ["chase_recorded", "chase_sent", "chase_updated", "reminder_sent"] },
  { key: "award", label: "Award and approval", kinds: ["award_drafted", "award_decided", "award_withdrawn", "award_step_decided", "award_expired"] },
  { key: "access", label: "Team and access", kinds: ["member_invited", "member_added", "member_role_changed", "member_removed", "invite_cancelled", "access_changed", "tools_changed", "workspace_renamed", "settings_changed", "audit_exported", "login", "signup", "token_regenerated", "email_connected", "email_disconnected"] },
  { key: "lookup", label: "Look-ups", kinds: ["query"] },
];

const ENTITY_TYPE: Record<string, string> = {
  event: "Sourcing event", supplier: "Supplier", document: "Document", quote: "Quote", followup: "Follow-up",
  award: "Award", access: "Workspace", lookup: "Look-up",
};

/** The item an entry affected, e.g. "Line 4", "Supplier V2", "quote_v3.pdf". */
export function entityOf(kind: string, detail: Record<string, unknown> | null | undefined, rfxCode?: string | null): { type: string; name: string } {
  const d = detail ?? {};
  const group = KIND_GROUPS.find((g) => g.kinds.includes(kind))?.key ?? "event";
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = d[k];
      if (v !== undefined && v !== null && v !== "") return Array.isArray(v) ? v.join(", ") : typeof v === "object" ? null : String(v);
    }
    return null;
  };
  const cell = typeof d.cell === "string" ? d.cell.split(":") : null;
  if (cell && cell.length === 2) return { type: "Price", name: `${cell[0]}, line ${cell[1]}` };
  if (kind.startsWith("line") || kind === "line_note_added") {
    const n = pick("lineNo", "lines", "nos");
    if (n) return { type: "Line item", name: `Line ${n}` };
  }
  if (kind.startsWith("question")) {
    const n = pick("nos", "questions");
    if (n) return { type: "Question", name: n };
  }
  if (group === "document") {
    const n = pick("filename", "document");
    if (n) return { type: "Document", name: n };
  }
  if (group === "supplier" || group === "followup" || kind === "quote_read" || kind === "questionnaire_read") {
    const n = pick("supplier", "supplierCode", "code");
    if (n) return { type: "Supplier", name: n };
  }
  if (kind.startsWith("member") || kind === "invite_cancelled") {
    const n = pick("email", "member");
    if (n) return { type: "Person", name: n };
  }
  if (group === "access" && !rfxCode) return { type: "Workspace", name: "Workspace" };
  return { type: ENTITY_TYPE[group] ?? "Sourcing event", name: rfxCode ?? "Workspace" };
}

/** Who did it, in words. */
export function actorOf(actor: string, personName: string | null | undefined, detail?: Record<string, unknown> | null): { name: string; via: string } {
  const person = personName ?? "Someone";
  if (actor === "claude") return { name: "Claude", via: `for ${person}, over MCP` };
  if (actor === "user") return { name: person, via: "in the app" };
  if (actor === "approver") return { name: String(detail?.name ?? "Approver"), via: "on the approval link" };
  return { name: "Bidline", via: "automatic" };
}

/** Detail fields worth showing a reviewer, in plain words. Ids and internals stay out. */
export const DETAIL_LABEL: Record<string, string> = {
  reason: "Reason", before: "Before", after: "After", decision: "Decision", to: "Sent to", items: "Items",
  lines: "Lines", issues: "Checks raised", role: "Role", from: "From", email: "Email", changes: "Changes",
  enabled: "Switched on", disabled: "Switched off", note: "Note", people: "People",
};

export function fmtValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "none";
  if (Array.isArray(v)) return v.length ? v.map((x) => (x && typeof x === "object" ? fmtValue(x) : String(x))).join(" | ") : "none";
  if (typeof v === "object") {
    return Object.entries(v as Record<string, unknown>)
      .filter(([, x]) => x !== null && x !== undefined && x !== "")
      .map(([k, x]) => `${k}: ${typeof x === "object" ? JSON.stringify(x) : String(x)}`)
      .join(" · ") || "none";
  }
  return String(v);
}
