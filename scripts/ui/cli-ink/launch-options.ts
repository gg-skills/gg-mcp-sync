/**
 * @fileoverview Re-exports the MCP Ink launch-option parser and help text.
 *
 * Flow: Ink entrypoint -> shared parser export -> launch target resolution.
 *
 * @example
 * ```typescript
 * const parsed = parseMcpInkLaunchOptions(["--section", "services"]);
 * ```
 *
 * @testing Jest unit: mcp-sync ink:test
 * @see scripts/ui/shared/launch-options.ts - Defines the shared launcher parser.
 * @see scripts/ui/cli-ink/app.tsx - Consumes the parsed Ink launch options.
 * @documentation reviewed=2026-04-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

export {
  getMcpShellHelpText as getMcpInkHelpText,
  parseMcpShellLaunchOptions as parseMcpInkLaunchOptions,
  resolveMcpShellLaunchTarget as resolveMcpInkLaunchTarget,
} from "../shared/launch-options";
export type {
  McpShellLaunchOptionsParseResult as McpInkLaunchOptionsParseResult,
  McpShellResolvedLaunchTarget as McpInkResolvedLaunchTarget,
} from "../shared/launch-options";
