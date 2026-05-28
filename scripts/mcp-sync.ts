#!/usr/bin/env -S npx tsx
/**
 * @fileoverview Dispatches `mcp-sync` subcommands to the package-local MCP Sync scripts.
 *
 * Flow: subcommand argv -> script path -> child process execution with target-project cwd preserved.
 *
 * @example
 * ```bash
 * mcp-sync setup
 * ```
 *
 * @testing CLI smoke: npx tsx scripts/mcp-sync.ts --help
 * @see skills/mcp-sync/scripts/setup.ts - Guided setup subcommand.
 * @see skills/mcp-sync/scripts/apply-config.ts - Apply subcommand.
 * @documentation reviewed=2026-05-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { spawn } from "node:child_process";
import { join } from "node:path";

const SCRIPT_BY_COMMAND = {
  setup: "setup.ts",
  "manage-env": "manage-env.ts",
  "manage-servers": "manage-servers.ts",
  "manage-editors": "manage-editors.ts",
  apply: "apply-config.ts",
  backup: "backup-configs.ts",
  validate: "validate-configs.ts",
  ink: "ui/cli-ink/index.mts",
  opentui: "ui/cli-opentui/main.tsx",
  interactive: "ui/cli-interactive/main.ts",
} as const;

/**
 * CLI subcommand names accepted by this entrypoint, aligned with `SCRIPT_BY_COMMAND` keys.
 */
type McpSyncCommandName = keyof typeof SCRIPT_BY_COMMAND;

/**
 * Prints usage, command list, and `MCP_SYNC_PROJECT_ROOT` hint to stdout.
 *
 * @remarks
 * Used for missing argv, `--help`/`-h`, and after emitting an unknown-command error on stderr.
 */
function printHelp(): void {
  console.log(`MCP Sync

Usage:
  mcp-sync <command> [args]

Commands:
  setup            Guided setup wizard
  manage-env       Edit required MCP environment variables
  manage-servers   Toggle services and transport preferences
  manage-editors   Configure editor scopes or instruction files
  apply            Apply enabled MCP config to selected editors
  backup           Backup selected editor config files
  validate         Validate generated MCP config files
  ink              Open the Ink shell (TTY)
  opentui          Open the OpenTUI shell (Bun + TTY)
  interactive      Open the classic numbered console

Environment:
  MCP_SYNC_PROJECT_ROOT=/path/to/project  Override the target project root.
`);
}

/**
 * Narrows a raw argv token to a known `SCRIPT_BY_COMMAND` key.
 *
 * @remarks
 * Relies on `Object.prototype.hasOwnProperty` so only own keys of the command map count.
 */
function isMcpSyncCommandName(value: string): value is McpSyncCommandName {
  return Object.prototype.hasOwnProperty.call(SCRIPT_BY_COMMAND, value);
}

/**
 * Parses argv, handles help/unknown commands, otherwise spawns the mapped script via `npx tsx`.
 *
 * @remarks
 * Child inherits stdio and `process.cwd()`; maps process signals to exit codes (130 for SIGINT).
 */
async function main(): Promise<void> {
  const [commandName, ...forwardedArgs] = process.argv.slice(2);
  if (!commandName || commandName === "--help" || commandName === "-h") {
    printHelp();
    return;
  }

  if (!isMcpSyncCommandName(commandName)) {
    console.error(`Unknown mcp-sync command: ${commandName}`);
    printHelp();
    process.exit(1);
  }

  const scriptPath = join(import.meta.dirname, SCRIPT_BY_COMMAND[commandName]);
  const child = spawn("npx", ["tsx", scriptPath, ...forwardedArgs], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  const exitCode = await new Promise<number>((resolve) => {
    child.on("error", () => resolve(1));
    child.on("exit", (code, signal) => {
      if (signal !== null) {
        resolve(signal === "SIGINT" ? 130 : 1);
        return;
      }
      resolve(code ?? 1);
    });
  });

  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
