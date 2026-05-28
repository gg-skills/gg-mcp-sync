/**
 * @fileoverview MCP editor adapter for Crush CLI; manages MCP server configuration for that CLI tool.
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
  CrushStdioServerConfig,
  CrushHttpServerConfig,
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
  path: ".crush.json",
  key: "mcp-crush",
  format: "json",
};

const GLOBAL_CONFIG: ConfigLocation = {
  path: "~/.config/crush/crush.json",
  key: "mcp-crush",
  format: "json",
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Detect if Crush CLI is installed by checking for the crush command.
 */
async function detectInstalled(): Promise<boolean> {
  try {
    execSync("which crush", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse Crush config with the flat mcp format.
 *
 * Crush stores servers directly under mcp:
 * {
 *   "mcp": {
 *     "server-id": { "type": "stdio", "command": [...], ... }
 *   }
 * }
 */
async function parseCrushConfig(filePath: string): Promise<McpConfigFile | null> {
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

  // Extract servers from mcp (flat structure)
  const parsed = parseResult.data;
  let servers: Record<string, McpServerConfig> = {};

  if (parsed.mcp && typeof parsed.mcp === "object") {
    servers = parsed.mcp as Record<string, McpServerConfig>;
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
 * EditorAdapter for Crush CLI
 *
 * Configuration Locations:
 * - Project: .crush.json (flat mcp format)
 * - Global: ~/.config/crush/crush.json (flat mcp format)
 *
 * Transport Support:
 * - stdio: Full support
 * - http: Full support
 * - sse: Full support
 */
export const crushCliAdapter: EditorAdapter = {
  id: "crush-cli",
  name: "Crush CLI",
  type: "cli",
  format: "mcp-crush",
  supportsHttp: false, // Use stdio only - HTTP transport has issues with some servers

  // Project-level config: .crush.json
  projectConfig: PROJECT_CONFIG,

  // Global config: ~/.config/crush/crush.json
  globalConfig: GLOBAL_CONFIG,

  // ==========================================================================
  // detectInstalled: Check if Crush CLI is installed
  // ==========================================================================
  detectInstalled,

  // ==========================================================================
  // readConfig: Read MCP configuration from file
  // ==========================================================================
  /**
   * Load Crush MCP server entries from the JSON path for the requested scope.
   *
   * @remarks
   * I/O: reads project `.crush.json` or the global Crush config and parses the flat `mcp` map.
   */
  async readConfig(scope: "project" | "global"): Promise<McpConfigFile | null> {
    const configLoc = scope === "project" ? PROJECT_CONFIG : GLOBAL_CONFIG;
    return parseCrushConfig(configLoc.path);
  },

  // ==========================================================================
  // writeConfig: Write MCP configuration to file
  // ==========================================================================
  /**
   * Persist merged MCP server templates into Crush JSON for the requested scope.
   *
   * @remarks
   * I/O: delegates to shared `writeConfig` with `preserveExisting`, optional removals, and a
   * backup only when writing the global config.
   */
  async writeConfig(
    scope: "project" | "global",
    servers: McpServerTemplate[],
    env: EnvVars,
    options?: { removeServerIds?: string[] }
  ): Promise<DryRunResult> {
    const configLoc = scope === "project" ? PROJECT_CONFIG : GLOBAL_CONFIG;
    const resolved = resolvePath(configLoc.path);

    // Convert server templates to Crush config format
    const serverConfigs: Record<string, McpServerConfig> = {};
    for (const server of servers) {
      // Use crush generator if available, fallback to standard with type field
      if (server.configs.crush) {
        serverConfigs[server.id] = server.configs.crush(env);
      } else if (server.transport === "stdio") {
        // Fallback: convert standard stdio config to Crush format
        const stdioConfig = server.configs.standard(env);
        serverConfigs[server.id] = {
          type: "stdio",
          ...stdioConfig,
          timeout: 120,
        } as CrushStdioServerConfig;
      } else {
        // Fallback: convert standard HTTP config to Crush format
        const httpConfig = server.configs.standard(env);
        if ("url" in httpConfig) {
          serverConfigs[server.id] = {
            type: "http",
            ...httpConfig,
            timeout: 120,
          } as CrushHttpServerConfig;
        }
      }
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
