import { q } from "./db";
import { logEvent } from "./events";
import { notify } from "./notify";

/**
 * @mentions in comments and notes. "@Asha" or "@Asha Rao" matches a person in
 * the workspace who can see the event; each is notified in the app (the bell)
 * and by email if they chose to be.
 */
export async function handleMentions(opts: { userId: string; rfx: { id: string; code: string; workspace_id: string; restricted: boolean; user_id: string }; text: string; where: string; link: string }) {
  if (!opts.text.includes("@")) return [];
  const people = await q<{ id: string; name: string }>(
    `select u.id, u.name from workspace_members m join users u on u.id = m.user_id
      where m.workspace_id = $1 and m.user_id <> $2
        and (not $3 or m.role = 'admin' or u.id = $4 or exists (select 1 from rfx_access a where a.rfx_id = $5 and a.user_id = u.id))`,
    [opts.rfx.workspace_id, opts.userId, opts.rfx.restricted, opts.rfx.user_id, opts.rfx.id]);
  const lower = opts.text.toLowerCase();
  // Longest names first, so "@Asha Rao" is not read as "@Asha" when both exist.
  const hit = people.sort((a, b) => b.name.length - a.name.length).filter((p) => {
    const full = `@${p.name.toLowerCase()}`;
    const first = `@${p.name.split(/\s+/)[0].toLowerCase()}`;
    return lower.includes(full) || new RegExp(`${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z])`).test(lower);
  });
  if (!hit.length) return [];
  const me = await q<{ name: string }>("select name from users where id = $1", [opts.userId]);
  await logEvent({ userId: opts.userId, rfxId: opts.rfx.id, actor: "user", kind: "mentioned",
    summary: `${me[0]?.name ?? "Someone"} mentioned ${hit.map((h) => h.name).join(", ")} in ${opts.where} on ${opts.rfx.code}: "${opts.text.slice(0, 140)}"`,
    detail: { mentions: hit.map((h) => h.id), names: hit.map((h) => h.name) } });
  await notify(hit.map((h) => h.id), "mentioned", `${me[0]?.name ?? "Someone"} mentioned you on ${opts.rfx.code}`, `${opts.text}\n\nOpen it: ${opts.link}`);
  return hit;
}
