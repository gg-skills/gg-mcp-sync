/**
 * @fileoverview MCP editor adapter for Verdent Deck; manages MCP server configuration for that standalone editor.
 *
 * @testing Jest unit: npm test -- scripts/editors/standalone-editors.unit.test.ts
 * @see scripts/editors/standalone-editors.unit.test.ts - Jest suite that exercises the standalone editor adapters.
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
  path: "~/.verdent-deck/mcp.json",
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
  return resolvePath("~/.verdent-deck");
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

export const verdentDeckAdapter: EditorAdapter = {
  id: "verdent-deck",
  name: "Verdent Deck",
  type: "standalone",
  projectConfig: undefined, // Standalone app, global only
  globalConfig: GLOBAL_CONFIG,
  format: "mcpServers",

  /**
   * Check if Verdent Deck is installed by looking for the config directory
   * or the application itself.
   */
  async detectInstalled(): Promise<boolean> {
    // Check if global config directory exists
    const globalConfigDir = getConfigDir();
    if (dirExists(globalConfigDir)) {
      return true;
    }

    // Check for macOS application
    if (process.platform === "darwin") {
      const macOSApp = "/Applications/Verdent Deck.app";
      if (dirExists(macOSApp)) {
        return true;
      }
    }

    return false;
  },

  /**
   * Read existing MCP config from global scope.
   * Verdent Deck only supports global configuration.
   */
  async readConfig(scope: "project" | "global"): Promise<McpConfigFile | null> {
    // Verdent Deck only supports global scope
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
   * Only supports global scope (Verdent Deck is a standalone app).
   */
  async writeConfig(
    scope: "project" | "global",
    servers: McpServerTemplate[],
    env: EnvVars
  ): Promise<DryRunResult> {
    // Verdent Deck only supports global scope
    if (scope === "project") {
      return {
        success: false,
        targetPath: "",
        operation: "skip",
        currentContent: null,
        proposedContent: "",
        diff: "",
        errors: ["Verdent Deck is a standalone application that only supports global configuration."],
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
