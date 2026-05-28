/**
 * @fileoverview Defines the MCP server template for zai vision.
 *
 * Flow: server definition -> registry entry -> editor-specific config generation.
 *
 * @example
 * ```typescript
 * const server = zaiVisionStdio;
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
  EnvVars,
} from "../lib/types";

/**
 * Builds the `@z_ai/mcp-server` subprocess environment from resolved MCP env vars.
 *
 * @remarks
 * Maps `MCP_ZAI_*` platform keys onto canonical runtime variables (`Z_AI_API_KEY`,
 * `PLATFORM_MODE`) while retaining legacy aliases expected by older templates.
 *
 * @param env - MCP operator env with optional `MCP_ZAI_API_KEY` and `MCP_ZAI_MODE`; defaults match
 *   `@z_ai/mcp-server` expectations when omitted.
 * @returns Plain string map suitable for merging into stdio MCP config `env` fields.
 */
function getZaiVisionRuntimeEnv(env: EnvVars): Record<string, string> {
  const apiKey = env.MCP_ZAI_API_KEY || "";
  const mode = env.MCP_ZAI_MODE || "ZAI";

  return {
    // Canonical vars recognized by current @z_ai/mcp-server runtime.
    Z_AI_API_KEY: apiKey,
    PLATFORM_MODE: mode,

    // Backward-compatible aliases for clients/templates that still use legacy names.
    ZAI_API_KEY: apiKey,
    ZAI_MODE: mode,
  };
}

/**
 * zai-vision-stdio MCP server definition
 *
 * Provides vision/image analysis capabilities through the Z_AI API.
 * Requires API key configuration and optional mode specification.
 *
 * Compatibility note:
 * - This template exposes `MCP_ZAI_MODE` as `ZAI_MODE` for client compatibility.
 * - Current `@z_ai/mcp-server@0.1.2` provider routing is controlled by `PLATFORM_MODE`
 *   (`ZAI` or `ZHIPU`), with default `ZHIPU` when unset.
 * - Validate effective mode from `~/.zai/zai-mcp-YYYY-MM-DD.log` startup lines.
 */
export const zaiVisionStdio: McpServerTemplate = {
  id: "zai-vision-stdio",
  name: "Z_AI Vision Server",
  transport: "stdio",
  package: "@z_ai/mcp-server",
  envVars: ["MCP_ZAI_API_KEY", "MCP_ZAI_MODE"],
  configs: {
    /**
     * Standard mcpServers format (Cursor, Windsurf, Claude CLI, etc.)
     */
    standard: (env: EnvVars): StdioServerConfig => ({
      command: "npx",
      args: ["-y", "@z_ai/mcp-server"],
      env: getZaiVisionRuntimeEnv(env),
    }),

    /**
     * VSCode native MCP format
     */
    vscode: (env: EnvVars): VscodeServerConfig => ({
      type: "stdio",
      command: "npx",
      args: ["-y", "@z_ai/mcp-server"],
      env: getZaiVisionRuntimeEnv(env),
    }),

    /**
     * OpenCode format
     */
    opencode: (env: EnvVars): OpenCodeServerConfig => ({
      type: "local",
      command: ["npx", "-y", "@z_ai/mcp-server"],
      environment: getZaiVisionRuntimeEnv(env),
    }),

    /**
     * Zed context_servers format
     */
    zed: (env: EnvVars): ZedServerConfig => ({
      command: "npx",
      args: ["-y", "@z_ai/mcp-server"],
      env: getZaiVisionRuntimeEnv(env),
    }),

    /**
     * Goose extensions format
     */
    goose: (env: EnvVars): GooseExtensionConfig => ({
      name: "zai-vision",
      command: "npx",
      args: ["-y", "@z_ai/mcp-server"],
      env: getZaiVisionRuntimeEnv(env),
      timeout: 30000,
    }),

    /**
     * Codex TOML format
     */
    codex: (env: EnvVars): CodexServerConfig => ({
      command: "npx",
      args: ["-y", "@z_ai/mcp-server"],
      env: getZaiVisionRuntimeEnv(env),
    }),

    /**
     * Continue YAML format
     */
    continue: (env: EnvVars): ContinueServerConfig => ({
      name: "zai-vision",
      command: "npx",
      args: ["-y", "@z_ai/mcp-server"],
      env: getZaiVisionRuntimeEnv(env),
    }),
  },
};
