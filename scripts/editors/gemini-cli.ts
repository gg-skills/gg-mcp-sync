/**
 * @fileoverview MCP editor adapter for Gemini CLI; manages MCP server configuration for that CLI tool.
 *
 * @testing Jest unit: npm test -- scripts/editors/cli-tools.unit.test.ts
 * @see scripts/editors/cli-tools.unit.test.ts - Jest suite that exercises the CLI editor adapters.
 * @documentation reviewed=2026-04-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { execSync } from "child_process";
import type {
  EditorAdapter,
  McpConfigFile,
  McpServerConfig,
  McpServerTemplate,
  DryRunResult,
  EnvVars,
} from "../lib";
import {
  resolvePath,
  fileExists,
  readFileSafe,
  writeConfig,
  parseJsonOrJsonc,
} from "../lib";

// =============================================================================
// Gemini CLI Adapter
// =============================================================================

/**
 * EditorAdapter for Gemini CLI
 *
 * Configuration Locations:
 * - Project: .gemini/settings.json (mcpServers format)
 * - Global: ~/.gemini/settings.json (mcpServers format)
 */
export const geminiCliAdapter: EditorAdapter = {
  id: "gemini-cli",
  name: "Gemini CLI",
  type: "cli",
  supportsHttp: false,
  format: "mcpServers",

  // Project-level config: .gemini/settings.json
  projectConfig: {
    path: ".gemini/settings.json",
    key: "mcpServers",
    format: "json",
  },

  // Global config: ~/.gemini/settings.json
  globalConfig: {
    path: "~/.gemini/settings.json",
    key: "mcpServers",
    format: "json",
  },

  // ==========================================================================
  // detectInstalled: Check if Gemini CLI is installed
  // ==========================================================================
  /**
   * Probes the host for a working Gemini CLI install via version subprocess checks.
   *
   * @remarks
   * `I/O:` Runs `gcloud ai gen ai --version`, then falls back to `gemini --version`.
   * Either succeeding implies the CLI is available for MCP wiring.
   */
  async detectInstalled(): Promise<boolean> {
    try {
      execSync("gcloud ai gen ai --version", { stdio: "pipe" });
      return true;
    } catch {
      try {
        execSync("gemini --version", { stdio: "pipe" });
        return true;
      } catch {
        return false;
      }
    }
  },

  // ==========================================================================
  // readConfig: Read MCP configuration from file
  // ==========================================================================
  /**
   * Loads Gemini CLI MCP server entries from project or global settings JSON.
   *
   * @remarks
   * `I/O:` Reads `projectConfig` or `globalConfig` paths after `resolvePath`; tolerates
   * missing files and parse failures by returning structured empties instead of throwing.
   * @param scope - Selects `.gemini/settings.json` under the repo vs the user home copy.
   */
  async readConfig(scope: "project" | "global"): Promise<McpConfigFile | null> {
    const config = scope === "project" ? this.projectConfig : this.globalConfig;

    if (!config) {
      return null;
    }

    const resolved = resolvePath(config.path);

    // Check if file exists
    if (!fileExists(resolved)) {
      return {
        path: resolved,
        format: config.format,
        rawContent: "",
        servers: {},
        exists: false,
      };
    }

    // Read file content
    const readResult = await readFileSafe(resolved);
    if (!readResult.success) {
      return {
        path: resolved,
        format: config.format,
        rawContent: "",
        servers: {},
        exists: true,
      };
    }

    const rawContent = readResult.data;

    // Parse JSON content
    const parseResult = parseJsonOrJsonc<Record<string, unknown>>(rawContent);
    if (!parseResult.success) {
      return {
        path: resolved,
        format: config.format,
        rawContent,
        servers: {},
        exists: true,
      };
    }

    // Extract mcpServers key
    const parsed = parseResult.data;
    let servers: Record<string, McpServerConfig> = {};

    if (parsed.mcpServers && typeof parsed.mcpServers === "object") {
      servers = parsed.mcpServers as Record<string, McpServerConfig>;
    }

    return {
      path: resolved,
      format: config.format,
      rawContent,
      servers,
      exists: true,
    };
  },

  // ==========================================================================
  // writeConfig: Write MCP configuration to file
  // ==========================================================================
  /**
   * Persists stdio MCP server templates into Gemini CLI settings with merge semantics.
   *
   * @remarks
   * `I/O:` Delegates to `writeConfig` with preserve-existing merge and optional removals.
   * HTTP transports are skipped with warnings because this CLI supports stdio only.
   * @param scope - Target settings file (project vs global home).
   * @param servers - Templates to materialize under `mcpServers`.
   * @param env - Substitutions passed into each template's `configs.standard`.
   */
  async writeConfig(
    scope: "project" | "global",
    servers: McpServerTemplate[],
    env: EnvVars,
    options?: { removeServerIds?: string[] }
  ): Promise<DryRunResult> {
    const config = scope === "project" ? this.projectConfig : this.globalConfig;

    if (!config) {
      return {
        success: false,
        targetPath: "",
        operation: "skip",
        currentContent: null,
        proposedContent: "",
        diff: "",
        errors: ["Configuration not available for this scope"],
        warnings: [],
      };
    }

    const resolved = resolvePath(config.path);

    // Filter to stdio servers only - Gemini CLI doesn't support HTTP transport
    const stdioServers = servers.filter((s) => s.transport === "stdio");
    const skippedServers = servers.filter((s) => s.transport !== "stdio");

    // Convert server templates to standard config format
    const serverConfigs: Record<string, McpServerConfig> = {};
    for (const server of stdioServers) {
      const serverConfig = server.configs.standard(env);
      serverConfigs[server.id] = serverConfig;
    }

    // Write config (preserving existing servers)
    const writeResult = await writeConfig(
      resolved,
      serverConfigs,
      config.key,
      config.format,
      {
        createIfMissing: true,
        createBackup: scope === "global",
        preserveExisting: true,
        removeServerIds: options?.removeServerIds,
      }
    );

    // Add warning about skipped HTTP servers
    if (skippedServers.length > 0) {
      writeResult.dryRun.warnings.push(
        `Skipped ${skippedServers.length} HTTP server(s) (Gemini CLI supports stdio only).`
      );
    }

    return writeResult.dryRun;
  },
};
