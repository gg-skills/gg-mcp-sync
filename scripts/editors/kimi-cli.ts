/**
 * @fileoverview MCP editor adapter for Kimi CLI; manages the CLI's global
 * `~/.kimi/mcp.json` file using stdio-compatible MCP server entries.
 *
 * Flow: MCP Sync server templates -> Kimi `mcpServers` JSON -> `kimi mcp list/test`.
 *
 * @testing Jest unit: npm test -- scripts/editors/cli-tools.unit.test.ts
 * @see scripts/editors/cli-tools.unit.test.ts - Jest suite that exercises the CLI editor adapters.
 * @documentation reviewed=2026-05-12 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { execSync } from "child_process";
import type {
  DryRunResult,
  EditorAdapter,
  EnvVars,
  McpConfigFile,
  McpServerConfig,
  McpServerTemplate,
} from "../lib";
import {
  fileExists,
  parseJsonOrJsonc,
  readFileSafe,
  resolvePath,
  writeConfig,
} from "../lib";

/**
 * Extract the standard `mcpServers` object from a parsed Kimi config payload.
 */
function extractMcpServers(parsed: Record<string, unknown>): Record<string, McpServerConfig> {
  const servers = parsed.mcpServers;
  if (!servers || typeof servers !== "object") {
    return {};
  }

  return servers as Record<string, McpServerConfig>;
}

/**
 * EditorAdapter for Kimi CLI.
 *
 * Configuration location:
 * - Global: ~/.kimi/mcp.json (mcpServers format)
 */
export const kimiCliAdapter: EditorAdapter = {
  id: "kimi-cli",
  name: "Kimi CLI",
  type: "cli",
  supportsHttp: false,
  format: "mcpServers",

  projectConfig: undefined,

  globalConfig: {
    path: "~/.kimi/mcp.json",
    key: "mcpServers",
    format: "json",
  },

  /**
   * Checks whether the Kimi CLI is available on PATH or has an initialized config file.
   */
  async detectInstalled(): Promise<boolean> {
    try {
      execSync("which kimi", { stdio: "pipe" });
      return true;
    } catch {
      try {
        execSync("which kimi-cli", { stdio: "pipe" });
        return true;
      } catch {
        return fileExists(resolvePath("~/.kimi/mcp.json"));
      }
    }
  },

  /**
   * Reads Kimi's global MCP configuration.
   */
  async readConfig(scope: "project" | "global"): Promise<McpConfigFile | null> {
    if (scope === "project" || !this.globalConfig) {
      return null;
    }

    const resolved = resolvePath(this.globalConfig.path);
    if (!fileExists(resolved)) {
      return {
        path: resolved,
        format: this.globalConfig.format,
        rawContent: "",
        servers: {},
        exists: false,
      };
    }

    const readResult = await readFileSafe(resolved);
    if (!readResult.success) {
      return {
        path: resolved,
        format: this.globalConfig.format,
        rawContent: "",
        servers: {},
        exists: true,
      };
    }

    const rawContent = readResult.data;
    const parseResult = parseJsonOrJsonc<Record<string, unknown>>(rawContent);
    if (!parseResult.success) {
      return {
        path: resolved,
        format: this.globalConfig.format,
        rawContent,
        servers: {},
        exists: true,
      };
    }

    return {
      path: resolved,
      format: this.globalConfig.format,
      rawContent,
      servers: extractMcpServers(parseResult.data),
      exists: true,
    };
  },

  /**
   * Writes stdio MCP server templates into Kimi's global `mcpServers` map.
   */
  async writeConfig(
    scope: "project" | "global",
    servers: McpServerTemplate[],
    env: EnvVars,
    options?: { removeServerIds?: string[] }
  ): Promise<DryRunResult> {
    if (scope === "project" || !this.globalConfig) {
      return {
        success: false,
        targetPath: "",
        operation: "skip",
        currentContent: null,
        proposedContent: "",
        diff: "",
        errors: ["Kimi CLI uses global ~/.kimi/mcp.json configuration"],
        warnings: [],
      };
    }

    const resolved = resolvePath(this.globalConfig.path);
    const stdioServers = servers.filter((server) => server.transport === "stdio");
    const skippedServers = servers.filter((server) => server.transport !== "stdio");

    const serverConfigs: Record<string, McpServerConfig> = {};
    for (const server of stdioServers) {
      serverConfigs[server.id] = server.configs.standard(env);
    }

    const writeResult = await writeConfig(
      resolved,
      serverConfigs,
      this.globalConfig.key,
      this.globalConfig.format,
      {
        createIfMissing: true,
        createBackup: true,
        preserveExisting: true,
        removeServerIds: options?.removeServerIds,
      }
    );

    if (skippedServers.length > 0) {
      writeResult.dryRun.warnings.push(
        `Skipped ${skippedServers.length} HTTP server(s) (Kimi CLI managed config is stdio-only).`
      );
    }

    return writeResult.dryRun;
  },
};
