/**
 * @fileoverview MCP editor adapter for Goose CLI; manages MCP server configuration for that CLI tool.
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
  EnvVars,
  DryRunResult,
  GooseExtensionConfig,
} from "../lib";
import {
  resolvePath,
  fileExists,
  readFileSafe,
  writeFileSafe,
  isFileReadable,
  isFileWritable,
  toDisplayPath,
  createBackupIfExists,
  cleanupOldBackups,
  dryRunWrite,
} from "../lib";
import yaml from "js-yaml";

// =============================================================================
// Installation Detection
// =============================================================================

/**
 * Detect if Goose CLI is installed by attempting to run `goose --version`.
 */
async function detectGooseCli(): Promise<boolean> {
  try {
    execSync("goose --version", { stdio: "ignore", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// Configuration Reading
// =============================================================================

/**
 * Parse YAML extensions format into a servers record.
 * Converts Goose's extensions format back to standard server config.
 */
function parseGooseYaml(content: string): Record<string, McpServerConfig> {

  try {
    const parsed = yaml.load(content) as Record<string, unknown>;

    // Extract extensions object
    const extensions = parsed?.extensions as Record<string, unknown>;
    if (!extensions || typeof extensions !== "object") {
      return {};
    }

    // Convert extensions format back to server configs
    const servers: Record<string, McpServerConfig> = {};
    for (const [id, ext] of Object.entries(extensions)) {
      if (typeof ext === "object" && ext !== null) {
        const extConfig = ext as Record<string, unknown>;
        servers[id] = {
          command: extConfig.command as string,
          args: extConfig.args as string[] | undefined,
          env: extConfig.env as Record<string, string> | undefined,
        };
      }
    }

    return servers;
  } catch {
    return {};
  }
}

/**
 * Read MCP configuration from Goose CLI config file.
 */
async function readGooseConfig(scope: "project" | "global"): Promise<McpConfigFile | null> {
  // Goose CLI only supports global configuration
  if (scope === "project") {
    return null;
  }

  const configPath = resolvePath("~/.config/goose/config.yaml");

  // Check if file is readable
  const isReadable = await isFileReadable(configPath);
  if (!isReadable) {
    return {
      path: configPath,
      format: "yaml",
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
      format: "yaml",
      rawContent: "",
      servers: {},
      exists: false,
    };
  }

  // Parse YAML content
  const servers = parseGooseYaml(readResult.data);

  return {
    path: configPath,
    format: "yaml",
    rawContent: readResult.data,
    servers,
    exists: true,
  };
}

// =============================================================================
// Configuration Writing
// =============================================================================

/**
 * Serialize servers to Goose YAML extensions format.
 */
function serializeToGooseYaml(
  servers: McpServerTemplate[],
  env: EnvVars
): string {

  // Convert to Goose extensions format
  const extensions: Record<string, unknown> = {};
  for (const server of servers) {
    if (server.transport !== "stdio") {
      continue;
    }
    // Use goose-specific config if available, otherwise fall back to standard
    const config =
      server.configs.goose?.(env) || (server.configs.standard(env) as GooseExtensionConfig);

    extensions[server.id] = {
      name: config.name || server.id,
      command: config.command,
      args: config.args,
      env: config.env,
      timeout: config.timeout ?? 300,
    };
  }

  return yaml.dump({ extensions }, { indent: 2, lineWidth: 100 });
}

/**
 * Merge new servers with existing Goose YAML config.
 */
async function mergeGooseConfig(
  configPath: string,
  servers: McpServerTemplate[],
  env: EnvVars,
  preserveExisting: boolean
): Promise<string> {
  const newYamlContent = serializeToGooseYaml(servers, env);

  // If not preserving existing or file doesn't exist, return new content
  if (!preserveExisting || !fileExists(configPath)) {
    return newYamlContent;
  }

  // Read existing content
  const readResult = await readFileSafe(configPath);
  if (!readResult.success) {
    return newYamlContent;
  }


  try {
    const existingData = yaml.load(readResult.data);
    const baseDoc =
      existingData && typeof existingData === "object"
        ? (existingData as Record<string, unknown>)
        : {};
    const existingExtensions = (baseDoc.extensions ||
      {}) as Record<string, unknown>;

    // Merge: new servers override existing
    const newExtensions = { ...existingExtensions };

    // Remove old servers that aren't in the new list
    for (const id of Object.keys(newExtensions)) {
      if (!newExtensions[id]) {
        delete newExtensions[id];
      }
    }

    // Add new servers
    for (const server of servers) {
      const config =
        server.configs.goose?.(env) || (server.configs.standard(env) as GooseExtensionConfig);

      newExtensions[server.id] = {
        name: config.name || server.id,
        command: config.command,
        args: config.args,
        env: config.env,
        timeout: config.timeout ?? 300,
      };
    }

    baseDoc.extensions = newExtensions;
    return yaml.dump(baseDoc, { indent: 2, lineWidth: 100 });
  } catch {
    // If parsing fails, return new content
    return newYamlContent;
  }
}

/**
 * Write MCP configuration to Goose CLI config file.
 */
async function writeGooseConfig(
  scope: "project" | "global",
  servers: McpServerTemplate[],
  env: EnvVars
): Promise<DryRunResult> {
  // Goose CLI only supports global configuration
  if (scope === "project") {
    return {
      success: false,
      targetPath: "",
      operation: "skip",
      currentContent: null,
      proposedContent: "",
      diff: "",
      errors: ["Goose CLI does not support project-level MCP configuration"],
      warnings: [],
    };
  }

  const configPath = resolvePath("~/.config/goose/config.yaml");

  // Check write permissions
  const isWritable = await isFileWritable(configPath);
  if (!isWritable && fileExists(configPath)) {
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

  const stdioServers = servers.filter((server) => server.transport === "stdio");
  const skippedServers = servers.filter((server) => server.transport !== "stdio");

  // Merge with existing config (preserve existing extensions)
  const proposedContent = await mergeGooseConfig(configPath, stdioServers, env, true);

  // Dry-run validation
  const dryRunResult = await dryRunWrite(configPath, proposedContent, {
    format: "yaml",
    createIfMissing: true,
  });

  if (!dryRunResult.success) {
    return dryRunResult;
  }

  // Create backup for global config
  if (fileExists(configPath)) {
    await createBackupIfExists(configPath);
  }

  // Write the file
  const writeResult = await writeFileSafe(configPath, proposedContent);
  if (!writeResult.success) {
    return {
      ...dryRunResult,
      success: false,
      errors: [...dryRunResult.errors, writeResult.error || "Unknown write error"],
    };
  }

  // Cleanup old backups
  await cleanupOldBackups(configPath);

  return {
    ...dryRunResult,
    success: true,
    targetPath: configPath,
    operation: fileExists(configPath) ? "update" : "create",
    warnings:
      skippedServers.length > 0
        ? [`Skipped ${skippedServers.length} HTTP server(s) (Goose CLI supports stdio only).`]
        : [],
  };
}

// =============================================================================
// Editor Adapter Export
// =============================================================================

/**
 * Goose CLI editor adapter
 *
 * Handles MCP configuration for Goose CLI using YAML extensions format.
 * - Detection: Checks if `goose` command is available
 * - Config Reading: Reads from ~/.config/goose/config.yaml (global only)
 * - Config Writing: Writes to ~/.config/goose/config.yaml with backup
 * - Format: YAML with `extensions` key containing server definitions
 */
export const gooseCliAdapter: EditorAdapter = {
  id: "goose-cli",
  name: "Goose CLI",
  type: "cli",
  supportsHttp: false,
  format: "extensions",

  // Global config: ~/.config/goose/config.yaml
  globalConfig: {
    path: "~/.config/goose/config.yaml",
    key: "extensions",
    format: "yaml",
  },

  // Note: projectConfig is undefined (not supported)

  /**
   * Detect if Goose CLI is installed.
   */
  async detectInstalled(): Promise<boolean> {
    return detectGooseCli();
  },

  /**
   * Read MCP configuration from Goose CLI config file.
   */
  async readConfig(scope: "project" | "global"): Promise<McpConfigFile | null> {
    return readGooseConfig(scope);
  },

  /**
   * Write MCP configuration to Goose CLI config file.
   */
  async writeConfig(
    scope: "project" | "global",
    servers: McpServerTemplate[],
    env: EnvVars
  ): Promise<DryRunResult> {
    return writeGooseConfig(scope, servers, env);
  },

  /**
   * Generate manual instructions for Goose CLI.
   */
  generateInstructions(servers: McpServerTemplate[], env: EnvVars): string {
    const lines: string[] = [
      "# Goose CLI MCP Configuration",
      "",
      "Goose CLI uses a YAML configuration file at `~/.config/goose/config.yaml`.",
      "",
      "## Configuration Structure",
      "",
      "The file should contain an `extensions` key with server definitions:",
      "",
      "```yaml",
      "extensions:",
    ];

    const stdioServers = servers.filter((server) => server.transport === "stdio");
    const skippedServers = servers.filter((server) => server.transport !== "stdio");

    // Add each server to the instructions
    for (const server of stdioServers) {
      const config = server.configs.goose?.(env) || server.configs.standard(env);
      const gooseConfig = config as GooseExtensionConfig;
      lines.push(`  ${server.id}:`);
      lines.push(`    name: ${gooseConfig.name || server.id}`);

      if ("command" in config) {
        lines.push(`    command: ${config.command}`);

        if (config.args && config.args.length > 0) {
          lines.push("    args:");
          for (const arg of config.args) {
            lines.push(`      - ${arg}`);
          }
        }

        if (config.env && Object.keys(config.env).length > 0) {
          lines.push("    env:");
          for (const [key, value] of Object.entries(config.env)) {
            lines.push(`      ${key}: ${value}`);
          }
        }

        lines.push("    timeout: 300");
      }
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
        const status = env[envVar] ? " (currently set)" : " (not set)";
        lines.push(`- \`${envVar}\`${status}`);
      }
    } else {
      lines.push("No additional environment variables are required.");
    }

    if (skippedServers.length > 0) {
      lines.push("");
      lines.push(
        `Note: Skipped ${skippedServers.length} HTTP server(s); Goose CLI supports stdio servers only.`
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
export default gooseCliAdapter;
