/**
 * @fileoverview MCP editor adapter for Cline; manages MCP server configuration for that VSCode extension.
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
import { mergeWithExisting } from "../lib/config-writer";
import { parseJsonOrJsonc } from "../lib/jsonc";
import { dryRunWrite } from "../lib/dry-run";
import { createBackupIfExists } from "../lib/backup";

// =============================================================================
// Configuration Locations
// =============================================================================

const GLOBAL_CONFIG: ConfigLocation = {
  path: "~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json",
  key: "mcpServers",
  format: "json",
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get the global storage directory path to check for installation.
 */
function getGlobalStorageDir(): string {
  return resolvePath(
    "~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev"
  );
}

/**
 * Parse servers from config file content.
 */
async function parseServersFromFile(
  filePath: string
): Promise<Record<string, McpServerConfig>> {
  const readResult = await readFileSafe(filePath);
  if (!readResult.success) {
    return {};
  }

  const parseResult = parseJsonOrJsonc<Record<string, unknown>>(readResult.data);
  if (!parseResult.success) {
    return {};
  }

  const parsed = parseResult.data;
  if (parsed && typeof parsed === "object" && "mcpServers" in parsed) {
    const mcpServers = (parsed as Record<string, unknown>).mcpServers;
    if (mcpServers && typeof mcpServers === "object") {
      return mcpServers as Record<string, McpServerConfig>;
    }
  }

  return {};
}

// =============================================================================
// Adapter Implementation
// =============================================================================

export const clineExtAdapter: EditorAdapter = {
  id: "cline-ext",
  name: "Cline (VSCode Ext)",
  type: "vscode-ext",
  format: "mcpServers",

  /**
   * Global config location for Cline VSCode extension
   */
  globalConfig: GLOBAL_CONFIG,

  /**
   * Project config is not supported for Cline VSCode extension
   */
  projectConfig: undefined,

  /**
   * Check if Cline VSCode extension is installed by checking if the global storage directory exists.
   */
  async detectInstalled(): Promise<boolean> {
    const globalStorageDir = getGlobalStorageDir();
    return dirExists(globalStorageDir);
  },

  /**
   * Read existing MCP config from the appropriate scope.
   *
   * Only supports global scope; project scope returns null.
   */
  async readConfig(scope: "project" | "global"): Promise<McpConfigFile | null> {
    // Project config not supported for Cline VSCode extension
    if (scope === "project") {
      return null;
    }

    // Read global config
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

    // Parse servers
    const servers = await parseServersFromFile(filePath);

    return {
      path: filePath,
      format: GLOBAL_CONFIG.format,
      rawContent,
      servers,
      exists: true,
    };
  },

  /**
   * Write MCP config using the merge and dry-run utilities.
   * Creates backups for global scope.
   *
   * Project scope is not supported for Cline VSCode extension.
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
        diff: "Project-level configuration is not supported for Cline VSCode extension",
        errors: ["Project scope not supported"],
        warnings: [],
      };
    }

    const filePath = resolvePath(GLOBAL_CONFIG.path);

    // Check write permissions
    const isWritable = await isFileWritable(filePath);
    if (!isWritable) {
      return {
        success: false,
        targetPath: filePath,
        operation: "skip",
        currentContent: null,
        proposedContent: "",
        diff: "No write permission",
        errors: [`Cannot write to ${toDisplayPath(filePath)}`],
        warnings: [],
      };
    }

    // Convert templates to server configs
    const serverConfigs: Record<string, McpServerConfig> = {};
    for (const template of servers) {
      const config = template.configs.standard(env);
      serverConfigs[template.id] = config;
    }

    // Merge with existing config
    const mergeResult = await mergeWithExisting(
      filePath,
      serverConfigs,
      GLOBAL_CONFIG.key,
      GLOBAL_CONFIG.format,
      {
        createIfMissing: true,
        preserveExisting: true,
      }
    );

    if (!mergeResult.success) {
      return {
        success: false,
        targetPath: filePath,
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
    if (fileExists(filePath)) {
      const readResult = await readFileSafe(filePath);
      if (readResult.success) {
        currentContent = readResult.data;
      }
    }

    // Perform dry-run
    const dryRunResult = await dryRunWrite(filePath, proposedContent, {
      format: GLOBAL_CONFIG.format,
      createIfMissing: true,
    });

    // If dry-run succeeded, create backup before confirming
    if (dryRunResult.success && fileExists(filePath)) {
      const backupResult = await createBackupIfExists(filePath);
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
