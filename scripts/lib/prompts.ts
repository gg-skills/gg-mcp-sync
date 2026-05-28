/**
 * @fileoverview Provides interactive prompt copy and terminal formatting helpers for MCP flows.
 *
 * Flow: prompt state + choices -> terminal UI copy and selection helpers.
 *
 * @example
 * ```typescript
 * displayHeader("MCP Setup Wizard");
 * ```
 *
 * @testing Jest unit: npm test
 * @see scripts/setup.ts - Uses these prompt helpers in the setup wizard.
 * @see scripts/manage-env.ts - Uses these prompt helpers in the env manager.
 * @documentation reviewed=2026-04-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import {
  input,
  select,
  confirm,
  checkbox,
  password,
  Separator,
} from "@inquirer/prompts";
import type { McpServerTemplate, EditorAdapter, EnvVars, McpState } from "./types";
import { toDisplayPath } from "./file-utils";
import { maskSecret, getEnvVarStatus } from "./env";
import { formatTimestamp } from "./state";

// =============================================================================
// ANSI Colors
// =============================================================================

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

// Foreground colors
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const MAGENTA = "\x1b[35m";
const CYAN = "\x1b[36m";

/**
 * Color helper functions for CLI output
 */
export const colors = {
  reset: (s: string) => `${RESET}${s}${RESET}`,
  bold: (s: string) => `${BOLD}${s}${RESET}`,
  dim: (s: string) => `${DIM}${s}${RESET}`,
  red: (s: string) => `${RED}${s}${RESET}`,
  green: (s: string) => `${GREEN}${s}${RESET}`,
  yellow: (s: string) => `${YELLOW}${s}${RESET}`,
  blue: (s: string) => `${BLUE}${s}${RESET}`,
  magenta: (s: string) => `${MAGENTA}${s}${RESET}`,
  cyan: (s: string) => `${CYAN}${s}${RESET}`,
  // Semantic colors
  project: (s: string) => `${CYAN}${s}${RESET}`,    // Cyan for project scope
  global: (s: string) => `${MAGENTA}${s}${RESET}`,  // Magenta for global scope
  stdio: (s: string) => `${GREEN}${s}${RESET}`,     // Green for stdio transport
  http: (s: string) => `${YELLOW}${s}${RESET}`,     // Yellow for http transport
};

// =============================================================================
// Types
// =============================================================================

/**
 * Server selection choice shape for the Inquirer checkbox prompt.
 */
export interface ServerChoice {
  serverId: string;
  name: string;
  transport: "stdio" | "http";
  envReady: boolean;
  missingVars: string[];
}

/**
 * Editor selection choice shape for the Inquirer checkbox prompt.
 */
export interface EditorChoice {
  editorId: string;
  name: string;
  type: string;
  projectPath: string | null;
  globalPath: string | null;
  projectEnabled: boolean;
  globalEnabled: boolean;
  projectLastSync: string | null;
  globalLastSync: string | null;
}

// =============================================================================
// Server Selection
// =============================================================================

/**
 * Display server selection prompt.
 */
export async function promptServerSelection(
  servers: McpServerTemplate[],
  env: EnvVars,
  currentlyEnabled: string[]
): Promise<string[]> {
  // Group servers by transport
  const stdioServers = servers.filter((s) => s.transport === "stdio");
  const httpServers = servers.filter((s) => s.transport === "http");

  // Build choices
  const choices: Array<{ name: string; value: string; checked: boolean } | Separator> = [];

  if (stdioServers.length > 0) {
    choices.push(new Separator("━━━ stdio servers ━━━"));
    for (const server of stdioServers) {
      const missingVars = server.envVars.filter((v) => getEnvVarStatus(env, v) !== "set");
      const envStatus = missingVars.length === 0
        ? "✓ Ready"
        : `✗ Missing ${missingVars.join(", ")}`;

      choices.push({
        name:
          `${server.name}\n` +
          `      Config key: ${server.id}\n` +
          `      Package: ${server.package ?? "N/A"}\n` +
          `      Env: ${envStatus}`,
        value: server.id,
        checked: currentlyEnabled.includes(server.id),
      });
    }
  }

  if (httpServers.length > 0) {
    choices.push(new Separator("━━━ http servers ━━━"));
    for (const server of httpServers) {
      const missingVars = server.envVars.filter((v) => getEnvVarStatus(env, v) !== "set");
      const envStatus = missingVars.length === 0
        ? "✓ Ready"
        : `✗ Missing ${missingVars.join(", ")}`;

      choices.push({
        name:
          `${server.name}\n` +
          `      Config key: ${server.id}\n` +
          `      URL: ${server.url ?? "N/A"}\n` +
          `      Env: ${envStatus}`,
        value: server.id,
        checked: currentlyEnabled.includes(server.id),
      });
    }
  }

  const selected = await checkbox({
    message: "Select MCP servers to enable:",
    choices,
    pageSize: 15,
  });

  return selected;
}

