/**
 * @fileoverview Reduces MCP Ink shell actions into state transitions and selection updates.
 *
 * Flow: current state + action -> clamped selection and staged UI state.
 *
 * @example
 * ```typescript
 * const nextState = mcpInkReducer(createInitialMcpInkState(), { type: "load-start" });
 * ```
 *
 * @testing Jest unit: mcp-sync ink:test
 * @see scripts/ui/cli-ink/types.ts - Defines the state and action contracts consumed here.
 * @see scripts/ui/cli-ink/app.tsx - Uses this reducer to drive the Ink UI.
 * @documentation reviewed=2026-04-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import type {
  McpInkAction,
  McpInkEditorItem,
  McpInkScopeId,
  McpInkSectionId,
  McpInkState,
} from "./types";
import type { McpInkServiceItem } from "./types";
import type { TransportPreference } from "../../lib/types";
import {
  formatMcpValidationSummaryLines,
  getMcpSchemaPanelRowCount,
} from "../../lib/validate-mcp-config-files";

/**
 * Fixed left-to-right tab order for the MCP Ink shell sections.
 */
export const MCP_INK_SECTIONS: McpInkSectionId[] = [
  "services",
  "envVars",
  "editors",
  "diagnostics",
  "schemas",
];

const INITIAL_SECTION_INDEX: Record<McpInkSectionId, number> = {
  services: 0,
  envVars: 0,
  editors: 0,
  diagnostics: 0,
  schemas: 0,
};

/**
 * Narrow state slice used to derive per-section row counts for navigation clamping.
 *
 * @remarks
 * **PURITY:** read-only projection — excludes drafts and selection except via callers.
 */
type McpInkCountState = Pick<
  McpInkState,
  "inventory" | "diagnosticsResults"
>;

/**
 * Returns the selectable row count for a section given inventory, diagnostics, and static panels.
 *
 * @remarks
 * **PURITY:** pure — `schemas` uses a static row estimate; diagnostics defaults to 1 empty row.
 */
function getSectionItemCount(countState: McpInkCountState, section: McpInkSectionId): number {
  if (section === "diagnostics") {
    return countState.diagnosticsResults && countState.diagnosticsResults.length > 0
      ? countState.diagnosticsResults.length
      : 1;
  }

  if (section === "schemas") {
    return getMcpSchemaPanelRowCount();
  }

  const inventory = countState.inventory;
  if (!inventory) {
    return 0;
  }

  switch (section) {
    case "services":
      return inventory.services.length;
    case "envVars":
      return inventory.envVars.length;
    case "editors":
      return inventory.editors.length;
  }
}

/**
 * Clamps a list index to `[0, count - 1]` when `count` is positive; otherwise returns `0`.
 *
 * @remarks
 * **PURITY:** pure index math for selection bounds.
 */
function clampIndex(index: number, count: number): number {
  if (count <= 0) {
    return 0;
  }

  if (index < 0) {
    return 0;
  }

  if (index >= count) {
    return count - 1;
  }

  return index;
}

/**
 * Picks the focused section, or the first tab-ordered section that has at least one row.
 *
 * @remarks
 * **PURITY:** uses counts only; does not read drafts or transport preference.
 */
function getFirstAvailableSection(
  countState: McpInkCountState,
  currentSection: McpInkSectionId
): McpInkSectionId {
  const currentCount = getSectionItemCount(countState, currentSection);
  if (currentCount > 0) {
    return currentSection;
  }

  for (const section of MCP_INK_SECTIONS) {
    if (getSectionItemCount(countState, section) > 0) {
      return section;
    }
  }

  return currentSection;
}

/**
 * Recomputes `selectedSection` and per-section indices so every index fits its section row count.
 *
 * @remarks
 * **PURITY:** normalization step before merging into reducer state.
 */
function clampSelectionState(
  countState: McpInkCountState,
  selectedSection: McpInkSectionId,
  selectedIndexBySection: Record<McpInkSectionId, number>
): Pick<McpInkState, "selectedSection" | "selectedIndexBySection"> {
  const nextSelectedSection = getFirstAvailableSection(countState, selectedSection);

  const nextSelectedIndexBySection: Record<McpInkSectionId, number> = {
    services: clampIndex(
      selectedIndexBySection.services,
      getSectionItemCount(countState, "services")
    ),
    envVars: clampIndex(
      selectedIndexBySection.envVars,
      getSectionItemCount(countState, "envVars")
    ),
    editors: clampIndex(
      selectedIndexBySection.editors,
      getSectionItemCount(countState, "editors")
    ),
    diagnostics: clampIndex(
      selectedIndexBySection.diagnostics,
      getSectionItemCount(countState, "diagnostics")
    ),
    schemas: clampIndex(
      selectedIndexBySection.schemas,
      getSectionItemCount(countState, "schemas")
    ),
  };

  return {
    selectedSection: nextSelectedSection,
    selectedIndexBySection: nextSelectedIndexBySection,
  };
}

