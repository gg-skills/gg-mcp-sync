/**
 * @fileoverview Provides `mcp-sync` command catalog entries for the shared MCP TUIs.
 *
 * Flow: script metadata + examples -> catalog rows + preview helpers.
 *
 * @example
 * ```typescript
 * const firstCommand = MCP_COMMAND_CATALOG[0];
 * ```
 *
 * @testing Jest unit: npm test
 * @see scripts/ui/cli-opentui/app.tsx - Displays the command catalog in OpenTUI.
 * @see scripts/ui/cli-ink/app.tsx - Displays the command catalog in Ink.
 */

/** One row in the `mcp-sync` command catalog surfaced by MCP TUIs and docs previews. */
export interface McpCommandCatalogEntry {
  /** Stable command identifier used by the TUI lookup helpers. */
  npmScript: string;
  /** Example invocation. */
  example: string;
  /** Script path relative to this skill package. */
  scriptPath: string;
  /** Uses Inquirer or other stdin prompts when run via tsx. */
  interactive: boolean;
  description: string;
}

/** Ordered catalog of MCP Sync commands with examples and interactivity hints. */
export const MCP_COMMAND_CATALOG: McpCommandCatalogEntry[] = [
  {
    npmScript: "mcp:setup",
    example: "mcp-sync setup",
    scriptPath: "scripts/setup.ts",
    interactive: true,
    description: "Guided wizard for MCP files and handoff to a TUI or classic commands",
  },
  {
    npmScript: "mcp:cli:ink",
    example: "mcp-sync ink",
    scriptPath: "scripts/ui/cli-ink/index.mts",
    interactive: true,
    description: "Ink shell for services, env, editors, diagnostics, and schemas",
  },
  {
    npmScript: "mcp:cli:opentui",
    example: "mcp-sync opentui",
    scriptPath: "scripts/ui/cli-opentui/main.tsx",
    interactive: true,
    description: "OpenTUI shell (Bun host) for the same MCP operations",
  },
  {
    npmScript: "mcp:manage-servers",
    example: "mcp-sync manage-servers",
    scriptPath: "scripts/manage-servers.ts",
    interactive: true,
    description: "Toggle services and transport preferences",
  },
  {
    npmScript: "mcp:manage-env",
    example: "mcp-sync manage-env",
    scriptPath: "scripts/manage-env.ts",
    interactive: true,
    description: "Edit MCP environment variables",
  },
  {
    npmScript: "mcp:manage-editors",
    example: "mcp-sync manage-editors",
    scriptPath: "scripts/manage-editors.ts",
    interactive: true,
    description: "Write editor configs or generate instructions",
  },
  {
    npmScript: "mcp-sync apply",
    example: "mcp-sync apply",
    scriptPath: "scripts/apply-config.ts",
    interactive: true,
    description: "Apply state to enabled editors",
  },
  {
    npmScript: "mcp:validate",
    example: "mcp-sync validate",
    scriptPath: "scripts/validate-configs.ts",
    interactive: false,
    description: "Validate MCP JSON configs against schemas",
  },
  {
    npmScript: "mcp:backup",
    example: "mcp-sync backup",
    scriptPath: "scripts/backup-configs.ts",
    interactive: true,
    description: "Backup editor MCP configs",
  },
  {
    npmScript: "mcp:test",
    example: "npm test",
    scriptPath: "scripts",
    interactive: false,
    description: "Jest unit tests for MCP Sync scripts",
  },
];

/** Appends forwarded args to a catalog example line for TUI command previews. */
export function formatMcpCommandPreview(example: string, extraArgs?: string[]): string {
  if (!extraArgs || extraArgs.length === 0) {
    return example;
  }
  return `${example} ${extraArgs.join(" ")}`;
}

/** Looks up a catalog row by historical `mcp:*` identifier; returns `undefined` when unknown. */
export function findMcpCatalogEntry(npmScript: string): McpCommandCatalogEntry | undefined {
  return MCP_COMMAND_CATALOG.find((e) => e.npmScript === npmScript);
}
