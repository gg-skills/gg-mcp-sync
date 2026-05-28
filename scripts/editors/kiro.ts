/**
 * @fileoverview MCP editor adapter for Kiro; manages MCP server configuration for that standalone editor.
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

const PROJECT_CONFIG: ConfigLocation = {
  path: ".kiro/settings/mcp.json",
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
  return resolvePath(".kiro");
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

export const kiroAdapter: EditorAdapter = {
  id: "kiro",
  name: "Kiro (AWS)",
  type: "standalone",
  projectConfig: PROJECT_CONFIG,
  globalConfig: undefined,
  format: "mcpServers",

  /**
   * Check if Kiro is installed by looking for the config directory.
   */
  async detectInstalled(): Promise<boolean> {
    const configDir = getConfigDir();
    return dirExists(configDir);
  },

  /**
   * Read existing MCP config from the project scope.
   * Kiro only supports project-level configuration.
   */
  async readConfig(scope: "project" | "global"): Promise<McpConfigFile | null> {
    // Kiro only supports project scope
    if (scope === "global") {
      return null;
    }

    const config = PROJECT_CONFIG;
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
   * Kiro only supports project scope; no backups are created.
   */
  async writeConfig(
    scope: "project" | "global",
    servers: McpServerTemplate[],
    env: EnvVars,
    options?: { removeServerIds?: string[] }
  ): Promise<DryRunResult> {
    // Kiro only supports project scope
    if (scope === "global") {
      return {
        success: false,
        targetPath: "",
        operation: "skip",
        currentContent: null,
        proposedContent: "",
        diff: "",
        errors: ["Kiro does not support global configuration"],
        warnings: [],
      };
    }

    const config = PROJECT_CONFIG;
    const filePath = resolvePath(config.path);

    // Convert templates to server configs
    const serverConfigs: Record<string, McpServerConfig> = {};
    for (const template of servers) {
      const config = template.configs.standard(env);
      serverConfigs[template.id] = config;
    }

    // Write config (no backup for Kiro)
    const writeResult = await writeConfig(
      filePath,
      serverConfigs,
      config.key,
      config.format,
      {
        createIfMissing: true,
        createBackup: false, // No backups for Kiro
        preserveExisting: true,
        removeServerIds: options?.removeServerIds,
      }
    );

    return writeResult.dryRun;
  },
};
