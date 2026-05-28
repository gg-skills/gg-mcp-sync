/**
 * @fileoverview Defines the MCP server template for puppeteer.
 *
 * Flow: server definition -> registry entry -> editor-specific config generation.
 *
 * @example
 * ```typescript
 * const server = puppeteerStdio;
 * ```
 *
 * @testing Jest unit: npm test
 * @see scripts/servers/index.ts - Re-exports the complete server registry.
 * @see scripts/lib/types.ts - Defines the shared server template type used here.
 * @documentation reviewed=2026-04-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import type {
  McpServerTemplate,
  StdioServerConfig,
  VscodeServerConfig,
  OpenCodeServerConfig,
  ZedServerConfig,
  GooseExtensionConfig,
  CodexServerConfig,
  ContinueServerConfig,
  EnvVars,
} from "../lib/types";

/**
 * Puppeteer MCP Server Definition
 * Provides web automation capabilities through the Model Context Protocol
 */
export const puppeteerStdio: McpServerTemplate = {
  id: "puppeteer-stdio",
  name: "Puppeteer",
  transport: "stdio",
  package: "@modelcontextprotocol/server-puppeteer",
  envVars: [],
  configs: {
    /**
     * Standard mcpServers format (Cursor, Windsurf, Claude CLI, etc.)
     */
    standard: (_env: EnvVars): StdioServerConfig => ({
      command: "npx",
      args: [
        "-y",
        "@modelcontextprotocol/server-puppeteer",
      ],
    }),

    /**
     * VSCode native MCP format
     */
    vscode: (_env: EnvVars): VscodeServerConfig => ({
      type: "stdio",
      command: "npx",
      args: [
        "-y",
        "@modelcontextprotocol/server-puppeteer",
      ],
    }),

    /**
     * OpenCode format
     */
    opencode: (_env: EnvVars): OpenCodeServerConfig => ({
      type: "local",
      command: [
        "npx",
        "-y",
        "@modelcontextprotocol/server-puppeteer",
      ],
    }),

    /**
     * Zed context_servers format
     */
    zed: (_env: EnvVars): ZedServerConfig => ({
      command: "npx",
      args: [
        "-y",
        "@modelcontextprotocol/server-puppeteer",
      ],
    }),

    /**
     * Goose extensions format
     */
    goose: (_env: EnvVars): GooseExtensionConfig => ({
      name: "puppeteer",
      command: "npx",
      args: [
        "-y",
        "@modelcontextprotocol/server-puppeteer",
      ],
    }),

    /**
     * Codex TOML format
     */
    codex: (_env: EnvVars): CodexServerConfig => ({
      command: "npx",
      args: [
        "-y",
        "@modelcontextprotocol/server-puppeteer",
      ],
    }),

    /**
     * Continue YAML format
     */
    continue: (_env: EnvVars): ContinueServerConfig => ({
      name: "puppeteer",
      command: "npx",
      args: [
        "-y",
        "@modelcontextprotocol/server-puppeteer",
      ],
    }),
  },
};
