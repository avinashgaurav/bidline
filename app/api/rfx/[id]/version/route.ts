import { currentUser } from "@/lib/auth";
import { one } from "@/lib/db";
import { versionOf } from "@/lib/events";

export const dynamic = "force-dynamic";

/** The number the open screens poll. It goes up whenever anything changes. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "signed out" }, { status: 401 });
  const { id } = await params;
  if (id === "all") return Response.json({ version: await versionOf({ userId: user.id }) });
  const own = await one("select 1 from rfx where id = $1 and user_id = $2", [id, user.id]);
  if (!own) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ version: await versionOf({ rfxId: id }) });
}