/**
 * Builds the ordered cycle of transport preferences allowed for a service's declared transports.
 *
 * @remarks
 * **PURITY:** always seeds `disabled`; adds combined options only when stdio and http both exist.
 */
function getAvailablePreferences(service: McpInkServiceItem): TransportPreference[] {
  const options: TransportPreference[] = ["disabled"];

  if (service.transports.includes("stdio")) {
    options.push("stdio-only");
  }

  if (service.transports.includes("http")) {
    options.push("http-only");
  }

  if (service.transports.includes("stdio") && service.transports.includes("http")) {
    options.push("prefer-stdio", "prefer-http");
  }

  return options;
}

/**
 * Returns the service row matching the current services list selection, if inventory is loaded.
 *
 * @remarks
 * **PURITY:** indexed read — returns null when inventory is missing or the index is empty.
 */
function getSelectedService(state: McpInkState): McpInkServiceItem | null {
  const serviceIndex = state.selectedIndexBySection.services;
  return state.inventory?.services[serviceIndex] ?? null;
}

/**
 * Returns the editor row matching the current editors list selection, if inventory is loaded.
 *
 * @remarks
 * **PURITY:** indexed read — returns null when inventory is missing or the index is empty.
 */
function getSelectedEditor(state: McpInkState): McpInkEditorItem | null {
  const editorIndex = state.selectedIndexBySection.editors;
  return state.inventory?.editors[editorIndex] ?? null;
}

/**
 * Stable map key for staging which editor/scope pair is queued in `draftEditorSelections`.
 *
 * @remarks
 * **PURITY:** string join only — must stay consistent with `toggle-editor-target` key parsing.
 */
function getEditorSelectionKey(editorId: string, scope: McpInkScopeId): string {
  return `${editorId}:${scope}`;
}

/**
 * Resolves the effective transport preference: staged draft overrides the inventory default.
 *
 * @remarks
 * **PURITY:** reads `state.draftServicePreferences` only.
 */
function getActiveServicePreference(
  state: McpInkState,
  service: McpInkServiceItem
): TransportPreference {
  return state.draftServicePreferences[service.id] ?? service.preference;
}

/**
 * Returns the selectable row count for a section given current inventory and diagnostics rows.
 *
 * @remarks
 * **I/O:** pure — uses diagnostics/schema helpers only for static row counts when inventory is absent.
 */
export function getMcpInkSectionItemCount(
  state: Pick<McpInkState, "inventory" | "diagnosticsResults">,
  section: McpInkSectionId
): number {
  return getSectionItemCount(
    { inventory: state.inventory, diagnosticsResults: state.diagnosticsResults },
    section
  );
}

/**
 * Moves the shell focus to the next or previous section in `MCP_INK_SECTIONS` with wraparound.
 *
 * @remarks
 * **PURITY:** advances tab order only; does not clamp row indices.
 */
function stepSection(currentSection: McpInkSectionId, direction: 1 | -1): McpInkSectionId {
  const currentIndex = MCP_INK_SECTIONS.indexOf(currentSection);
  const nextIndex =
    (currentIndex + direction + MCP_INK_SECTIONS.length) % MCP_INK_SECTIONS.length;
  return MCP_INK_SECTIONS[nextIndex];
}

/**
 * Factory for a cold Ink shell before inventory load completes.
 */
export function createInitialMcpInkState(): McpInkState {
  return {
    screen: "shell",
    status: "loading",
    inventory: null,
    applyResult: null,
    editorResult: null,
    errorMessage: null,
    noticeMessage: null,
    interactionMode: "browse",
    draftServicePreferences: {},
    draftEnvValues: {},
    draftEditorSelections: {},
    envEditorName: null,
    envEditorBuffer: "",
    envEditorInitialValue: "",
    selectedSection: "services",
    selectedIndexBySection: INITIAL_SECTION_INDEX,
    refreshToken: 0,
    diagnosticsResults: null,
    diagnosticsStaticLines: [],
    schemaPreviewText: "",
  };
}

/** Action payload shape for inventory refreshes after MCP settings load successfully. */
type McpInkLoadSuccessAction = Extract<McpInkAction, { type: "load-success" }>;

