/**
 * @fileoverview Factory IDE adapter for MCP editor configuration and file-based config synchronization.
 *
 * @example
 * ```typescript
 * import { factoryIdeAdapter } from "./factory-ide";
 * 
 * const installed = await factoryIdeAdapter.detectInstalled();
 * void installed;
 * ```
 *
 * @testing Jest unit: npm test -- scripts/editors/standalone-editors.unit.test.ts
 * @see scripts/editors/standalone-editors.unit.test.ts - Jest suite that exercises the Factory IDE adapter.
 * @documentation reviewed=2026-04-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

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
  dirExists,
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

const EDITOR_ID = "factory-ide";
const EDITOR_NAME = "Factory IDE";

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
// Factory IDE Adapter
// =============================================================================

export const factoryIdeAdapter: EditorAdapter = {
  id: EDITOR_ID,
  name: EDITOR_NAME,
  type: "standalone",
  projectConfig: PROJECT_CONFIG,
  globalConfig: GLOBAL_CONFIG,
  format: "mcpServers",

  /**
   * Detect if Factory IDE is installed.
   * Checks for the global config directory or application directory.
   */
  async detectInstalled(): Promise<boolean> {
    // Check for global config directory
    const globalConfigDir = resolvePath("~/.factory");
    if (dirExists(globalConfigDir)) {
      return true;
    }

    // Check for macOS application
    if (process.platform === "darwin") {
      const macOSApp = "/Applications/Factory.app";
      if (dirExists(macOSApp)) {
        return true;
      }
    }

    return false;
  },

  /**
   * Read MCP configuration from Factory IDE config file.
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
   * Write MCP configuration to Factory IDE config file.
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
