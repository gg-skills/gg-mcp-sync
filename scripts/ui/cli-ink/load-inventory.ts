/**
 * @fileoverview Re-exports the MCP shell inventory loader for the Ink launcher.
 *
 * Flow: Ink app -> shared inventory loader -> typed inventory model.
 *
 * @example
 * ```typescript
 * const inventory = await loadMcpInkInventory({ projectRoot: process.cwd() });
 * ```
 *
 * @testing Jest unit: mcp-sync ink:test
 * @see scripts/ui/shared/load-inventory.ts - Implements the shared inventory loader.
 * @see scripts/ui/cli-ink/app.tsx - Consumes the Ink inventory loader.
 * @documentation reviewed=2026-04-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

export {
  buildEditorInventory,
  buildEnvVarInventory,
  buildInventorySummary,
  buildInventoryWarnings,
  buildServiceInventory,
  loadMcpShellInventory as loadMcpInkInventory,
} from "../shared/load-inventory";
export type { McpShellInventoryDependencies as McpInkInventoryDependencies } from "../shared/load-inventory";