/** Action payload shape for toggling one editor target while preserving the draft map. */
type McpInkToggleEditorTargetAction = Extract<McpInkAction, { type: "toggle-editor-target" }>;

/**
 * Applies `load-success` inventory and optional selection/draft overrides with clamping.
 *
 * @remarks
 * **PURITY:** mirrors the former `load-success` switch arm — no I/O; preserves merge order.
 */
function applyMcpInkLoadSuccess(options: {
  state: McpInkState;
  action: McpInkLoadSuccessAction;
}): McpInkState {
  const { state, action } = options;
  const requestedSelectedSection = action.selectedSection ?? state.selectedSection;
  const requestedSelectedIndexBySection: Record<McpInkSectionId, number> = {
    services: action.selectedIndexBySection?.services ?? state.selectedIndexBySection.services,
    envVars: action.selectedIndexBySection?.envVars ?? state.selectedIndexBySection.envVars,
    editors: action.selectedIndexBySection?.editors ?? state.selectedIndexBySection.editors,
    diagnostics:
      action.selectedIndexBySection?.diagnostics ?? state.selectedIndexBySection.diagnostics,
    schemas: action.selectedIndexBySection?.schemas ?? state.selectedIndexBySection.schemas,
  };
  const countState: McpInkCountState = {
    inventory: action.inventory,
    diagnosticsResults: state.diagnosticsResults,
  };
  const clamped = clampSelectionState(
    countState,
    requestedSelectedSection,
    requestedSelectedIndexBySection
  );

  return {
    ...state,
    status: "ready",
    inventory: action.inventory,
    errorMessage: null,
    noticeMessage: action.noticeMessage ?? null,
    interactionMode: "browse",
    draftServicePreferences: action.draftServicePreferences ?? state.draftServicePreferences,
    draftEnvValues: action.draftEnvValues ?? state.draftEnvValues,
    draftEditorSelections: action.draftEditorSelections ?? state.draftEditorSelections,
    envEditorName: null,
    envEditorBuffer: "",
    envEditorInitialValue: "",
    ...clamped,
  };
}

/**
 * Toggles a queued editor write target with project/global exclusivity rules.
 *
 * @remarks
 * **PURITY:** mirrors the former `toggle-editor-target` switch arm — no I/O.
 */
function applyMcpInkToggleEditorTarget(options: {
  state: McpInkState;
  action: McpInkToggleEditorTargetAction;
}): McpInkState {
  const { state, action } = options;
  if (state.selectedSection !== "editors") {
    return state;
  }

  const selectedEditor = getSelectedEditor(state);
  if (!selectedEditor) {
    return state;
  }

  const selectedScope = selectedEditor.scopes[action.scope];
  if (!selectedScope.supported) {
    return state;
  }

  const selectionKey = getEditorSelectionKey(selectedEditor.id, action.scope);
  if (selectionKey in state.draftEditorSelections) {
    const remainingSelections = { ...state.draftEditorSelections };
    delete remainingSelections[selectionKey];
    return {
      ...state,
      draftEditorSelections: remainingSelections,
      noticeMessage: `Cleared queued ${action.scope} write for ${selectedEditor.name}.`,
    };
  }

  // Enforce project-over-global exclusivity:
  // queuing project removes global, queuing global when project is staged is blocked
  const projectKey = getEditorSelectionKey(selectedEditor.id, "project");
  const globalKey = getEditorSelectionKey(selectedEditor.id, "global");

  if (action.scope === "global" && projectKey in state.draftEditorSelections) {
    return {
      ...state,
      noticeMessage: `Cannot queue global — project is already queued for ${selectedEditor.name}. Project takes precedence.`,
    };
  }

  const nextSelections = { ...state.draftEditorSelections, [selectionKey]: true as const };
  if (action.scope === "project" && globalKey in nextSelections) {
    delete nextSelections[globalKey];
  }

  return {
    ...state,
    draftEditorSelections: nextSelections,
    noticeMessage:
      action.scope === "project" && globalKey in state.draftEditorSelections
        ? `Queued project write for ${selectedEditor.name} (global cleared — project takes precedence).`
        : `Queued ${action.scope} write for ${selectedEditor.name}.`,
  };
}

/**
 * Moves the list selection within the focused section by one row with wraparound.
 *
 * @remarks
 * **PURITY:** mirrors the former `select-next/previous-item` arms — same modulo wrap and count guard.
 */
