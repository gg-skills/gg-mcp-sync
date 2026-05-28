/**
 * @fileoverview Augment VSCode extension adapter for the manager editor registry. This file owns
 * the `augment-ext` UI-only contract, where MCP server setup is performed manually through the
 * Augment command palette and JSON import flow instead of programmatic writes.
 *
 * Flow: VSCode detects the Augment extension -> the adapter reports `ui-only` -> users import MCP
 * server JSON in the extension UI -> auth and workspace servers stay aligned with the editor's
 * manual configuration surface.
 *
 * @testing Jest unit: npm test -- scripts/editors/vscode-extensions.unit.test.ts
 * @see scripts/editors/vscode-extensions.unit.test.ts - Jest suite that exercises the VSCode extension adapters.
 * @documentation reviewed=2026-04-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { execSync } from "child_process";
import type {
  EditorAdapter,
  McpConfigFile,
  McpServerTemplate,
  EnvVars,
  DryRunResult,
} from "../lib";

// =============================================================================
// Adapter Implementation
// =============================================================================

/**
 * Augment VSCode Extension editor adapter.
 *
 * Detects Augment installation (if possible), but configuration is managed
 * entirely through the VSCode UI using the Augment extension's "Configure MCP
 * Servers" command with JSON import functionality.
 */
