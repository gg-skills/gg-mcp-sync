/**
 * @fileoverview MCP editor adapter for Amp CLI; manages MCP server configuration for that CLI tool.
 *
 * @testing Jest unit: npm test -- scripts/editors/cli-tools.unit.test.ts
 * @see scripts/editors/cli-tools.unit.test.ts - Jest suite that exercises the CLI editor adapters.
 * @documentation reviewed=2026-04-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { execSync } from "child_process";
import type {
  EditorAdapter,
  ConfigLocation,
  McpServerTemplate,
  McpConfigFile,
  DryRunResult,
  EnvVars,
  McpServerConfig,
  StdioServerConfig,
} from "../lib";
import {
  resolvePath,
  fileExists,
  readFileSafe,
  parseJsonOrJsonc,
} from "../lib";
import { writeConfig } from "../lib";

// =============================================================================
// Types
// =============================================================================

/** Normalized Amp CLI config structure */
interface AmpCliConfigContent {
  "amp.mcpServers"?: Record<string, McpServerConfig>;
  [key: string]: unknown;
}

// =============================================================================
// Adapter Configuration
// =============================================================================

/** Global config location for Amp CLI */
const GLOBAL_CONFIG_LOCATION: ConfigLocation = {
  path: "~/.config/amp/settings.json",
  key: "amp.mcpServers",
  format: "json",
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Detect if Amp CLI is installed by checking if the amp command exists.
 */
function detectAmpCliInstalled(): boolean {
  try {
    execSync("which amp", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse Amp CLI config with the special nested key format.
 */
async function parseAmpCliConfig(
  filePath: string
): Promise<McpConfigFile | null> {
  const resolved = resolvePath(filePath);

  if (!fileExists(resolved)) {
    return null;
  }

  const readResult = await readFileSafe(resolved);
  if (!readResult.success) {
    return null;
  }

  const content = readResult.data;
  const parseResult = parseJsonOrJsonc<AmpCliConfigContent>(content);

  if (!parseResult.success) {
    return null;
  }

  const servers = parseResult.data["amp.mcpServers"] ?? {};

  return {
    path: resolved,
    format: "json",
    rawContent: content,
    servers: servers as Record<string, McpServerConfig>,
    exists: true,
  };
}

/**
 * Normalize servers to Amp CLI's expected format.
 * Converts standard stdio config to Amp CLI format if needed.
 */
function normalizeServersForAmpCli(
  servers: McpServerTemplate[],
  env: EnvVars
): { normalized: Record<string, McpServerConfig>; skipped: McpServerTemplate[] } {
  const result: Record<string, McpServerConfig> = {};
  const skipped: McpServerTemplate[] = [];

  for (const server of servers) {
    if (server.transport !== "stdio") {
      skipped.push(server);
      continue;
    }
    // Use standard generator for Amp CLI (which uses stdio format)
    const config = server.configs.standard(env) as StdioServerConfig;
    result[server.id] = config;
  }

  return { normalized: result, skipped };
}

// =============================================================================
// Editor Adapter Implementation
// =============================================================================

export const ampCliAdapter: EditorAdapter = {
  id: "amp-cli",
  name: "Amp CLI",
  type: "cli",
  supportsHttp: false,
  globalConfig: GLOBAL_CONFIG_LOCATION,
  format: "amp.mcpServers",

  /**
   * Detect if Amp CLI is installed.
   */
  async detectInstalled(): Promise<boolean> {
    return detectAmpCliInstalled();
  },

  /**
   * Read MCP config from Amp CLI's settings.json.
   * Only supports global config (no project-level support).
   */
  async readConfig(scope: "project" | "global"): Promise<McpConfigFile | null> {
    // Amp CLI only supports global config
    if (scope === "project") {
      return null;
    }

    if (!this.globalConfig) {
      return null;
    }

    return parseAmpCliConfig(this.globalConfig.path);
  },

  /**
   * Write MCP config to Amp CLI's settings.json.
   * Only supports global config (no project-level support).
   */
  async writeConfig(
    scope: "project" | "global",
    servers: McpServerTemplate[],
    env: EnvVars
  ): Promise<DryRunResult> {
    // Amp CLI only supports global config
    if (scope === "project") {
      return {
        success: false,
        targetPath: "",
        operation: "skip",
        currentContent: null,
        proposedContent: "",
        diff: "[Amp CLI does not support project-level config]",
        errors: ["Project-level config not supported by Amp CLI"],
        warnings: [],
      };
    }

    if (!this.globalConfig) {
      return {
        success: false,
        targetPath: "",
        operation: "skip",
        currentContent: null,
        proposedContent: "",
        diff: "[No global config location configured]",
        errors: ["Global config location not configured"],
        warnings: [],
      };
    }

    const targetPath = resolvePath(this.globalConfig.path);

    // Normalize servers to Amp CLI format
    const { normalized, skipped } = normalizeServersForAmpCli(servers, env);

    // Write config with backup for global file
    const result = await writeConfig(
      targetPath,
      normalized,
      this.globalConfig.key,
      this.globalConfig.format,
      {
        createIfMissing: true,
        createBackup: true,
        preserveExisting: true,
      }
    );

    if (skipped.length === 0) {
      return result.dryRun;
    }

    return {
      ...result.dryRun,
      warnings: [
        ...result.dryRun.warnings,
        `Skipped ${skipped.length} HTTP server(s); Amp CLI supports stdio only.`,
      ],
    };
  },
};
