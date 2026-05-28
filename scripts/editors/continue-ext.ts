/**
 * @fileoverview MCP editor adapter for Continue; manages MCP server configuration for that VSCode extension.
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
  toDisplayPath,
  isFileWritable,
  writeFileSafe,
  listFiles,
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
import { serializeToYamlContinue } from "../lib/config-writer";
import { dryRunWrite } from "../lib/dry-run";
import { createBackupIfExists } from "../lib/backup";
import yaml from "js-yaml";
import { mkdir } from "fs/promises";

// =============================================================================
// Constants
// =============================================================================

const EDITOR_ID = "continue-ext";
const EDITOR_NAME = "Continue (VSCode Ext)";

const PROJECT_CONFIG: ConfigLocation = {
  path: ".continue/mcpServers",
  key: "ui-only",
  format: "yaml",
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get the path to a server's YAML file.
 */
function getServerFilePath(basePath: string, serverId: string): string {
  return `${basePath}/${serverId}.yaml`;
}

/**
 * Parse YAML server config from file.
 */
async function parseYamlServer(filePath: string): Promise<McpServerConfig | null> {
  const readResult = await readFileSafe(filePath);
  if (!readResult.success) {
    return null;
  }

  try {
    const parsed = yaml.load(readResult.data);
    return parsed as McpServerConfig;
  } catch (e) {
    console.warn("Failed to parse YAML server config:", e);
    return null;
  }
}

/**
 * Read all server YAML files from the mcpServers directory.
 */
async function readServersFromDirectory(
  dirPath: string
): Promise<Record<string, McpServerConfig>> {
  if (!dirExists(dirPath)) {
    return {};
  }

  const servers: Record<string, McpServerConfig> = {};

  try {
    const listResult = await listFiles(dirPath);

    if (!listResult.success) {
      return servers;
    }

    for (const file of listResult.data) {
      // Only process .yaml files
      if (!file.endsWith(".yaml")) {
        continue;
      }

      const serverId = file.replace(/\.yaml$/, "");
      const filePath = `${dirPath}/${file}`;
      const serverConfig = await parseYamlServer(filePath);

      if (serverConfig) {
        servers[serverId] = serverConfig;
      }
    }
  } catch (e) {
    console.warn("Error reading MCP servers directory:", e);
  }

  return servers;
}

/**
 * Ensure the mcpServers directory exists.
 */
async function ensureDirectoryExists(dirPath: string): Promise<boolean> {
  const resolved = resolvePath(dirPath);

  if (dirExists(resolved)) {
    return true;
  }

  try {
    await mkdir(resolved, { recursive: true });
    return true;
  } catch (e) {
    console.warn("Failed to create directory:", e);
    return false;
  }
}

/**
 * Get the Continue VSCode extension directory to detect installation.
 */
function getContinueExtDir(): string {
  if (process.platform === "darwin") {
    // macOS: ~/.vscode/extensions
    return resolvePath("~/.vscode/extensions");
  } else if (process.platform === "linux") {
    // Linux: ~/.vscode/extensions
    return resolvePath("~/.vscode/extensions");
  } else if (process.platform === "win32") {
    // Windows: AppData/Code/User/extensions
    const appData = process.env.APPDATA;
    if (appData) {
      return `${appData}\\Code\\User\\extensions`;
    }
  }

  return resolvePath("~/.vscode/extensions");
}

// =============================================================================
// Adapter Implementation
// =============================================================================

