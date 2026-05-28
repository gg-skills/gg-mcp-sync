/**
 * @fileoverview MCP editor adapter for Cody; manages MCP server configuration for that VSCode extension.
 *
 * @testing Jest unit: npm test -- scripts/editors/vscode-extensions.unit.test.ts
 * @see scripts/editors/vscode-extensions.unit.test.ts - Jest suite that exercises the VSCode extension adapters.
 * @documentation reviewed=2026-04-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import type {
  ConfigLocation,
  DryRunResult,
  EditorAdapter,
  EnvVars,
  McpConfigFile,
  McpServerTemplate,
} from "../lib";

// =============================================================================
// Configuration Locations
// =============================================================================

const GLOBAL_CONFIG: ConfigLocation = {
  path: "~/Library/Application Support/Code/User/settings.json",
  key: "openctx.providers",
  format: "json",
};

// =============================================================================
// Adapter Implementation
// =============================================================================

export const codyExtAdapter: EditorAdapter = {
  id: "cody-ext",
  name: "Cody (VSCode Ext)",
  type: "vscode-ext",
  format: "openctx.providers",

  /**
   * Global config location for Cody VSCode extension
   */
  globalConfig: GLOBAL_CONFIG,

  /**
   * Project config is not supported for Cody VSCode extension
   */
  projectConfig: undefined,

  /**
   * Check if Cody VSCode extension is installed.
   * Since Cody integrates with VSCode settings, we return false as detection
   * is complex and users should manually verify installation.
   */
  async detectInstalled(): Promise<boolean> {
    // Cody detection is complex and platform-specific
    // Return false to indicate this should be done manually
    return false;
  },

  /**
   * Read config is not supported for Cody (UI-only adapter).
   * Returns null for both scopes since OpenCtx configuration requires manual setup.
   */
  async readConfig(_scope: "project" | "global"): Promise<McpConfigFile | null> {
    // UI-only adapter - configuration is not read programmatically
    return null;
  },

  /**
   * Write config is not supported for Cody (UI-only adapter).
   * Returns an unsupported operation result with instructions.
   */
  async writeConfig(
    _scope: "project" | "global",
    _servers: McpServerTemplate[],
    _env: EnvVars
  ): Promise<DryRunResult> {
    // Cody uses OpenCtx provider pattern which cannot be auto-configured
    return {
      success: false,
      targetPath: "",
      operation: "skip",
      currentContent: null,
      proposedContent: "",
      diff: "Cody uses OpenCtx provider pattern - manual configuration required",
      errors: [
        "Cody VSCode extension uses OpenCtx provider pattern which requires manual UI configuration.",
        "Please use the generateInstructions() method for step-by-step setup instructions.",
      ],
      warnings: [],
    };
  },

  /**
   * Generate manual instructions for Cody VSCode extension.
   * Since Cody uses OpenCtx provider pattern, configuration must be done manually
   * through VSCode settings or the Cody extension UI.
   */
  generateInstructions(
    servers: McpServerTemplate[],
    env: EnvVars
  ): string {
    const lines: string[] = [
      "# Cody (VSCode Extension) - MCP Configuration",
      "",
      "Cody uses the **OpenCtx provider pattern** for MCP integration, which requires manual configuration.",
      "This is different from standard MCP server configurations used by other editors.",
      "",
      "## Important Notes",
      "",
      "- Cody configuration cannot be automated due to the OpenCtx provider pattern complexity",
      "- You must manually edit VSCode settings or use the Cody extension UI",
      "- Platform: macOS (~/Library/Application Support/Code/User/settings.json)",
      "- For other platforms, adjust the path accordingly (Windows: %APPDATA%\\Code\\User\\settings.json)",
      "",
      "## Step 1: Open VSCode Settings",
      "",
      "1. Open VSCode",
      "2. Press `Cmd + ,` (macOS) or `Ctrl + ,` (Windows/Linux) to open Settings",
      "3. Switch to the JSON editor view (click the `{}` icon in top right)",
      "",
      "## Step 2: Add OpenCtx Provider Configuration",
      "",
      "Add or modify the `openctx.providers` section in your VSCode settings.json:",
      "",
      "```json",
      "{",
      '  "openctx.providers": {',
      '    "https://openctx.org/npm/@openctx/provider-modelcontextprotocol": {',
      '      "nodeCommand": "node",',
    ];

    const stdioServers = servers.filter((server) => server.transport === "stdio");
    const skippedServers = servers.filter((server) => server.transport !== "stdio");

    // Add server instructions
    for (let i = 0; i < stdioServers.length; i++) {
      const server = stdioServers[i];
      const config = server.configs.standard(env);

      if (i === 0) {
        lines.push(`      "mcp.provider.uri": "file://<path-to-mcp-server>",`);
      }

      if ("command" in config) {
        lines.push(`      "mcp.provider.${server.id}.command": "${config.command}",`);

        if (config.args && config.args.length > 0) {
          const argsStr = config.args.map((a) => `"${a}"`).join(", ");
          lines.push(`      "mcp.provider.${server.id}.args": [${argsStr}],`);
        }

        if (config.env && Object.keys(config.env).length > 0) {
          const envStr = JSON.stringify(config.env);
          lines.push(`      "mcp.provider.${server.id}.env": ${envStr},`);
        }
      }
    }

    lines.push('    }');
    lines.push('  }');
    lines.push('}');
    lines.push("```");
    lines.push("");
    lines.push("## Step 3: Configure Environment Variables");
    lines.push("");

    // List required environment variables
    const allEnvVars = new Set<string>();
    for (const server of stdioServers) {
      for (const envVar of server.envVars) {
        allEnvVars.add(envVar);
      }
    }

    if (allEnvVars.size > 0) {
      lines.push("Set these environment variables in your shell profile (~/.zshrc, ~/.bash_profile, etc.):");
      lines.push("");

      for (const envVar of Array.from(allEnvVars).sort()) {
        const value = env[envVar] || "<your-value-here>";
        lines.push(`export ${envVar}="${value}"`);
      }

      lines.push("");
      lines.push("Or in VSCode settings:");
      lines.push("");
      lines.push("```json");
      lines.push("{");
      lines.push('  "env": {');

      const envEntries = Array.from(allEnvVars).sort();
      envEntries.forEach((envVar, idx) => {
        const value = env[envVar] || "<your-value-here>";
        const comma = idx < envEntries.length - 1 ? "," : "";
        lines.push(`    "${envVar}": "${value}"${comma}`);
      });

      lines.push("  }");
      lines.push("}");
      lines.push("```");
    } else {
      lines.push("No additional environment variables are required.");
    }

    lines.push("");
    lines.push("## Step 4: Verify Configuration");
    lines.push("");
    lines.push("1. Reload VSCode (Cmd + R on macOS)");
    lines.push("2. Open Cody chat panel");
    lines.push("3. Check that your MCP servers are available in the context providers");
    lines.push("");
    lines.push("## Reference");
    lines.push("");
    lines.push("- [OpenCtx Documentation](https://openctx.org/)");
    lines.push("- [Cody Extension Documentation](https://cody.dev/)");
    lines.push("- [VSCode Settings JSON](https://code.visualstudio.com/docs/getstarted/settings#_settings-file-locations)");
    lines.push("");
    lines.push("## Server Details");
    lines.push("");

    for (const server of servers) {
      lines.push(`### ${server.name}`);
      lines.push(`- ID: \`${server.id}\``);
      lines.push(`- Transport: \`${server.transport}\``);

      if (server.envVars.length > 0) {
        lines.push("- Required environment variables:");
        for (const envVar of server.envVars) {
          lines.push(`  - \`${envVar}\``);
        }
      }

      lines.push("");
    }

    if (skippedServers.length > 0) {
      lines.push("");
      lines.push(
        `Note: Skipped ${skippedServers.length} HTTP server(s); Cody OpenCtx providers support stdio only.`
      );
    }

    return lines.join("\n");
  },
};
