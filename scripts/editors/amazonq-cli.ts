/**
 * @fileoverview MCP editor adapter for Amazon Q CLI; manages MCP server configuration for that CLI tool.
 *
 * @testing Jest unit: npm test -- scripts/editors/cli-tools.unit.test.ts
 * @see scripts/editors/cli-tools.unit.test.ts - Jest suite that exercises the CLI editor adapters.
 * @documentation reviewed=2026-04-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { execSync } from "child_process";
import type {
  EditorAdapter,
  ConfigLocation,
  DryRunResult,
  McpConfigFile,
  McpServerConfig,
  McpServerTemplate,
  EnvVars,
} from "../lib";
import {
  readFileSafe,
  resolvePath,
  fileExists,
} from "../lib/file-utils";
import { writeConfig } from "../lib/config-writer";
import { stringifyJsonWithNewline, parseJsonOrJsonc } from "../lib/jsonc";

// =============================================================================
// Types
// =============================================================================

/** Amazon Q CLI detection result */
interface AmazonQDetectionResult {
  installed: boolean;
  version?: string;
  error?: string;
}

// =============================================================================
// Detection
// =============================================================================

/**
 * Check if Amazon Q CLI is installed by attempting to run 'amazonq --version'.
 */
async function detectAmazonQCli(): Promise<AmazonQDetectionResult> {
  try {
    const version = execSync("amazonq --version", {
      encoding: "utf-8",
      stdio: "pipe",
    }).trim();
    return { installed: true, version };
  } catch (error) {
    return {
      installed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// =============================================================================
// Config Reading
// =============================================================================

/**
 * Read and parse the MCP config file.
 */
async function readConfigFile(filePath: string): Promise<McpConfigFile | null> {
  const resolved = resolvePath(filePath);

  if (!fileExists(resolved)) {
    return {
      path: resolved,
      format: "json",
      rawContent: "",
      servers: {},
      exists: false,
    };
  }

  const readResult = await readFileSafe(resolved);
  if (!readResult.success) {
    return null;
  }

  const rawContent = readResult.data;

  // Parse the JSON file
  const parseResult = parseJsonOrJsonc<Record<string, unknown>>(rawContent);
  if (!parseResult.success) {
    return null;
  }

  // Extract servers from mcpServers key
  const data = parseResult.data;
  const mcpServers = (data.mcpServers || {}) as Record<string, McpServerConfig>;

  return {
    path: resolved,
    format: "json",
    rawContent,
    servers: mcpServers,
    exists: true,
  };
}

// =============================================================================
// Config Writing
// =============================================================================

/**
 * Generate the new config content by merging with existing servers.
 */
async function generateNewConfigContent(
  filePath: string,
  newServers: Record<string, McpServerConfig>,
  removeServerIds?: string[]
): Promise<string> {
  const resolved = resolvePath(filePath);

  // If file doesn't exist, create new config
  if (!fileExists(resolved)) {
    return stringifyJsonWithNewline({ mcpServers: newServers });
  }

  // Read existing content
  const readResult = await readFileSafe(resolved);
  if (!readResult.success) {
    return stringifyJsonWithNewline({ mcpServers: newServers });
  }

  // Parse existing content
  const parseResult = parseJsonOrJsonc<Record<string, unknown>>(readResult.data);
  if (!parseResult.success) {
    return stringifyJsonWithNewline({ mcpServers: newServers });
  }

  // Merge servers (new ones override existing)
  const data = parseResult.data;
  const existingServers = {
    ...((data.mcpServers || {}) as Record<string, McpServerConfig>),
  };
  for (const serverId of removeServerIds ?? []) {
    delete existingServers[serverId];
  }
  const mergedServers = { ...existingServers, ...newServers };

  return stringifyJsonWithNewline({ mcpServers: mergedServers });
}

// =============================================================================
// Dry Run
// =============================================================================

/**
 * Perform a dry-run write to validate the configuration.
 */
async function performDryRun(
  filePath: string,
  newServers: Record<string, McpServerConfig>,
  removeServerIds?: string[]
): Promise<DryRunResult> {
  const resolved = resolvePath(filePath);
  const proposedContent = await generateNewConfigContent(filePath, newServers, removeServerIds);

  // Determine operation type
  let operation: "create" | "update" | "backup" | "skip" = "create";
  let currentContent: string | null = null;

  if (fileExists(resolved)) {
    operation = "update";
    const readResult = await readFileSafe(resolved);
    if (readResult.success) {
      currentContent = readResult.data;
    }
  }

  // Check for changes
  if (currentContent === proposedContent) {
    operation = "skip";
  }

  // Generate a simple diff
  const diff = currentContent ? getDiff(currentContent, proposedContent) : "File will be created";

  return {
    success: true,
    targetPath: resolved,
    operation,
    currentContent,
    proposedContent,
    diff,
    errors: [],
    warnings: [],
  };
}

/**
 * Generate a simple diff representation.
 */
function getDiff(oldContent: string, newContent: string): string {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");

  const diffs: string[] = [];
  const maxLines = Math.max(oldLines.length, newLines.length);

  for (let i = 0; i < Math.min(maxLines, 3); i++) {
    const oldLine = oldLines[i] || "";
    const newLine = newLines[i] || "";

    if (oldLine !== newLine) {
      diffs.push(`- ${oldLine}`);
      diffs.push(`+ ${newLine}`);
    }
  }

  if (maxLines > 3) {
    diffs.push(`... and ${maxLines - 3} more lines`);
  }

  return diffs.length > 0 ? diffs.join("\n") : "No changes";
}

// =============================================================================
// Editor Adapter Implementation
// =============================================================================

/**
 * Amazon Q CLI Editor Adapter
 */
export const amazonqCliAdapter: EditorAdapter = {
  id: "amazonq-cli",
  name: "Amazon Q CLI",
  type: "cli",
  format: "mcpServers",

  // Project-level configuration
  projectConfig: {
    path: ".amazonq/mcp.json",
    key: "mcpServers",
    format: "json",
  } as ConfigLocation,

  // Global configuration
  globalConfig: {
    path: "~/.amazonq/mcp.json",
    key: "mcpServers",
    format: "json",
  } as ConfigLocation,

  /**
   * Detect if Amazon Q CLI is installed.
   */
  async detectInstalled(): Promise<boolean> {
    const result = await detectAmazonQCli();
    return result.installed;
  },

  /**
   * Read the current MCP configuration from file.
   */
  async readConfig(scope: "project" | "global"): Promise<McpConfigFile | null> {
    const configLocation = scope === "project" ? this.projectConfig : this.globalConfig;

    if (!configLocation) {
      return null;
    }

    return readConfigFile(configLocation.path);
  },

  /**
   * Write MCP configuration with dry-run validation.
   */
  async writeConfig(
    scope: "project" | "global",
    servers: McpServerTemplate[],
    env: EnvVars,
    options?: { removeServerIds?: string[] }
  ): Promise<DryRunResult> {
    const configLocation = scope === "project" ? this.projectConfig : this.globalConfig;

    if (!configLocation) {
      return {
        success: false,
        targetPath: "",
        operation: "skip",
        currentContent: null,
        proposedContent: "",
        diff: "",
        errors: ["Configuration scope not supported"],
        warnings: [],
      };
    }

    // Convert server templates to config objects
    const serverConfigs: Record<string, McpServerConfig> = {};
    for (const server of servers) {
      const config = server.configs.standard(env);
      serverConfigs[server.id] = config;
    }

    // Perform dry-run
    const dryRun = await performDryRun(
      configLocation.path,
      serverConfigs,
      options?.removeServerIds
    );

    if (!dryRun.success) {
      return dryRun;
    }

    // For global scope, we should create a backup
    if (scope === "global" && dryRun.operation !== "skip") {
      dryRun.operation = "backup";
    }

    // Actually write the file
    if (dryRun.operation !== "skip") {
      const writeResult = await writeConfig(
        configLocation.path,
        serverConfigs,
        "mcpServers",
        "json",
        {
          createIfMissing: true,
          createBackup: scope === "global",
          preserveExisting: true,
          removeServerIds: options?.removeServerIds,
        }
      );

      if (!writeResult.success) {
        return {
          success: false,
          targetPath: configLocation.path,
          operation: dryRun.operation,
          currentContent: dryRun.currentContent,
          proposedContent: dryRun.proposedContent,
          diff: dryRun.diff,
          errors: [writeResult.error || "Failed to write configuration"],
          warnings: [],
        };
      }

      // Return the write result's dry-run info
      return writeResult.dryRun;
    }

    return dryRun;
  },
};

export default amazonqCliAdapter;
