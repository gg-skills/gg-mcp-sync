/**
 * @fileoverview Defines the per-project storage paths used by MCP Sync runtime state.
 *
 * Flow: stable relative path constants -> CLI entrypoints and controllers resolve files under the target project root.
 *
 * @example
 * ```typescript
 * const envPath = MCP_SYNC_ENV_FILE_NAME;
 * ```
 *
 * @testing Jest unit: npm test
 * @see scripts/lib/env.ts - Uses the env file constants when reading and writing secrets.
 * @see scripts/lib/state.ts - Uses the state file constant for enabled services and editor sync metadata.
 */

/** Directory under the target project root that stores untracked MCP Sync runtime files. */
export const MCP_SYNC_CONFIG_DIR_NAME = ".mcp-sync";

/** Secret-bearing dotenv file under the target project root. */
export const MCP_SYNC_ENV_FILE_NAME = `${MCP_SYNC_CONFIG_DIR_NAME}/env`;

/** Non-secret dotenv template generated beside the runtime env file. */
export const MCP_SYNC_ENV_EXAMPLE_FILE_NAME = `${MCP_SYNC_CONFIG_DIR_NAME}/env.example`;

/** Persisted enabled-service and editor-write state under the target project root. */
export const MCP_SYNC_STATE_FILE_NAME = `${MCP_SYNC_CONFIG_DIR_NAME}/state.json`;

/** Generated manual setup instructions for UI-only tools. */
export const MCP_SYNC_INSTRUCTIONS_DIR_NAME = `${MCP_SYNC_CONFIG_DIR_NAME}/instructions`;

/** Local backup directory for project/global editor config snapshots. */
export const MCP_SYNC_BACKUP_DIR_NAME = `${MCP_SYNC_CONFIG_DIR_NAME}/backups`;

/** Gitignore lines consumers should add to target projects before writing secrets or state. */
export const MCP_SYNC_GITIGNORE_PATTERNS = [`${MCP_SYNC_CONFIG_DIR_NAME}/`];
