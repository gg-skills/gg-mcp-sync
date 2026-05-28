/**
 * @fileoverview MCP editor adapter for Zed; manages MCP server configuration for that standalone editor.
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
} from "../lib/file-utils";
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
  ZedServerConfig,
} from "../lib";

// =============================================================================
// Configuration Locations
// =============================================================================

const GLOBAL_CONFIG: ConfigLocation = {
  path: "~/.config/zed/settings.json",
  key: "context_servers",
  format: "jsonc",
};

// =============================================================================
// Installation Detection
// =============================================================================

/**
 * Detect if Zed is installed by checking for the config directory.
 */
async function detectInstalled(): Promise<boolean> {
  try {
    const configDir = resolvePath("~/.config/zed");
    return dirExists(configDir);
  } catch (error) {
    console.warn("Failed to detect Zed installation:", error);
    return false;
  }
}

// =============================================================================
// Configuration Reading
// =============================================================================

/**
 * Read MCP configuration from Zed settings file.
 */
async function readConfig(scope: "project" | "global"): Promise<McpConfigFile | null> {
  // Zed only supports global config
  if (scope === "project") {
    return {
      path: "",
      format: "jsonc",
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

  // Parse JSONC content
  const parseResult = parseJsonOrJsonc<Record<string, unknown>>(rawContent);
  if (!parseResult.success) {
    return null;
  }

  // Extract context_servers object
  const config = parseResult.data as Record<string, unknown>;
  const serversRaw = (config[GLOBAL_CONFIG.key] as Record<string, unknown>) || {};

  return {
    path: filePath,
    format: GLOBAL_CONFIG.format,
    rawContent,
    servers: serversRaw as Record<string, McpServerConfig>,
    exists: true,
  };
}

// =============================================================================
// Configuration Writing
// =============================================================================

/**
 * Write MCP configuration to Zed settings file.
 * Preserves JSONC formatting (comments, trailing commas).
 */
async function writeConfig(
  scope: "project" | "global",
  servers: McpServerTemplate[],
  env: EnvVars
): Promise<DryRunResult> {
  // Zed only supports global config
  if (scope === "project") {
    return {
      success: false,
      targetPath: "",
      operation: "skip",
      currentContent: null,
      proposedContent: "",
      diff: "",
      errors: ["Zed does not support project-level MCP configuration"],
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

  // Read current config to preserve structure and comments
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

  const includedServers: McpServerTemplate[] = [];
  const skippedServers: McpServerTemplate[] = [];

  for (const server of servers) {
    if (server.configs.zed || server.transport === "stdio") {
      includedServers.push(server);
    } else {
      skippedServers.push(server);
    }
  }

  // Generate server configs using the 'zed' format
  const serverConfigs: Record<string, ZedServerConfig> = {};
  for (const server of includedServers) {
    const config = server.configs.zed ? server.configs.zed(env) : server.configs.standard(env);
    serverConfigs[server.id] = config as ZedServerConfig;
  }

  // Update or create context_servers object
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
    warnings:
      skippedServers.length > 0
        ? [
            ...dryRunResult.warnings,
            `Skipped ${skippedServers.length} HTTP server(s) without Zed configs.`,
          ]
        : dryRunResult.warnings,
  };
}

// =============================================================================
// Editor Adapter Export
// =============================================================================

/**
 * Zed editor adapter
 */
export const zedAdapter: EditorAdapter = {
  id: "zed",
  name: "Zed",
  type: "standalone",
  supportsHttp: false,
  globalConfig: GLOBAL_CONFIG,
  format: "context_servers",
  detectInstalled,
  readConfig,
  writeConfig,
};