// =============================================================================
// Editor Selection
// =============================================================================

/**
 * Display editor selection prompt.
 */
export async function promptEditorSelection(
  editors: EditorAdapter[],
  state: McpState
): Promise<Array<{ editorId: string; scope: "project" | "global" }>> {
  // Group editors by type
  const vscodeExts = editors.filter((e) => e.type === "vscode-ext");
  const cliTools = editors.filter((e) => e.type === "cli");
  const standalones = editors.filter((e) => e.type === "standalone");
  const webTools = editors.filter((e) => e.type === "web");

  const choices: Array<{ name: string; value: string; checked: boolean } | Separator> = [];

  /**
   * Append a labeled separator and checkbox rows for one editor grouping.
   *
   * @remarks
   * Mutates the enclosing `choices` buffer used by this prompt; returns immediately when `group`
   * is empty.
   *
   * @param group - Editors rendered together under one UI section.
   * @param label - Section title shown on the separator preceding those rows.
   */
  const addEditorChoices = (group: EditorAdapter[], label: string) => {
    if (group.length === 0) return;
    choices.push(new Separator(`━━━ ${label} ━━━`));

    for (const editor of group) {
      const editorState = state.editors[editor.id];

      // Project scope
      if (editor.projectConfig) {
        const isEnabled = editorState?.project.enabled ?? false;
        const lastSync = editorState?.project.lastSync
          ? `(synced ${formatTimestamp(editorState.project.lastSync)})`
          : "(not configured)";

        choices.push({
          name: `${editor.name} - Project: ${editor.projectConfig.path} ${lastSync}`,
          value: `${editor.id}:project`,
          checked: isEnabled,
        });
      }

      // Global scope
      if (editor.globalConfig) {
        const isEnabled = editorState?.global.enabled ?? false;
        const lastSync = editorState?.global.lastSync
          ? `(synced ${formatTimestamp(editorState.global.lastSync)})`
          : "(not configured)";

        choices.push({
          name: `${editor.name} - Global: ${toDisplayPath(editor.globalConfig.path)} ${lastSync}`,
          value: `${editor.id}:global`,
          checked: isEnabled,
        });
      }

      // UI-only tools
      if (!editor.projectConfig && !editor.globalConfig) {
        choices.push({
          name: `${editor.name} (requires manual UI setup)`,
          value: `${editor.id}:instructions`,
          checked: false,
        });
      }
    }
  };

  addEditorChoices(vscodeExts, "VSCode Extensions");
  addEditorChoices(cliTools, "CLI Tools");
  addEditorChoices(standalones, "Standalone Editors");
  addEditorChoices(webTools, "Web-based Tools");

  const selected = await checkbox({
    message: "Select editor configurations to enable:",
    choices,
    pageSize: 20,
  });

  // Parse selections into editor/scope pairs
  return selected.map((s) => {
    const [editorId, scope] = s.split(":");
    return {
      editorId,
      scope: scope as "project" | "global",
    };
  });
}

// =============================================================================
// Environment Variable Prompts
// =============================================================================

/**
 * Display environment variable editing prompt.
 */
export async function promptEnvVarEdit(
  varName: string,
  currentValue: string | undefined,
  usedBy: string[]
): Promise<string | null> {
  const status = currentValue ? `Current: ${maskSecret(currentValue)}` : "Not set";
  const servers = usedBy.join(", ");

  console.log(`\n${varName}`);
  console.log(`  Status: ${status}`);
  console.log(`  Used by: ${servers}`);

  const action = await select({
    message: "Action:",
    choices: [
      { name: "Edit value", value: "edit" },
      { name: "Keep current", value: "keep" },
      ...(currentValue ? [{ name: "Clear value", value: "clear" }] : []),
    ],
  });

  if (action === "keep") {
    return null; // No change
  }

  if (action === "clear") {
    return ""; // Clear the value
  }

  // Edit value
  const newValue = await password({
    message: `Enter value for ${varName}:`,
    mask: "*",
  });

  return newValue;
}

/**
 * Display all environment variables for editing.
 */
