/**
 * @fileoverview Defines the MCP server template for apify.
 *
 * Flow: server definition -> registry entry -> editor-specific config generation.
 *
 * @example
 * ```typescript
 * const server = apifyHttp;
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
  VscodeServerConfig,
  OpenCodeServerConfig,
  ZedServerConfig,
  GooseExtensionConfig,
  CodexServerConfig,
  ContinueServerConfig,
  EnvVars,
} from "../lib/types";

/**
 * Substitute environment variables in a URL template.
 *
 * Replaces {VAR_NAME} placeholders with actual values from env object.
 * Throws error if a required variable is missing.
 *
 * @param template - URL with {VAR_NAME} placeholders
 * @param env - Environment variables map
 * @returns URL with substituted values
 */
function substituteEnvVars(template: string, env: EnvVars): string {
  return template.replace(/{([^}]+)}/g, (match, varName) => {
    const value = env[varName];
    if (!value) {
      throw new Error(`Missing environment variable: ${varName}`);
    }
    return value;
  });
}

/**
 * Config generators for Apify HTTP server
 *
 * Standard HTTP config returns { url: "..." } with API token substituted.
 * VSCode and other editors use appropriate HTTP-compatible formats.
 */
const configs: ServerConfigGenerators = {
  /**
   * Standard config for Cursor, Windsurf, Claude CLI, etc.
   * Returns HTTP config with substituted API token in URL.
   */
  standard: (env: EnvVars): HttpServerConfig => ({
    type: "sse",
    url: substituteEnvVars(
      "https://mcp.apify.com/sse?token={MCP_APIFY_API_TOKEN}",
      env
    ),
  }),

  /**
   * VSCode native MCP config
   * Uses HTTP transport with type annotation.
   */
  vscode: (env: EnvVars): VscodeServerConfig => ({
    type: "sse",
    url: substituteEnvVars(
      "https://mcp.apify.com/sse?token={MCP_APIFY_API_TOKEN}",
      env
    ),
  }),

  /**
   * OpenCode format
   * HTTP remote server with URL and optional headers.
   */
  opencode: (env: EnvVars): OpenCodeServerConfig => ({
    type: "remote",
    url: substituteEnvVars(
      "https://mcp.apify.com/sse?token={MCP_APIFY_API_TOKEN}",
      env
    ),
  }),

  /**
   * Zed context_servers format
   * HTTP-based server (can be represented as stdio for compatibility).
   */
  zed: (env: EnvVars): ZedServerConfig => ({
    command: "node",
    args: [
      "-e",
      `require('https').request('${substituteEnvVars(
        "https://mcp.apify.com/sse?token={MCP_APIFY_API_TOKEN}",
        env
      )}').on('response', r => r.pipe(process.stdout)).end()`,
    ],
  }),

  /**
   * Goose extensions format
   * HTTP-based server configured as stdio compatible extension.
   */
  goose: (env: EnvVars): GooseExtensionConfig => ({
    name: "apify-http",
    command: "node",
    args: [
      "-e",
      `require('https').request('${substituteEnvVars(
        "https://mcp.apify.com/sse?token={MCP_APIFY_API_TOKEN}",
        env
      )}').on('response', r => r.pipe(process.stdout)).end()`,
    ],
  }),

  /**
   * Codex TOML format
   * HTTP-based server configured as stdio compatible command.
   */
  codex: (env: EnvVars): CodexServerConfig => ({
    command: "node",
    args: [
      "-e",
      `require('https').request('${substituteEnvVars(
        "https://mcp.apify.com/sse?token={MCP_APIFY_API_TOKEN}",
        env
      )}').on('response', r => r.pipe(process.stdout)).end()`,
    ],
  }),

  /**
   * Continue YAML format
   * HTTP-based server configured as stdio compatible command.
   */
  continue: (env: EnvVars): ContinueServerConfig => ({
    name: "apify-http",
    command: "node",
    args: [
      "-e",
      `require('https').request('${substituteEnvVars(
        "https://mcp.apify.com/sse?token={MCP_APIFY_API_TOKEN}",
        env
      )}').on('response', r => r.pipe(process.stdout)).end()`,
    ],
  }),
};

/**
 * Apify HTTP MCP Server Definition
 *
 * Connects to Apify's cloud HTTP API via Server-Sent Events (SSE).
 * Requires authentication via MCP_APIFY_API_TOKEN environment variable.
 *
 * Features:
 * - Web scraping and data extraction
 * - Actor management and execution
 * - Task scheduling and automation
 * - Dataset and storage operations
 * - Advanced crawling capabilities
 * - Proxy and browser automation
 *
 * @see https://docs.apify.com
 */
export const apifyHttp: McpServerTemplate = {
  id: "apify-http",
  name: "Apify HTTP (Cloud API)",
  transport: "http",
  url: "https://mcp.apify.com/sse?token={MCP_APIFY_API_TOKEN}",
  envVars: ["MCP_APIFY_API_TOKEN"],
  configs,
};
