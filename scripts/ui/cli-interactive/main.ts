/**
 * @fileoverview Runs the MCP Sync interactive console that dispatches setup and management scripts.
 *
 * Flow: TTY session -> menu selection -> direct script execution against the target project root.
 *
 * @example
 * ```typescript
 * const scriptsDir = MCP_SYNC_SCRIPTS_DIR;
 * ```
 *
 * @testing Manual interactive: mcp-sync interactive in a TTY
 * @see skills/mcp-sync/scripts/shared/cli-interactive/framework.ts - Provides the shared interactive console runtime used by this entrypoint.
 * @see skills/mcp-sync/scripts/setup.ts - Setup script invoked when the operator chooses the setup menu path.
 * @see skills/mcp-sync/scripts/manage-env.ts - Env management script invoked from the management section of this menu.
 * @documentation reviewed=2026-05-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveMcpSyncProjectRoot } from "../../lib/project-root.ts";
import type { CliInteractiveSession } from "../../shared/cli-interactive/framework.ts";

/**
 * Lazy-loaded module surface for the shared interactive CLI framework.
 *
 * @remarks
 * Assigned in `start()` before handlers run; `getCliInteractiveFramework` throws when still null.
 */
type CliInteractiveFrameworkModule = typeof import("../../shared/cli-interactive/framework.ts");

let cliInteractiveFramework: CliInteractiveFrameworkModule | null = null;

const MCP_SYNC_SCRIPTS_DIR = fileURLToPath(new URL("../../", import.meta.url));
const MCP_SYNC_PACKAGE_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/**
 * Returns the initialized interactive framework module.
 *
 * @remarks
 * PRE-CONDITION: `start()` must have populated `cliInteractiveFramework` or this throws synchronously.
 */
function getCliInteractiveFramework(): CliInteractiveFrameworkModule {
  if (cliInteractiveFramework === null) {
    throw new Error("CLI interactive framework module was not initialized.");
  }
  return cliInteractiveFramework;
}

/**
 * Renders the MCP Sync main menu sections and numeric options in the TTY session.
 *
 * @remarks
 * PURITY: Session output only; no subprocess or filesystem side effects.
 */
function showMainMenu(session: CliInteractiveSession): void {
  session.printHeader("MCP", "MAIN MENU");

  session.printPanelTitle("Setup & Configuration");
  session.printMenuItem("1", "Setup", "Initial MCP setup");
  session.printMenuItem("2", "Apply config", "Apply MCP configuration");
  session.printMenuItem("3", "Backup configs", "Backup existing configurations");
  session.printMenuItem("4", "Validate configs", "Validate configuration files");

  session.printPanelTitle("Management");
  session.printMenuItem("5", "Manage env", "Manage environment variables");
  session.printMenuItem("6", "Manage servers", "Manage MCP servers");
  session.printMenuItem("7", "Manage editors", "Manage editor configurations");

  session.printPanelTitle("Testing");
  session.printMenuItem("8", "Run tests", "Execute MCP Sync test suite");

  session.printSectionBreak();
  session.printMenuItem("0", "Exit", "Return to shell");
}

/**
 * Previews and, when confirmed, runs an MCP Sync script via `npx tsx` against the resolved project root.
 *
 * @remarks
 * I/O: Child process execution through the framework helper after an affirmative prompt.
 */
async function runScriptCommand(
  session: CliInteractiveSession,
  scriptRelativePath: string,
  description: string,
): Promise<void> {
  const scriptPath = join(MCP_SYNC_SCRIPTS_DIR, scriptRelativePath);
  const projectRoot = resolveMcpSyncProjectRoot(process.cwd());
  const commandText = `npx tsx ${scriptPath}`;

  session.printPanelTitle("Command Preview", description);
  session.printCommand(commandText);
  if (!(await session.promptYesNo("Run this command", "y"))) {
    session.printWarning("Skipped.");
    return;
  }

  await getCliInteractiveFramework().printAndRunCommand({
    args: ["tsx", scriptPath],
    binary: "npx",
    commandText,
    cwd: projectRoot,
    session,
  });
}

/**
 * Previews and, when confirmed, runs `npm test` from the MCP Sync package root.
 *
 * @remarks
 * I/O: Uses `MCP_SYNC_PACKAGE_ROOT` as cwd for the test subprocess when the user confirms.
 */
async function runTestCommand(session: CliInteractiveSession): Promise<void> {
  const commandText = "npm test";
  session.printPanelTitle("Command Preview", "Run MCP Sync tests");
  session.printCommand(commandText);
  if (!(await session.promptYesNo("Run this command", "y"))) {
    session.printWarning("Skipped.");
    return;
  }
  await getCliInteractiveFramework().printAndRunCommand({
    args: ["test"],
    binary: "npm",
    commandText,
    cwd: MCP_SYNC_PACKAGE_ROOT,
    session,
  });
}

/**
 * Dispatches a menu choice to the matching setup, management, test, or exit path.
 *
 * @returns Whether the outer loop should keep running or end the session.
 *
 * @remarks
 * Choices 1-8 may await long-running script or test commands before returning `"continue"`.
 */
async function handleSelection(
  session: CliInteractiveSession,
  choice: string,
): Promise<"continue" | "exit"> {
  switch (choice) {
    case "1":
      await runScriptCommand(session, "setup.ts", "MCP Setup");
      return "continue";
    case "2":
      await runScriptCommand(session, "apply-config.ts", "Apply MCP Config");
      return "continue";
    case "3":
      await runScriptCommand(session, "backup-configs.ts", "Backup Configs");
      return "continue";
    case "4":
      await runScriptCommand(session, "validate-configs.ts", "Validate Configs");
      return "continue";
    case "5":
      await runScriptCommand(session, "manage-env.ts", "Manage Environment");
      return "continue";
    case "6":
      await runScriptCommand(session, "manage-servers.ts", "Manage Servers");
      return "continue";
    case "7":
      await runScriptCommand(session, "manage-editors.ts", "Manage Editors");
      return "continue";
    case "8":
      await runTestCommand(session);
      return "continue";
    case "0":
      session.printSuccess("Goodbye!");
      return "exit";
    default:
      session.printError(`Invalid option: ${choice}`);
      return "continue";
  }
}

/**
 * Drives the interactive loop: TTY assertion, screen clears, menu display, and post-action prompts.
 *
 * @remarks
 * USAGE: Runs until the user exits from the main menu or declines returning after an action.
 */
async function main(session: CliInteractiveSession): Promise<void> {
  getCliInteractiveFramework().assertCliInteractiveTty("mcp-sync interactive");
  session.clearScreen();

  for (;;) {
    showMainMenu(session);
    session.writeLine("");

    const userChoice = await session.promptReadLine("Select option [0-8]: ");
    session.writeLine("");

    const result = await handleSelection(session, userChoice);
    if (result === "exit") {
      return;
    }

    session.writeLine("");
    session.printDivider();

    if (!(await session.promptYesNo("Return to menu", "y"))) {
      session.printSuccess("Goodbye!");
      return;
    }

    session.clearScreen();
  }
}

/**
 * Dynamically imports the shared CLI framework, wires the module singleton, and hands off to the runner.
 *
 * @remarks
 * I/O: Dynamic `import()` must finish before `main` can call framework helpers that assume initialization.
 */
async function start(): Promise<void> {
  const frameworkUrl = new URL("../../shared/cli-interactive/framework.ts", import.meta.url).href;
  const frameworkPromise = import(frameworkUrl);
  cliInteractiveFramework = await frameworkPromise;
  await cliInteractiveFramework.runCliInteractiveMain(main);
}

void start();
