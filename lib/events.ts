import { json, one, q } from "./db";

/**
 * The transcript.
 *
 * Every tool call from Claude, every edit and upload made in the app, every
 * approval decision lands here. It is three things at once: the audit trail a
 * CFO can read, the history Claude reads back to see what a person changed in
 * the app, and the version counter the open screens poll to refresh themselves.
 */

export type Actor = "claude" | "user" | "approver" | "system";

export interface EventInput {
  userId: string | null;
  rfxId?: string | null;
  actor: Actor;
  kind: string;
  tool?: string | null;
  /** What the person asked Claude, as Claude passed it on. */
  userRequest?: string | null;
  summary: string;
  detail?: Record<string, unknown>;
  /** For workspace-level entries (team changes) with no event. Defaults to the event's or the person's workspace. */
  workspaceId?: string | null;
}

export interface EventRow {
  id: string;
  user_id: string | null;
  rfx_id: string | null;
  actor: Actor;
  kind: string;
  tool: string | null;
  user_request: string | null;
  summary: string;
  detail: Record<string, unknown>;
  created_at: string;
  /** The person (or the person whose Claude it was). */
  user_name?: string | null;
}

export async function logEvent(e: EventInput): Promise<void> {
  await q(
    `insert into events (user_id, rfx_id, actor, kind, tool, user_request, summary, detail, workspace_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,
       coalesce($9, (select workspace_id from rfx where id = $2), (select workspace_id from users where id = $1)))`,
    [
      e.userId, e.rfxId ?? null, e.actor, e.kind, e.tool ?? null,
      e.userRequest?.trim() ? e.userRequest.trim().slice(0, 4000) : null,
      e.summary.slice(0, 2000), json(e.detail ?? {}), e.workspaceId ?? null,
    ],
  );
  if (e.rfxId) await q("update rfx set updated_at = now() where id = $1", [e.rfxId]);
}

/** Highest event id for an RFx (or a user's whole workspace). Screens poll this. */
export async function versionOf(opts: { rfxId?: string; userId?: string }): Promise<number> {
  const row = opts.rfxId
    ? await one<{ v: string | null }>("select max(id) as v from events where rfx_id = $1", [opts.rfxId])
    : await one<{ v: string | null }>("select max(id) as v from events where workspace_id = (select workspace_id from users where id = $1)", [opts.userId]);
  return Number(row?.v ?? 0);
}

export async function listEvents(opts: {
  rfxId: string; limit?: number; sinceId?: number;
}): Promise<EventRow[]> {
  const limit = Math.min(opts.limit ?? 200, 2000);
  // One event's trail. The organisation-wide log goes through lib/audit.ts, which checks access.
  return q<EventRow>(
    `select e.*, u.name as user_name from events e left join users u on u.id = e.user_id
      where e.rfx_id = $1 and e.id > $2 order by e.id desc limit $3`,
    [opts.rfxId, opts.sinceId ?? 0, limit],
  );
}

const ACTOR_LABEL: Record<Actor, string> = {
  claude: "Claude (via MCP)",
  user: "Buyer (in the app)",
  approver: "Approver (approval link)",
  system: "Bidline",
};

function fmtTime(iso: string) {
  return new Date(iso).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

/** The transcript as a Markdown document, oldest first. */
export function transcriptMarkdown(opts: {
  title: string;
  subtitle?: string;
  events: EventRow[];
}): string {
  const rows = [...opts.events].sort((a, b) => Number(a.id) - Number(b.id));
  const out: string[] = [
    `# Activity log: ${opts.title}`,
    "",
    opts.subtitle ?? "",
    "",
    `Generated ${fmtTime(new Date().toISOString())}. ${rows.length} entries, oldest first.`,
    "",
    "This log records every change to this event: requests made in Claude, actions Claude took",
    "in Bidline, edits made in the app, and approval decisions.",
    "",
  ];
  for (const e of rows) {
    out.push(`## ${fmtTime(e.created_at)} · ${ACTOR_LABEL[e.actor] ?? e.actor}`);
    out.push("");
    if (e.user_request) {
      out.push(`**Asked:** ${e.user_request.replace(/\n+/g, " ")}`);
      out.push("");
    }
    out.push(`**${e.tool ? `Tool \`${e.tool}\`` : kindLabel(e.kind)}:** ${e.summary}`);
    const d = e.detail ?? {};
    if (d.before !== undefined || d.after !== undefined) {
      out.push("");
      out.push(`- Before: \`${short(d.before)}\``);
      out.push(`- After: \`${short(d.after)}\``);
      if (d.reason) out.push(`- Reason: ${String(d.reason)}`);
    }
    out.push("");
  }
  return out.join("\n");
}

function kindLabel(kind: string): string {
  return kind.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function short(v: unknown): string {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return (s ?? "null").replace(/`/g, "'").slice(0, 300);
}
