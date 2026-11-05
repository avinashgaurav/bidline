import { currentUser } from "@/lib/auth";
import { listAudit } from "@/lib/audit";
import { actorOf, entityOf, kindLabel } from "@/lib/audit-format";
import { verifyChain } from "@/lib/audit-chain";
import { logEvent } from "@/lib/events";
import { can } from "@/lib/roles";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The audit log as CSV, with the filters on screen, and each entry's hash so the copy can be checked later. */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return new Response("Sign in first.", { status: 401 });
  if (!can(user.role, "audit_all") && !can(user.role, "edit")) return new Response("Your role cannot export the audit log.", { status: 403 });
  const p = new URL(req.url).searchParams;
  const rows = await listAudit(user.id, {
    rfx: p.get("rfx"), person: p.get("person"), actor: p.get("actor"), group: p.get("group"), from: p.get("from"), to: p.get("to"), search: p.get("q"), limit: 500,
  }, { all: can(user.role, "audit_all") });
  const chain = await verifyChain(user.workspace_id);
  const hashes = await import("@/lib/db").then(({ q }) =>
    q<{ id: string; hash: string | null; prev_hash: string | null }>("select id::text, hash, prev_hash from events where id = any($1::bigint[])", [rows.map((r) => r.id)]));
  const h = new Map(hashes.map((x) => [x.id, x]));
  const head = ["time_utc", "person", "via", "action", "item_type", "item", "event_code", "event_title", "summary", "asked_in_claude", "tool", "before", "after", "reason", "entry_id", "hash", "prev_hash"];
  const lines = [head.join(",")];
  for (const r of rows) {
    const who = actorOf(r.actor, r.user_name, r.detail);
    const ent = entityOf(r.kind, r.detail, r.rfx_code);
    const d = r.detail ?? {};
    lines.push([
      new Date(r.created_at).toISOString(), who.name, who.via, kindLabel(r.kind), ent.type, ent.name, r.rfx_code, r.rfx_title, r.summary,
      r.user_request, r.tool, d.before, d.after, d.reason, r.id, h.get(r.id)?.hash, h.get(r.id)?.prev_hash,
    ].map(cell).join(","));
  }
  lines.push("");
  lines.push(`# ${rows.length} entries. Chain check at ${chain.checkedAt}: ${chain.intact ? "intact" : `NOT intact (${chain.changed} changed, ${chain.missingLinks} missing links)`}. Latest hash ${chain.lastHash ?? "none"}.`);
  await logEvent({ userId: user.id, actor: "user", kind: "audit_exported", summary: `Exported ${rows.length} audit entries as CSV.`, detail: { filters: Object.fromEntries(p.entries()) } });
  return new Response(lines.join("\n"), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="bidline-audit-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
