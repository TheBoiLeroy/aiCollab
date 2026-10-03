import { createMcpHandler } from "@modelcontextprotocol/server";
import { publicOrigin, supabaseAs, unauthorized, verifyBearer } from "@/lib/mcp/auth";
import { buildServer } from "@/lib/mcp/server";

// Remote MCP endpoint (streamable HTTP, stateless). Every request carries a
// Supabase OAuth access token; tools run as that user, so RLS applies.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(request: Request) {
  const user = await verifyBearer(request);
  if (!user) return unauthorized(request);

  const ctx = { supabase: supabaseAs(user), user, appUrl: publicOrigin(request) };
  const handler = createMcpHandler(() => buildServer(ctx), {
    onerror: (e) => console.error("[mcp]", e),
  });
  return handler.fetch(request, {
    authInfo: { token: user.token, clientId: user.clientId, scopes: [], expiresAt: user.expiresAt },
  });
}

export { handle as GET, handle as POST, handle as DELETE };