function applySelectAdjacentItem(options: {
  state: McpInkState;
  direction: 1 | -1;
}): McpInkState {
  const { state, direction } = options;
  const countState: McpInkCountState = {
    inventory: state.inventory,
    diagnosticsResults: state.diagnosticsResults,
  };
  const count = getSectionItemCount(countState, state.selectedSection);
  const currentIndex = state.selectedIndexBySection[state.selectedSection];
  const nextIndex = count <= 0 ? 0 : (currentIndex + direction + count) % count;

  return {
    ...state,
    selectedIndexBySection: {
      ...state.selectedIndexBySection,
      [state.selectedSection]: nextIndex,
    },
  };
}

/**
 * Shifts shell focus to the next or previous tab-ordered section with selection clamping.
 *
 * @remarks
 * **PURITY:** mirrors the former `select-next/previous-section` arms — delegates to `stepSection` + `clampSelectionState`.
 */
function applySelectAdjacentSection(options: {
  state: McpInkState;
  direction: 1 | -1;
}): McpInkState {
  const { state, direction } = options;
  const nextSection = stepSection(state.selectedSection, direction);
  const countState: McpInkCountState = {
    inventory: state.inventory,
    diagnosticsResults: state.diagnosticsResults,
  };
  const clamped = clampSelectionState(
    countState,
    nextSection,
    state.selectedIndexBySection
  );

  return {
    ...state,
    ...clamped,
  };
}

/**
 * Advances the staged transport preference for the focused service row, or clears when unchanged.
 *
 * @remarks
 * **PURITY:** mirrors the former `cycle-service-preference` arm — same guards and draft-map edits.
 */
function applyCycleServicePreference(options: { state: McpInkState }): McpInkState {
  const { state } = options;
  if (state.selectedSection !== "services") {
    return state;
  }

  const selectedService = getSelectedService(state);
  if (!selectedService) {
    return state;
  }

  const availablePreferences = getAvailablePreferences(selectedService);
  const currentPreference = getActiveServicePreference(state, selectedService);
  const currentIndex = availablePreferences.indexOf(currentPreference);
  const nextIndex =
    currentIndex >= 0 ? (currentIndex + 1) % availablePreferences.length : 0;
  const nextPreference = availablePreferences[nextIndex];

  if (nextPreference === selectedService.preference) {
    const remainingDrafts = { ...state.draftServicePreferences };
    delete remainingDrafts[selectedService.id];

    return {
      ...state,
      draftServicePreferences: remainingDrafts,
      noticeMessage: `Cleared staged preference for ${selectedService.serviceName}.`,
    };
  }

  return {
    ...state,
    draftServicePreferences: {
      ...state.draftServicePreferences,
      [selectedService.id]: nextPreference,
    },
    noticeMessage: `Staged ${selectedService.serviceName} as ${nextPreference}.`,
  };
}

/**
 * Pure reducer for MCP Ink shell navigation, staging drafts, and async result fields.
 *
 * @remarks
 * **I/O:** pure — returns new state objects; persistence and subprocess work happen in `app.tsx`.
 */
