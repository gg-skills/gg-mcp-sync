/**
 * @fileoverview MCP editor adapter for Warp Terminal; manages MCP server configuration for that standalone editor.
 *
 * @testing Jest unit: npm test -- scripts/editors/standalone-editors.unit.test.ts
 * @see scripts/editors/standalone-editors.unit.test.ts - Jest suite that exercises the standalone editor adapters.
 * @documentation reviewed=2026-04-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import {
  dirExists,
  fileExists,
  isFileWritable,
  readFileSafe,
  resolvePath,
  writeFileSafe,
} from "../lib";
import { parseJsonOrJsonc } from "../lib/jsonc";
import { dryRunWrite } from "../lib/dry-run";
import { createBackupIfExists, cleanupOldBackups } from "../lib/backup";
import type {
  ConfigLocation,
  DryRunResult,
  EditorAdapter,
  EnvVars,
  McpConfigFile,
  McpServerConfig,
  McpServerTemplate,
} from "../lib";

// =============================================================================
// Configuration Locations
// =============================================================================

const GLOBAL_CONFIG: ConfigLocation = {
  path: "~/.warp/mcp_config.json",
  key: "mcpServers",
  format: "json",
};

// Warp Terminal does not support project-level MCP config
const PROJECT_CONFIG: ConfigLocation | undefined = undefined;

// =============================================================================
// Installation Detection
// =============================================================================

/**
 * Detect if Warp Terminal is installed by checking for the config directory.
 */
async function detectInstalled(): Promise<boolean> {
  const configDir = resolvePath("~/.warp");
  return dirExists(configDir);
}

// =============================================================================
// Configuration Reading
// =============================================================================

/**
 * Read MCP configuration from Warp Terminal config file.
 */
async function readConfig(scope: "project" | "global"): Promise<McpConfigFile | null> {
  // Warp Terminal only supports global config
  if (scope === "project") {
    return {
      path: "",
      format: "json",
      rawContent: "",
      servers: {},
      exists: false,
    };
  }

  const filePath = resolvePath(GLOBAL_CONFIG.path);

  // Check if file exists
  if (!fileExists(filePath)) {
    return {
      path: filePath,
      format: GLOBAL_CONFIG.format,
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

  // Parse JSON content
  const parseResult = parseJsonOrJsonc<Record<string, unknown>>(rawContent);
  if (!parseResult.success) {
    return null;
  }

  // Extract mcpServers object
  const config = parseResult.data as Record<string, unknown>;
  const serversRaw = (config[GLOBAL_CONFIG.key] as Record<string, McpServerConfig>) || {};

  return {
    path: filePath,
    format: GLOBAL_CONFIG.format,
    rawContent,
    servers: serversRaw,
    exists: true,
  };
}

// =============================================================================
// Configuration Writing
// =============================================================================

/**
 * Write MCP configuration to Warp Terminal config file.
 */
async function writeConfig(
  scope: "project" | "global",
  servers: McpServerTemplate[],
  env: EnvVars
): Promise<DryRunResult> {
  // Warp Terminal only supports global config
  if (scope === "project") {
    return {
      success: false,
      targetPath: "",
      operation: "skip",
      currentContent: null,
      proposedContent: "",
      diff: "",
      errors: ["Warp Terminal does not support project-level MCP configuration"],
      warnings: [],
    };
  }

  const filePath = resolvePath(GLOBAL_CONFIG.path);

  // Check file writability (if it exists)
  if (fileExists(filePath) && !isFileWritable(filePath)) {
    return {
      success: false,
      targetPath: filePath,
      operation: "skip",
      currentContent: null,
      proposedContent: "",
      diff: "",
      errors: [
        `File is not writable: ${filePath}`,
        "Check file permissions or try running with elevated privileges",
      ],
      warnings: [],
    };
  }

  // Read current config to preserve structure
  let currentConfig: Record<string, unknown> = {};
  let currentContent: string | null = null;

  if (fileExists(filePath)) {
    const readResult = await readFileSafe(filePath);
    if (readResult.success) {
      currentContent = readResult.data;
      const parseResult = parseJsonOrJsonc<Record<string, unknown>>(readResult.data);
      if (parseResult.success) {
        currentConfig = parseResult.data;
      }
    }
  }

  // Generate server configs using standard format
  const serverConfigs: Record<string, McpServerConfig> = {};
  for (const server of servers) {
    const config = server.configs.standard(env);
    serverConfigs[server.id] = config;
  }

  // Update or create mcpServers object
  currentConfig[GLOBAL_CONFIG.key] = serverConfigs;

  // Serialize to JSON with proper formatting
  const proposedContent = JSON.stringify(currentConfig, null, 2) + "\n";

  // Dry-run validation
  const dryRunResult = await dryRunWrite(filePath, proposedContent, {
    format: GLOBAL_CONFIG.format,
    createIfMissing: true,
  });

  if (!dryRunResult.success) {
    return dryRunResult;
  }

  // Create backup for global config if it exists
  if (fileExists(filePath)) {
    await createBackupIfExists(filePath);
  }

  // Write the file
  const writeResult = await writeFileSafe(filePath, proposedContent);
  if (!writeResult.success) {
    return {
      ...dryRunResult,
      success: false,
      errors: [...dryRunResult.errors, writeResult.error || "Unknown write error"],
    };
  }

  // Cleanup old backups
  await cleanupOldBackups(filePath);

  return {
    ...dryRunResult,
    success: true,
    targetPath: filePath,
    operation: currentContent ? "update" : "create",
  };
}

// =============================================================================
// Editor Adapter Export
// =============================================================================

/**
 * Warp Terminal editor adapter
 */
export const warpTerminalAdapter: EditorAdapter = {
  id: "warp-terminal",
  name: "Warp Terminal",
  type: "standalone",
  projectConfig: PROJECT_CONFIG,
  globalConfig: GLOBAL_CONFIG,
  format: "mcpServers",
  detectInstalled,
  readConfig,
  writeConfig,
};
