/**
 * @fileoverview Defines the MCP server template for serena.
 *
 * Flow: server definition -> registry entry -> editor-specific config generation.
 *
 * @example
 * ```typescript
 * const server = serenaStdio;
 * ```
 *
 * @testing Jest unit: npm test
 * @see scripts/servers/index.ts - Re-exports the complete server registry.
 * @see scripts/lib/types.ts - Defines the shared server template type used here.
 * @documentation reviewed=2026-04-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import type { McpServerTemplate } from "../lib/types";

const SERENA_ARGS = [
  "--from",
  "git+https://github.com/oraios/serena",
  "serena",
  "start-mcp-server",
] as const;

export const serenaStdio: McpServerTemplate = {
  id: "serena-stdio",
  name: "Serena",
  transport: "stdio",
  package: "git+https://github.com/oraios/serena",
  envVars: [],
  configs: {
    standard: () => ({
      command: "uvx",
      args: [...SERENA_ARGS],
    }),
    vscode: () => ({
      type: "stdio",
      command: "uvx",
      args: [...SERENA_ARGS],
    }),
    opencode: () => ({
      type: "local",
      command: ["uvx", ...SERENA_ARGS],
    }),
    zed: () => ({
      command: "uvx",
      args: [...SERENA_ARGS],
    }),
    goose: () => ({
      name: "serena",
      command: "uvx",
      args: [...SERENA_ARGS],
      timeout: 30000,
    }),
    codex: () => ({
      command: "uvx",
      args: [...SERENA_ARGS],
    }),
    continue: () => ({
      name: "serena",
      command: "uvx",
      args: [...SERENA_ARGS],
    }),
  },
};

