/**
 * @fileoverview Defines the MCP server template for playwright.
 *
 * Flow: server definition -> registry entry -> editor-specific config generation.
 *
 * @example
 * ```typescript
 * const server = playwrightStdio;
 * ```
 *
 * @testing Jest unit: npm test
 * @see scripts/servers/index.ts - Re-exports the complete server registry.
 * @see scripts/lib/types.ts - Defines the shared server template type used here.
 * @documentation reviewed=2026-04-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import {
  McpServerTemplate,
  StdioServerConfig,
  VscodeServerConfig,
  OpenCodeServerConfig,
  ZedServerConfig,
  GooseExtensionConfig,
  CodexServerConfig,
  ContinueServerConfig,
} from "../lib/types";

export const playwrightStdio: McpServerTemplate = {
  id: "playwright-stdio",
  name: "Playwright",
  transport: "stdio",
  package: "@playwright/mcp@latest",
  envVars: [],
  configs: {
    /**
     * Standard config for Cursor, Windsurf, Claude CLI, etc.
     */
    standard: (): StdioServerConfig => ({
      command: "npx",
      args: ["@playwright/mcp"],
    }),

    /**
     * VSCode native MCP format
     */
    vscode: (): VscodeServerConfig => ({
      type: "stdio",
      command: "npx",
      args: ["@playwright/mcp"],
    }),

    /**
     * OpenCode format
     */
    opencode: (): OpenCodeServerConfig => ({
      type: "local",
      command: ["npx", "@playwright/mcp"],
    }),

    /**
     * Zed context_servers format
     */
    zed: (): ZedServerConfig => ({
      command: "npx",
      args: ["@playwright/mcp"],
    }),

    /**
     * Goose extensions format
     */
    goose: (): GooseExtensionConfig => ({
      name: "playwright",
      command: "npx",
      args: ["@playwright/mcp"],
    }),

    /**
     * Codex TOML format
     */
    codex: (): CodexServerConfig => ({
      command: "npx",
      args: ["@playwright/mcp"],
    }),

    /**
     * Continue YAML format
     */
    continue: (): ContinueServerConfig => ({
      name: "playwright",
      command: "npx",
      args: ["@playwright/mcp"],
    }),
  },
};
