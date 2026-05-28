/**
 * @fileoverview MCP editor adapter for OpenCode CLI; manages MCP server configuration for that CLI tool.
 *
 * @testing Jest unit: npm test -- scripts/editors/cli-tools.unit.test.ts
 * @see scripts/editors/cli-tools.unit.test.ts - Jest suite that exercises the CLI editor adapters.
 * @documentation reviewed=2026-04-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { execSync } from "child_process";
import type {
  EditorAdapter,
  ConfigLocation,
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
// Configuration Locations
// =============================================================================

const PROJECT_CONFIG: ConfigLocation = {
  path: "opencode.json",
  key: "mcp-opencode",
  format: "json",
};

const GLOBAL_CONFIG: ConfigLocation = {
  path: "~/.config/opencode/opencode.json",
  key: "mcp-opencode",
  format: "json",
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Detect if OpenCode CLI is installed by checking for the opencode command.
 */
async function detectInstalled(): Promise<boolean> {
  try {
    execSync("which opencode", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse OpenCode config with the flat mcp format.
 *
 * OpenCode stores servers directly under mcp:
 * {
 *   "mcp": {
 *     "server-id": { "type": "local", "command": [...], ... }
 *   }
 * }
 *
 * The parser also accepts the legacy nested mcp.servers shape so existing
 * invalid files can be migrated on the next write instead of losing entries.
 */
async function parseOpenCodeConfig(filePath: string): Promise<McpConfigFile | null> {
  const resolved = resolvePath(filePath);

  // Check if file exists
  if (!fileExists(resolved)) {
    return {
      path: resolved,
      format: "json",
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
      format: "json",
      rawContent: "",
      servers: {},
      exists: true,
    };
  }

  const content = readResult.data;

  // Parse JSON content
  const parseResult = parseJsonOrJsonc<Record<string, unknown>>(content);
  if (!parseResult.success) {
    return {
      path: resolved,
      format: "json",
      rawContent: content,
      servers: {},
      exists: true,
    };
  }

  // Extract servers from flat mcp, falling back to legacy mcp.servers.
  const parsed = parseResult.data;
  let servers: Record<string, McpServerConfig> = {};
  const parsedMcp = parsed.mcp;

  if (parsedMcp && typeof parsedMcp === "object") {
    const flatServers = Object.fromEntries(
      Object.entries(parsedMcp as Record<string, unknown>).filter(([key, value]) => {
        if (key === "servers") {
          return false;
        }
        return value !== null && typeof value === "object";
      })
    ) as Record<string, McpServerConfig>;

    if (Object.keys(flatServers).length > 0) {
      servers = flatServers;
    } else {
      const legacyServers = (parsedMcp as Record<string, unknown>).servers;
      if (legacyServers && typeof legacyServers === "object") {
        servers = legacyServers as Record<string, McpServerConfig>;
      }
    }
  }

  return {
    path: resolved,
    format: "json",
    rawContent: content,
    servers,
    exists: true,
  };
}

// =============================================================================
// Editor Adapter Export
// =============================================================================

/**
 * EditorAdapter for OpenCode CLI
 *
 * Configuration Locations:
 * - Project: opencode.json (flat mcp format)
 * - Global: ~/.config/opencode/opencode.json (flat mcp format)
 */
export const opencodeCliAdapter: EditorAdapter = {
  id: "opencode-cli",
  name: "OpenCode CLI",
  type: "cli",
  format: "mcp-opencode",

  // Project-level config: opencode.json
  projectConfig: PROJECT_CONFIG,

  // Global config: ~/.config/opencode/opencode.json
  globalConfig: GLOBAL_CONFIG,

  // ==========================================================================
  // detectInstalled: Check if OpenCode CLI is installed
  // ==========================================================================
  detectInstalled,

  // ==========================================================================
  // readConfig: Read MCP configuration from file
  // ==========================================================================
  /**
   * Loads OpenCode CLI MCP server entries from project or global `opencode.json`.
   *
   * @remarks
   * `I/O:` Delegates to `parseOpenCodeConfig`, which tolerates missing files and parse failures by
   * returning structured empties. Accepts flat `mcp` entries and falls back to legacy nested
   * `mcp.servers` so the next write can migrate without losing data.
   * @param scope - Selects repo-root `opencode.json` vs the user config under `~/.config/opencode/`.
   */
  async readConfig(scope: "project" | "global"): Promise<McpConfigFile | null> {
    const configLoc = scope === "project" ? PROJECT_CONFIG : GLOBAL_CONFIG;
    return parseOpenCodeConfig(configLoc.path);
  },

  // ==========================================================================
  // writeConfig: Write MCP configuration to file
  // ==========================================================================
  /**
   * Persists MCP server templates into OpenCode JSON using merge-safe writes.
   *
   * @remarks
   * `I/O:` Delegates to `writeConfig` with preserve-existing merge, optional removals, and a backup
   * snapshot when writing the global file. Prefers `configs.opencode` when a template defines it,
   * otherwise materializes `configs.standard`.
   * @param scope - Target `opencode.json` (project vs global home config).
   * @param servers - Templates keyed by server id for the flat OpenCode `mcp` map.
   * @param env - Substitutions passed into each template's config factory.
   * @param options - Optional `removeServerIds` for dropping entries during the merge write.
   */
  async writeConfig(
    scope: "project" | "global",
    servers: McpServerTemplate[],
    env: EnvVars,
    options?: { removeServerIds?: string[] }
  ): Promise<DryRunResult> {
    const configLoc = scope === "project" ? PROJECT_CONFIG : GLOBAL_CONFIG;
    const resolved = resolvePath(configLoc.path);

    // Convert server templates to OpenCode config format
    const serverConfigs: Record<string, McpServerConfig> = {};
    for (const server of servers) {
      // Use opencode generator if available, fallback to standard
      const serverConfig = server.configs.opencode
        ? server.configs.opencode(env)
        : server.configs.standard(env);
      serverConfigs[server.id] = serverConfig;
    }

    // Write config (preserving existing servers)
    const writeResult = await writeConfig(
      resolved,
      serverConfigs,
      configLoc.key,
      configLoc.format,
      {
        createIfMissing: true,
        createBackup: scope === "global", // Backup for global config only
        preserveExisting: true,
        removeServerIds: options?.removeServerIds,
      }
    );

    return writeResult.dryRun;
  },
};
