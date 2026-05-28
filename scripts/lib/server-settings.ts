/**
 * @fileoverview Applies persisted MCP state server settings to editor-specific config generator outputs.
 *
 * Flow: persisted state server settings + server templates -> wrapped templates with editor-aware config overrides.
 *
 * @example
 * ```typescript
 * const wrapped = applyStateSettingsToServerTemplates(servers, {
 *   "serena-stdio": { startupTimeoutSeconds: 120 },
 * });
 * ```
 *
 * @testing Jest unit: npm test -- --runInBand scripts/lib/server-settings.unit.test.ts
 * @see scripts/lib/types.ts - Shared MCP config and state-setting types consumed here.
 * @see scripts/controllers/apply-controller.ts - Uses wrapped templates during apply flows.
 * @documentation reviewed=2026-05-12 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import type {
  CodexServerConfig,
  CrushHttpServerConfig,
  CrushStdioServerConfig,
  GooseExtensionConfig,
  McpServerSettings,
  McpServerTemplate,
  OpenCodeServerConfig,
  ServerConfigGenerators,
} from "./types";

/**
 * Merges persisted startup-timeout seconds into Codex MCP server config when valid.
 *
 * @remarks
 * Returns `config` unchanged unless `settings.startupTimeoutSeconds` is a number; otherwise spreads
 * `config` and sets Codex-specific `startup_timeout_sec`.
 *
 * @agent.internal
 */
function applySettingsToCodexConfig(
  config: CodexServerConfig,
  settings: McpServerSettings | undefined
): CodexServerConfig {
  if (typeof settings?.startupTimeoutSeconds !== "number") {
    return config;
  }

  return {
    ...config,
    startup_timeout_sec: settings.startupTimeoutSeconds,
  };
}

/**
 * Merges persisted startup-timeout seconds into OpenCode server config when valid.
 *
 * @remarks
 * OpenCode expects `timeout` in milliseconds; converts seconds with `* 1000`. Passthrough when
 * `startupTimeoutSeconds` is missing or not a number.
 *
 * @agent.internal
 */
function applySettingsToOpenCodeConfig(
  config: OpenCodeServerConfig,
  settings: McpServerSettings | undefined
): OpenCodeServerConfig {
  if (typeof settings?.startupTimeoutSeconds !== "number") {
    return config;
  }

  return {
    ...config,
    timeout: settings.startupTimeoutSeconds * 1000,
  };
}

/**
 * Merges persisted startup-timeout seconds into configs whose `timeout` field is stored in seconds.
 *
 * @remarks
 * Shared by Goose extension entries and Crush stdio/HTTP entries so both stay aligned with persisted
 * `startupTimeoutSeconds` without duplicating merge logic. Passthrough when the setting is missing
 * or not a number.
 *
 * @agent.internal
 */
function mergePersistedSecondsIntoConfigTimeoutField<T extends { timeout?: number }>(
  config: T,
  settings: McpServerSettings | undefined
): T {
  if (typeof settings?.startupTimeoutSeconds !== "number") {
    return config;
  }

  return {
    ...config,
    timeout: settings.startupTimeoutSeconds,
  };
}

/**
 * Merges persisted startup-timeout seconds into Goose extension config when valid.
 *
 * @remarks
 * Goose `timeout` uses the same second unit as persisted state; delegates to
 * `mergePersistedSecondsIntoConfigTimeoutField`.
 *
 * @agent.internal
 */
function applySettingsToGooseConfig(
  config: GooseExtensionConfig,
  settings: McpServerSettings | undefined
): GooseExtensionConfig {
  return mergePersistedSecondsIntoConfigTimeoutField(config, settings);
}

/**
 * Merges persisted startup-timeout seconds into Crush stdio or HTTP server config when valid.
 *
 * @remarks
 * Crush `timeout` is expressed in seconds. Accepts either stdio or HTTP config shapes; delegates to
 * `mergePersistedSecondsIntoConfigTimeoutField`.
 *
 * @agent.internal
 */
function applySettingsToCrushConfig(
  config: CrushStdioServerConfig | CrushHttpServerConfig,
  settings: McpServerSettings | undefined
): CrushStdioServerConfig | CrushHttpServerConfig {
  return mergePersistedSecondsIntoConfigTimeoutField(config, settings);
}

/**
 * Wraps editor config generators so emitted configs receive merged persisted state settings.
 *
 * @remarks
 * Preserves `undefined` for absent generator slots; only composes `codex`, `opencode`, `goose`, and
 * `crush` when present. Pure function—no I/O.
 *
 * @agent.internal
 */
function wrapServerConfigGenerators(
  generators: ServerConfigGenerators,
  settings: McpServerSettings | undefined
): ServerConfigGenerators {
  return {
    ...generators,
    codex: generators.codex
      ? (env) => applySettingsToCodexConfig(generators.codex!(env), settings)
      : undefined,
    opencode: generators.opencode
      ? (env) => applySettingsToOpenCodeConfig(generators.opencode!(env), settings)
      : undefined,
    goose: generators.goose
      ? (env) => applySettingsToGooseConfig(generators.goose!(env), settings)
      : undefined,
    crush: generators.crush
      ? (env) => applySettingsToCrushConfig(generators.crush!(env), settings)
      : undefined,
  };
}

/**
 * Wraps a single server template so editor-specific config generators receive persisted state settings.
 */
export function applyStateSettingsToServerTemplate(
  server: McpServerTemplate,
  serverSettings: Record<string, McpServerSettings>
): McpServerTemplate {
  const settings = serverSettings[server.id];
  if (!settings) {
    return server;
  }

  return {
    ...server,
    configs: wrapServerConfigGenerators(server.configs, settings),
  };
}

/**
 * Applies persisted state settings to every server template in the provided list.
 */
export function applyStateSettingsToServerTemplates(
  servers: McpServerTemplate[],
  serverSettings: Record<string, McpServerSettings> | undefined
): McpServerTemplate[] {
  if (!serverSettings || Object.keys(serverSettings).length === 0) {
    return servers;
  }

  return servers.map((server) => applyStateSettingsToServerTemplate(server, serverSettings));
}
