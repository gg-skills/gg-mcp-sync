/**
 * @fileoverview Builds the MCP Ink apply-review model and preview notices.
 *
 * Flow: inventory + draft state -> apply plan, preview targets, and staged change notices.
 *
 * @example
 * ```typescript
 * const model = buildApplyReviewModel(inventory, state);
 * ```
 *
 * @testing Jest unit: mcp-sync ink:test
 * @see scripts/ui/cli-ink/types.ts - Provides the inventory and state types used here.
 * @see scripts/ui/cli-ink/app.tsx - Renders the apply-review model in Ink.
 * @documentation reviewed=2026-04-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import {
  buildMcpApplyPlan,
  type McpApplyPlan,
  type McpApplyTarget,
} from "../../controllers/apply-controller";
import {
  buildEditorSelectionPreview,
  type McpEditorPreviewItem,
  type McpEditorSelection,
} from "../../controllers/editor-controller";
import type { TransportPreference } from "../../lib/types";
import { getEnabledServersFromPreferences, getServersByIds } from "../../servers";
import type { McpInkInventory, McpInkState } from "./types";

/**
 * Apply-preview snapshot: plan, enabled preview, staged counts, editor writes, and UX notices.
 */
export interface McpInkApplyReviewModel {
  plan: McpApplyPlan;
  previewEnabledServerIds: string[];
  stagedServiceChangeCount: number;
  stagedEnvChangeCount: number;
  stagedEditorChangeCount: number;
  stagedEditorWrites: McpEditorPreviewItem[];
  notices: string[];
}

/**
 * Builds the preview map of service id to resolved transport preference for apply planning.
 *
 * @remarks
 * **I/O:** pure — drafts override inventory defaults; entries with `disabled` preference are omitted.
 */
function buildServicePreferencePreview(
  inventory: McpInkInventory,
  state: McpInkState
): Record<string, { preference: TransportPreference }> {
  const preferences: Record<string, { preference: TransportPreference }> = {};

  for (const service of inventory.services) {
    const preference = state.draftServicePreferences[service.id] ?? service.preference;
    if (preference === "disabled") {
      continue;
    }

    preferences[service.id] = {
      preference,
    };
  }

  return preferences;
}

/**
 * Derives apply-controller targets from which editor scopes are enabled in the inventory.
 *
 * @remarks
 * **I/O:** pure — encodes the project-over-global precedence rule used by `mcp-sync apply`.
 */
export function buildApplyTargetsFromInventory(
  inventory: McpInkInventory
): McpApplyTarget[] {
  const targets: McpApplyTarget[] = [];

  for (const editor of inventory.editors) {
    const hasProject = editor.scopes.project.enabled && editor.scopes.project.configPath;

    if (hasProject) {
      targets.push({
        editorId: editor.id,
        editorName: editor.name,
        scope: "project",
        configPath: editor.scopes.project.configPath,
      });
    }

    // Skip global when project is enabled — project-scoped configs take precedence
    if (!hasProject && editor.scopes.global.enabled && editor.scopes.global.configPath) {
      targets.push({
        editorId: editor.id,
        editorName: editor.name,
        scope: "global",
        configPath: editor.scopes.global.configPath,
      });
    }
  }

  return targets;
}

/**
 * Parses draft editor selection keys (`editorId:scope`) into structured selections.
 *
 * @remarks
 * **I/O:** pure — malformed keys and scopes other than `project`, `global`, or `instructions` are dropped.
 */
function parseEditorSelections(selectionMap: Record<string, true>): McpEditorSelection[] {
  return Object.keys(selectionMap)
    .map((selectionKey) => {
      const separatorIndex = selectionKey.indexOf(":");
      if (separatorIndex <= 0) {
        return null;
      }

      const editorId = selectionKey.slice(0, separatorIndex);
      const scope = selectionKey.slice(separatorIndex + 1);

      if (scope !== "project" && scope !== "global" && scope !== "instructions") {
        return null;
      }

      return {
        editorId,
        scope,
      };
    })
    .filter((selection): selection is McpEditorSelection => selection !== null);
}

/**
 * Builds the full apply-review panel model from live inventory plus staged shell drafts.
 *
 * @remarks
 * **I/O:** pure — callers supply consistent `inventory` and `state`; notices explain disk vs draft divergence.
 */
export function buildApplyReviewModel(
  inventory: McpInkInventory,
  state: McpInkState
): McpInkApplyReviewModel {
  const servicePreferences = buildServicePreferencePreview(inventory, state);
  const previewEnabledServerIds = getEnabledServersFromPreferences(servicePreferences);
  const enabledServers = getServersByIds(previewEnabledServerIds);
  const plan = buildMcpApplyPlan({
    enabledServers,
    allTargets: buildApplyTargetsFromInventory(inventory),
    requestedEditorId: null,
    includeOpencodeGlobal: false,
  });
  const stagedServiceChangeCount = Object.keys(state.draftServicePreferences).length;
  const stagedEnvChangeCount = Object.keys(state.draftEnvValues).length;
  const stagedEditorSelections = parseEditorSelections(state.draftEditorSelections);
  const stagedEditorChangeCount = stagedEditorSelections.length;
  const stagedEditorWrites = buildEditorSelectionPreview(
    inventory.projectRoot,
    stagedEditorSelections
  );
  const notices: string[] = [];

  if (
    stagedServiceChangeCount > 0
    || stagedEnvChangeCount > 0
    || stagedEditorChangeCount > 0
  ) {
    notices.push("Preview includes staged shell changes that are not saved to disk yet.");
  }

  if (stagedServiceChangeCount > 0) {
    notices.push(
      "Direct mcp-sync apply still reads .mcp-sync/state.json from disk until staged service changes are saved."
    );
  }

  if (stagedEnvChangeCount > 0) {
    notices.push(
      "Direct mcp-sync apply still reads .mcp-sync/env from disk until staged env values are saved."
    );
  }

  if (stagedEditorChangeCount > 0) {
    notices.push(
      "Direct mcp-sync apply still reads .mcp-sync/state.json from disk until queued editor writes run."
    );
  }

  return {
    plan,
    previewEnabledServerIds,
    stagedServiceChangeCount,
    stagedEnvChangeCount,
    stagedEditorChangeCount,
    stagedEditorWrites,
    notices,
  };
}
