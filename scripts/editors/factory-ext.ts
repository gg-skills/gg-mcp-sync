/**
 * @fileoverview Factory Droid adapter for MCP editor configuration and file-based config synchronization.
 *
 * @example
 * ```typescript
 * import { factoryExtAdapter } from "./factory-ext";
 * 
 * const installed = await factoryExtAdapter.detectInstalled();
 * void installed;
 * ```
 *
 * @testing Jest unit: npm test -- scripts/editors/vscode-extensions.unit.test.ts
 * @see scripts/editors/vscode-extensions.unit.test.ts - Jest suite that exercises the Factory Droid VSCode extension adapter.
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

const EDITOR_ID = "factory-ext";
const EDITOR_NAME = "Factory Droid (VSCode Ext)";

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
// Factory Droid VSCode Extension Adapter
// =============================================================================

export const factoryExtAdapter: EditorAdapter = {
  id: EDITOR_ID,
  name: EDITOR_NAME,
  type: "vscode-ext",
  projectConfig: PROJECT_CONFIG,
  globalConfig: GLOBAL_CONFIG,
  format: "mcpServers",

  /**
   * Detect if Factory Droid VSCode extension is installed.
   * Checks if VSCode is installed and Factory extension is available.
   */
  async detectInstalled(): Promise<boolean> {
    try {
      // Try to find VSCode executable
      execSync("which code", { stdio: "pipe" });

      // Check for Factory extension in common VSCode extension directories
      if (process.platform === "darwin" || process.platform === "linux") {
        // macOS / Linux: ~/.vscode/extensions
        const vscodeExtDir = resolvePath("~/.vscode/extensions");
        if (!fileExists(vscodeExtDir)) {
          return false;
        }

        // Check if Factory extension is installed (look for factory-related extensions)
        try {
          const output = execSync(
            `ls -1 "${vscodeExtDir}" 2>/dev/null | grep -i factory || true`,
            { encoding: "utf-8" }
          );
          return output.trim().length > 0;
        } catch (error) {
          console.error(`Failed to detect ${EDITOR_NAME} extension:`, error);
          return false;
        }
      } else if (process.platform === "win32") {
        // Windows: AppData/Code/User/extensions
        const appData = process.env.APPDATA;
        if (!appData) {
          return false;
        }

        const vscodeExtDir = `${appData}\\Code\\User\\extensions`;
        if (!fileExists(vscodeExtDir)) {
          return false;
        }

        try {
          const output = execSync(
            `dir "${vscodeExtDir}" 2>nul | findstr /i factory || exit /b 1`,
            { encoding: "utf-8" }
          );
          return output.trim().length > 0;
        } catch (error) {
          console.error(`Failed to detect ${EDITOR_NAME} extension on Windows:`, error);
          return false;
        }
      }

      return false;
    } catch (error) {
      console.error(`VSCode not found (${EDITOR_NAME} detection):`, error);
      return false;
    }
  },

  /**
   * Read MCP configuration from Factory Droid config file.
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
   * Write MCP configuration to Factory Droid config file.
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
