/**
 * @fileoverview Defines the MCP server template for Chrome DevTools MCP.
 *
 * Flow: server definition -> registry entry -> editor-specific config generation.
 *
 * @example
 * ```typescript
 * const server = chromeDevtoolsStdio;
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
  CrushStdioServerConfig,
  EnvVars,
} from "../lib/types";

const CHROME_DEVTOOLS_MCP_PACKAGE = "chrome-devtools-mcp@0.21.0" as const;
const CHROME_DEVTOOLS_MCP_BASE_ARGS = ["-y", CHROME_DEVTOOLS_MCP_PACKAGE] as const;

/**
 * Derives upstream chrome-devtools-mcp policy env from platform opt-out toggles.
 *
 * @remarks
 * PURITY: Pure; emits env keys only when a toggle is `"0"` (explicit opt-out from usage stats or
 * update checks).
 *
 * @param env - Materialized MCP env vars; `"0"` on `MCP_CHROME_DEVTOOLS_*` disables the matching
 * upstream behavior.
 * @returns Child-process env overrides, or `undefined` when nothing is opted out.
 */
function getChromeDevtoolsPolicyEnv(env: EnvVars): Record<string, string> | undefined {
  const policyEnv: Record<string, string> = {};

  if (env.MCP_CHROME_DEVTOOLS_ENABLE_USAGE_STATISTICS === "0") {
    policyEnv.CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS = "1";
  }

  if (env.MCP_CHROME_DEVTOOLS_ENABLE_UPDATE_CHECKS === "0") {
    policyEnv.CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS = "1";
  }

  return Object.keys(policyEnv).length > 0 ? policyEnv : undefined;
}

/**
 * Returns the pinned `npx` argv tail for launching chrome-devtools-mcp.
 *
 * @remarks
 * USAGE: Combine with `"npx"` as the command for transports that separate command and args.
 *
 * @returns Args array including `-y` and the semver-pinned package spec.
 */
function getChromeDevtoolsArgs(): string[] {
  return [...CHROME_DEVTOOLS_MCP_BASE_ARGS];
}

/**
 * Builds stdio-shaped `args` plus optional upstream policy `env`.
 *
 * @remarks
 * Omits `env` when policy-derived overrides are empty so emitted configs stay minimal.
 *
 * @param env - Source env used to derive optional chrome-devtools-mcp policy overrides.
 * @returns Partial stdio template with args and optionally env side-by-side with `command: "npx"`.
 */
function buildStandardConfig(env: EnvVars): Pick<StdioServerConfig, "args" | "env"> {
  const policyEnv = getChromeDevtoolsPolicyEnv(env);

  return policyEnv
    ? { args: getChromeDevtoolsArgs(), env: policyEnv }
    : { args: getChromeDevtoolsArgs() };
}

/**
 * Builds OpenCode-local transport fields (`command` argv and optional `environment`).
 *
 * @remarks
 * OpenCode nests `npx` in `command` and names env `environment`; stdio presets use separate
 * `command` plus `args` instead.
 *
 * @param env - Same policy inputs as stdio presets; forwarded for policy-env resolution.
 * @returns Partial OpenCode template without the `type: "local"` discriminator.
 */
function buildOpenCodeConfig(
  env: EnvVars
): Pick<OpenCodeServerConfig, "command" | "environment"> {
  const policyEnv = getChromeDevtoolsPolicyEnv(env);

  return policyEnv
    ? {
        command: ["npx", ...CHROME_DEVTOOLS_MCP_BASE_ARGS],
        environment: policyEnv,
      }
    : {
        command: ["npx", ...CHROME_DEVTOOLS_MCP_BASE_ARGS],
      };
}

export const chromeDevtoolsStdio: McpServerTemplate = {
  id: "chrome-devtools-stdio",
  name: "Chrome DevTools",
  transport: "stdio",
  package: CHROME_DEVTOOLS_MCP_PACKAGE,
  envVars: [
    "MCP_CHROME_DEVTOOLS_ENABLE_USAGE_STATISTICS",
    "MCP_CHROME_DEVTOOLS_ENABLE_UPDATE_CHECKS",
  ],
  configs: {
    standard: (env: EnvVars): StdioServerConfig => ({
      command: "npx",
      ...buildStandardConfig(env),
    }),

    vscode: (env: EnvVars): VscodeServerConfig => ({
      type: "stdio",
      command: "npx",
      ...buildStandardConfig(env),
    }),

    opencode: (env: EnvVars): OpenCodeServerConfig => ({
      type: "local",
      ...buildOpenCodeConfig(env),
    }),

    zed: (env: EnvVars): ZedServerConfig => ({
      command: "npx",
      ...buildStandardConfig(env),
    }),

    goose: (env: EnvVars): GooseExtensionConfig => ({
      name: "chrome-devtools",
      command: "npx",
      ...buildStandardConfig(env),
    }),

    codex: (env: EnvVars): CodexServerConfig => ({
      command: "npx",
      ...buildStandardConfig(env),
    }),

    continue: (env: EnvVars): ContinueServerConfig => ({
      name: "chrome-devtools",
      command: "npx",
      ...buildStandardConfig(env),
    }),

    crush: (env: EnvVars): CrushStdioServerConfig => ({
      type: "stdio",
      command: "npx",
      ...buildStandardConfig(env),
      timeout: 120,
    }),
  },
};

export default chromeDevtoolsStdio;
