/**
 * @fileoverview MCP editor adapter for Google Antigravity; manages MCP server configuration for that standalone editor.
 *
 * @testing Jest unit: npm test -- scripts/editors/standalone-editors.unit.test.ts
 * @see scripts/editors/standalone-editors.unit.test.ts - Jest suite that exercises the standalone editor adapters.
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
  readFileSafe,
  isFileWritable,
  toDisplayPath,
  resolvePath,
} from "../lib/file-utils";
import { parseJsonOrJsonc } from "../lib/jsonc";
import { dryRunWrite } from "../lib/dry-run";
import { mergeWithExisting } from "../lib/config-writer";
import { createBackupIfExists } from "../lib/backup";

// =============================================================================
// Adapter Implementation
// =============================================================================

/**
 * Google Antigravity editor adapter.
 *
 * Detects Antigravity installation, reads global config, and writes config with backup.
 * Project-level config is not supported by Antigravity.
 */
export const antigravityAdapter: EditorAdapter = {
  id: "antigravity",
  name: "Google Antigravity",
  type: "standalone",
  format: "mcpServers",

  /**
   * Global config location for Antigravity
   */
  globalConfig: {
    path: "~/.gemini/antigravity/mcp_config.json",
    key: "mcpServers",
    format: "json",
  } as ConfigLocation,

  /**
   * Detect if Google Antigravity is installed.
   *
   * Checks for the antigravity executable in PATH.
   */
  async detectInstalled(): Promise<boolean> {
    try {
      // Try to execute antigravity --version
      execSync("antigravity --version", { stdio: "pipe", timeout: 5000 });
      return true;
    } catch {
      // Try alternative command
      try {
        execSync("which antigravity", { stdio: "pipe", timeout: 5000 });
        return true;
      } catch {
        return false;
      }
    }
  },

  /**
   * Read current MCP configuration from file.
   *
   * Only supports global scope; project scope returns null.
   */
  async readConfig(scope: "project" | "global"): Promise<McpConfigFile | null> {
    // Project config not supported
    if (scope === "project") {
      return null;
    }

    // Read global config
    if (!antigravityAdapter.globalConfig) {
      return null;
    }

    const configPath = resolvePath(antigravityAdapter.globalConfig.path);

    // Check if file is readable
    if (!fileExists(configPath)) {
      return {
        path: configPath,
        format: "json",
        rawContent: "",
        servers: {},
        exists: false,
      };
    }

    // Read the file
    const readResult = await readFileSafe(configPath);
    if (!readResult.success) {
      return null;
    }

    const rawContent = readResult.data;

    // Parse JSON
    const parseResult = parseJsonOrJsonc<Record<string, unknown>>(rawContent);
    if (!parseResult.success) {
      return null;
    }

    // Extract servers from mcpServers key
    const parsed = parseResult.data;
    let servers: Record<string, unknown> = {};

    if (parsed && typeof parsed === "object" && "mcpServers" in parsed) {
      const mcpServers = (parsed as Record<string, unknown>).mcpServers;
      if (mcpServers && typeof mcpServers === "object") {
        servers = mcpServers as Record<string, unknown>;
      }
    }

    return {
      path: configPath,
      format: "json",
      rawContent,
      servers: servers as Record<string, McpServerConfig>,
      exists: true,
    };
  },

  /**
   * Write MCP configuration to file with dry-run validation and backup.
   *
   * Only supports global scope; project scope is not supported.
   */
  async writeConfig(
    scope: "project" | "global",
    servers: McpServerTemplate[],
    env: EnvVars
  ): Promise<DryRunResult> {
    // Project config not supported
    if (scope === "project") {
      return {
        success: false,
        targetPath: "",
        operation: "skip",
        currentContent: null,
        proposedContent: "",
        diff: "Project-level configuration is not supported for Google Antigravity",
        errors: ["Project scope not supported"],
        warnings: [],
      };
    }

    if (!antigravityAdapter.globalConfig) {
      return {
        success: false,
        targetPath: "",
        operation: "skip",
        currentContent: null,
        proposedContent: "",
        diff: "Global config not defined",
        errors: ["Global config location not defined"],
        warnings: [],
      };
    }

    const configPath = resolvePath(antigravityAdapter.globalConfig.path);

    // Check write permissions
    const isWritable = await isFileWritable(configPath);
    if (!isWritable) {
      return {
        success: false,
        targetPath: configPath,
        operation: "skip",
        currentContent: null,
        proposedContent: "",
        diff: "No write permission",
        errors: [`Cannot write to ${toDisplayPath(configPath)}`],
        warnings: [],
      };
    }

    // Convert templates to server configs
    const serverConfigs: Record<string, McpServerConfig> = {};
    for (const template of servers) {
      // Use standard config generator
      const config = template.configs.standard(env);
      serverConfigs[template.id] = config;
    }

    // Merge with existing config
    const mergeResult = await mergeWithExisting(
      configPath,
      serverConfigs,
      "mcpServers",
      "json",
      {
        createIfMissing: true,
        preserveExisting: true,
      }
    );

    if (!mergeResult.success) {
      return {
        success: false,
        targetPath: configPath,
        operation: "skip",
        currentContent: null,
        proposedContent: "",
        diff: mergeResult.error,
        errors: [mergeResult.error],
        warnings: [],
      };
    }

    const proposedContent = mergeResult.data;

    // Read current content if it exists
    let currentContent: string | null = null;
    if (fileExists(configPath)) {
      const readResult = await readFileSafe(configPath);
      if (readResult.success) {
        currentContent = readResult.data;
      }
    }

    // Perform dry-run
    const dryRunResult = await dryRunWrite(
      configPath,
      proposedContent,
      {
        format: "json",
        createIfMissing: true,
      }
    );

    // If dry-run succeeded, create backup before confirming
    if (dryRunResult.success && fileExists(configPath)) {
      const backupResult = await createBackupIfExists(configPath);
      if (backupResult.success) {
        // Backup created successfully
        return {
          ...dryRunResult,
          currentContent,
          proposedContent,
        };
      }
      // Backup failed but dry-run passed - still return success but with warning
      return {
        ...dryRunResult,
        currentContent,
        proposedContent,
        warnings: [...dryRunResult.warnings, "Could not create backup file"],
      };
    }

    return {
      ...dryRunResult,
      currentContent,
      proposedContent,
    };
  },
};
