/**
 * @fileoverview Entrypoint for the MCP OpenTUI launcher.
 *
 * Flow: argv/help/TTY guard -> OpenTUI renderer -> MCP app shell.
 *
 * @example
 * ```typescript
 * const helpRequested = process.argv.includes("--help");
 * ```
 *
 * @testing Manual interactive: mcp-sync opentui in a TTY
 * @see scripts/ui/cli-opentui/app.tsx - Renders the OpenTUI app.
 * @see scripts/ui-cli-opentui/create-renderer.ts - Provides the OpenTUI renderer factory.
 * @documentation reviewed=2026-04-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { openTuiAssertInteractiveStdin } from "../../ui-cli-opentui/tty-guard.js";

const HELP_TEXT = [
  "Usage: mcp-sync opentui [options]",
  "",
  "Interactive OpenTUI shell for MCP inventory, diagnostics, schemas, and command browsing.",
  "",
  "Options:",
  "  --help, -h     Show this help.",
  "",
  "Forwarded CLI flags beyond --help are not implemented yet.",
  "Use mcp-sync subcommands for automation.",
].join("\n");

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(HELP_TEXT);
  process.exit(0);
}

openTuiAssertInteractiveStdin("mcp-sync opentui");

const opentuiReactPromise = import("@opentui/react");
const { createRoot } = await opentuiReactPromise;
const rendererFactoryPromise = import("../../ui-cli-opentui/create-renderer.js");
const { openTuiCreateScriptRenderer } = await rendererFactoryPromise;
const appPromise = import("./app.js");
const { McpOpenTuiApp } = await appPromise;

const renderer = await openTuiCreateScriptRenderer();
createRoot(renderer).render(<McpOpenTuiApp />);
