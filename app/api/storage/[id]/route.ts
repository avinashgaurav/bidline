import { currentUser } from "@/lib/auth";
import { filesOfEvent } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** One sourcing event's files, listed when its fold is opened. Same access rule as the download route. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in." }, { status: 401 });
  const { id } = await params;
  return Response.json({ files: await filesOfEvent(user.id, id) }, { headers: { "cache-control": "private, no-store" } });
}
