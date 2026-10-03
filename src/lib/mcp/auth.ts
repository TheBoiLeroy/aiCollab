import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { supabaseEnv } from "@/lib/supabase/env";

/**
 * MCP clients authenticate through Supabase Auth's OAuth 2.1 server. The access
 * tokens it issues are ordinary Supabase JWTs (plus a client_id claim), so a
 * Supabase client built from one is subject to the same RLS as the web app.
 */

const issuer = () => `${supabaseEnv().url}/auth/v1`;

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
const getJwks = () => (jwks ??= createRemoteJWKSet(new URL(`${issuer()}/.well-known/jwks.json`)));

export type McpUser = { id: string; email: string; clientId: string; token: string; expiresAt?: number };

export async function verifyBearer(request: Request): Promise<McpUser | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getJwks(), { issuer: issuer(), audience: "authenticated" });
    if (typeof payload.sub !== "string") return null;
    return {
      id: payload.sub,
      email: String(payload.email ?? ""),
      clientId: String(payload.client_id ?? ""),
      token,
      expiresAt: payload.exp,
    };
  } catch {
    return null;
  }
}

/** A Supabase client acting as the token's user (RLS applies). */
export function supabaseAs(user: McpUser) {
  const { url, key } = supabaseEnv();
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${user.token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Public origin of this app as the MCP client sees it. */
export function publicOrigin(request: Request) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");
  if (!host) return process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  return `${proto}://${host}`;
}

export const MCP_PATH = "/api/mcp";

/** RFC 9728 metadata telling MCP clients which authorization server issues tokens for us. */
export function protectedResourceMetadata(request: Request) {
  return {
    resource: `${publicOrigin(request)}${MCP_PATH}`,
    authorization_servers: [issuer()],
    bearer_methods_supported: ["header"],
    scopes_supported: ["openid", "email", "profile"],
    resource_name: "Intermediary",
  };
}

export function unauthorized(request: Request) {
  const metadata = `${publicOrigin(request)}/.well-known/oauth-protected-resource${MCP_PATH}`;
  return new Response(JSON.stringify({ error: "invalid_token", error_description: "Sign in to Intermediary" }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": `Bearer resource_metadata="${metadata}"`,
    },
  });
}
