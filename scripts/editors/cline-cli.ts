/**
 * @fileoverview MCP editor adapter for Cline CLI; manages MCP server configuration for that CLI tool.
 *
 * @testing Jest unit: npm test -- scripts/editors/cli-tools.unit.test.ts
 * @see scripts/editors/cli-tools.unit.test.ts - Jest suite that exercises the CLI editor adapters.
 * @documentation reviewed=2026-04-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import type {
  EditorAdapter,
  McpConfigFile,
  McpServerConfig,
  McpServerTemplate,
  EnvVars,
  DryRunResult,
} from "../lib";
import {
  resolvePath,
  readFileSafe,
  isFileReadable,
  isFileWritable,
  parseJsonOrJsonc,
  writeConfig,
  toDisplayPath,
} from "../lib";
import { execSync } from "child_process";

/**
 * Check if Cline CLI is installed by attempting to run `cline --version`.
 */
async function detectClineCli(): Promise<boolean> {
  try {
    execSync("cline --version", { stdio: "ignore", timeout: 5000 });
    return true;
  } catch (e) {
    console.error("Failed to detect Cline CLI:", e);
    return false;
  }
}

/**
 * Read MCP configuration from Cline CLI config file.
 */
async function readClineConfig(scope: "project" | "global"): Promise<McpConfigFile | null> {
  // Cline CLI only supports global configuration
  if (scope === "project") {
    return null;
  }

  const configPath = resolvePath("~/.cline/cline_mcp_settings.json");

  // Check if file is readable
  const isReadable = await isFileReadable(configPath);
  if (!isReadable) {
    return {
      path: configPath,
      format: "json",
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
      format: "json",
      rawContent: "",
      servers: {},
      exists: false,
    };
  }

  // Parse JSON content
  const parseResult = parseJsonOrJsonc<Record<string, unknown>>(readResult.data);
  if (!parseResult.success) {
    return {
      path: configPath,
      format: "json",
      rawContent: readResult.data,
      servers: {},
      exists: true,
    };
  }

  // Extract mcpServers key
  const mcpServers = (parseResult.data as Record<string, unknown>)?.mcpServers;
  const servers = typeof mcpServers === "object" && mcpServers !== null
    ? (mcpServers as Record<string, unknown>)
    : {};

  return {
    path: configPath,
    format: "json",
    rawContent: readResult.data,
    servers: servers as Record<string, McpServerConfig>,
    exists: true,
  };
}

/**
 * Write MCP configuration to Cline CLI config file.
 */
async function writeClineConfig(
  scope: "project" | "global",
  servers: McpServerTemplate[],
  env: EnvVars
): Promise<DryRunResult> {
  // Cline CLI only supports global configuration
  if (scope === "project") {
    return {
      success: false,
      targetPath: "",
      operation: "skip",
      currentContent: null,
      proposedContent: "",
      diff: "",
      errors: ["Cline CLI does not support project-level MCP configuration"],
      warnings: [],
    };
  }

  const configPath = resolvePath("~/.cline/cline_mcp_settings.json");

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

  // Build server config object from templates
  const serverConfigs: Record<string, McpServerConfig> = {};
  for (const template of servers) {
    const config = template.configs.standard(env);
    serverConfigs[template.id] = config;
  }

  // Write using the standard config writer with backup
  const writeResult = await writeConfig(
    configPath,
    serverConfigs,
    "mcpServers",
    "json",
    {
      createIfMissing: true,
      createBackup: true,
      preserveExisting: true,
    }
  );

  return writeResult.dryRun;
}

/**
 * Cline CLI Editor Adapter
 *
 * Handles MCP configuration for Cline CLI.
 * - Detection: Checks if `cline` command is available
 * - Config Reading: Reads from ~/.cline/cline_mcp_settings.json (global only)
 * - Config Writing: Writes to ~/.cline/cline_mcp_settings.json with backup
 */
export const clineCliAdapter: EditorAdapter = {
  id: "cline-cli",
  name: "Cline CLI",
  type: "cli",
  format: "mcpServers",
  globalConfig: {
    path: "~/.cline/cline_mcp_settings.json",
    key: "mcpServers",
    format: "json",
  },
  // Note: projectConfig is undefined (not supported)

  /**
   * Detect if Cline CLI is installed.
   */
  async detectInstalled(): Promise<boolean> {
    return detectClineCli();
  },

  /**
   * Read MCP configuration from Cline CLI config file.
   */
  async readConfig(scope: "project" | "global"): Promise<McpConfigFile | null> {
    return readClineConfig(scope);
  },

  /**
   * Write MCP configuration to Cline CLI config file.
   */
  async writeConfig(
    scope: "project" | "global",
    servers: McpServerTemplate[],
    env: EnvVars
  ): Promise<DryRunResult> {
    return writeClineConfig(scope, servers, env);
  },

  /**
   * Generate manual instructions for Cline CLI.
   */
  generateInstructions(servers: McpServerTemplate[], env: EnvVars): string {
    const lines: string[] = [
      "# Cline CLI MCP Configuration",
      "",
      "Cline CLI uses a JSON configuration file at `~/.cline/cline_mcp_settings.json`.",
      "",
      "## Configuration Structure",
      "",
      "The file should contain an `mcpServers` key with server definitions:",
      "",
      "```json",
      "{",
      '  "mcpServers": {',
    ];

    // Add each server to the instructions
    for (const server of servers) {
      const config = server.configs.standard(env);
      lines.push(`    "${server.id}": {`);

      if ("command" in config) {
        lines.push(`      "command": "${config.command}",`);
        if (config.args) {
          const args = config.args.map((a) => `"${a}"`).join(", ");
          lines.push(`      "args": [${args}],`);
        }
        if (config.env && Object.keys(config.env).length > 0) {
          lines.push("      \"env\": {");
          const envEntries = Object.entries(config.env);
          envEntries.forEach(([key, value], idx) => {
            const comma = idx < envEntries.length - 1 ? "," : "";
            lines.push(`        "${key}": "${value}"${comma}`);
          });
          lines.push("      }");
        }
      } else if ("url" in config) {
        lines.push(`      "url": "${config.url}"`);
        if (config.headers && Object.keys(config.headers).length > 0) {
          lines.push(",");
          lines.push("      \"headers\": {");
          const headerEntries = Object.entries(config.headers);
          headerEntries.forEach(([key, value], idx) => {
            const comma = idx < headerEntries.length - 1 ? "," : "";
            lines.push(`        "${key}": "${value}"${comma}`);
          });
          lines.push("      }");
        }
      }

      lines.push("    },");
    }

    lines.push("  }");
    lines.push("}");
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
export default clineCliAdapter;
