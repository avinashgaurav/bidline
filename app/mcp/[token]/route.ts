import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { userByMcpToken } from "@/lib/auth";
import { q } from "@/lib/db";
import { appUrlFrom } from "@/lib/app-url";
import { buildServer } from "@/lib/mcp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The MCP endpoint Claude connects to: /mcp/<personal token>.
 *
 * Stateless streamable HTTP: a fresh server per request, bound to the user the
 * token belongs to, answering in plain JSON. No session to lose between
 * serverless instances. The token in the path is the credential, which is why
 * the Connect page lets a user regenerate it.
 */
async function handle(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await userByMcpToken(token);
  if (!user) {
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32001, message: "This Bidline connector link is not valid. Copy a fresh one from the Connect Claude page." }, id: null },
      { status: 404 },
    );
  }
  // Any valid call, including Claude listing the tools when the connector is
  // added, counts as "connected" for the onboarding check.
  if (!user.last_mcp_at || Date.now() - new Date(user.last_mcp_at).getTime() > 60_000) {
    await q("update users set last_mcp_at = now() where id = $1", [user.id]);
  }
  const server = buildServer(user, appUrlFrom(req));
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(req);
}

/**
 * No server-to-client stream: every answer comes back on its POST. Saying so
 * up front stops a client holding a GET open until the function times out.
 */
export function GET() {
  return new Response(null, { status: 405, headers: { allow: "POST" } });
}

export { handle as POST, handle as DELETE };
