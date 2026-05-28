/**
 * @fileoverview MCP editor adapter for Refact; manages MCP server configuration for that VSCode extension.
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
 * Refact.ai VSCode Extension editor adapter.
 *
 * Detects Refact.ai installation (if possible), but configuration is managed
 * entirely through the VSCode UI using the Refact.ai extension's settings.
 */
export const refactExtAdapter: EditorAdapter = {
  id: "refact-ext",
  name: "Refact.ai (VSCode Ext)",
  type: "vscode-ext",
  format: "ui-only",

  /**
   * Detect if Refact.ai VSCode Extension is installed.
   *
   * Checks for VSCode and looks for Refact.ai extension by attempting to detect
   * VSCode installation and checking for the Refact.ai extension directory.
   * This is a best-effort detection; the extension may be installed but not
   * enabled.
   */
  async detectInstalled(): Promise<boolean> {
    try {
      // Check if VSCode is installed
      execSync("code --version", { stdio: "pipe", timeout: 5000 });

      // Try to check for Refact.ai extension
      // This is a heuristic check for the extension directory
      try {
        if (process.platform === "darwin") {
          // macOS
          execSync(
            "ls -d ~/Library/Application\\ Support/Code/User/globalStorage/smallcloudai.refact* 2>/dev/null | head -1",
            { stdio: "pipe", timeout: 5000 }
          );
          return true;
        } else if (process.platform === "linux") {
          // Linux
          execSync(
            "ls -d ~/.config/Code/User/globalStorage/smallcloudai.refact* 2>/dev/null | head -1",
            { stdio: "pipe", timeout: 5000 }
          );
          return true;
        } else if (process.platform === "win32") {
          // Windows - best effort check
          execSync(
            'dir /b "%APPDATA%\\Code\\User\\globalStorage\\smallcloudai.refact*" 2>nul',
            { stdio: "pipe", timeout: 5000, shell: "cmd.exe" }
          );
          return true;
        }
      } catch (e) {
        // Refact.ai extension might not be installed, but VSCode is
        console.debug("Refact.ai extension detection failed:", e);
        return false;
      }

      return false;
    } catch (e) {
      // VSCode not found
      console.debug("VSCode detection failed:", e);
      return false;
    }
  },

  /**
   * Read MCP configuration from Refact.ai.
   *
   * Always returns null because this is a UI-only adapter.
   * Configuration is managed entirely through the VSCode UI.
   */
  async readConfig(
    _scope: "project" | "global"
  ): Promise<McpConfigFile | null> {
    // UI-only adapter: configuration cannot be read programmatically
    return null;
  },

  /**
   * Write MCP configuration to Refact.ai.
   *
   * Returns an error because this is a UI-only adapter.
   * Users must manually configure MCP servers through the VSCode UI.
   */
  async writeConfig(
    _scope: "project" | "global",
    _servers: McpServerTemplate[],
    _env: EnvVars
  ): Promise<DryRunResult> {
    return {
      success: false,
      targetPath: "",
      operation: "skip",
      currentContent: null,
      proposedContent: "",
      diff: "UI-only adapter: Cannot write configuration programmatically. See generateInstructions() for manual setup.",
      errors: [
        "Refact.ai VSCode Extension uses UI-only configuration.",
        "MCP servers must be configured manually through the VSCode extension settings.",
        "Open VSCode settings and search for 'Refact.ai' to configure MCP servers.",
      ],
      warnings: [],
    };
  },

  /**
   * Generate manual instructions for configuring Refact.ai MCP servers.
   *
   * Provides step-by-step instructions for users to configure the MCP server
   * settings through the Refact.ai extension's UI.
   */
  generateInstructions(servers: McpServerTemplate[], env: EnvVars): string {
    const lines: string[] = [
      "# Refact.ai (VSCode Extension) MCP Configuration",
      "",
      "Refact.ai uses its own configuration system with UI-based setup.",
      "Configuration is managed through the extension's settings in VSCode.",
      "",
      "## Manual Setup Steps",
      "",
      "### Step 1: Open VSCode",
      "Make sure you have VSCode open with the Refact.ai extension installed.",
      "",
      "### Step 2: Open Settings",
      "Press **Cmd+,** (macOS) or **Ctrl+,** (Windows/Linux) to open Settings.",
      "",
      "### Step 3: Search for Refact.ai Settings",
      "In the settings search bar, type **\"refact\"** to filter to Refact.ai settings.",
      "",
      "### Step 4: Configure MCP Servers",
      "Look for the **\"MCP Servers\"** or **\"Model Context Protocol\"** section.",
      "Click **\"Edit in settings.json\"** if available, or manually add the configuration.",
      "",
      "### Step 5: Add Server Configuration",
      "Add the following configuration to your settings.json:",
      "",
      "```json",
      '{',
      '  "refact.mcpServers": {',
    ];

    // Add each server to the instructions
    for (let i = 0; i < servers.length; i++) {
      const server = servers[i];
      const config = server.configs.standard(env);
      const isLastServer = i === servers.length - 1;

      lines.push(`    "${server.id}": {`);

      if ("command" in config) {
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
    lines.push("## Alternative: Using settings.json Directly");
    lines.push("");
    lines.push("You can also edit the settings file directly:");
    lines.push("");
    lines.push("1. Open Command Palette (**Cmd+Shift+P** / **Ctrl+Shift+P**)");
    lines.push("2. Search for **\"Preferences: Open Settings (JSON)\"**");
    lines.push("3. Add the configuration shown above to your settings.json");
    lines.push("");
    lines.push("## Troubleshooting");
    lines.push("");
    lines.push("### Extension not found");
    lines.push("If the Refact.ai extension is not installed:");
    lines.push("1. Open VSCode Extensions panel (**Cmd+Shift+X** / **Ctrl+Shift+X**)");
    lines.push("2. Search for \"Refact.ai\"");
    lines.push("3. Install the official Refact.ai extension by Small Cloud");
    lines.push("");
    lines.push("### MCP settings not available");
    lines.push("If MCP settings are not visible:");
    lines.push("1. Make sure you have the latest version of the Refact.ai extension");
    lines.push("2. Check Refact.ai documentation for MCP configuration options");
    lines.push("3. MCP support may be in beta or require specific extension version");
    lines.push("");
    lines.push("### Server connection errors");
    lines.push("If MCP servers fail to connect:");
    lines.push("1. Verify all required environment variables are set correctly");
    lines.push("2. Check that the server commands are available in your PATH");
    lines.push("3. Review VSCode Output panel for Refact.ai logs");

    return lines.join("\n");
  },
};

/**
 * Export as default for convenient imports
 */
export default refactExtAdapter;
