/**
 * @fileoverview Defines the shared MCP Ink state and selection contracts used by the MCP shell UI.
 *
 * Flow: shared shell inventory types + execution results -> Ink state and action contracts.
 *
 * @example
 * ```typescript
 * const launchTarget: McpInkLaunchTarget = { section: "services", matchKind: "section", matchValue: null };
 * ```
 *
 * @testing Jest unit: mcp-sync ink:test
 * @see scripts/ui/shared/shell-types.ts - Defines the neutral shared shell inventory model.
 * @see scripts/ui/cli-ink/app.tsx - Consumes the Ink state and action contracts.
 * @documentation reviewed=2026-04-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import type {
  McpShellEditorItem,
  McpShellEditorScopeItem,
  McpShellEnvVarItem,
  McpShellFilePresence,
  McpShellInventory,
  McpShellInventorySummary,
  McpShellLaunchTarget,
  McpShellScopeId,
  McpShellSectionId,
  McpShellServiceItem,
} from "../shared/shell-types";
import type { McpApplyExecutionResult } from "../../controllers/apply-controller";
import type { McpEditorExecutionResult } from "../../controllers/editor-controller";
import type { TransportPreference } from "../../lib/types";
import type {
  McpValidatedConfigFileResult,
  McpValidateMcpConfigFilesSummary,
} from "../../lib/validate-mcp-config-files";

/** Ink shell re-export of {@link McpShellSectionId} for reducer and UI selection keys. */
export type McpInkSectionId = McpShellSectionId;
/** Ink shell re-export of {@link McpShellScopeId} for editor scope rows. */
export type McpInkScopeId = McpShellScopeId;
/** Ink shell re-export of {@link McpShellLaunchTarget} for list jump and focus contracts. */
export type McpInkLaunchTarget = McpShellLaunchTarget;
/** Ink shell re-export of {@link McpShellFilePresence} for onboarding file badges. */
export type McpInkFilePresence = McpShellFilePresence;
/** Ink shell re-export of {@link McpShellServiceItem} for the services table. */
export type McpInkServiceItem = McpShellServiceItem;
/** Ink shell re-export of {@link McpShellEnvVarItem} for the env-vars table. */
export type McpInkEnvVarItem = McpShellEnvVarItem;
/** Ink shell re-export of {@link McpShellEditorScopeItem} for nested editor rows. */
export type McpInkEditorScopeItem = McpShellEditorScopeItem;
/** Ink shell re-export of {@link McpShellEditorItem} for the editors matrix. */
export type McpInkEditorItem = McpShellEditorItem;
/** Ink shell re-export of {@link McpShellInventorySummary} for footer counts. */
export type McpInkInventorySummary = McpShellInventorySummary;
/** Ink shell re-export of {@link McpShellInventory} as the loaded inventory snapshot. */
export type McpInkInventory = McpShellInventory;

/** The complete UI state for the MCP Ink shell: inventory, review screens, env editor, diagnostics, and selection tracking. */
export interface McpInkState {
  screen: "shell" | "apply-review" | "apply-result" | "editor-result";
  status: "loading" | "ready" | "error";
  inventory: McpInkInventory | null;
  applyResult: McpApplyExecutionResult | null;
  editorResult: McpEditorExecutionResult | null;
  errorMessage: string | null;
  noticeMessage: string | null;
  interactionMode: "browse" | "env-edit";
  draftServicePreferences: Record<string, TransportPreference>;
  draftEnvValues: Record<string, string>;
  draftEditorSelections: Record<string, true>;
  envEditorName: string | null;
  envEditorBuffer: string;
  envEditorInitialValue: string;
  selectedSection: McpInkSectionId;
  selectedIndexBySection: Record<McpInkSectionId, number>;
  refreshToken: number;
  /** Last JSON-schema validation outcome (diagnostics section). */
  diagnosticsResults: McpValidatedConfigFileResult[] | null;
  /** Appended blocks of plain validation output for `<Static>`. */
  diagnosticsStaticLines: string[];
  /** Snippet of selected schema JSON file (schemas section). */
  schemaPreviewText: string;
}

/** Discriminated union of all possible state transitions (actions) dispatched by the MCP Ink reducer. */
export type McpInkAction =
  | { type: "load-start" }
  | {
      type: "load-success";
      inventory: McpInkInventory;
      noticeMessage?: string | null;
      draftServicePreferences?: Record<string, TransportPreference>;
      draftEnvValues?: Record<string, string>;
      draftEditorSelections?: Record<string, true>;
      selectedSection?: McpInkSectionId;
      selectedIndexBySection?: Partial<Record<McpInkSectionId, number>>;
    }
  | { type: "load-error"; errorMessage: string }
  | { type: "select-next-item" }
  | { type: "select-previous-item" }
  | { type: "select-next-section" }
  | { type: "select-previous-section" }
  | { type: "open-apply-review" }
  | { type: "show-apply-result"; result: McpApplyExecutionResult }
  | { type: "show-editor-result"; result: McpEditorExecutionResult }
  | { type: "close-review" }
  | { type: "cycle-service-preference" }
  | { type: "clear-service-preference" }
  | { type: "start-env-edit"; envVarName: string; initialValue: string }
  | { type: "append-env-edit"; value: string }
  | { type: "backspace-env-edit" }
  | { type: "submit-env-edit" }
  | { type: "cancel-env-edit" }
  | { type: "clear-env-draft" }
  | { type: "toggle-editor-target"; scope: McpInkScopeId }
  | { type: "clear-editor-targets" }
  | { type: "refresh-requested" }
  | { type: "diagnostics-complete"; summary: McpValidateMcpConfigFilesSummary }
  | { type: "schema-preview-ready"; text: string }
  | { type: "notice"; message: string | null };
