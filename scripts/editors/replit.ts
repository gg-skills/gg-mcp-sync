/**
 * @fileoverview MCP editor adapter for Replit; manages the web-based MCP configuration surface.
 *
 * @testing Jest unit: npm test -- scripts/editors/web-editors.unit.test.ts
 * @see scripts/editors/web-editors.unit.test.ts - Jest suite that exercises the web-based editor adapters.
 * @documentation reviewed=2026-04-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import type {
  EditorAdapter,
  DryRunResult,
  EnvVars,
  HttpServerConfig,
  McpConfigFile,
  McpServerTemplate,
  StdioServerConfig,
} from "../lib";

/**
 * Builds the union of `envVars` names declared on every server template.
 */
function collectRequiredEnvVarNames(servers: McpServerTemplate[]): Set<string> {
  const allEnvVars = new Set<string>();
  for (const server of servers) {
    for (const envVar of server.envVars) {
      allEnvVars.add(envVar);
    }
  }
  return allEnvVars;
}

/**
 * Appends Markdown bullets for a resolved stdio or HTTP standard config shape.
 */
function appendStandardConfigInstructionLines(
  lines: string[],
  config: StdioServerConfig | HttpServerConfig,
): void {
  if ("command" in config) {
    lines.push(`   - Command: \`${config.command}\``);

    if (config.args && config.args.length > 0) {
      lines.push(`   - Arguments: \`${config.args.join(" ")}\``);
    }

    if (config.env && Object.keys(config.env).length > 0) {
      lines.push("   - Environment Variables:");
      for (const [key, value] of Object.entries(config.env)) {
        lines.push(`     - \`${key}\` = \`${value}\``);
      }
    }
  } else if ("url" in config) {
    lines.push(`   - URL: \`${config.url}\``);

    if (config.headers && Object.keys(config.headers).length > 0) {
      lines.push("   - Headers:");
      for (const [key, value] of Object.entries(config.headers)) {
        lines.push(`     - \`${key}\` = \`${value}\``);
      }
    }
  }
}

// =============================================================================
// Editor Adapter Export
// =============================================================================

/**
 * Replit Editor Adapter
 *
 * Since Replit is a web-based IDE, automatic MCP server configuration
 * is not supported. Users must manually add servers through the Replit UI.
 *
 * This adapter provides:
 * - Detection: Always returns false (web-based, no local installation)
 * - Config Reading: Returns null (not applicable for web-based IDE)
 * - Config Writing: Returns error (cannot write to web-based UI)
 * - Instructions: Provides step-by-step manual setup guide
 */
export const replitAdapter: EditorAdapter = {
  id: "replit",
  name: "Replit",
  type: "web",
  format: "ui-only",

  /**
   * Detect if Replit is installed.
   * Always returns false since Replit is web-based.
   */
  async detectInstalled(): Promise<boolean> {
    return false;
  },

  /**
   * Read MCP configuration from Replit.
   * Returns null since Replit is web-based and does not support file-based config.
   */
  async readConfig(): Promise<McpConfigFile | null> {
    return null;
  },

  /**
   * Write MCP configuration to Replit.
   * Returns error since Replit is web-based and does not support automated configuration.
   */
  async writeConfig(): Promise<DryRunResult> {
    return {
      success: false,
      targetPath: "Replit UI",
      operation: "skip",
      currentContent: null,
      proposedContent: "",
      diff: "",
      errors: [
        "Replit is a web-based IDE and does not support automated MCP server configuration.",
        "Please use the manual setup instructions below.",
      ],
      warnings: [],
    };
  },

  /**
   * Generate manual instructions for adding MCP servers to Replit.
   */
  generateInstructions(servers: McpServerTemplate[], env: EnvVars): string {
    const lines: string[] = [
      "# Replit MCP Server Configuration",
      "",
      "Replit is a web-based IDE, so MCP servers must be configured manually through the UI.",
      "",
      "## Manual Setup Steps",
      "",
      "1. **Open your Replit project** in your browser",
      "",
      "2. **Access Integrations**",
      "   - Click the menu button (three dots) in the top right corner",
      "   - Select \"Integrations\" from the dropdown menu",
      "",
      "3. **Navigate to MCP Servers**",
      "   - Look for \"MCP Servers\" in the integrations list",
      "   - Click \"Add Server\" button",
      "",
      "4. **Configure Each MCP Server**",
      "",
    ];

    // Add each server configuration
    for (const server of servers) {
      const config = server.configs.standard(env);
      lines.push(`   **${server.name}** (ID: ${server.id})`);
      lines.push("");

      appendStandardConfigInstructionLines(lines, config);

      lines.push("");
    }

    lines.push("## Environment Variables");
    lines.push("");

    // List required environment variables
    const allEnvVars = collectRequiredEnvVarNames(servers);

    if (allEnvVars.size > 0) {
      lines.push("Before configuring MCP servers, ensure these environment variables are set in Replit:");
      lines.push("");
      for (const envVar of Array.from(allEnvVars).sort()) {
        const isSet = env[envVar];
        const suffix = isSet ? ` (currently set: \`${isSet}\`)` : " (not set)";
        lines.push(`- \`${envVar}\`${suffix}`);
      }
      lines.push("");
      lines.push("To set environment variables in Replit:");
      lines.push("1. Click the \"Tools\" button in the top right");
      lines.push("2. Select \"Secrets (Environment Variables)\"");
      lines.push("3. Add each variable with its value");
    } else {
      lines.push("No additional environment variables are required.");
      lines.push("");
    }

    lines.push("## Additional Resources");
    lines.push("");
    lines.push("- [Replit Official Documentation](https://docs.replit.com)");
    lines.push("- [Replit Integrations Guide](https://docs.replit.com/tools-and-features/integrations)");
    lines.push("");
    lines.push("## Troubleshooting");
    lines.push("");
    lines.push("If you encounter issues:");
    lines.push("- Verify all environment variables are correctly set in Replit Secrets");
    lines.push("- Check that the command path is correct and accessible in your Replit environment");
    lines.push("- Ensure all arguments are properly formatted");
    lines.push("- Restart your Replit project after making changes");

    return lines.join("\n");
  },
};
