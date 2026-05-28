#!/usr/bin/env -S npx tsx
/**
 * @fileoverview Bootstraps MCP files and then hands off to the MCP shell or classic management scripts.
 *
 * Flow: project root + existing state -> setup wizard -> Ink shell or classic scripts.
 *
 * @example
 * ```typescript
 * const command = "mcp-sync setup";
 * ```
 *
 * @testing Manual CLI: mcp-sync setup
 * @see scripts/manage-env.ts - One of the classic follow-on management scripts.
 * @see scripts/manage-servers.ts - One of the classic follow-on management scripts.
 * @see scripts/manage-editors.ts - One of the classic follow-on management scripts.
 * @documentation reviewed=2026-04-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { join } from "path";
import { spawn } from "child_process";
import { readFile, writeFile } from "fs/promises";
import { readEnvFile, createEnvTemplate, ENV_FILE_NAME, ENV_EXAMPLE_FILE_NAME } from "./lib/env";
import { readState, createDefaultState, writeState, STATE_FILE_NAME } from "./lib/state";
import { resolveMcpSyncProjectRoot } from "./lib/project-root";
import { fileExists } from "./lib/file-utils";
import { servers } from "./servers";
import { editors } from "./editors";
import {
  displayHeader,
  displaySection,
  displaySuccess,
  displayInfo,
  promptConfirm,
  promptSelect,
} from "./lib/prompts";

// =============================================================================
// Helpers
// =============================================================================

/**
 * Runs an external command to completion and reports whether it exited successfully.
 *
 * @remarks
 * I/O: inherits parent stdio. Spawn failures and non-zero exit codes resolve to `false`.
 */
async function runCommand(command: string, args: string[], cwd: string = process.cwd()): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      cwd,
    });

    child.on("close", (code) => {
      resolve(code === 0);
    });

    child.on("error", () => {
      resolve(false);
    });
  });
}

/**
 * Executes an MCP management script under `npx tsx` with optional trailing CLI arguments.
 *
 * @remarks
 * I/O: inherits parent stdio through the shared command runner.
 */
async function runScript(scriptPath: string, args: string[], cwd: string): Promise<boolean> {
  return runCommand("npx", ["tsx", scriptPath, ...args], cwd);
}

/**
 * Launches the MCP Ink CLI shell from the repository root using Bun.
 *
 * @remarks
 * Ink 6 pulls in `yoga-layout`, which must stay on a native ESM path; `npx tsx` can rewrite that
 * graph as CommonJS and fail on top-level await.
 */
async function runInkShell(projectRoot: string, args: string[] = []): Promise<boolean> {
  return runCommand("bun", ["run", join(import.meta.dirname, "ui/cli-ink/index.mts"), ...args], projectRoot);
}

/**
 * Guides the operator through environment, server, and editor setup scripts in order.
 *
 * @remarks
 * Each leg runs only when confirmed interactively; delegates to classic `manage-*` scripts under
 * `scripts`.
 */
async function runClassicSetupFlow(projectRoot: string, scriptsDir: string): Promise<void> {
  displaySection("Step 2: Environment Variables");
  console.log("  Configure your API keys and secrets.\n");

  const runEnv = await promptConfirm("Configure environment variables now?", true);
  if (runEnv) {
    await runScript(join(scriptsDir, "manage-env.ts"), [], projectRoot);
  }

  displaySection("Step 3: Server Selection");
  console.log("  Choose which MCP servers to enable.\n");

  const runServers = await promptConfirm("Select servers now?", true);
  if (runServers) {
    await runScript(join(scriptsDir, "manage-servers.ts"), [], projectRoot);
  }

  displaySection("Step 4: Editor Configuration");
  console.log("  Configure your editors and tools.\n");

  const runEditors = await promptConfirm("Configure editors now?", true);
  if (runEditors) {
    await runScript(join(scriptsDir, "manage-editors.ts"), [], projectRoot);
  }
}

/**
 * Prints the completion banner and suggested follow-up npm commands after setup flows.
 *
 * @remarks
 * Reads persisted MCP state when present so the summary reflects how many servers stay enabled.
 */
async function displaySetupSummary(projectRoot: string): Promise<void> {
  const stateFilePath = join(projectRoot, STATE_FILE_NAME);
  const stateResult = await readState(stateFilePath);
  const enabledServerCount =
    stateResult.success ? stateResult.data.enabledServers.length : 0;

  displaySection("Setup Complete");
  if (enabledServerCount > 0) {
    displaySuccess(`Setup flow finished with ${enabledServerCount} enabled server(s).`);
  } else {
    displayInfo("Setup flow finished. No servers are enabled yet.");
  }

  console.log("\n  You can run these commands anytime:");
  console.log("    mcp-sync ink             - Open the MCP Ink shell");
  console.log("    mcp-sync opentui         - Open the MCP OpenTUI shell (Bun)");
  console.log("    mcp-sync manage-env      - Edit environment variables");
  console.log("    mcp-sync manage-servers  - Toggle servers");
  console.log("    mcp-sync manage-editors  - Configure editors");
  console.log("    mcp-sync setup           - Run this wizard again");
}

