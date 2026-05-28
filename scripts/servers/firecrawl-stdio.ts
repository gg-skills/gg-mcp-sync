/**
 * @fileoverview Defines the MCP server template for firecrawl.
 *
 * Flow: server definition -> registry entry -> editor-specific config generation.
 *
 * @example
 * ```typescript
 * const server = firecrawlStdio;
 * ```
 *
 * @testing Jest unit: npm test
 * @see scripts/servers/index.ts - Re-exports the complete server registry.
 * @see scripts/lib/types.ts - Defines the shared server template type used here.
 * @documentation reviewed=2026-04-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import type { McpServerTemplate } from "../lib/types";

export const firecrawlStdio: McpServerTemplate = {
  id: "firecrawl-stdio",
  name: "Firecrawl",
  transport: "stdio",
  package: "firecrawl-mcp",
  envVars: ["MCP_FIRECRAWL_API_KEY"],
  configs: {
    /**
     * Standard mcpServers format (Cursor, Windsurf, Claude CLI, etc.)
     */
    standard: (env) => ({
      command: "npx",
      args: ["-y", "firecrawl-mcp"],
      env: {
        FIRECRAWL_API_KEY: env.MCP_FIRECRAWL_API_KEY,
      },
    }),

    /**
     * VSCode native MCP format
     */
    vscode: (env) => ({
      type: "stdio",
      command: "npx",
      args: ["-y", "firecrawl-mcp"],
      env: {
        FIRECRAWL_API_KEY: env.MCP_FIRECRAWL_API_KEY,
      },
    }),

    /**
     * OpenCode format (local stdio server)
     */
    opencode: (env) => ({
      type: "local",
      command: ["npx", "-y", "firecrawl-mcp"],
      environment: {
        FIRECRAWL_API_KEY: env.MCP_FIRECRAWL_API_KEY,
      },
    }),

    /**
     * Zed context_servers format
     */
    zed: (env) => ({
      command: "npx",
      args: ["-y", "firecrawl-mcp"],
      env: {
        FIRECRAWL_API_KEY: env.MCP_FIRECRAWL_API_KEY,
      },
    }),

    /**
     * Goose extensions format
     */
    goose: (env) => ({
      name: "firecrawl",
      command: "npx",
      args: ["-y", "firecrawl-mcp"],
      env: {
        FIRECRAWL_API_KEY: env.MCP_FIRECRAWL_API_KEY,
      },
    }),

    /**
     * Codex TOML format
     */
    codex: (env) => ({
      command: "npx",
      args: ["-y", "firecrawl-mcp"],
      env: {
        FIRECRAWL_API_KEY: env.MCP_FIRECRAWL_API_KEY,
      },
    }),

    /**
     * Continue YAML format
     */
    continue: (env) => ({
      name: "firecrawl",
      command: "npx",
      args: ["-y", "firecrawl-mcp"],
      env: {
        FIRECRAWL_API_KEY: env.MCP_FIRECRAWL_API_KEY,
      },
    }),

    /**
     * Crush CLI format (stdio)
     */
    crush: (env) => ({
      type: "stdio" as const,
      command: "npx",
      args: ["-y", "firecrawl-mcp"],
      env: {
        FIRECRAWL_API_KEY: env.MCP_FIRECRAWL_API_KEY,
      },
      timeout: 120,
    }),
  },
};
