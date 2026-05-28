/**
 * @fileoverview MCP editor adapter for Codex CLI; writes stdio and Codex bridge MCP servers.
 *
 * @testing Jest unit: npm test -- scripts/editors/cli-tools.unit.test.ts
 * @see scripts/editors/cli-tools.unit.test.ts - Jest suite that exercises the CLI editor adapters.
 * @documentation reviewed=2026-05-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { execSync } from "child_process";
import type {
  EditorAdapter,
  ConfigLocation,
  McpConfigFile,
  McpServerConfig,
  McpServerTemplate,
  EnvVars,
  DryRunResult,
  StdioServerConfig,
} from "../lib";
import {
  resolvePath,
  fileExists,
  readFileSafe,
  isFileReadable,
  isFileWritable,
  writeFileSafe,
  toDisplayPath,
} from "../lib";
import { dryRunWrite } from "../lib/dry-run";
import { createBackupIfExists, cleanupOldBackups } from "../lib/backup";

// =============================================================================
// Configuration Locations
// =============================================================================

const PROJECT_CONFIG: ConfigLocation = {
  path: ".codex/config.toml",
  key: "mcp",
  format: "toml",
};

const GLOBAL_CONFIG: ConfigLocation = {
  path: "~/.codex/config.toml",
  key: "mcp",
  format: "toml",
};

// =============================================================================
// Installation Detection
// =============================================================================

/**
 * Check if Codex CLI is installed by attempting to run `codex --version`.
 */
