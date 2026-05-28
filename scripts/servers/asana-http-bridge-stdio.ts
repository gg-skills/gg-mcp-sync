/**
 * @fileoverview Defines the stdio MCP bridge template for Asana's hosted HTTP MCP endpoint.
 *
 * Flow: server definition -> registry entry -> editor-specific config generation.
 *
 * @example
 * ```typescript
 * const server = asanaHttpBridgeStdio;
 * ```
 *
 * @testing Jest unit: npm test
 * @see scripts/servers/index.ts - Re-exports the complete server registry.
 * @see scripts/lib/types.ts - Defines the shared server template type used here.
 * @documentation reviewed=2026-05-12 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import type {
  CodexServerConfig,
  EnvVars,
  McpServerTemplate,
  OpenCodeServerConfig,
  StdioServerConfig,
  VscodeStdioServerConfig,
} from "../lib/types";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

/** Asana MCP v2 endpoint. */
const ASANA_MCP_URL = "https://mcp.asana.com/v2/mcp";
/** Local wrapper that keeps editor transport stdio and normalizes upstream tool schemas. */
const ASANA_HTTP_BRIDGE_SCRIPT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../bridges/asana-http-bridge-stdio.mjs"
);

/**
 * Builds the local stdio bridge invocation used by all editors.
 *
 * @remarks
 * Editors launch this Node wrapper as stdio. The wrapper launches `mcp-remote` for the actual
 * HTTP bridge and inlines Asana's local JSON Schema `$ref` values in `tools/list` responses so
 * Moonshot/Kimi-compatible tool schema validation does not reject the upstream Asana schemas.
 */
function AsanaHttpBridgeStdio_createBridgeArgs(): string[] {
  return [ASANA_HTTP_BRIDGE_SCRIPT_PATH];
}

/**
 * Config generators for the Asana HTTP stdio bridge.
 *
 * Editors receive stdio/local-process configuration only. The `mcp-remote` process then connects to
 * Asana's hosted streamable HTTP MCP endpoint.
 */
const configs = {
  standard: (env: EnvVars): StdioServerConfig => ({
    command: "node",
    args: AsanaHttpBridgeStdio_createBridgeArgs(),
    env: {
      MCP_ASANA_CLIENT_ID: env.MCP_ASANA_CLIENT_ID,
      MCP_ASANA_CLIENT_SECRET: env.MCP_ASANA_CLIENT_SECRET,
    },
  }),

  vscode: (env: EnvVars): VscodeStdioServerConfig => ({
    type: "stdio",
    command: "node",
    args: AsanaHttpBridgeStdio_createBridgeArgs(),
    env: {
      MCP_ASANA_CLIENT_ID: env.MCP_ASANA_CLIENT_ID,
      MCP_ASANA_CLIENT_SECRET: env.MCP_ASANA_CLIENT_SECRET,
    },
  }),

  opencode: (env: EnvVars): OpenCodeServerConfig => ({
    type: "local",
    command: ["node", ...AsanaHttpBridgeStdio_createBridgeArgs()],
    environment: {
      MCP_ASANA_CLIENT_ID: env.MCP_ASANA_CLIENT_ID,
      MCP_ASANA_CLIENT_SECRET: env.MCP_ASANA_CLIENT_SECRET,
    },
  }),

  codex: (env: EnvVars): CodexServerConfig => ({
    command: "node",
    args: AsanaHttpBridgeStdio_createBridgeArgs(),
    env: {
      MCP_ASANA_CLIENT_ID: env.MCP_ASANA_CLIENT_ID,
      MCP_ASANA_CLIENT_SECRET: env.MCP_ASANA_CLIENT_SECRET,
    },
    startup_timeout_sec: 120,
  }),
};

/**
 * Asana HTTP stdio bridge MCP server definition.
 *
 * Editors launch a local stdio process, and that bridge connects to Asana's hosted MCP endpoint
 * using OAuth client credentials supplied through `.mcp-sync/env`.
 */
export const asanaHttpBridgeStdio: McpServerTemplate = {
  id: "asana-http-bridge-stdio",
  legacyIds: ["asana-http", "asana-http-stdio-bridge"],
  name: "Asana HTTP Bridge",
  transport: "stdio",
  package: "mcp-remote@latest",
  url: ASANA_MCP_URL,
  envVars: ["MCP_ASANA_CLIENT_ID", "MCP_ASANA_CLIENT_SECRET"],
  configs,
};
