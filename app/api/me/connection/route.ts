import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Polled by the Connect Claude popup: has this account's connector been used yet? */
export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "signed out" }, { status: 401 });
  return Response.json({ connected: Boolean(user.last_mcp_at), lastMcpAt: user.last_mcp_at });
}
