/**
 * @fileoverview MCP editor adapter for Claude Code CLI; manages MCP server configuration for that CLI tool.
 *
 * @testing Jest unit: npm test -- scripts/editors/cli-tools.unit.test.ts
 * @see scripts/editors/cli-tools.unit.test.ts - Jest suite that exercises the CLI editor adapters.
 * @documentation reviewed=2026-04-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { execSync } from "child_process";
import type {
  EditorAdapter,
  McpConfigFile,
  McpServerConfig,
  McpServerTemplate,
  DryRunResult,
  EnvVars,
} from "../lib";
import {
  resolvePath,
  fileExists,
  readFileSafe,
  writeConfig,
  parseJsonOrJsonc,
} from "../lib";

// =============================================================================
// Claude CLI Adapter
// =============================================================================

/**
 * EditorAdapter for Claude Code CLI
 *
 * Configuration Locations:
 * - Project: .mcp.json (mcpServers format)
 * - Global: Not supported
 */
export const claudeCliAdapter: EditorAdapter = {
  id: "claude-cli",
  name: "Claude Code CLI",
  type: "cli",
  format: "mcpServers",

  // Project-level config: .mcp.json
  projectConfig: {
    path: ".mcp.json",
    key: "mcpServers",
    format: "json",
  },

  // Global config: Not supported
  globalConfig: undefined,

  // ==========================================================================
  // detectInstalled: Check if Claude CLI is installed
  // ==========================================================================
  /**
   * Determines whether the Claude Code CLI binary is discoverable on PATH.
   *
   * @remarks
   * I/O: runs `which claude` synchronously; treats any failure as not installed.
   */
  async detectInstalled(): Promise<boolean> {
    try {
      execSync("which claude", { stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  },

  // ==========================================================================
  // readConfig: Read MCP configuration from file
  // ==========================================================================
  /**
   * Reads the project `.mcp.json` MCP server map for supported scopes.
   *
   * @remarks
   * Global scope is unsupported and returns null. Missing, unreadable, or invalid JSON yields empty
   * `servers` while preserving path and existence metadata.
   */
  async readConfig(scope: "project" | "global"): Promise<McpConfigFile | null> {
    // Claude CLI only supports project scope
    if (scope === "global") {
      return null;
    }

    const config = this.projectConfig;

    if (!config) {
      return null;
    }

    const resolved = resolvePath(config.path);

    // Check if file exists
    if (!fileExists(resolved)) {
      return {
        path: resolved,
        format: config.format,
        rawContent: "",
        servers: {},
        exists: false,
      };
    }

    // Read file content
    const readResult = await readFileSafe(resolved);
    if (!readResult.success) {
      return {
        path: resolved,
        format: config.format,
        rawContent: "",
        servers: {},
        exists: true,
      };
    }

    const rawContent = readResult.data;

    // Parse JSON content
    const parseResult = parseJsonOrJsonc<Record<string, unknown>>(rawContent);
    if (!parseResult.success) {
      return {
        path: resolved,
        format: config.format,
        rawContent,
        servers: {},
        exists: true,
      };
    }

    // Extract mcpServers key
    const parsed = parseResult.data;
    let servers: Record<string, McpServerConfig> = {};

    if (parsed.mcpServers && typeof parsed.mcpServers === "object") {
      servers = parsed.mcpServers as Record<string, McpServerConfig>;
    }

    return {
      path: resolved,
      format: config.format,
      rawContent,
      servers,
      exists: true,
    };
  },

  // ==========================================================================
  // writeConfig: Write MCP configuration to file
  // ==========================================================================
  /**
   * Applies MCP server templates into the project `.mcp.json` `mcpServers` map.
   *
   * @remarks
   * Global scope returns a structured skip result. Project writes preserve unrelated servers, create
   * the file when missing, and omit backups for project-scoped paths.
   */
  async writeConfig(
    scope: "project" | "global",
    servers: McpServerTemplate[],
    env: EnvVars,
    options?: { removeServerIds?: string[] }
  ): Promise<DryRunResult> {
    // Claude CLI only supports project scope
    if (scope === "global") {
      return {
        success: false,
        targetPath: "",
        operation: "skip",
        currentContent: null,
        proposedContent: "",
        diff: "",
        errors: ["Claude CLI does not support global configuration"],
        warnings: [],
      };
    }

    const config = this.projectConfig;

    if (!config) {
      return {
        success: false,
        targetPath: "",
        operation: "skip",
        currentContent: null,
        proposedContent: "",
        diff: "",
        errors: ["Configuration not available"],
        warnings: [],
      };
    }

    const resolved = resolvePath(config.path);

    // Convert server templates to standard config format
    const serverConfigs: Record<string, McpServerConfig> = {};
    for (const server of servers) {
      const serverConfig = server.configs.standard(env);
      serverConfigs[server.id] = serverConfig;
    }

    // Write config (preserving existing servers, no backup for project files)
    const writeResult = await writeConfig(
      resolved,
      serverConfigs,
      config.key,
      config.format,
      {
        createIfMissing: true,
        createBackup: false, // No backup needed for project files
        preserveExisting: true,
        removeServerIds: options?.removeServerIds,
      }
    );

    return writeResult.dryRun;
  },
};
