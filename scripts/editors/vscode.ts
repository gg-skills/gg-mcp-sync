/**
 * @fileoverview MCP editor adapter for VSCode (Native MCP); manages MCP server configuration for that VSCode extension.
 *
 * @testing Jest unit: npm test -- scripts/editors/vscode-extensions.unit.test.ts
 * @see scripts/editors/vscode-extensions.unit.test.ts - Jest suite that exercises the VSCode extension adapters.
 * @documentation reviewed=2026-04-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import {
  dirExists,
  fileExists,
  readFileSafe,
  resolvePath,
} from "../lib";
import type {
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
  path: ".vscode/mcp.json",
  key: "servers",
  format: "json",
};

// VSCode does not support global MCP config
const GLOBAL_CONFIG: ConfigLocation | null = null;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get the config directory path to check for installation.
 */
function getConfigDir(scope: "project" | "global"): string | null {
  if (scope === "project") {
    return resolvePath(".vscode");
  }
  // VSCode global config not supported
  return null;
}

/**
 * Parse servers from config file content.
 */
async function parseServersFromFile(filePath: string): Promise<Record<string, McpServerConfig>> {
  const readResult = await readFileSafe(filePath);
  if (!readResult.success) {
    return {};
  }

  const parseResult = parseJsonOrJsonc<Record<string, unknown>>(readResult.data);
  if (!parseResult.success) {
    return {};
  }

  const keyPath = getKeyPath("servers");
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

export const vscodeAdapter: EditorAdapter = {
  id: "vscode",
  name: "VSCode (Native MCP)",
  type: "vscode-ext",
  projectConfig: PROJECT_CONFIG,
  globalConfig: undefined,
  format: "servers",

  /**
   * Check if VSCode is installed by looking for the config directory.
   */
  async detectInstalled(): Promise<boolean> {
    // Check if project config directory exists
    const projectConfigDir = getConfigDir("project");
    // VSCode is generally installed system-wide; return true if project is detected
    return projectConfigDir !== null && dirExists(projectConfigDir);
  },

  /**
   * Read existing MCP config from the appropriate scope.
   */
  async readConfig(scope: "project" | "global"): Promise<McpConfigFile | null> {
    // VSCode does not support global config
    if (scope === "global") {
      return null;
    }

    const filePath = resolvePath(PROJECT_CONFIG.path);

    // Check if file exists
    if (!fileExists(filePath)) {
      return {
        path: filePath,
        format: PROJECT_CONFIG.format,
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
    const servers = await parseServersFromFile(filePath);

    return {
      path: filePath,
      format: PROJECT_CONFIG.format,
      rawContent,
      servers,
      exists: true,
    };
  },

  /**
   * Write MCP config using the writeConfig function.
   * VSCode only supports project-level config.
   */
  async writeConfig(
    scope: "project" | "global",
    servers: McpServerTemplate[],
    env: EnvVars,
    options?: { removeServerIds?: string[] }
  ): Promise<DryRunResult> {
    // VSCode does not support global config
    if (scope === "global") {
      return {
        success: false,
        targetPath: "",
        operation: "skip",
        currentContent: null,
        proposedContent: "",
        diff: "",
        errors: ["VSCode does not support global MCP configuration. Use project scope only."],
        warnings: [],
      };
    }

    const filePath = resolvePath(PROJECT_CONFIG.path);

    // Convert templates to server configs using vscode-specific format
    const serverConfigs: Record<string, McpServerConfig> = {};
    for (const template of servers) {
      // Use vscode config generator if available, otherwise fall back to standard
      const config = template.configs.vscode
        ? template.configs.vscode(env)
        : template.configs.standard(env);
      serverConfigs[template.id] = config;
    }

    // Write config with appropriate options
    const writeResult = await writeConfig(filePath, serverConfigs, PROJECT_CONFIG.key, PROJECT_CONFIG.format, {
      createIfMissing: true,
      createBackup: false,
      preserveExisting: true,
      removeServerIds: options?.removeServerIds,
    });

    return writeResult.dryRun;
  },
};
