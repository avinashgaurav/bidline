import { currentUser } from "@/lib/auth";
import { listNotifications, markNotificationsSeen } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "signed out" }, { status: 401 });
  return Response.json(await listNotifications(user.id));
}

/** Mark everything as read. */
export async function POST() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "signed out" }, { status: 401 });
  await markNotificationsSeen(user.id);
  return Response.json({ ok: true });
}
