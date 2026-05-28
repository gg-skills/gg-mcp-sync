/**
 * @fileoverview Pure selection, formatting, and env-edit action helpers for the MCP Ink shell.
 *
 * Flow: inventory + reducer snapshot -> row selection, labels, staged-change predicates, and
 * `getEnvEditInputActions` encoding for `mcpInkReducer`.
 *
 * @example
 * ```typescript
 * import { hasStagedApplyChanges, formatPreferenceLabel } from "./cli-ink-app-shell-state-helpers";
 * ```
 *
 * @testing Jest unit: mcp-sync ink:test (via `app-input.unit.test.ts` importing `app.tsx` re-exports)
 * @see skills/mcp-sync/scripts/ui/cli-ink/app.tsx - Renders UI that consumes these helpers.
 * @see skills/mcp-sync/scripts/ui/cli-ink/reducer.ts - Consumes `getEnvEditInputActions` shapes.
 * @documentation reviewed=2026-05-15 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { maskSecret } from "../../lib/env";
import type { McpValidatedConfigFileResult } from "../../lib/validate-mcp-config-files";
import type { McpEditorSelection } from "../../controllers/editor-controller";
import type { TransportPreference } from "../../lib/types";
import type {
  McpInkAction,
  McpInkEditorItem,
  McpInkEnvVarItem,
  McpInkInventory,
  McpInkScopeId,
  McpInkSectionId,
  McpInkServiceItem,
  McpInkState,
} from "./types";

/**
 * Flags from Ink `useInput` key events used when translating stdin into env-edit actions.
 */
export interface McpInkInputKey {
  return?: boolean;
  escape?: boolean;
  backspace?: boolean;
  delete?: boolean;
  ctrl?: boolean;
  meta?: boolean;
  tab?: boolean;
}

/**
 * Returns the services row at the current selection index, or null when out of range.
 */
export function getSelectedService(
  inventory: McpInkInventory,
  state: McpInkState
): McpInkServiceItem | null {
  const item = inventory.services[state.selectedIndexBySection.services];
  return item ?? null;
}

/**
 * Returns the env-vars row at the current selection index, or null when out of range.
 */
export function getSelectedEnvVar(
  inventory: McpInkInventory,
  state: McpInkState
): McpInkEnvVarItem | null {
  const item = inventory.envVars[state.selectedIndexBySection.envVars];
  return item ?? null;
}

/**
 * Returns the editors row at the current selection index, or null when out of range.
 */
export function getSelectedEditor(
  inventory: McpInkInventory,
  state: McpInkState
): McpInkEditorItem | null {
  const item = inventory.editors[state.selectedIndexBySection.editors];
  return item ?? null;
}

/**
 * Human-readable tab title for a shell section id.
 */
export function getSectionLabel(section: McpInkSectionId): string {
  switch (section) {
    case "services":
      return "Services";
    case "envVars":
      return "Env";
    case "editors":
      return "Editors";
    case "diagnostics":
      return "Diagnostics";
    case "schemas":
      return "Schemas";
  }
}

/**
 * Returns the diagnostics validation row at the current index, or null when none exist.
 */
export function getSelectedDiagnostic(
  state: McpInkState
): McpValidatedConfigFileResult | null {
  const rows = state.diagnosticsResults;
  if (!rows || rows.length === 0) {
    return null;
  }
  return rows[state.selectedIndexBySection.diagnostics] ?? null;
}

/**
 * Formats boolean inventory facts as compact yes/no labels for the detail pane.
 */
export function formatBool(value: boolean): string {
  return value ? "yes" : "no";
}

/**
 * Masks staged env values for safe on-screen display while preserving empty placeholders.
 */
export function formatDraftEnvValue(value: string): string {
  return value.length > 0 ? maskSecret(value) : "(empty)";
}

/**
 * Stable key for editor/scope pairs in the draft selection map.
 */
