/**
 * @fileoverview Resolves the target project root for MCP Sync commands.
 *
 * Flow: explicit environment override -> current working directory -> absolute project root used for runtime config.
 *
 * @example
 * ```typescript
 * const projectRoot = resolveMcpSyncProjectRoot(process.cwd());
 * ```
 *
 * @testing Jest unit: npm test
 * @see scripts/setup.ts - Resolves the target project before creating `.mcp-sync/` files.
 * @see scripts/apply-config.ts - Resolves the target project before writing editor configs.
 */

import { resolve } from "path";

/** Environment variable that lets package-local npm scripts target a different project root. */
export const MCP_SYNC_PROJECT_ROOT_ENV = "MCP_SYNC_PROJECT_ROOT";

/** Resolve the target project root from `MCP_SYNC_PROJECT_ROOT`, falling back to the supplied cwd. */
export function resolveMcpSyncProjectRoot(fallbackCwd: string): string {
  const explicitRoot = process.env[MCP_SYNC_PROJECT_ROOT_ENV];
  if (explicitRoot && explicitRoot.trim().length > 0) {
    return resolve(explicitRoot);
  }
  return resolve(fallbackCwd);
}
