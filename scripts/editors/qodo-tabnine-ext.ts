/**
 * @fileoverview MCP editor adapter for Qodo/Tabnine; manages MCP server configuration for that VSCode extension.
 *
 * @testing Jest unit: npm test -- scripts/editors/vscode-extensions.unit.test.ts
 * @see scripts/editors/vscode-extensions.unit.test.ts - Jest suite that exercises the VSCode extension adapters.
 * @documentation reviewed=2026-04-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { fileExists, readFileSafe, resolvePath } from "../lib";
import type {
  ConfigKeyFormat,
  ConfigLocation,
  DryRunResult,
  EditorAdapter,
  EnvVars,
  McpConfigFile,
  McpServerConfig,
  McpServerTemplate,
} from "../lib";
import { writeConfig, getKeyPath } from "../lib/config-writer";
import { parseJsonOrJsonc } from "../lib/jsonc";

// =============================================================================
// Configuration Locations
// =============================================================================

const PROJECT_CONFIG: ConfigLocation = {
  path: ".tabnine/mcp_servers.json",
  key: "mcpServers",
  format: "json",
};

const GLOBAL_CONFIG: ConfigLocation = {
  path: "~/.tabnine/mcp_servers.json",
  key: "mcpServers",
  format: "json",
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Parse servers from config file content.
 */
async function parseServersFromFile(
  filePath: string,
  keyFormat: ConfigKeyFormat
): Promise<Record<string, McpServerConfig>> {
  const readResult = await readFileSafe(filePath);
  if (!readResult.success) {
    return {};
  }

  const parseResult = parseJsonOrJsonc<Record<string, unknown>>(readResult.data);
  if (!parseResult.success) {
    return {};
  }

  const keyPath = getKeyPath(keyFormat);
  let current: unknown = parseResult.data;

  for (const key of keyPath) {
    if (current && typeof current === "object") {
      current = (current as Record<string, unknown>)[key];
    }
  }

  if (current && typeof current === "object") {
    return current as Record<string, McpServerConfig>;
  }

  return {};
}

// =============================================================================
// Adapter Implementation
// =============================================================================

export const qodoTabnineExtAdapter: EditorAdapter = {
  id: "qodo-tabnine-ext",
  name: "Qodo Gen / Tabnine",
  type: "vscode-ext",
  projectConfig: PROJECT_CONFIG,
  globalConfig: GLOBAL_CONFIG,
  format: "mcpServers",

  /**
   * Detect if Qodo Gen / Tabnine VSCode extension is installed.
   * Checks if the global config directory exists.
   */
  async detectInstalled(): Promise<boolean> {
    const globalConfigPath = resolvePath(GLOBAL_CONFIG.path);
    const globalConfigDir = globalConfigPath.substring(
      0,
      globalConfigPath.lastIndexOf("/")
    );
    return fileExists(globalConfigDir);
  },

  /**
   * Read existing MCP config from the appropriate scope.
   *
   * Supports both project and global scopes. Project scope is relative to
   * the current working directory; global scope is in the user's home directory.
   */
  async readConfig(scope: "project" | "global"): Promise<McpConfigFile | null> {
    const configLocation = scope === "project" ? PROJECT_CONFIG : GLOBAL_CONFIG;
    const filePath = resolvePath(configLocation.path);

    // Check if file exists
    if (!fileExists(filePath)) {
      return {
        path: filePath,
        format: configLocation.format,
        rawContent: "",
        servers: {},
        exists: false,
      };
    }

    // Read file content
    const readResult = await readFileSafe(filePath);
    if (!readResult.success) {
      return null;
    }

    const rawContent = readResult.data;

    // Parse servers
    const servers = await parseServersFromFile(filePath, configLocation.key);

    return {
      path: filePath,
      format: configLocation.format,
      rawContent,
      servers,
      exists: true,
    };
  },

  /**
   * Write MCP config using the writeConfig function.
   * Creates backups for global config.
   *
   * Supports both project and global scopes.
   */
  async writeConfig(
    scope: "project" | "global",
    servers: McpServerTemplate[],
    env: EnvVars,
    options?: { removeServerIds?: string[] }
  ): Promise<DryRunResult> {
    const configLocation = scope === "project" ? PROJECT_CONFIG : GLOBAL_CONFIG;
    const filePath = resolvePath(configLocation.path);

    // Convert templates to server configs
    const serverConfigs: Record<string, McpServerConfig> = {};
    for (const template of servers) {
      const config = template.configs.standard(env);
      serverConfigs[template.id] = config;
    }

    // Write config with appropriate options
    const writeResult = await writeConfig(
      filePath,
      serverConfigs,
      configLocation.key,
      configLocation.format,
      {
        createIfMissing: true,
        createBackup: scope === "global", // Create backup for global scope only
        preserveExisting: true, // Keep other servers already in the config
        removeServerIds: options?.removeServerIds,
      }
    );

    return writeResult.dryRun;
  },
};
