/**
 * @fileoverview MCP editor adapter for the Pi Coding Agent CLI. Detects Pi installation,
 * reads existing MCP server configurations, and writes updated configurations scoped to
 * project or global directories. Part of the `scripts/editors/` CLI adapter suite.
 *
 * @example
 * ```ts
 * import { piCliAdapter } from "./pi-cli";
 *
 * const installed = await piCliAdapter.detectInstalled();
 * const config = await piCliAdapter.readConfig("project");
 * const result = await piCliAdapter.writeConfig("project", serverTemplates, env);
 * ```
 *
 * @testing Jest unit: npm test -- scripts/editors/cli-tools.unit.test.ts
 * @see scripts/editors/cli-tools.unit.test.ts - Jest unit tests covering CLI tool editor adapters including Pi.
 * @documentation reviewed=2026-04-30 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { execSync } from "child_process";
import { dirExists, fileExists, readFileSafe, resolvePath } from "../lib";
import type {
  ConfigKeyFormat,
  ConfigLocation,
  DryRunResult,
  EditorAdapter,
  EnvVars,
  McpConfigFile,
  McpServerConfig,
  McpServerTemplate,
} from "../lib";
import { writeConfig, getKeyPath } from "../lib/config-writer";
import { parseJsonOrJsonc } from "../lib/jsonc";

// =============================================================================
// Configuration Locations
// =============================================================================

const PROJECT_CONFIG: ConfigLocation = {
  path: ".pi/mcp.json",
  key: "mcpServers",
  format: "json",
};

const GLOBAL_CONFIG: ConfigLocation = {
  path: "~/.pi/agent/mcp.json",
  key: "mcpServers",
  format: "json",
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get config location for the given scope.
 */
function getConfigLocation(scope: "project" | "global"): ConfigLocation {
  return scope === "project" ? PROJECT_CONFIG : GLOBAL_CONFIG;
}

/**
 * Parse servers from config file content.
 */
async function parseServersFromFile(
  filePath: string,
  keyFormat: ConfigKeyFormat
): Promise<Record<string, McpServerConfig>> {
  const readResult = await readFileSafe(filePath);
  if (!readResult.success) {
    return {};
  }

  const parseResult = parseJsonOrJsonc<Record<string, unknown>>(readResult.data);
  if (!parseResult.success) {
    return {};
  }

  const keyPath = getKeyPath(keyFormat);
  let current: unknown = parseResult.data;

  for (const key of keyPath) {
    if (current && typeof current === "object") {
      current = (current as Record<string, unknown>)[key];
    }
  }

  if (current && typeof current === "object") {
    return current as Record<string, McpServerConfig>;
  }

  return {};
}

// =============================================================================
// Adapter Implementation
// =============================================================================

export const piCliAdapter: EditorAdapter = {
  id: "pi-cli",
  name: "Pi Coding Agent",
  type: "cli",
  projectConfig: PROJECT_CONFIG,
  globalConfig: GLOBAL_CONFIG,
  format: "mcpServers",

  /**
   * Check if Pi is installed by checking for the 'pi' command.
   */
  async detectInstalled(): Promise<boolean> {
    try {
      execSync("which pi", { stdio: "pipe" });
      return true;
    } catch {
      // Also check if the global config directory exists as a fallback
      const globalConfigDir = resolvePath("~/.pi/agent");
      return dirExists(globalConfigDir);
    }
  },

  /**
   * Read existing MCP config from the appropriate scope.
   */
  async readConfig(scope: "project" | "global"): Promise<McpConfigFile | null> {
    const config = getConfigLocation(scope);
    const filePath = resolvePath(config.path);

    // Check if file exists
    if (!fileExists(filePath)) {
      return {
        path: filePath,
        format: config.format,
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
    const servers = await parseServersFromFile(filePath, config.key);

    return {
      path: filePath,
      format: config.format,
      rawContent,
      servers,
      exists: true,
    };
  },

  /**
   * Write MCP server configurations to the appropriate scope.
   * Creates backups for global scope.
   */
  async writeConfig(
    scope: "project" | "global",
    servers: McpServerTemplate[],
    env: EnvVars,
    options?: { removeServerIds?: string[] }
  ): Promise<DryRunResult> {
    const config = getConfigLocation(scope);
    const filePath = resolvePath(config.path);

    // Convert templates to server configs
    const serverConfigs: Record<string, McpServerConfig> = {};
    for (const template of servers) {
      const serverConfig = template.configs.standard(env);
      serverConfigs[template.id] = serverConfig;
    }

    // Write config with appropriate options
    const writeResult = await writeConfig(
      filePath,
      serverConfigs,
      config.key,
      config.format,
      {
        createIfMissing: true,
        createBackup: scope === "global", // Create backups for global scope
        preserveExisting: true,
        removeServerIds: options?.removeServerIds,
      }
    );

    return writeResult.dryRun;
  },
};
