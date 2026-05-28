/**
 * @fileoverview Stores and updates the MCP project state used by setup and management flows.
 *
 * Flow: current state + mutation helpers -> updated state summaries and timestamps.
 *
 * @example
 * ```typescript
 * const state = createDefaultState();
 * ```
 *
 * @testing Jest unit: npm test
 * @see scripts/setup.ts - Creates the default state during setup.
 * @see scripts/ui/shared/load-inventory.ts - Reads this state to build inventory screens.
 * @documentation reviewed=2026-04-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { mkdir, readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { dirname } from "path";
import type {
  McpState,
  EditorState,
  EditorScopeState,
  EnvVarState,
  Result,
} from "./types";
import { parseJsonOrJsonc, stringifyJsonWithNewline } from "./jsonc";
import { MCP_SYNC_STATE_FILE_NAME } from "./storage-paths";

// =============================================================================
// Constants
// =============================================================================

/** Default path for persisted MCP enablement and sync metadata under the target project root. */
export const STATE_FILE_NAME = MCP_SYNC_STATE_FILE_NAME;
/** Semantic version embedded in persisted MCP state for forward-compatible migrations. */
export const STATE_VERSION = "1.0.0" as const;

// =============================================================================
// Default State
// =============================================================================

/**
 * Create a default empty state.
 */
export function createDefaultState(): McpState {
  return {
    version: STATE_VERSION,
    enabledServers: [],
    serverSettings: {},
    envVars: {},
    editors: {},
    lastModified: new Date().toISOString(),
    lastModifiedBy: "setup",
  };
}

/**
 * Create a default editor scope state.
 */
export function createDefaultEditorScopeState(configPath: string): EditorScopeState {
  return {
    enabled: false,
    configPath,
    lastSync: null,
    lastBackup: null,
  };
}

/**
 * Create a default editor state.
 */
export function createDefaultEditorState(
  projectPath: string | null,
  globalPath: string | null
): EditorState {
  return {
    project: createDefaultEditorScopeState(projectPath ?? ""),
    global: createDefaultEditorScopeState(globalPath ?? ""),
  };
}

// =============================================================================
// Read Functions
// =============================================================================

/**
 * Read the state file.
 */
export async function readState(filePath: string): Promise<Result<McpState, string>> {
  try {
    if (!existsSync(filePath)) {
      return { success: true, data: createDefaultState() };
    }

    const content = await readFile(filePath, "utf-8");

    // Handle empty or whitespace-only files
    if (!content.trim()) {
      return { success: true, data: createDefaultState() };
    }

    const parseResult = parseJsonOrJsonc<McpState>(content);

    if (!parseResult.success) {
      return { success: false, error: parseResult.error };
    }

    // Validate version
    const state = parseResult.data;
    if (state.version !== STATE_VERSION) {
      // Future: handle migrations here
      return {
        success: false,
        error: `State file version mismatch: expected ${STATE_VERSION}, got ${state.version}`,
      };
    }

    const normalizedState: McpState = {
      ...state,
      serverSettings: state.serverSettings ?? {},
    };

    return { success: true, data: normalizedState };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Failed to read state file: ${message}` };
  }
}

// =============================================================================
// Write Functions
// =============================================================================

/**
 * Write the state file.
 */
export async function writeState(
  filePath: string,
  state: McpState
): Promise<Result<void, string>> {
  try {
    // Update modification timestamp
    const updatedState: McpState = {
      ...state,
      lastModified: new Date().toISOString(),
    };

    const content = stringifyJsonWithNewline(updatedState);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf-8");

    return { success: true, data: undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Failed to write state file: ${message}` };
  }
}

// =============================================================================
// Server State Functions
// =============================================================================

/**
 * Enable a server in the state.
 */
export function enableServer(state: McpState, serverId: string): McpState {
  if (state.enabledServers.includes(serverId)) {
    return state;
  }
  return {
    ...state,
    enabledServers: [...state.enabledServers, serverId],
  };
}

/**
 * Disable a server in the state.
 */
export function disableServer(state: McpState, serverId: string): McpState {
  return {
    ...state,
    enabledServers: state.enabledServers.filter((id) => id !== serverId),
  };
}

/**
 * Toggle a server's enabled state.
 */
export function toggleServer(state: McpState, serverId: string): McpState {
  if (state.enabledServers.includes(serverId)) {
    return disableServer(state, serverId);
  }
  return enableServer(state, serverId);
}

/**
 * Set multiple servers' enabled state.
 */
export function setEnabledServers(state: McpState, serverIds: string[]): McpState {
  return {
    ...state,
    enabledServers: [...serverIds],
  };
}

/**
 * Check if a server is enabled.
 */
export function isServerEnabled(state: McpState, serverId: string): boolean {
  return state.enabledServers.includes(serverId);
}

/**
 * Persist per-server settings under the concrete server id.
 */
export function updateServerSettings(
  state: McpState,
  serverId: string,
  serverSettings: McpState["serverSettings"][string]
): McpState {
  return {
    ...state,
    serverSettings: {
      ...state.serverSettings,
      [serverId]: serverSettings,
    },
  };
}