async function detectCodexCli(): Promise<boolean> {
  try {
    execSync("codex --version", { stdio: "ignore", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// TOML Parsing & Serialization
// =============================================================================

/**
 * Simple TOML parser for reading MCP config.
 * Extracts [mcp_servers.*] sections.
 */
function parseToml(content: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  if (!content.trim()) {
    return result;
  }

  // Extract [mcp_servers.server-id] sections
  const serverPattern = /\[mcp_servers\.([^\]]+)\]([\s\S]*?)(?=\n\[|$)/g;
  let match;

  while ((match = serverPattern.exec(content)) !== null) {
    const serverId = match[1];
    const serverContent = match[2];
    const serverConfig: Record<string, unknown> = {};

    // Parse command
    const commandMatch = serverContent.match(/command\s*=\s*"([^"]+)"/);
    if (commandMatch) {
      serverConfig.command = commandMatch[1];
    }

    // Parse args array
    const argsMatch = serverContent.match(/args\s*=\s*\[(.*?)\]/s);
    if (argsMatch) {
      const argsStr = argsMatch[1];
      const args = argsStr
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s)
        .map((s) => s.replace(/^"(.*)"$/, "$1"));
      if (args.length > 0) {
        serverConfig.args = args;
      }
    }

    const startupTimeoutMatch = serverContent.match(/startup_timeout_sec\s*=\s*(\d+(?:\.\d+)?)/);
    if (startupTimeoutMatch) {
      serverConfig.startup_timeout_sec = Number(startupTimeoutMatch[1]);
    }

    // Parse env variables from [mcp_servers.server-id.env]
    const envPattern = new RegExp(
      `\\[mcp_servers\\.${serverId}\\.env\\]([\\s\\S]*?)(?=\\n\\[|$)`
    );
    const envMatch = envPattern.exec(content);
    if (envMatch) {
      const envContent = envMatch[1];
      const envObj: Record<string, string> = {};
      const envLinePattern = /([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"([^"]*)"/g;
      let envLineMatch;

      while ((envLineMatch = envLinePattern.exec(envContent)) !== null) {
        envObj[envLineMatch[1]] = envLineMatch[2];
      }

      if (Object.keys(envObj).length > 0) {
        serverConfig.env = envObj;
      }
    }

    result[serverId] = serverConfig;
  }

  return result;
}

/**
 * Serialize servers to TOML format (Codex).
 * Uses [mcp_servers.name] format as per Codex documentation.
 */
function getParsedCodexServerConfigMap(content: string): Record<string, Record<string, unknown>> {
  const parsed = parseToml(content);
  const result: Record<string, Record<string, unknown>> = {};

  for (const [serverId, serverConfig] of Object.entries(parsed)) {
    if (serverConfig && typeof serverConfig === "object") {
      result[serverId] = serverConfig;
    }
  }

  return result;
}

/**
 * Encode a value as a TOML basic string.
 *
 * @remarks
 * JSON string escaping is compatible with TOML basic strings for the values emitted here, including
 * quoted shell snippets used by Codex bridge commands.
 */
function formatTomlString(value: string): string {
  return JSON.stringify(value);
}

/**
 * Serialize managed MCP server maps into Codex `[mcp_servers.*]` TOML blocks.
 *
 * @remarks
 * Emits `command`, `args`, optional `startup_timeout_sec`, and nested `[mcp_servers.<id>.env]`
 * tables when present. Inserts blank lines between server blocks so appended output stays readable
 * when merged with preserved non-MCP TOML from an existing file.
 */
function serializeToml(servers: Record<string, unknown>, _includeHeader: boolean = true): string {
  const lines: string[] = [];

  for (const [id, configAny] of Object.entries(servers)) {
    const config = configAny as Record<string, unknown>;
    lines.push(`[mcp_servers.${id}]`);

    // Write command
    if (config.command) {
      lines.push(`command = ${formatTomlString(String(config.command))}`);
    }

    // Write args
    if (config.args && Array.isArray(config.args) && config.args.length > 0) {
      const argsStr = (config.args as string[])
        .map((a) => formatTomlString(a))
        .join(", ");
      lines.push(`args = [${argsStr}]`);
    }

    if (typeof config.startup_timeout_sec === "number") {
      lines.push(`startup_timeout_sec = ${config.startup_timeout_sec}`);
    }

    // Write env
    if (config.env && typeof config.env === "object") {
      const envObj = config.env as Record<string, string>;
      if (Object.keys(envObj).length > 0) {
        lines.push("");
        lines.push(`[mcp_servers.${id}.env]`);
        for (const [key, value] of Object.entries(envObj)) {
          lines.push(`${key} = ${formatTomlString(value)}`);
        }
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Remove MCP-related TOML sections from Codex config text prior to rewriting managed servers.
 *
 * @remarks
 * Drops lines under `[mcp_servers.*]`, legacy `[mcp.servers.*]`, and the standalone `[mcp]`
 * header while leaving unrelated tables and key order elsewhere untouched.
 */
function removeMcpServerBlocks(content: string): string {
  const lines = content.split("\n");
  const output: string[] = [];
  let skip = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const sectionMatch = trimmed.match(/^\[([^\]]+)\]\s*$/);
    if (sectionMatch) {
      const section = sectionMatch[1];
      // Remove both old format (mcp.servers.) and new format (mcp_servers.)
      if (section.startsWith("mcp_servers.") || section.startsWith("mcp.servers.")) {
        skip = true;
        continue;
      }
      // Also skip the standalone [mcp] section if it exists
      if (section === "mcp") {
        skip = true;
        continue;
      }
      skip = false;
    }

    if (!skip) {
      output.push(line);
    }
  }

  return output.join("\n");
}

// =============================================================================
// Configuration Reading
// =============================================================================

/**
 * Read MCP configuration from Codex CLI config file (TOML format).
 */
async function readCodexConfig(scope: "project" | "global"): Promise<McpConfigFile | null> {
  const configLoc = scope === "project" ? PROJECT_CONFIG : GLOBAL_CONFIG;
  const configPath = resolvePath(configLoc.path);

  // Check if file is readable
  const isReadable = await isFileReadable(configPath);
  if (!isReadable) {
    return {
      path: configPath,
      format: "toml",
      rawContent: "",
      servers: {},
      exists: false,
    };
  }

  // Read file content
  const readResult = await readFileSafe(configPath);
  if (!readResult.success) {
    return {
      path: configPath,
      format: "toml",
      rawContent: "",
      servers: {},
      exists: false,
    };
  }

  // Parse TOML content
  const servers = parseToml(readResult.data);

  return {
    path: configPath,
    format: "toml",
    rawContent: readResult.data,
    servers: servers as Record<string, McpServerConfig>,
    exists: true,
  };
}

// =============================================================================
// Configuration Writing
// =============================================================================

/**
 * Write MCP configuration to Codex CLI config file (TOML format).
 */
async function writeCodexConfig(
  scope: "project" | "global",
  servers: McpServerTemplate[],
  env: EnvVars
): Promise<DryRunResult> {
  const configLoc = scope === "project" ? PROJECT_CONFIG : GLOBAL_CONFIG;
  const configPath = resolvePath(configLoc.path);

  // Check write permissions
  const isWritable = await isFileWritable(configPath);
  if (!isWritable) {
    return {
      success: false,
      targetPath: configPath,
      operation: "update",
      currentContent: null,
      proposedContent: "",
      diff: "",
      errors: [
        `Configuration file is not writable: ${toDisplayPath(configPath)}`,
        "Check file permissions or ensure the parent directory exists and is writable",
      ],
      warnings: [],
    };
  }

  const codexCompatibleServers = servers.filter((server) => {
    return server.transport === "stdio" || Boolean(server.configs.codex);
  });
  const skippedServers = servers.filter((server) => {
    return server.transport !== "stdio" && !server.configs.codex;
  });
  const existingResult = await readFileSafe(configPath);
  const existingManagedConfigs = existingResult.success
    ? getParsedCodexServerConfigMap(existingResult.data)
    : {};

  // Build server config object from templates using codex format
  const serverConfigs: Record<string, unknown> = {};
  for (const template of codexCompatibleServers) {
    // Use codex format if available, otherwise use standard
    const config = template.configs.codex
      ? template.configs.codex(env)
      : template.configs.standard(env);
    const existingConfig = existingManagedConfigs[template.id];
    if (
      typeof existingConfig?.startup_timeout_sec === "number"
      && typeof config.startup_timeout_sec !== "number"
    ) {
      config.startup_timeout_sec = existingConfig.startup_timeout_sec;
    }
    serverConfigs[template.id] = config;
  }

  // Serialize to TOML, preserving non-MCP content when possible
  let proposedContent = serializeToml(serverConfigs);
  if (existingResult.success && existingResult.data.trim().length > 0) {
    const baseContent = removeMcpServerBlocks(existingResult.data).trimEnd();
    const hasMcpHeader = /\[mcp\]/.test(baseContent);
    const appended = serializeToml(serverConfigs, !hasMcpHeader);
    proposedContent = `${baseContent}\n\n${appended}`.trim() + "\n";
  }

  // Dry-run validation
  const dryRunOptions = {
    format: "toml" as const,
    createIfMissing: true,
  };

  const dryRun = await dryRunWrite(configPath, proposedContent, dryRunOptions);

  if (!dryRun.success) {
    return dryRun;
  }

  // Create backup if global config
  if (scope === "global" && fileExists(configPath)) {
    await createBackupIfExists(configPath);
  }

  // Write the file
  const writeResult = await writeFileSafe(configPath, proposedContent);

  if (!writeResult.success) {
    return {
      ...dryRun,
      success: false,
      errors: [...dryRun.errors, writeResult.error || "Unknown write error"],
    };
  }

  // Cleanup old backups
  if (scope === "global") {
    await cleanupOldBackups(configPath);
  }

  return {
    ...dryRun,
    success: true,
    targetPath: configPath,
    operation: fileExists(configPath) ? "update" : "create",
    warnings:
      skippedServers.length > 0
        ? [
            `Skipped ${skippedServers.length} HTTP server(s) without Codex bridge config.`,
          ]
        : [],
  };
}

// =============================================================================
// Editor Adapter Export
// =============================================================================

/**
 * Codex CLI Editor Adapter
 *
 * Handles MCP configuration for Codex CLI.
 * - Detection: Checks if `codex` command is available
 * - Config Reading: Reads from `.codex/config.toml` (project) or `~/.codex/config.toml` (global)
 * - Config Writing: Writes TOML for stdio servers and server-provided Codex bridge configs
 */
export const codexCliAdapter: EditorAdapter = {
  id: "codex-cli",
  name: "Codex CLI",
  type: "cli",
  supportsHttp: false,
  format: "mcp",
  projectConfig: PROJECT_CONFIG,
  globalConfig: GLOBAL_CONFIG,

  /**
   * Detect if Codex CLI is installed.
   */
  async detectInstalled(): Promise<boolean> {
    return detectCodexCli();
  },

  /**
   * Read MCP configuration from Codex CLI config file.
   */
  async readConfig(scope: "project" | "global"): Promise<McpConfigFile | null> {
    return readCodexConfig(scope);
  },

  /**
   * Write MCP configuration to Codex CLI config file.
   */
  async writeConfig(
    scope: "project" | "global",
    servers: McpServerTemplate[],
    env: EnvVars
  ): Promise<DryRunResult> {
    return writeCodexConfig(scope, servers, env);
  },

  /**
   * Generate manual instructions for Codex CLI.
   */
  generateInstructions(servers: McpServerTemplate[], env: EnvVars): string {
    const lines: string[] = [
      "# Codex CLI MCP Configuration",
      "",
      "Codex CLI uses TOML configuration files for MCP servers.",
      "",
      "## Configuration Files",
      "",
      "- **Project**: `.codex/config.toml` (in your project directory)",
      "- **Global**: `~/.codex/config.toml` (in your home directory)",
      "",
      "## Configuration Structure",
      "",
      "The TOML file uses the following structure:",
      "",
      "```toml",
      "[mcp]",
      "",
    ];

    const codexCompatibleServers = servers.filter((server) => {
      return server.transport === "stdio" || Boolean(server.configs.codex);
    });
    const skippedServers = servers.filter((server) => {
      return server.transport !== "stdio" && !server.configs.codex;
    });

    // Add each server to the instructions
    for (const server of codexCompatibleServers) {
      const rawConfig = server.configs.codex
        ? server.configs.codex(env)
        : server.configs.standard(env);
      // Codex CLI only supports stdio configs
      const config = rawConfig as StdioServerConfig;

      lines.push(`[mcp_servers.${server.id}]`);
      lines.push(`command = ${formatTomlString(config.command)}`);

      if (config.args && config.args.length > 0) {
        const args = config.args.map((a: string) => formatTomlString(a)).join(", ");
        lines.push(`args = [${args}]`);
      }

      if (typeof config.startup_timeout_sec === "number") {
        lines.push(`startup_timeout_sec = ${config.startup_timeout_sec}`);
      }

      if (config.env && Object.keys(config.env).length > 0) {
        lines.push("");
        lines.push(`[mcp_servers.${server.id}.env]`);
        for (const [key, value] of Object.entries(config.env)) {
          lines.push(`${key} = ${formatTomlString(value)}`);
        }
      }

      lines.push("");
    }

    lines.push("```");
    lines.push("");
    lines.push("## Environment Variables");
    lines.push("");

    // List required environment variables
    const allEnvVars = new Set<string>();
    for (const server of servers) {
      for (const envVar of server.envVars) {
        allEnvVars.add(envVar);
      }
    }

    if (allEnvVars.size > 0) {
      lines.push("Before using these MCP servers, ensure these environment variables are set:");
      lines.push("");
      for (const envVar of Array.from(allEnvVars).sort()) {
        const statusText = env[envVar] ? " (currently set)" : " (not set)";
        lines.push(`- \`${envVar}\`${statusText}`);
      }
    } else {
      lines.push("No additional environment variables are required.");
    }

    if (skippedServers.length > 0) {
      lines.push("");
      lines.push(
        `Note: Skipped ${skippedServers.length} HTTP server(s) without Codex bridge config.`
      );
    }

    lines.push("");
    lines.push("## Automatic Configuration");
    lines.push("");
    lines.push("You can also run the automated setup script from the project root:");
    lines.push("");
    lines.push("```bash");
    lines.push("mcp-sync setup");
    lines.push("```");

    return lines.join("\n");
  },
};

/**
 * Export as default for convenient imports
 */
export default codexCliAdapter;