export async function promptEnvVarsEdit(
  requiredVars: Map<string, string[]>, // varName -> serverIds that use it
  currentEnv: EnvVars
): Promise<EnvVars> {
  const updatedEnv = { ...currentEnv };

  for (const [varName, usedBy] of requiredVars) {
    const newValue = await promptEnvVarEdit(varName, currentEnv[varName], usedBy);

    if (newValue !== null) {
      if (newValue === "") {
        delete updatedEnv[varName];
      } else {
        updatedEnv[varName] = newValue;
      }
    }
  }

  return updatedEnv;
}

// =============================================================================
// Confirmation Prompts
// =============================================================================

/**
 * Confirm an action.
 */
export async function promptConfirm(message: string, defaultValue = true): Promise<boolean> {
  return confirm({
    message,
    default: defaultValue,
  });
}

/**
 * Confirm before writing files.
 */
export async function promptConfirmWrite(
  files: Array<{ path: string; operation: string }>
): Promise<boolean> {
  console.log("\nFiles to be modified:");
  for (const file of files) {
    console.log(`  ${file.operation}: ${toDisplayPath(file.path)}`);
  }

  return confirm({
    message: "Proceed with these changes?",
    default: true,
  });
}

// =============================================================================
// Backup Prompts
// =============================================================================

/**
 * Display backup selection prompt.
 */
export async function promptBackupSelection(
  backups: Array<{ path: string; timestamp: string; age: string }>
): Promise<string | null> {
  if (backups.length === 0) {
    console.log("No backups available.");
    return null;
  }

  const choices = backups.map((b) => ({
    name: `${toDisplayPath(b.path)} (${b.age})`,
    value: b.path,
  }));

  choices.push({ name: "Cancel", value: "__cancel__" });

  const selected = await select({
    message: "Select backup to restore:",
    choices,
  });

  return selected === "__cancel__" ? null : selected;
}

// =============================================================================
// Menu Prompts
// =============================================================================

/**
 * Display main setup menu.
 */
export async function promptSetupMenu(): Promise<"env" | "servers" | "editors" | "all" | "quit"> {
  return select({
    message: "What would you like to configure?",
    choices: [
      { name: "Run full setup wizard", value: "all" },
      new Separator(),
      { name: "Manage environment variables", value: "env" },
      { name: "Manage MCP servers", value: "servers" },
      { name: "Manage editor configurations", value: "editors" },
      new Separator(),
      { name: "Quit", value: "quit" },
    ],
  });
}

/**
 * Display editor management menu.
 */
export async function promptEditorMenu(): Promise<"configure" | "refresh" | "backups" | "back"> {
  return select({
    message: "Editor configuration:",
    choices: [
      { name: "Configure editors", value: "configure" },
      { name: "Refresh all configurations", value: "refresh" },
      { name: "Browse backups", value: "backups" },
      new Separator(),
      { name: "Back", value: "back" },
    ],
  });
}

// =============================================================================
// Input Prompts
// =============================================================================

/**
 * Prompt for text input.
 */
export async function promptInput(
  message: string,
  defaultValue?: string
): Promise<string> {
  return input({
    message,
    default: defaultValue,
  });
}

/**
 * Prompt for a selection from a list.
 */
export async function promptSelect<T extends string>(
  message: string,
  choices: Array<{ name: string; value: T; description?: string }>
): Promise<T> {
  return select({
    message,
    choices,
  });
}

// =============================================================================
// Display Helpers
// =============================================================================

/**
 * Display a header.
 */
export function displayHeader(title: string): void {
  const line = "─".repeat(60);
  console.log(`\n┌${line}┐`);
  console.log(`│ ${title.padEnd(58)} │`);
  console.log(`└${line}┘\n`);
}

/**
 * Display a section header.
 */
export function displaySection(title: string): void {
  console.log(`\n━━━ ${title} ${"━".repeat(Math.max(0, 50 - title.length))}\n`);
}

/**
 * Display a success message.
 */
export function displaySuccess(message: string): void {
  console.log(colors.green(`✓ ${message}`));
}

/**
 * Display an error message.
 */
export function displayError(message: string): void {
  console.log(colors.red(`✗ ${message}`));
}

/**
 * Display a warning message.
 */
export function displayWarning(message: string): void {
  console.log(colors.yellow(`⚠ ${message}`));
}

/**
 * Display info message.
 */
export function displayInfo(message: string): void {
  console.log(colors.cyan(`ℹ ${message}`));
}
