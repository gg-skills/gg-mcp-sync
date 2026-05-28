/**
 * @fileoverview MCP editor adapter for Windsurf; manages MCP server configuration for that VSCode extension.
 *
 * @testing Jest unit: npm test -- scripts/editors/vscode-extensions.unit.test.ts
 * @see scripts/editors/vscode-extensions.unit.test.ts - Jest suite that exercises the VSCode extension adapters.
 * @documentation reviewed=2026-04-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { execSync } from "child_process";
import {
  EditorAdapter,
  ConfigLocation,
  McpConfigFile,
  McpServerConfig,
  DryRunResult,
  McpServerTemplate,
  EnvVars,
} from "../lib";
import {
  fileExists,
  resolvePath,
  readFileSafe,
  writeFileSafe,
} from "../lib/file-utils";
import { parseJsonOrJsonc } from "../lib/jsonc";
import { dryRunWrite } from "../lib/dry-run";
import { createBackupIfExists, cleanupOldBackups } from "../lib/backup";

// =============================================================================
// Configuration Locations
// =============================================================================

const PROJECT_CONFIG: ConfigLocation = {
  path: ".windsurf/mcp.json",
  key: "mcpServers",
  format: "json",
};

const GLOBAL_CONFIG: ConfigLocation = {
  path: "~/.codeium/windsurf/mcp_config.json",
  key: "mcpServers",
  format: "json",
};

// =============================================================================
// Installation Detection
// =============================================================================

/**
 * Detect if Windsurf is installed by checking for the executable.
 */
async function detectInstalled(): Promise<boolean> {
  try {
    // Try to find Windsurf in common locations or via PATH
    execSync("which windsurf", { stdio: "pipe" });
    return true;
  } catch {
    // Try alternative detection method - check for Codeium Windsurf app
    try {
      if (process.platform === "darwin") {
        // macOS: check for /Applications/Windsurf.app
        execSync("test -d /Applications/Windsurf.app", { stdio: "pipe" });
        return true;
      } else if (process.platform === "linux") {
        // Linux: check for ~/.codeium/windsurf (config dir exists)
        const configPath = resolvePath("~/.codeium/windsurf");
        return fileExists(configPath);
      } else if (process.platform === "win32") {
        // Windows: check for AppData path
        const windsurfPath = process.env.LOCALAPPDATA
          ? resolvePath(`${process.env.LOCALAPPDATA}/Codeium/Windsurf`)
          : null;
        return windsurfPath ? fileExists(windsurfPath) : false;
      }
    } catch {
      return false;
    }
  }
  return false;
}

// =============================================================================
// Configuration Reading
// =============================================================================

/**
 * Read MCP configuration from a file.
 */
async function readConfig(scope: "project" | "global"): Promise<McpConfigFile | null> {
  const configLoc = scope === "project" ? PROJECT_CONFIG : GLOBAL_CONFIG;
  const resolvedPath = resolvePath(configLoc.path);

  // Check if file exists
  if (!fileExists(resolvedPath)) {
    return {
      path: resolvedPath,
      format: configLoc.format,
      rawContent: "",
      servers: {},
      exists: false,
    };
  }

  // Read file content
  const readResult = await readFileSafe(resolvedPath);
  if (!readResult.success) {
    return null;
  }

  // Parse content
  const parseResult = parseJsonOrJsonc(readResult.data);
  if (!parseResult.success) {
    return null;
  }

  // Extract servers from the configured key
  const config = parseResult.data as Record<string, unknown>;
  const serversRaw = (config[configLoc.key] as Record<string, unknown>) || {};

  return {
    path: resolvedPath,
    format: configLoc.format,
    rawContent: readResult.data,
    servers: serversRaw as Record<string, McpServerConfig>,
    exists: true,
  };
}

// =============================================================================
// Configuration Writing
// =============================================================================

/**
 * Write MCP configuration to a file with dry-run validation.
 */
async function writeConfig(
  scope: "project" | "global",
  servers: McpServerTemplate[],
  env: EnvVars
): Promise<DryRunResult> {
  const configLoc = scope === "project" ? PROJECT_CONFIG : GLOBAL_CONFIG;
  const resolvedPath = resolvePath(configLoc.path);

  // Generate server configs using the 'standard' format (mcpServers)
  const serverConfigs: Record<string, unknown> = {};
  for (const server of servers) {
    serverConfigs[server.id] = server.configs.standard(env);
  }

  // Build configuration object
  const configObj: Record<string, unknown> = {
    [configLoc.key]: serverConfigs,
  };

  // Serialize to JSON
  const proposedContent = JSON.stringify(configObj, null, 2) + "\n";

  // Dry-run validation
  const dryRunOptions = {
    format: configLoc.format as "json" | "jsonc" | "yaml" | "toml",
    createIfMissing: true,
  };

  const dryRunResult = await dryRunWrite(resolvedPath, proposedContent, dryRunOptions);

  if (!dryRunResult.success) {
    return dryRunResult;
  }

  // Create backup for global config
  if (scope === "global" && fileExists(resolvedPath)) {
    await createBackupIfExists(resolvedPath);
  }

  // Write the file
  const writeResult = await writeFileSafe(resolvedPath, proposedContent);
  if (!writeResult.success) {
    return {
      ...dryRunResult,
      success: false,
      errors: [...dryRunResult.errors, writeResult.error || "Unknown write error"],
    };
  }

  // Cleanup old backups for global config
  if (scope === "global") {
    await cleanupOldBackups(resolvedPath);
  }

  return {
    ...dryRunResult,
    success: true,
    targetPath: resolvedPath,
    operation: fileExists(resolvedPath) ? "update" : "create",
  };
}

// =============================================================================
// Editor Adapter Export
// =============================================================================

/**
 * Windsurf editor adapter
 */
export const windsurfAdapter: EditorAdapter = {
  id: "windsurf",
  name: "Windsurf",
  type: "vscode-ext",
  format: "mcpServers",
  projectConfig: PROJECT_CONFIG,
  globalConfig: GLOBAL_CONFIG,
  detectInstalled,
  readConfig,
  writeConfig,
};
