/**
 * @fileoverview MCP editor adapter for Cursor; manages MCP server configuration for that VSCode extension.
 *
 * @testing Jest unit: npm test -- scripts/editors/vscode-extensions.unit.test.ts
 * @see scripts/editors/vscode-extensions.unit.test.ts - Jest suite that exercises the VSCode extension adapters.
 * @documentation reviewed=2026-04-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { dirExists, fileExists, readFileSafe, resolvePath } from "../lib";
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
  path: ".cursor/mcp.json",
  key: "mcpServers",
  format: "json",
};

const GLOBAL_CONFIG: ConfigLocation = {
  path: "~/.cursor/mcp.json",
  key: "mcpServers",
  format: "json",
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get config directory path for the given scope.
 */
function getConfigLocation(scope: "project" | "global"): ConfigLocation {
  return scope === "project" ? PROJECT_CONFIG : GLOBAL_CONFIG;
}

/**
 * Get the config directory path to check for installation.
 */
function getConfigDir(scope: "project" | "global"): string {
  if (scope === "project") {
    return resolvePath(".cursor");
  }
  return resolvePath("~/.cursor");
}

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

export const cursorAdapter: EditorAdapter = {
  id: "cursor",
  name: "Cursor",
  type: "vscode-ext",
  projectConfig: PROJECT_CONFIG,
  globalConfig: GLOBAL_CONFIG,
  format: "mcpServers",

  /**
   * Check if Cursor is installed by looking for the config directory.
   */
  async detectInstalled(): Promise<boolean> {
    // Check if global config directory exists
    const globalConfigDir = getConfigDir("global");
    return dirExists(globalConfigDir);
  },

  /**
   * Read existing MCP config from the appropriate scope.
   */
  async readConfig(scope: "project" | "global"): Promise<McpConfigFile | null> {
    const config = getConfigLocation(scope);
    const filePath = resolvePath(config.path);

    // Check if file exists
    if (!fileExists(filePath)) {
      return {
        path: filePath,
        format: config.format,
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
    const servers = await parseServersFromFile(filePath, config.key);

    return {
      path: filePath,
      format: config.format,
      rawContent,
      servers,
      exists: true,
    };
  },

  /**
   * Write MCP config using the writeConfig function.
   * Creates backups for global scope.
   */
  async writeConfig(
    scope: "project" | "global",
    servers: McpServerTemplate[],
    env: EnvVars,
    options?: { removeServerIds?: string[] }
  ): Promise<DryRunResult> {
    const config = getConfigLocation(scope);
    const filePath = resolvePath(config.path);

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
      config.key,
      config.format,
      {
        createIfMissing: true,
        createBackup: scope === "global", // Create backups for global scope
        preserveExisting: true,
        removeServerIds: options?.removeServerIds,
      }
    );

    return writeResult.dryRun;
  },
};
