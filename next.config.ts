import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The MCP App view inlines this file at runtime (src/lib/mcp/view.ts reads it from disk).
  outputFileTracingIncludes: {
    "/api/mcp": ["./node_modules/@modelcontextprotocol/ext-apps/dist/src/app-with-deps.js"],
  },
};

export default nextConfig;
