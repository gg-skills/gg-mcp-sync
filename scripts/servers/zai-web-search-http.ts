/**
 * @fileoverview Defines the MCP server template for zai web search.
 *
 * Flow: server definition -> registry entry -> editor-specific config generation.
 *
 * @example
 * ```typescript
 * const server = zaiWebSearchHttp;
 * ```
 *
 * @testing Jest unit: npm test
 * @see scripts/servers/index.ts - Re-exports the complete server registry.
 * @see scripts/lib/types.ts - Defines the shared server template type used here.
 * @documentation reviewed=2026-04-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import type { EnvVars, HttpServerConfig, McpServerTemplate } from "../lib/types";

/**
 * Z.AI Web Search HTTP server definition
 *
 * Transport: HTTP
 * URL: https://api.z.ai/api/mcp/web_search_prime/mcp
 * Auth: Bearer token via Authorization header
 */
export const zaiWebSearchHttp: McpServerTemplate = {
  id: "zai-web-search-http",
  name: "Z.AI Web Search (HTTP)",
  transport: "http",
  url: "https://api.z.ai/api/mcp/web_search_prime/mcp",
  envVars: ["MCP_ZAI_API_KEY"],
  configs: {
    standard: (env: EnvVars): HttpServerConfig => {
      return {
        type: "http",
        url: "https://api.z.ai/api/mcp/web_search_prime/mcp",
        headers: {
          Authorization: `Bearer ${env.MCP_ZAI_API_KEY}`,
        },
      };
    },
  },
};