// =============================================================================
// Environment Variable State Functions
// =============================================================================

/**
 * Update environment variable state.
 */
export function updateEnvVarState(
  state: McpState,
  varName: string,
  isSet: boolean
): McpState {
  const envVarState: EnvVarState = {
    isSet,
    lastValidated: new Date().toISOString(),
  };

  return {
    ...state,
    envVars: {
      ...state.envVars,
      [varName]: envVarState,
    },
  };
}

/**
 * Update multiple environment variable states.
 */
export function updateEnvVarsState(
  state: McpState,
  vars: Record<string, boolean>
): McpState {
  const now = new Date().toISOString();
  const envVars: Record<string, EnvVarState> = { ...state.envVars };

  for (const [varName, isSet] of Object.entries(vars)) {
    envVars[varName] = {
      isSet,
      lastValidated: now,
    };
  }

  return {
    ...state,
    envVars,
  };
}

// =============================================================================
// Editor State Functions
// =============================================================================

/**
 * Get editor state, creating default if not exists.
 */
export function getEditorState(
  state: McpState,
  editorId: string,
  projectPath: string | null,
  globalPath: string | null
): EditorState {
  if (state.editors[editorId]) {
    return state.editors[editorId];
  }
  return createDefaultEditorState(projectPath, globalPath);
}

/**
 * Returns a new MCP state with the given editor state merged in.
 */
export function updateEditorState(
  state: McpState,
  editorId: string,
  editorState: EditorState
): McpState {
  return {
    ...state,
    editors: {
      ...state.editors,
      [editorId]: editorState,
    },
  };
}

/**
 * Enables the specified editor scope, auto-disabling global when project is chosen.
 */
export function enableEditorScope(
  state: McpState,
  editorId: string,
  scope: "project" | "global",
  configPath: string
): McpState {
  const editorState = state.editors[editorId] ?? createDefaultEditorState(null, null);
  const scopeState = editorState[scope];

  const updatedScopeState: EditorScopeState = {
    ...scopeState,
    enabled: true,
    configPath,
  };

  // When enabling project scope, auto-disable global to prevent duplicate configs.
  // Project-scoped configs take precedence in every editor.
  if (scope === "project") {
    return updateEditorState(state, editorId, {
      ...editorState,
      project: updatedScopeState,
      global: { ...editorState.global, enabled: false },
    });
  }

  return updateEditorState(state, editorId, {
    ...editorState,
    [scope]: updatedScopeState,
  });
}

/**
 * Disables the specified editor scope without altering the other scope.
 */
export function disableEditorScope(
  state: McpState,
  editorId: string,
  scope: "project" | "global"
): McpState {
  const editorState = state.editors[editorId];
  if (!editorState) {
    return state;
  }

  const updatedScopeState: EditorScopeState = {
    ...editorState[scope],
    enabled: false,
  };

  return updateEditorState(state, editorId, {
    ...editorState,
    [scope]: updatedScopeState,
  });
}

/**
 * Record a sync for an editor scope.
 */
export function recordEditorSync(
  state: McpState,
  editorId: string,
  scope: "project" | "global"
): McpState {
  const editorState = state.editors[editorId];
  if (!editorState) {
    return state;
  }

  const updatedScopeState: EditorScopeState = {
    ...editorState[scope],
    lastSync: new Date().toISOString(),
  };

  return updateEditorState(state, editorId, {
    ...editorState,
    [scope]: updatedScopeState,
  });
}

/**
 * Record a backup for an editor scope.
 */
export function recordEditorBackup(
  state: McpState,
  editorId: string,
  scope: "project" | "global"
): McpState {
  const editorState = state.editors[editorId];
  if (!editorState) {
    return state;
  }

  const updatedScopeState: EditorScopeState = {
    ...editorState[scope],
    lastBackup: new Date().toISOString(),
  };

  return updateEditorState(state, editorId, {
    ...editorState,
    [scope]: updatedScopeState,
  });
}

// =============================================================================
// Modification Tracking
// =============================================================================

/**
 * Mark state as modified by a specific script.
 */
export function markModified(
  state: McpState,
  modifiedBy: McpState["lastModifiedBy"]
): McpState {
  return {
    ...state,
    lastModified: new Date().toISOString(),
    lastModifiedBy: modifiedBy,
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Format a timestamp for display.
 */
export function formatTimestamp(isoTimestamp: string | null): string {
  if (!isoTimestamp) {
    return "never";
  }

  const date = new Date(isoTimestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) {
    return "just now";
  }
  if (diffMins < 60) {
    return `${diffMins}m ago`;
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  if (diffDays === 1) {
    return "yesterday";
  }
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  return date.toLocaleDateString();
}

/**
 * Get summary of state for display.
 */
export function getStateSummary(state: McpState): {
  enabledServers: number;
  configuredEditors: number;
  lastModified: string;
} {
  const configuredEditors = Object.values(state.editors).filter(
    (e) => e.project.enabled || e.global.enabled
  ).length;

  return {
    enabledServers: state.enabledServers.length,
    configuredEditors,
    lastModified: formatTimestamp(state.lastModified),
  };
}
