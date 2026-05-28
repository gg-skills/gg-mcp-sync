/**
 * @fileoverview MCP editor adapter for Trae; manages MCP server configuration for that VSCode extension.
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

const GLOBAL_CONFIG: ConfigLocation = {
  path: "~/.trae/mcp.json",
  key: "mcpServers",
  format: "json",
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get the config directory path to check for installation.
 */
function getConfigDir(): string {
  return resolvePath("~/.trae");
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

export const traeExtAdapter: EditorAdapter = {
  id: "trae-ext",
  name: "Trae (VSCode Ext)",
  type: "vscode-ext",
  projectConfig: undefined,
  globalConfig: GLOBAL_CONFIG,
  format: "mcpServers",

  /**
   * Check if Trae is installed by looking for the config directory.
   */
  async detectInstalled(): Promise<boolean> {
    // Check if global config directory exists
    const globalConfigDir = getConfigDir();
    return dirExists(globalConfigDir);
  },

  /**
   * Read existing MCP config from global scope.
   * Trae only supports global configuration.
   */
  async readConfig(scope: "project" | "global"): Promise<McpConfigFile | null> {
    // Trae only supports global scope
    if (scope === "project") {
      return {
        path: "",
        format: GLOBAL_CONFIG.format,
        rawContent: "",
        servers: {},
        exists: false,
      };
    }

    const filePath = resolvePath(GLOBAL_CONFIG.path);

    // Check if file exists
    if (!fileExists(filePath)) {
      return {
        path: filePath,
        format: GLOBAL_CONFIG.format,
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
    const servers = await parseServersFromFile(filePath, GLOBAL_CONFIG.key);

    return {
      path: filePath,
      format: GLOBAL_CONFIG.format,
      rawContent,
      servers,
      exists: true,
    };
  },

  /**
   * Write MCP config using the writeConfig function.
   * Creates backups for global config.
   * Only supports global scope (Trae only supports global configuration).
   */
  async writeConfig(
    scope: "project" | "global",
    servers: McpServerTemplate[],
    env: EnvVars
  ): Promise<DryRunResult> {
    // Trae only supports global scope
    if (scope === "project") {
      return {
        success: false,
        targetPath: "",
        operation: "skip",
        currentContent: null,
        proposedContent: "",
        diff: "",
        errors: ["Project-level configuration is not supported for Trae VSCode Extension. Only global scope is supported."],
        warnings: [],
      };
    }

    const filePath = resolvePath(GLOBAL_CONFIG.path);

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
      GLOBAL_CONFIG.key,
      GLOBAL_CONFIG.format,
      {
        createIfMissing: true,
        createBackup: true, // Always create backups for global scope
        preserveExisting: true,
      }
    );

    return writeResult.dryRun;
  },
};
