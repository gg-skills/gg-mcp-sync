/**
 * @fileoverview Factory CLI adapter for MCP editor configuration and file-based config synchronization.
 *
 * @example
 * ```typescript
 * import { factoryCliAdapter } from "./factory-cli";
 * 
 * const installed = await factoryCliAdapter.detectInstalled();
 * void installed;
 * ```
 *
 * @testing Jest unit: npm test -- scripts/editors/cli-tools.unit.test.ts scripts/editors/vscode-extensions.unit.test.ts scripts/editors/standalone-editors.unit.test.ts
 * @see scripts/editors/cli-tools.unit.test.ts - Jest suite that exercises the Factory CLI adapter.
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
  toDisplayPath,
  parseJsonOrJsonc,
  writeConfig,
} from "../lib";

// =============================================================================
// Constants
// =============================================================================

const EDITOR_ID = "factory-cli";
const EDITOR_NAME = "Factory CLI";

const PROJECT_CONFIG: ConfigLocation = {
  path: ".factory/mcp.json",
  key: "mcpServers",
  format: "json",
};

const GLOBAL_CONFIG: ConfigLocation = {
  path: "~/.factory/mcp.json",
  key: "mcpServers",
  format: "json",
};

// =============================================================================
// Factory CLI Adapter
// =============================================================================

export const factoryCliAdapter: EditorAdapter = {
  id: EDITOR_ID,
  name: EDITOR_NAME,
  type: "cli",
  projectConfig: PROJECT_CONFIG,
  globalConfig: GLOBAL_CONFIG,
  format: "mcpServers",

  /**
   * Detect if Factory CLI is installed.
   * Checks if 'factory' command is available in PATH.
   */
  async detectInstalled(): Promise<boolean> {
    try {
      // Try to execute 'factory --version'
      execSync("factory --version", { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Read MCP configuration from Factory CLI config file.
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
    if (readResult.success === false) {
      console.error(`Failed to read ${EDITOR_NAME} config: ${readResult.error}`);
      return null;
    }

    const rawContent = readResult.data;

    // Parse JSON content
    const parseResult = parseJsonOrJsonc<Record<string, unknown>>(rawContent);
    if (!parseResult.success) {
      console.error(
        `Failed to parse ${EDITOR_NAME} config at ${toDisplayPath(configPath)}`
      );
      return null;
    }

    // Extract servers from mcpServers key
    const parsedData = parseResult.data;
    const servers: Record<string, McpServerConfig> = {};

    if (parsedData && typeof parsedData === "object") {
      const mcpServers = (parsedData as Record<string, unknown>).mcpServers;
      if (mcpServers && typeof mcpServers === "object") {
        Object.assign(servers, mcpServers);
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
   * Write MCP configuration to Factory CLI config file.
   * Creates a backup for global scope.
   */
  async writeConfig(
    scope: "project" | "global",
    servers: McpServerTemplate[],
    env: EnvVars,
    options?: { removeServerIds?: string[] }
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
        removeServerIds: options?.removeServerIds,
      }
    );

    return writeResult.dryRun;
  },
};
