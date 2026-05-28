/**
 * @fileoverview MCP editor adapter for Windsurf Next; manages MCP server configuration for that standalone editor.
 *
 * @testing Jest unit: npm test -- scripts/editors/standalone-editors.unit.test.ts
 * @see scripts/editors/standalone-editors.unit.test.ts - Jest suite that exercises the standalone editor adapters.
 * @documentation reviewed=2026-04-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

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

const GLOBAL_CONFIG: ConfigLocation = {
  path: "~/.codeium/windsurf-next/mcp_config.json",
  key: "mcpServers",
  format: "json",
};

// =============================================================================
// Installation Detection
// =============================================================================

/**
 * Detect if Windsurf Next is installed by checking for its config directory.
 */
async function detectInstalled(): Promise<boolean> {
  try {
    if (process.platform === "darwin" || process.platform === "linux") {
      // macOS / Linux: check for ~/.codeium/windsurf-next (config dir exists)
      const configPath = resolvePath("~/.codeium/windsurf-next");
      return fileExists(configPath);
    } else if (process.platform === "win32") {
      // Windows: check for AppData path
      const windsurfPath = process.env.LOCALAPPDATA
        ? resolvePath(`${process.env.LOCALAPPDATA}/Codeium/WindsurfNext`)
        : null;
      return windsurfPath ? fileExists(windsurfPath) : false;
    }
  } catch {
    return false;
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
  // Windsurf Next only supports global config
  if (scope === "project") {
    return null;
  }

  const configLoc = GLOBAL_CONFIG;
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
  // Windsurf Next only supports global config
  if (scope === "project") {
    return {
      success: false,
      targetPath: "",
      operation: "skip",
      currentContent: null,
      proposedContent: "",
      diff: "",
      errors: ["Windsurf Next does not support project-level configuration"],
      warnings: [],
    };
  }

  const configLoc = GLOBAL_CONFIG;
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
  if (fileExists(resolvedPath)) {
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

  // Cleanup old backups
  await cleanupOldBackups(resolvedPath);

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
 * Windsurf Next editor adapter
 */
export const windsurfNextAdapter: EditorAdapter = {
  id: "windsurf-next",
  name: "Windsurf Next",
  type: "standalone",
  format: "mcpServers",
  projectConfig: undefined, // No project config for Windsurf Next
  globalConfig: GLOBAL_CONFIG,
  detectInstalled,
  readConfig,
  writeConfig,
};
