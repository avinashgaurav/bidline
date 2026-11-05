import { currentUser } from "@/lib/auth";
import { resolveRfx } from "@/lib/rfx";
import { versionOf } from "@/lib/events";
import { listAudit } from "@/lib/audit";
import { actorOf } from "@/lib/audit-format";

export const dynamic = "force-dynamic";

/** The number the open screens poll. It goes up whenever anything changes. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "signed out" }, { status: 401 });
  const { id } = await params;
  if (id === "all") {
    // The whole workspace: the number, plus the newest entry this person can see, for the "updated" note.
    const [version, latest] = await Promise.all([versionOf({ userId: user.id }), listAudit(user.id, { limit: 1, noLookups: true }, { all: false })]);
    const e = latest[0];
    return Response.json({ version, latest: e ? { summary: e.summary, who: actorOf(e.actor, e.user_name, e.detail).name, mine: e.user_id === user.id && e.actor === "user" } : null });
  }
  const own = await resolveRfx(user.id, id).catch(() => null);
  if (!own) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ version: await versionOf({ rfxId: own.id }) });
}