export const augmentExtAdapter: EditorAdapter = {
  id: "augment-ext",
  name: "Augment (VSCode Ext)",
  type: "vscode-ext",
  format: "ui-only",

  /**
   * Detect if Augment VSCode Extension is installed.
   *
   * Checks for VSCode and looks for Augment extension by attempting to detect
   * VSCode installation and checking for the Augment extension directory.
   * This is a best-effort detection; the extension may be installed but not
   * enabled.
   */
  async detectInstalled(): Promise<boolean> {
    try {
      // Check if VSCode is installed
      execSync("code --version", { stdio: "pipe", timeout: 5000 });

      // Try to check for Augment extension
      // This is a heuristic check for the extension directory
      try {
        if (process.platform === "darwin") {
          // macOS
          execSync(
            "ls -d ~/Library/Application\\ Support/Code/User/globalStorage/SteadyAI.Augment* 2>/dev/null | head -1",
            { stdio: "pipe", timeout: 5000 }
          );
          return true;
        } else if (process.platform === "linux") {
          // Linux
          execSync(
            "ls -d ~/.config/Code/User/globalStorage/SteadyAI.Augment* 2>/dev/null | head -1",
            { stdio: "pipe", timeout: 5000 }
          );
          return true;
        } else if (process.platform === "win32") {
          // Windows
          execSync(
            'where /Q "SteadyAI.Augment"',
            { stdio: "pipe", timeout: 5000 }
          );
          return true;
        }
      } catch {
        // Augment extension might not be installed, but VSCode is
        // Return false for Augment specifically
        return false;
      }

      return false;
    } catch {
      // VSCode not found
      return false;
    }
  },

  /**
   * Read MCP configuration from Augment.
   *
   * Always returns null because this is a UI-only adapter.
   * Configuration is managed entirely through the VSCode UI.
   */
  async readConfig(
    scope: "project" | "global"
  ): Promise<McpConfigFile | null> {
    // UI-only adapter: configuration cannot be read programmatically
    return null;
  },

  /**
   * Write MCP configuration to Augment.
   *
   * Returns an error because this is a UI-only adapter.
   * Users must manually configure MCP servers through the VSCode UI.
   */
  async writeConfig(
    scope: "project" | "global",
    servers: McpServerTemplate[],
    env: EnvVars
  ): Promise<DryRunResult> {
    return {
      success: false,
      targetPath: "",
      operation: "skip",
      currentContent: null,
      proposedContent: "",
      diff: "UI-only adapter: Cannot write configuration programmatically. See generateInstructions() for manual setup.",
      errors: [
        "Augment VSCode Extension uses UI-only configuration.",
        "MCP servers must be configured manually through the VSCode extension UI.",
        "Use the 'Augment: Configure MCP Servers' command in VSCode.",
      ],
      warnings: [],
    };
  },

  /**
   * Generate manual instructions for configuring Augment MCP servers.
   *
   * Provides step-by-step instructions for users to import the MCP server
   * configuration through the Augment extension's UI.
   */
  generateInstructions(servers: McpServerTemplate[], env: EnvVars): string {
    const lines: string[] = [
      "# Augment (VSCode Extension) MCP Configuration",
      "",
      "Augment uses VSCode's native MCP configuration system with UI-based setup.",
      "Configuration is managed through the Augment extension's command interface.",
      "",
      "## Manual Setup Steps",
      "",
      "### Step 1: Open VSCode",
      "Make sure you have VSCode open with the Augment extension installed.",
      "",
      "### Step 2: Open Command Palette",
      "Press **Cmd+Shift+P** (macOS) or **Ctrl+Shift+P** (Windows/Linux) to open the Command Palette.",
      "",
      "### Step 3: Find Augment Configuration Command",
      "Search for and select: **\"Augment: Configure MCP Servers\"**",
      "",
      "### Step 4: Import from JSON",
      "In the configuration dialog, click **\"Import from JSON\"** button.",
      "",
      "### Step 5: Paste Configuration",
      "Copy the JSON configuration below and paste it into the import dialog:",
      "",
      "```json",
      "{",
      '  "mcpServers": {',
    ];

    // Add each server to the instructions
    for (let i = 0; i < servers.length; i++) {
      const server = servers[i];
      const config = server.configs.standard(env);
      const isLastServer = i === servers.length - 1;

      lines.push(`    "${server.id}": {`);

      if ("command" in config) {
        lines.push(`      "type": "stdio",`);
        lines.push(`      "command": "${config.command}"`);

        if (config.args && config.args.length > 0) {
          lines.push(",");
          lines.push(`      "args": [`);
          config.args.forEach((arg, idx) => {
            const comma = idx < config.args!.length - 1 ? "," : "";
            lines.push(`        "${arg}"${comma}`);
          });
          lines.push("      ]");
        }

        if (config.env && Object.keys(config.env).length > 0) {
          lines.push(",");
          lines.push("      \"env\": {");
          const envEntries = Object.entries(config.env);
          envEntries.forEach(([key, value], idx) => {
            const comma = idx < envEntries.length - 1 ? "," : "";
            lines.push(`        "${key}": "${value}"${comma}`);
          });
          lines.push("      }");
        }
      } else if ("url" in config) {
        lines.push(`      "type": "http",`);
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

      lines.push(isLastServer ? "    }" : "    },");
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
        const isSet = env[envVar];
        const status = isSet ? "(currently set)" : "(NOT SET - you must set this)";
        lines.push(`- \`${envVar}\` ${status}`);
      }
      lines.push("");
      lines.push(
        "You can set environment variables in your shell profile (~/.zshrc, ~/.bashrc, etc.) or VSCode settings."
      );
    } else {
      lines.push("No additional environment variables are required.");
    }

    lines.push("");
    lines.push("## Additional Configuration");
    lines.push("");
    lines.push(
      "After importing the JSON configuration, the Augment extension will:"
    );
    lines.push("1. Validate the MCP server configurations");
    lines.push("2. Test connections to each server");
    lines.push("3. Display any configuration errors or warnings");
    lines.push("");
    lines.push("## Troubleshooting");
    lines.push("");
    lines.push("### Command not found");
    lines.push(
      "If the Augment extension is installed but the command is not available:"
    );
    lines.push("1. Reload VSCode (Cmd+R or Ctrl+R)");
    lines.push("2. Verify the Augment extension is enabled in the Extensions panel");
    lines.push("");
    lines.push("### Server connection errors");
    lines.push(
      "If MCP servers fail to connect after configuration:"
    );
    lines.push(
      "1. Verify all required environment variables are set correctly"
    );
    lines.push(
      "2. Check that the server commands are available in your PATH"
    );
    lines.push("3. Review Augment extension logs for detailed error messages");
    lines.push("");
    lines.push("## Automatic Configuration");
    lines.push("");
    lines.push("For automated setup across multiple tools, you can use:");
    lines.push("");
    lines.push("```bash");
    lines.push("mcp-sync setup");
    lines.push("```");
    lines.push("");
    lines.push("This will configure all supported editors including VSCode extensions.");

    return lines.join("\n");
  },
};

/**
 * Export as default for convenient imports
 */
export default augmentExtAdapter;