// =============================================================================
// Main
// =============================================================================

/**
 * MCP setup wizard entrypoint: repairs env/state artifacts, then Ink shell or classic prompts.
 *
 * @remarks
 * I/O: conditional filesystem reads and writes for templates and state; interactive stdin/stdout
 * prompts throughout.
 */
async function main(): Promise<void> {
  const projectRoot = resolveMcpSyncProjectRoot(process.cwd());
  const scriptsDir = import.meta.dirname;
  const envFilePath = join(projectRoot, ENV_FILE_NAME);
  const envExamplePath = join(projectRoot, ENV_EXAMPLE_FILE_NAME);
  const stateFilePath = join(projectRoot, STATE_FILE_NAME);

  displayHeader("MCP Setup Wizard");

  console.log("  Welcome! This wizard will configure MCP servers for");
  console.log("  your development environment.");
  console.log("");
  console.log("  Available:");
  console.log(`    - ${servers.length} MCP servers`);
  console.log(`    - ${editors.length} editor/tool configurations`);
  console.log("");
  console.log("  Steps:");
  console.log("    1. Create or repair the MCP env/state files");
  console.log("    2. Choose MCP Ink or the classic focused commands");
  console.log("    3. Finish in the surface that matches your task");
  console.log("");

  // Check if already configured
  const stateExists = fileExists(stateFilePath);
  if (stateExists) {
    const stateResult = await readState(stateFilePath);
    if (stateResult.success && stateResult.data.enabledServers.length > 0) {
      displayInfo("Existing configuration found.");
      const action = await promptSelect<"full" | "menu" | "quit">("What would you like to do?", [
        { name: "Run full setup again", value: "full" },
        { name: "Go to main menu", value: "menu" },
        { name: "Quit", value: "quit" },
      ]);

      if (action === "quit") {
        return;
      }

      if (action === "menu") {
        await mainMenu(projectRoot, scriptsDir);
        return;
      }
    }
  }

  // First-time setup
  const proceed = await promptConfirm("Start setup?", true);
  if (!proceed) {
    displayInfo("Setup cancelled.");
    return;
  }

  // Step 1: Create files if needed
  displaySection("Step 1: Environment Setup");

  // Create .mcp-sync/env.example
  if (!fileExists(envExamplePath)) {
    displayInfo("Creating .mcp-sync/env.example template...");
    await createEnvTemplate(envExamplePath);
    displaySuccess("Created .mcp-sync/env.example");
  }

  // Create .mcp-sync/env if it doesn't exist
  if (!fileExists(envFilePath)) {
    displayInfo("Creating .mcp-sync/env (copy from .mcp-sync/env.example)...");
    const templateResult = await readEnvFile(envExamplePath);
    if (templateResult.success) {
      // Create empty env file - user will fill in values
      const content = await readFile(envExamplePath, "utf-8");
      await writeFile(envFilePath, content, "utf-8");
      displaySuccess("Created .mcp-sync/env");
    }
  }

  // Create state if doesn't exist
  if (!fileExists(stateFilePath)) {
    displayInfo("Creating state file...");
    const defaultState = createDefaultState();
    await writeState(stateFilePath, defaultState);
    displaySuccess("Created .mcp-sync/state.json");
  }

  console.log("\n  Files created. Choose how to continue:\n");

  const setupFlow = await promptSelect<"ink" | "classic">(
    "How would you like to continue?",
    [
      { name: "Open MCP Ink shell (recommended)", value: "ink" },
      { name: "Use the classic step-by-step prompts", value: "classic" },
    ]
  );

  if (setupFlow === "ink") {
    displaySection("Step 2: MCP Ink Shell");
    console.log("  Starting MCP Ink in the environment section.\n");
    await runInkShell(projectRoot, ["--section", "env"]);
  } else {
    await runClassicSetupFlow(projectRoot, scriptsDir);
  }

  await displaySetupSummary(projectRoot);
}

/**
 * Interactive loop for operators revisiting MCP tooling after initial setup.
 *
 * @remarks
 * Runs until the user chooses quit; routes selections to the Ink shell or individual `manage-*`
 * scripts.
 */
async function mainMenu(projectRoot: string, scriptsDir: string): Promise<void> {
  let running = true;

  while (running) {
    console.log("");
    const action = await promptSelect<"ink" | "env" | "servers" | "editors" | "quit">(
      "What would you like to do?",
      [
        { name: "Open MCP Ink shell", value: "ink" },
        { name: "Manage environment variables", value: "env" },
        { name: "Manage MCP servers", value: "servers" },
        { name: "Manage editor configurations", value: "editors" },
        { name: "Quit", value: "quit" },
      ]
    );

    switch (action) {
      case "ink":
        await runInkShell(projectRoot);
        break;
      case "env":
        await runScript(join(scriptsDir, "manage-env.ts"), [], projectRoot);
        break;
      case "servers":
        await runScript(join(scriptsDir, "manage-servers.ts"), [], projectRoot);
        break;
      case "editors":
        await runScript(join(scriptsDir, "manage-editors.ts"), [], projectRoot);
        break;
      case "quit":
        running = false;
        break;
    }
  }
}

// Run
main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
