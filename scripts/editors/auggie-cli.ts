/**
 * @fileoverview MCP editor adapter for Auggie CLI; manages MCP server configuration for that CLI tool.
 *
 * @testing Jest unit: npm test -- scripts/editors/cli-tools.unit.test.ts
 * @see scripts/editors/cli-tools.unit.test.ts - Jest suite that exercises the CLI editor adapters.
 * @documentation reviewed=2026-05-09 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { copyFile, mkdir, writeFile } from "fs/promises";
import { constants as fsConstants } from "fs";
import path from "path";
import type {
  EditorAdapter,
  McpConfigFile,
  DryRunResult,
  McpServerTemplate,
  EnvVars,
} from "../lib";
import {
  resolvePath,
  readFileSafe,
  parseJsonOrJsonc,
  dryRunWrite,
} from "../lib";

// =============================================================================
// Types
// =============================================================================

const execFileAsync = promisify(execFile);

// =============================================================================
// Auggie CLI Adapter
// =============================================================================

export const auggieCliAdapter: EditorAdapter = {
  id: "auggie-cli",
  name: "Auggie CLI",
  type: "cli",
  format: "mcpServers",

  // Global config only - no project config
  globalConfig: {
    path: "~/.auggie/mcp_settings.json",
    key: "mcpServers",
    format: "json",
  },

  /**
   * Detect if Auggie CLI is installed.
   * Checks if 'auggie' command is available.
   */
  async detectInstalled(): Promise<boolean> {
    try {
      await execFileAsync("auggie", ["--version"]);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Read MCP configuration from global config file.
   * Project config not supported.
   */
  async readConfig(scope: "project" | "global"): Promise<McpConfigFile | null> {
    if (scope === "project") {
      // Project config not supported for Auggie CLI
      return null;
    }

    const configPath = resolvePath(auggieCliAdapter.globalConfig!.path);
    const readResult = await readFileSafe(configPath);

    if (!readResult.success) {
      // File doesn't exist yet - that's OK, return null
      return null;
    }

    // Parse the JSON content
    const parseResult = parseJsonOrJsonc(readResult.data);
    if (!parseResult.success) {
      return {
        path: configPath,
        format: "json",
        rawContent: readResult.data,
        servers: {},
        exists: true,
      };
    }

    // Extract servers from the mcpServers key
    const mcpServersObj = parseResult.data as Record<string, unknown>;
    const servers = (mcpServersObj.mcpServers ?? {}) as Record<string, unknown>;

    return {
      path: configPath,
      format: "json",
      rawContent: readResult.data,
      servers: servers as Record<string, any>,
      exists: true,
    };
  },

  /**
   * Write MCP configuration with dry-run validation and backup.
   * Only supports global config.
   */
  async writeConfig(
    scope: "project" | "global",
    servers: McpServerTemplate[],
    env: EnvVars
  ): Promise<DryRunResult> {
    if (scope === "project") {
      // Project config not supported
      return {
        success: false,
        targetPath: "",
        operation: "skip",
        currentContent: null,
        proposedContent: "",
        diff: "",
        errors: ["Auggie CLI does not support project-level configuration"],
        warnings: [],
      };
    }

    const configPath = resolvePath(auggieCliAdapter.globalConfig!.path);

    // Build the mcpServers configuration object
    const mcpServersObj: Record<string, any> = {};
    for (const server of servers) {
      const config = server.configs.standard(env);
      mcpServersObj[server.id] = config;
    }

    // Create the full config object
    const fullConfig = {
      mcpServers: mcpServersObj,
    };

    // Dry-run validation
    const dryRun = await dryRunWrite(
      configPath,
      JSON.stringify(fullConfig, null, 2) + "\n",
      {
        format: "json",
        createIfMissing: true,
      }
    );

    if (!dryRun.success) {
      return dryRun;
    }

    // If dry-run passed, create backup and write
    let backupPath: string | undefined;
    if (dryRun.operation === "update") {
      // Backup before updating
      const backupResult = await createBackupIfExists(configPath);
      if (backupResult.success && backupResult.data) {
        backupPath = backupResult.data.backupPath;
      }
    }

    // Write the config
    const writeResult = await writeConfigToFile(
      configPath,
      fullConfig,
      {
        format: "json",
        createIfMissing: true,
      }
    );

    if (!writeResult.success) {
      return {
        success: false,
        targetPath: configPath,
        operation: dryRun.operation,
        currentContent: dryRun.currentContent,
        proposedContent: dryRun.proposedContent,
        diff: dryRun.diff,
        errors: [writeResult.error || "Failed to write configuration"],
        warnings: [],
        backupPath,
      };
    }

    return {
      ...dryRun,
      success: true,
    };
  },
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a backup of the config file if it exists.
 */
async function createBackupIfExists(filePath: string): Promise<
  | { success: true; data: { backupPath: string } | null }
  | { success: false; error: string }
> {
  try {
    const exists = await fs
      .access(filePath, fsConstants.F_OK)
      .then(() => true)
      .catch(() => false);

    if (!exists) {
      return { success: true, data: null };
    }

    // Generate backup path with timestamp
    const timestamp = new Date().toISOString().replace(/:/g, "-").replace(/\.\d{3}Z$/, "");
    const backupPath = `${filePath}.bak-${timestamp}`;

    await copyFile(filePath, backupPath);
    return { success: true, data: { backupPath } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Failed to create backup: ${message}` };
  }
}

/**
 * Write configuration to file with error handling.
 */
async function writeConfigToFile(
  filePath: string,
  config: Record<string, unknown>,
  options: { format: "json"; createIfMissing?: boolean }
): Promise<{ success: boolean; error?: string }> {
  try {
    // Ensure directory exists
    const dir = path.dirname(filePath);
    await mkdir(dir, { recursive: true });

    // Write the file
    const content = JSON.stringify(config, null, 2) + "\n";

    await writeFile(filePath, content, "utf-8");
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Failed to write configuration: ${message}` };
  }
}
