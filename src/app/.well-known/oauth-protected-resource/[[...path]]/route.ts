import { protectedResourceMetadata } from "@/lib/mcp/auth";

// RFC 9728 protected resource metadata for the MCP endpoint. Served at both
// /.well-known/oauth-protected-resource and .../api/mcp (path-suffixed form).
export function GET(request: Request) {
  return Response.json(protectedResourceMetadata(request), {
    headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300" },
  });
}
