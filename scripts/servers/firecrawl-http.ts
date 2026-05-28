/**
 * @fileoverview Defines the MCP server template for firecrawl.
 *
 * Flow: server definition -> registry entry -> editor-specific config generation.
 *
 * @example
 * ```typescript
 * const server = firecrawlHttp;
 * ```
 *
 * @testing Jest unit: npm test
 * @see scripts/servers/index.ts - Re-exports the complete server registry.
 * @see scripts/lib/types.ts - Defines the shared server template type used here.
 * @documentation reviewed=2026-04-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import type {
  McpServerTemplate,
  ServerConfigGenerators,
  HttpServerConfig,
  VscodeHttpServerConfig,
  OpenCodeServerConfig,
  CrushHttpServerConfig,
  EnvVars,
} from "../lib/types";

// =============================================================================
// Constants
// =============================================================================

/** Firecrawl MCP v2 endpoint */
const FIRECRAWL_V2_URL = "https://mcp.firecrawl.dev/v2/mcp";

// =============================================================================
// Config Generators
// =============================================================================

/**
 * Config generators for Firecrawl HTTP server
 *
 * Uses v2 endpoint with Authorization header (Bearer token).
 * The API key is passed in the Authorization header, not the URL.
 */
const configs: ServerConfigGenerators = {
  /**
   * Standard config for Cursor, Windsurf, Claude CLI, etc.
   * Uses HTTP transport with Authorization header.
   */
  standard: (env: EnvVars): HttpServerConfig => ({
    type: "http",
    url: FIRECRAWL_V2_URL,
    headers: {
      Authorization: `Bearer ${env.MCP_FIRECRAWL_API_KEY}`,
    },
  }),

  /**
   * VSCode native MCP config
   * Uses HTTP transport with Authorization header.
   */
  vscode: (env: EnvVars): VscodeHttpServerConfig => ({
    type: "http",
    url: FIRECRAWL_V2_URL,
    headers: {
      Authorization: `Bearer ${env.MCP_FIRECRAWL_API_KEY}`,
    },
  }),

  /**
   * OpenCode format
   * HTTP remote server with Authorization header.
   * Note: OpenCode may need headers passed differently - check docs
   */
  opencode: (_env: EnvVars): OpenCodeServerConfig => ({
    type: "remote",
    url: FIRECRAWL_V2_URL,
  }),

  /**
   * Crush CLI format (HTTP)
   * Uses HTTP transport with Authorization header.
   * Crush uses $(echo $VAR) syntax for env vars in headers.
   */
  crush: (_env: EnvVars): CrushHttpServerConfig => ({
    type: "http",
    url: FIRECRAWL_V2_URL,
    headers: {
      Authorization: "Bearer $(echo $MCP_FIRECRAWL_API_KEY)",
    },
    timeout: 120,
  }),
};

// =============================================================================
// Server Definition
// =============================================================================

/**
 * Firecrawl HTTP MCP Server Definition
 *
 * Connects to Firecrawl's cloud HTTP API via Streamable HTTP (v2).
 * Requires authentication via MCP_FIRECRAWL_API_KEY environment variable.
 *
 * Features:
 * - Web page scraping and content extraction
 * - Multiple output formats (markdown, HTML, JSON)
 * - Batch operations for multiple URLs
 * - Full website crawling with depth control
 * - Structured data extraction with LLM
 * - Web search integration
 * - Advanced selector capabilities
 *
 * @see https://docs.firecrawl.dev/mcp-server
 */
export const firecrawlHttp: McpServerTemplate = {
  id: "firecrawl-http",
  name: "Firecrawl HTTP (Cloud API v2)",
  transport: "http",
  url: FIRECRAWL_V2_URL,
  envVars: ["MCP_FIRECRAWL_API_KEY"],
  configs,
};