export const continueExtAdapter: EditorAdapter = {
  id: EDITOR_ID,
  name: EDITOR_NAME,
  type: "vscode-ext",
  supportsHttp: false,
  format: "ui-only",

  /**
   * Project config location for Continue VSCode extension
   */
  projectConfig: PROJECT_CONFIG,

  /**
   * Global config is not supported for Continue VSCode extension
   */
  globalConfig: undefined,

  /**
   * Check if Continue VSCode extension is installed by checking for VSCode extensions directory.
   */
  async detectInstalled(): Promise<boolean> {
    const extDir = getContinueExtDir();
    if (!dirExists(extDir)) {
      return false;
    }

    // Try to find Continue extension in the extensions directory
    try {
      const listResult = await listFiles(extDir);
      if (!listResult.success) {
        return false;
      }
      return listResult.data.some((file) => file.toLowerCase().includes("continue"));
    } catch (e) {
      console.warn("Error detecting Continue extension:", e);
      return false;
    }
  },

  /**
   * Read existing MCP config from the project scope.
   *
   * Only supports project scope; global scope returns null.
   */
  async readConfig(scope: "project" | "global"): Promise<McpConfigFile | null> {
    // Global config not supported for Continue VSCode extension
    if (scope === "global") {
      return null;
    }

    // Read project config
    const dirPath = resolvePath(PROJECT_CONFIG.path);

    // Read all YAML files from the directory
    const servers = await readServersFromDirectory(dirPath);

    return {
      path: dirPath,
      format: PROJECT_CONFIG.format,
      rawContent: "",
      servers,
      exists: dirExists(dirPath),
    };
  },

  /**
   * Write MCP config using YAML files (one per server).
   * Creates separate files for each server in `.continue/mcpServers/` directory.
   *
   * Global scope is not supported for Continue VSCode extension.
   */
  async writeConfig(
    scope: "project" | "global",
    servers: McpServerTemplate[],
    env: EnvVars
  ): Promise<DryRunResult> {
    // Global config not supported
    if (scope === "global") {
      return {
        success: false,
        targetPath: "",
        operation: "skip",
        currentContent: null,
        proposedContent: "",
        diff: "Global-level configuration is not supported for Continue VSCode extension",
        errors: ["Global scope not supported"],
        warnings: [],
      };
    }

    const dirPath = resolvePath(PROJECT_CONFIG.path);

    // Ensure directory exists
    const dirCreated = await ensureDirectoryExists(dirPath);
    if (!dirCreated) {
      return {
        success: false,
        targetPath: dirPath,
        operation: "skip",
        currentContent: null,
        proposedContent: "",
        diff: "Cannot create .continue/mcpServers directory",
        errors: [`Cannot create directory at ${toDisplayPath(dirPath)}`],
        warnings: [],
      };
    }

    // Verify we can write to the directory
    const isWritable = await isFileWritable(dirPath);
    if (!isWritable) {
      return {
        success: false,
        targetPath: dirPath,
        operation: "skip",
        currentContent: null,
        proposedContent: "",
        diff: "No write permission",
        errors: [`Cannot write to ${toDisplayPath(dirPath)}`],
        warnings: [],
      };
    }

    // Write each server as a separate YAML file
    const writeResults: Array<{
      filePath: string;
      success: boolean;
      error?: string;
    }> = [];

    const stdioServers = servers.filter((server) => server.transport === "stdio");
    const skippedServers = servers.filter((server) => server.transport !== "stdio");

    for (const template of stdioServers) {
      const config = template.configs.standard(env);
      const proposedContent = serializeToYamlContinue(template.id, config);

      const filePath = getServerFilePath(dirPath, template.id);

      // Perform dry-run
      const dryRunResult = await dryRunWrite(filePath, proposedContent, {
        format: PROJECT_CONFIG.format,
        createIfMissing: true,
      });

      if (!dryRunResult.success) {
        writeResults.push({
          filePath,
          success: false,
          error: dryRunResult.errors.join("; "),
        });
        continue;
      }

      // Create backup if file exists
      if (fileExists(filePath)) {
        const backupResult = await createBackupIfExists(filePath);
        if (!backupResult.success) {
          // Log backup failure but continue
        }
      }

      // Write the file
      const writeResult = await writeFileSafe(filePath, proposedContent);

      if (writeResult.success) {
        writeResults.push({
          filePath,
          success: true,
        });
      } else {
        const failedResult = writeResult as { success: false; error: string };
        writeResults.push({
          filePath,
          success: false,
          error: failedResult.error || "Unknown error",
        });
      }
    }

    // Check if all writes succeeded
    const allSucceeded = writeResults.every((r) => r.success);
    const failedWrites = writeResults.filter((r) => !r.success);

    if (!allSucceeded && failedWrites.length > 0) {
      return {
        success: false,
        targetPath: dirPath,
        operation: "skip",
        currentContent: null,
        proposedContent: "",
        diff: `Failed to write ${failedWrites.length} server files`,
        errors: failedWrites.map((r) => `${r.filePath}: ${r.error}`),
        warnings: [],
      };
    }

    // All writes succeeded
    const successCount = writeResults.length;
    return {
      success: true,
      targetPath: dirPath,
      operation: servers.length > 0 ? "create" : "skip",
      currentContent: null,
      proposedContent: `Created/updated ${successCount} server configuration files in ${toDisplayPath(dirPath)}`,
      diff: `${successCount} YAML files in .continue/mcpServers/: ${stdioServers.map((s) => s.id).join(", ")}`,
      errors: [],
      warnings:
        [
          ...(failedWrites.length > 0
            ? failedWrites.map((r) => `Partial failure for ${r.filePath}`)
            : []),
          ...(skippedServers.length > 0
            ? [
                `Skipped ${skippedServers.length} HTTP server(s); Continue supports stdio servers only.`,
              ]
            : []),
        ],
    };
  },
};
