#!/usr/bin/env bun

import {
  getMcpInkHelpText,
  parseMcpInkLaunchOptions,
} from "./launch-options.ts";
import { resolveMcpSyncProjectRoot } from "../../lib/project-root.ts";

let launchTarget = null;

try {
  const parsedOptions = parseMcpInkLaunchOptions(process.argv.slice(2));

  if (parsedOptions.helpRequested) {
    console.log(getMcpInkHelpText());
    process.exit(0);
  }

  launchTarget = parsedOptions.target;
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  console.error("");
  console.error(getMcpInkHelpText());
  process.exit(1);
}

if (!process.stdout.isTTY || !process.stdin.isTTY) {
  console.error("mcp-sync ink requires an interactive TTY.");
  process.exit(1);
}

const [{ default: React }, { render }, { McpInkApp }] = await Promise.all([
  import("react"),
  import("ink"),
  import("./app.tsx"),
]);

render(React.createElement(McpInkApp, { projectRoot: resolveMcpSyncProjectRoot(process.cwd()), launchTarget }));
