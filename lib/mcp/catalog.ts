import { can } from "../roles";

/**
 * The Claude tools as people see them on the Tools page: grouped by job, with
 * an example of what to ask. Pure data; the tool definitions themselves live
 * in server.ts, which reads `toolAllowed` to decide what to offer Claude.
 */

export interface ToolInfo { name: string; title: string; description: string; readOnly: boolean }

/**
 * Off until an admin switches them on: tools that act with weight on Claude's
 * word alone. Stored as "+name" in the workspace's tool list when switched on.
 */
export const DEFAULT_OFF = ["decide_award"];

/** Whether a tool is switched on for the workspace. */
export const toolOn = (name: string, list: string[]) => (DEFAULT_OFF.includes(name) ? list.includes(`+${name}`) : !list.includes(name));

/** Always on: Claude needs these to find its way around. */
export const LOCKED_TOOLS = ["get_started", "list_rfxs", "get_rfx"];

export const TOOL_GROUPS: Array<{ key: string; label: string; help: string; tools: string[]; example: string }> = [
  {
    key: "orient", label: "Find your way around", help: "What exists in the workspace and what is waiting.",
    tools: ["get_started", "list_rfxs", "get_rfx", "search_bidline", "list_team", "list_open_work", "price_history", "get_activity", "archive_rfx"],
    example: "What is waiting across all my sourcing events?",
  },
  {
    key: "setup", label: "Set up a sourcing event", help: "Create events, line items, questions and suppliers.",
    tools: ["create_rfx", "create_rfx_from_template", "list_templates", "save_template", "check_ready", "update_rfx", "upsert_lines", "set_budget", "add_questions", "remove_questions", "duplicate_rfx", "add_line_note", "issue_rfx", "add_suppliers", "update_supplier"],
    example: "Create a sourcing event for 40 chairs due 20 Nov and invite Featherlite.",
  },
  {
    key: "read", label: "Read supplier documents", help: "Claude reads each file and submits what it says, with the source of every price.",
    tools: ["list_documents", "read_document", "save_document_text", "update_document", "submit_quote", "submit_questionnaire", "submit_second_read"],
    example: "Read every unread supplier document on my latest event and submit the quotes.",
  },
  {
    key: "compare", label: "Compare and check", help: "Bidline's like-for-like figures, and where each price came from.",
    tools: ["get_comparison", "get_line", "explain_cell", "get_supplier", "list_needs_attention", "flag_unusual_prices", "comment_on_price", "compare_award_options", "what_if"],
    example: "Using only Bidline's figures, which qualified supplier should win each line?",
  },
  {
    key: "correct", label: "Correct and set rules", help: "Fix a price with a reason, set exchange rates and unit rules.",
    tools: ["correct_price", "set_fx_rate", "add_unit_rule", "set_prior_po_rates", "record_assumption", "resolve_unmatched_item"],
    example: "Line 20 from Vector should be 14,500 per unit, the PDF was misread.",
  },
  {
    key: "followup", label: "Follow up with suppliers", help: "What each supplier still owes you, and the emails that ask for it.",
    tools: ["get_chase_list", "record_chase", "email_supplier", "update_follow_up"],
    example: "What does each supplier still owe me? Draft the follow-ups.",
  },
  {
    key: "insight", label: "Suppliers and spend", help: "How suppliers have done across events, and what has been committed against budget.",
    tools: ["supplier_scorecard", "spend_summary", "check_gstin"],
    example: "Which suppliers reply slowest, and what have we awarded to each this quarter?",
  },
  {
    key: "award", label: "Award and records", help: "Draft the award, send it for approval, and export the record.",
    tools: ["create_award", "withdraw_award", "decide_award", "get_award_status", "get_export_link"],
    example: "Draft the award with qualified suppliers only and give me the approval link.",
  },
];

export const groupOf = (tool: string) => TOOL_GROUPS.find((g) => g.tools.includes(tool));

/** Whether Claude is offered this tool for this person: switched on for the workspace and allowed for their role. */
export function toolAllowed(t: Pick<ToolInfo, "name" | "readOnly">, role: string, disabled: string[]): boolean {
  if (!toolOn(t.name, disabled) && !LOCKED_TOOLS.includes(t.name)) return false;
  if (t.readOnly) return true;
  if (t.name === "add_line_note" || t.name === "comment_on_price") return can(role, "note");
  if (t.name === "decide_award") return can(role, "approve");
  return can(role, "edit");
}

/** Integrations beside the Claude connector: what is live today and what is planned. */
export const INTEGRATIONS: Array<{ key: string; name: string; what: string; status: "live" | "planned" }> = [
  { key: "claude", name: "Claude (MCP connector)", what: "Your Claude reads supplier documents and works with Bidline's figures.", status: "live" },
  { key: "smtp", name: "Email from your own mailbox", what: "Send follow-ups to suppliers from your own address.", status: "live" },
  { key: "gmail", name: "Gmail and Outlook sign-in", what: "Connect a mailbox with one click instead of an app password, and pick up supplier replies.", status: "planned" },
  { key: "whatsapp", name: "WhatsApp Business", what: "Send follow-ups where many suppliers reply first.", status: "planned" },
  { key: "erp", name: "Tally, Zoho Books and SAP", what: "Turn an approved award into purchase-order lines in your accounts system.", status: "planned" },
  { key: "slack", name: "Slack and Teams app", what: "Approve awards and answer questions inside Slack or Teams. Alerts to a Slack, Teams or webhook channel already work (Settings, Integrations).", status: "planned" },
  { key: "sso", name: "Single sign-on (Google, Microsoft, Okta)", what: "Sign in with your company account; admins control who gets in.", status: "planned" },
];
