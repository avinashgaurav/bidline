import { currentUser } from "@/lib/auth";
import { searchAll } from "@/lib/search";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "signed out" }, { status: 401 });
  const text = new URL(req.url).searchParams.get("q") ?? "";
  return Response.json({ hits: await searchAll(user.id, text.slice(0, 100)) });
}
