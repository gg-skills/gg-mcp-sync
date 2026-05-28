/**
 * @fileoverview Defines the MCP server template for apify.
 *
 * Flow: server definition -> registry entry -> editor-specific config generation.
 *
 * @example
 * ```typescript
 * const server = apifyStdio;
 * ```
 *
 * @testing Jest unit: npm test
 * @see scripts/servers/index.ts - Re-exports the complete server registry.
 * @see scripts/lib/types.ts - Defines the shared server template type used here.
 * @documentation reviewed=2026-04-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import type { McpServerTemplate } from "../lib/types";

export const apifyStdio: McpServerTemplate = {
  id: "apify-stdio",
  name: "Apify",
  transport: "stdio",
  package: "@apify/actors-mcp-server",
  envVars: ["MCP_APIFY_API_TOKEN"],
  configs: {
    /**
     * Standard mcpServers format (Cursor, Windsurf, Claude CLI, etc.)
     */
    standard: (env) => ({
      command: "npx",
      args: ["-y", "@apify/actors-mcp-server"],
      env: {
        APIFY_TOKEN: env.MCP_APIFY_API_TOKEN,
      },
    }),

    /**
     * VSCode native MCP format
     */
    vscode: (env) => ({
      type: "stdio",
      command: "npx",
      args: ["-y", "@apify/actors-mcp-server"],
      env: {
        APIFY_TOKEN: env.MCP_APIFY_API_TOKEN,
      },
    }),

    /**
     * OpenCode format (local stdio server)
     */
    opencode: (env) => ({
      type: "local",
      command: ["npx", "-y", "@apify/actors-mcp-server"],
      environment: {
        APIFY_TOKEN: env.MCP_APIFY_API_TOKEN,
      },
    }),

    /**
     * Zed context_servers format
     */
    zed: (env) => ({
      command: "npx",
      args: ["-y", "@apify/actors-mcp-server"],
      env: {
        APIFY_TOKEN: env.MCP_APIFY_API_TOKEN,
      },
    }),

    /**
     * Goose extensions format
     */
    goose: (env) => ({
      name: "apify",
      command: "npx",
      args: ["-y", "@apify/actors-mcp-server"],
      env: {
        APIFY_TOKEN: env.MCP_APIFY_API_TOKEN,
      },
    }),

    /**
     * Codex TOML format
     */
    codex: (env) => ({
      command: "npx",
      args: ["-y", "@apify/actors-mcp-server"],
      env: {
        APIFY_TOKEN: env.MCP_APIFY_API_TOKEN,
      },
    }),

    /**
     * Continue YAML format
     */
    continue: (env) => ({
      name: "apify",
      command: "npx",
      args: ["-y", "@apify/actors-mcp-server"],
      env: {
        APIFY_TOKEN: env.MCP_APIFY_API_TOKEN,
      },
    }),
  },
};
