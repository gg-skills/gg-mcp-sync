/**
 * @fileoverview Defines the MCP server template for augment context engine.
 *
 * Flow: server definition -> registry entry -> editor-specific config generation.
 *
 * @example
 * ```typescript
 * const server = augmentContextEngineStdio;
 * ```
 *
 * @testing Jest unit: npm test
 * @see scripts/servers/index.ts - Re-exports the complete server registry.
 * @see scripts/lib/types.ts - Defines the shared server template type used here.
 * @documentation reviewed=2026-04-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import type { EnvVars, McpServerTemplate } from "../lib/types";

const AUGGIE_MCP_ARGS = ["--mcp", "--mcp-auto-workspace"] as const;

/**
 * Builds optional Augment API credential env for launching `auggie` when MCP_* keys are present.
 *
 * @remarks
 * PURITY: Derives a small key subset from the passed env snapshot only; returns undefined when empty.
 *
 * @param env - Materialized MCP env map used while emitting editor-specific server configs.
 * @returns Child env fragment with `AUGMENT_API_TOKEN` and/or `AUGMENT_API_URL`, or undefined if neither is set.
 */
function getOptionalAuthEnv(env: EnvVars): Record<string, string> | undefined {
  const authEnv: Record<string, string> = {};

  if (env.MCP_AUGMENT_API_TOKEN) {
    authEnv.AUGMENT_API_TOKEN = env.MCP_AUGMENT_API_TOKEN;
  }

  if (env.MCP_AUGMENT_API_URL) {
    authEnv.AUGMENT_API_URL = env.MCP_AUGMENT_API_URL;
  }

  return Object.keys(authEnv).length > 0 ? authEnv : undefined;
}

export const augmentContextEngineStdio: McpServerTemplate = {
  id: "augment-context-engine-stdio",
  legacyIds: ["augment-context-engine", "codebase-retrieval-stdio"],
  name: "Augment Context Engine",
  transport: "stdio",
  package: "auggie",
  envVars: [],
  configs: {
    standard: (env) => ({
      command: "auggie",
      args: [...AUGGIE_MCP_ARGS],
      env: getOptionalAuthEnv(env),
    }),
    vscode: (env) => ({
      type: "stdio",
      command: "auggie",
      args: [...AUGGIE_MCP_ARGS],
      env: getOptionalAuthEnv(env),
    }),
    opencode: (env) => ({
      type: "local",
      command: ["auggie", ...AUGGIE_MCP_ARGS],
      environment: getOptionalAuthEnv(env),
    }),
    zed: (env) => ({
      command: "auggie",
      args: [...AUGGIE_MCP_ARGS],
      env: getOptionalAuthEnv(env),
    }),
    goose: (env) => ({
      name: "codebase-retrieval",
      command: "auggie",
      args: [...AUGGIE_MCP_ARGS],
      env: getOptionalAuthEnv(env),
      timeout: 30000,
    }),
    codex: (env) => ({
      command: "auggie",
      args: [...AUGGIE_MCP_ARGS],
      env: getOptionalAuthEnv(env),
    }),
    continue: (env) => ({
      name: "codebase-retrieval",
      command: "auggie",
      args: [...AUGGIE_MCP_ARGS],
      env: getOptionalAuthEnv(env),
    }),
    crush: (env) => ({
      type: "stdio",
      command: "auggie",
      args: [...AUGGIE_MCP_ARGS],
      env: getOptionalAuthEnv(env),
      timeout: 120,
    }),
  },
};

export default augmentContextEngineStdio;
