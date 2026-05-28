/**
 * @fileoverview Defines the MCP server template for zai zread.
 *
 * Flow: server definition -> registry entry -> editor-specific config generation.
 *
 * @example
 * ```typescript
 * const server = zaiZreadHttp;
 * ```
 *
 * @testing Jest unit: npm test
 * @see scripts/servers/index.ts - Re-exports the complete server registry.
 * @see scripts/lib/types.ts - Defines the shared server template type used here.
 * @documentation reviewed=2026-04-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import type { EnvVars, HttpServerConfig, McpServerTemplate } from "../lib/types";

/**
 * Z.AI ZRead HTTP server definition
 *
 * Transport: HTTP
 * URL: https://api.z.ai/api/mcp/zread/mcp
 * Auth: Bearer token via Authorization header
 */
export const zaiZreadHttp: McpServerTemplate = {
  id: "zai-zread-http",
  name: "Z.AI ZRead (HTTP)",
  transport: "http",
  url: "https://api.z.ai/api/mcp/zread/mcp",
  envVars: ["MCP_ZAI_API_KEY"],
  configs: {
    standard: (env: EnvVars): HttpServerConfig => {
      return {
        type: "http",
        url: "https://api.z.ai/api/mcp/zread/mcp",
        headers: {
          Authorization: `Bearer ${env.MCP_ZAI_API_KEY}`,
        },
      };
    },
  },
};