export function mcpInkReducer(state: McpInkState, action: McpInkAction): McpInkState {
  switch (action.type) {
    case "load-start":
      return {
        ...state,
        status: "loading",
        errorMessage: null,
        noticeMessage: null,
        interactionMode: "browse",
        envEditorName: null,
        envEditorBuffer: "",
        envEditorInitialValue: "",
      };

    case "load-success":
      return applyMcpInkLoadSuccess({ state, action });

    case "load-error":
      return {
        ...state,
        status: "error",
        errorMessage: action.errorMessage,
        noticeMessage: null,
        interactionMode: "browse",
        envEditorName: null,
        envEditorBuffer: "",
        envEditorInitialValue: "",
      };

    case "select-next-item":
      return applySelectAdjacentItem({ state, direction: 1 });

    case "select-previous-item":
      return applySelectAdjacentItem({ state, direction: -1 });

    case "select-next-section":
      return applySelectAdjacentSection({ state, direction: 1 });

    case "select-previous-section":
      return applySelectAdjacentSection({ state, direction: -1 });

    case "open-apply-review":
      return {
        ...state,
        screen: "apply-review",
      };

    case "show-apply-result":
      return {
        ...state,
        screen: "apply-result",
        applyResult: action.result,
        editorResult: null,
      };

    case "show-editor-result":
      return {
        ...state,
        screen: "editor-result",
        applyResult: null,
        editorResult: action.result,
      };

    case "close-review":
      return {
        ...state,
        screen: "shell",
        applyResult: null,
        editorResult: null,
      };

    case "cycle-service-preference":
      return applyCycleServicePreference({ state });

    case "clear-service-preference": {
      if (state.selectedSection !== "services") {
        return state;
      }

      const selectedService = getSelectedService(state);
      if (!selectedService || !(selectedService.id in state.draftServicePreferences)) {
        return state;
      }

      const remainingDrafts = { ...state.draftServicePreferences };
      delete remainingDrafts[selectedService.id];
      return {
        ...state,
        draftServicePreferences: remainingDrafts,
        noticeMessage: `Cleared staged preference for ${selectedService.serviceName}.`,
      };
    }

    case "start-env-edit":
      return {
        ...state,
        interactionMode: "env-edit",
        envEditorName: action.envVarName,
        envEditorBuffer: action.initialValue,
        envEditorInitialValue: action.initialValue,
        noticeMessage: `Editing ${action.envVarName}.`,
      };

    case "append-env-edit":
      if (state.interactionMode !== "env-edit") {
        return state;
      }

      return {
        ...state,
        envEditorBuffer: state.envEditorBuffer + action.value,
      };

    case "backspace-env-edit":
      if (state.interactionMode !== "env-edit") {
        return state;
      }

      return {
        ...state,
        envEditorBuffer: state.envEditorBuffer.slice(0, -1),
      };

    case "submit-env-edit": {
      if (state.interactionMode !== "env-edit" || !state.envEditorName) {
        return state;
      }

      const nextDraftEnvValues = {
        ...state.draftEnvValues,
      };

      if (state.envEditorBuffer === state.envEditorInitialValue) {
        delete nextDraftEnvValues[state.envEditorName];
      } else {
        nextDraftEnvValues[state.envEditorName] = state.envEditorBuffer;
      }

      return {
        ...state,
        interactionMode: "browse",
        draftEnvValues: nextDraftEnvValues,
        envEditorName: null,
        envEditorBuffer: "",
        envEditorInitialValue: "",
        noticeMessage:
          state.envEditorBuffer === state.envEditorInitialValue
            ? `Cleared staged env value for ${state.envEditorName}.`
            : `Staged env value for ${state.envEditorName}.`,
      };
    }

    case "cancel-env-edit":
      if (state.interactionMode !== "env-edit") {
        return state;
      }

      return {
        ...state,
        interactionMode: "browse",
        envEditorName: null,
        envEditorBuffer: "",
        envEditorInitialValue: "",
        noticeMessage: "Cancelled env editing.",
      };

    case "clear-env-draft": {
      if (!state.inventory || state.selectedSection !== "envVars") {
        return state;
      }

      const selectedEnvVar = state.inventory.envVars[state.selectedIndexBySection.envVars];
      if (!selectedEnvVar || !(selectedEnvVar.name in state.draftEnvValues)) {
        return state;
      }

      const remainingDrafts = { ...state.draftEnvValues };
      delete remainingDrafts[selectedEnvVar.name];
      return {
        ...state,
        draftEnvValues: remainingDrafts,
        noticeMessage: `Cleared staged env value for ${selectedEnvVar.name}.`,
      };
    }

    case "toggle-editor-target":
      return applyMcpInkToggleEditorTarget({ state, action });

    case "clear-editor-targets": {
      if (state.selectedSection !== "editors") {
        return state;
      }

      const selectedEditor = getSelectedEditor(state);
      if (!selectedEditor) {
        return state;
      }

      const nextSelections = Object.fromEntries(
        Object.entries(state.draftEditorSelections).filter(([selectionKey]) => {
          return !selectionKey.startsWith(`${selectedEditor.id}:`);
        })
      ) as Record<string, true>;

      if (Object.keys(nextSelections).length === Object.keys(state.draftEditorSelections).length) {
        return state;
      }

      return {
        ...state,
        draftEditorSelections: nextSelections,
        noticeMessage: `Cleared queued writes for ${selectedEditor.name}.`,
      };
    }

    case "refresh-requested":
      return {
        ...state,
        refreshToken: state.refreshToken + 1,
      };

    case "diagnostics-complete": {
      const header = `--- ${new Date().toISOString()} ---`;
      const body = formatMcpValidationSummaryLines(action.summary);
      return {
        ...state,
        diagnosticsResults: action.summary.results,
        diagnosticsStaticLines: [...state.diagnosticsStaticLines, header, ...body, ""],
        noticeMessage: `Validation: ${action.summary.invalidCount} invalid, ${action.summary.skippedCount} skipped.`,
      };
    }

    case "schema-preview-ready":
      return {
        ...state,
        schemaPreviewText: action.text,
      };

    case "notice":
      return {
        ...state,
        noticeMessage: action.message,
      };
  }
}