export function getEditorSelectionKey(editorId: string, scope: McpInkScopeId): string {
  return `${editorId}:${scope}`;
}

/**
 * Converts draft editor selection keys into controller-ready scope selections.
 *
 * @remarks
 * Drops malformed keys so only known `McpInkScopeId` values reach apply flows.
 */
export function parseEditorSelections(selectionMap: Record<string, true>): McpEditorSelection[] {
  return Object.keys(selectionMap).flatMap((selectionKey) => {
    const [editorId, scope] = selectionKey.split(":");
    if (scope !== "project" && scope !== "global" && scope !== "instructions") {
      return [];
    }

    return [
      {
        editorId,
        scope,
      },
    ];
  });
}

/**
 * Lists scopes that currently have staged editor write targets for one editor id.
 */
export function getStagedEditorScopes(
  state: McpInkState,
  editorId: string
): McpInkScopeId[] {
  return (["project", "global", "instructions"] as const).filter((scope) => {
    return getEditorSelectionKey(editorId, scope) in state.draftEditorSelections;
  });
}

/**
 * True when any service preference, env draft, or editor target is staged for apply.
 */
export function hasStagedApplyChanges(state: McpInkState): boolean {
  return (
    Object.keys(state.draftServicePreferences).length > 0
    || Object.keys(state.draftEnvValues).length > 0
    || Object.keys(state.draftEditorSelections).length > 0
  );
}

/**
 * Short label for a transport preference suitable for list rows and summaries.
 */
export function formatPreferenceLabel(preference: TransportPreference): string {
  switch (preference) {
    case "disabled":
      return "disabled";
    case "stdio-only":
      return "stdio only";
    case "http-only":
      return "http only";
    case "prefer-stdio":
      return "prefer stdio";
    case "prefer-http":
      return "prefer http";
  }
}

/**
 * Badge tone for the shell header notice derived from edit mode and staged drafts.
 */
export function getNoticeTone(state: McpInkState): "editing" | "staged" | "info" {
  if (state.interactionMode === "env-edit") {
    return "editing";
  }

  if (hasStagedApplyChanges(state)) {
    return "staged";
  }

  return "info";
}

/**
 * Maps apply or validation outcome counts to header badge severity.
 */
export function getResultTone(
  successCount: number,
  errorCount: number,
): "ready" | "warning" | "destructive" {
  if (errorCount > 0) {
    return successCount > 0 ? "warning" : "destructive";
  }

  return "ready";
}

/**
 * Strips newline characters from raw stdin chunks so env editing stays single-line.
 */
export function sanitizeEnvEditInput(input: string): string {
  return input.replace(/[\r\n]/g, "");
}

/**
 * Maps Ink stdin input events to reducer actions while the shell is in env-edit mode.
 *
 * @remarks
 * **I/O:** pure — encodes escape/backspace/return semantics expected by `mcpInkReducer`.
 */
export function getEnvEditInputActions(
  input: string,
  key: McpInkInputKey
): McpInkAction[] {
  const printableInput = sanitizeEnvEditInput(input);

  if (key.escape) {
    return [{ type: "cancel-env-edit" }];
  }

  if (key.backspace || key.delete) {
    return [{ type: "backspace-env-edit" }];
  }

  if (key.return) {
    const actions: McpInkAction[] = [];
    if (printableInput.length > 0) {
      actions.push({ type: "append-env-edit", value: printableInput });
    }
    actions.push({ type: "submit-env-edit" });
    return actions;
  }

  if (!key.ctrl && !key.meta && !key.tab && printableInput.length > 0) {
    return [{ type: "append-env-edit", value: printableInput }];
  }

  return [];
}

/**
 * Effective transport preference for a row, preferring staged drafts over inventory defaults.
 */
export function getDisplayedServicePreference(
  state: McpInkState,
  item: McpInkServiceItem
): TransportPreference {
  return state.draftServicePreferences[item.id] ?? item.preference;
}
