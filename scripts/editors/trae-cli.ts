/**
 * @fileoverview MCP editor adapter for Trae CLI; manages MCP server configuration for that CLI tool.
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
  McpServerTemplate,
  DryRunResult,
  EnvVars,
  McpServerConfig,
} from "../lib";
import {
  fileExists,
  readFileSafe,
  resolvePath,
  writeConfig,
} from "../lib";
import yaml from "js-yaml";

// =============================================================================
// Constants
// =============================================================================

const EDITOR_ID = "trae-cli";
const EDITOR_NAME = "Trae CLI";

const PROJECT_CONFIG: ConfigLocation = {
  path: "trae_config.yaml",
  key: "mcp_servers",
  format: "yaml",
};

const GLOBAL_CONFIG: ConfigLocation = {
  path: "~/trae_config.yaml",
  key: "mcp_servers",
  format: "yaml",
};

// =============================================================================
// YAML Parsing Utilities
// =============================================================================

/**
 * Parse YAML content safely.
 */
function parseYaml(content: string): Record<string, unknown> | null {
  try {
    const parsed = yaml.load(content);
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return null;
  }
}

// =============================================================================
// Trae CLI Adapter
// =============================================================================

export const traeCliAdapter: EditorAdapter = {
  id: EDITOR_ID,
  name: EDITOR_NAME,
  type: "cli",
  projectConfig: PROJECT_CONFIG,
  globalConfig: GLOBAL_CONFIG,
  format: "mcp_servers",

  /**
   * Detect if Trae CLI is installed.
   * Checks if 'trae' command is available in PATH.
   */
  async detectInstalled(): Promise<boolean> {
    try {
      execSync("which trae", { stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Read MCP configuration from Trae CLI config file.
   */
  async readConfig(scope: "project" | "global"): Promise<McpConfigFile | null> {
    const configLocation = scope === "project" ? PROJECT_CONFIG : GLOBAL_CONFIG;
    const configPath = resolvePath(configLocation.path);

    // Check if file exists
    if (!fileExists(configPath)) {
      return {
        path: configPath,
        format: configLocation.format,
        rawContent: "",
        servers: {},
        exists: false,
      };
    }

    // Read the file
    const readResult = await readFileSafe(configPath);
    if (!readResult.success) {
      return null;
    }

    const rawContent = readResult.data;

    // Parse YAML content
    const parsed = parseYaml(rawContent);
    if (parsed === null) {
      return null;
    }

    // Extract servers from mcp_servers key
    const servers: Record<string, McpServerConfig> = {};

    if (parsed.mcp_servers && typeof parsed.mcp_servers === "object") {
      const mcp_servers = parsed.mcp_servers as Record<string, unknown>;

      // Convert Trae format to standard format
      for (const [id, config] of Object.entries(mcp_servers)) {
        if (typeof config === "object" && config !== null) {
          const configObj = config as Record<string, unknown>;
          const standardConfig: McpServerConfig = {
            command: typeof configObj.command === "string" ? configObj.command : "",
            args: Array.isArray(configObj.args) ? (configObj.args as string[]) : undefined,
            env:
              typeof configObj.env === "object" && configObj.env !== null
                ? (configObj.env as Record<string, string>)
                : undefined,
          };
          servers[id] = standardConfig;
        }
      }
    }

    return {
      path: configPath,
      format: configLocation.format,
      rawContent,
      servers,
      exists: true,
    };
  },

  /**
   * Write MCP configuration to Trae CLI config file.
   * Creates a backup for global scope.
   */
  async writeConfig(
    scope: "project" | "global",
    servers: McpServerTemplate[],
    env: EnvVars
  ): Promise<DryRunResult> {
    const configLocation = scope === "project" ? PROJECT_CONFIG : GLOBAL_CONFIG;
    const configPath = resolvePath(configLocation.path);

    // Convert server templates to config format
    const serverConfigs: Record<string, McpServerConfig> = {};

    for (const server of servers) {
      // Use the standard config generator
      const config = server.configs.standard(env);
      serverConfigs[server.id] = config;
    }

    // Write the configuration
    const writeResult = await writeConfig(
      configPath,
      serverConfigs,
      configLocation.key,
      configLocation.format,
      {
        createIfMissing: true,
        createBackup: scope === "global", // Create backup for global scope
        preserveExisting: true, // Keep other servers already in the config
      }
    );

    return writeResult.dryRun;
  },
};
