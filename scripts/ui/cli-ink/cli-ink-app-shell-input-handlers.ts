/**
 * @fileoverview Impure stdin handlers for the MCP Ink shell: quit paths, saves, apply, and movement.
 *
 * Flow: `McpInkShellInputContext` from `useInput` -> ordered `mcpInkShellInputTry*` predicates that
 * dispatch reducer actions and start async controller work without reordering legacy key contracts.
 *
 * @example
 * ```typescript
 * import { mcpInkShellInputTryQuitEscape } from "./cli-ink-app-shell-input-handlers";
 * ```
 *
 * @testing Jest unit: mcp-sync ink:test
 * @see skills/mcp-sync/scripts/ui/cli-ink/app.tsx - Wires these handlers from `useInput`.
 * @see skills/mcp-sync/scripts/ui/cli-ink/cli-ink-app-shell-state-helpers.ts - Shared pure helpers consumed here.
 * @documentation reviewed=2026-05-15 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import type { Dispatch, SetStateAction } from "react";
import type { Key as InkInputKey } from "ink";
import {
  assertMcpSchemaFilesPresent,
  validateMcpConfigFiles,
} from "../../lib/validate-mcp-config-files";
import {
  buildMcpApplyPlan,
  executeApplyPlan,
  loadApplyBaseContext,
} from "../../controllers/apply-controller";
import {
  loadServiceControllerContext,
  saveServicePreferenceChanges,
} from "../../controllers/services-controller";
import {
  loadEnvControllerContext,
  saveManagedEnvVar,
} from "../../controllers/env-controller";
import type { McpEnvControllerContext } from "../../controllers/env-controller";
import {
  executeEditorSelections,
  loadEditorControllerContext,
} from "../../controllers/editor-controller";
import { loadMcpInkInventory } from "./load-inventory";
import type { McpInkAction, McpInkInventory, McpInkSectionId, McpInkState } from "./types";
import {
  getEditorSelectionKey,
  getEnvEditInputActions,
  hasStagedApplyChanges,
  parseEditorSelections,
} from "./cli-ink-app-shell-state-helpers";

/**
 * Ink `useInput` key flags used by the shell keyboard router (arrows + shared env-edit flags).
 */
export type McpInkShellInputKey = InkInputKey;

/**
 * Shared closure bundle for `McpInkApp` stdin routing helpers.
 */
export interface McpInkShellInputContext {
  input: string;
  key: McpInkShellInputKey;
  state: McpInkState;
  dispatch: Dispatch<McpInkAction>;
  exit: () => void;
  projectRoot: string;
  isSavingServices: boolean;
  isSavingEnvValues: boolean;
  isSavingEditors: boolean;
  setIsSavingServices: Dispatch<SetStateAction<boolean>>;
  setIsSavingEnvValues: Dispatch<SetStateAction<boolean>>;
  setIsSavingEditors: Dispatch<SetStateAction<boolean>>;
}

/**
 * Handles q/escape quit paths, env-edit cancel, review close, and Ink app exit.
 *
 * @remarks
 * **I/O:** impure — dispatches reducer actions and may call `exit()`.
 */
export function mcpInkShellInputTryQuitEscape(ctx: McpInkShellInputContext): boolean {
  if (ctx.input === "q") {
    if (ctx.state.interactionMode === "env-edit") {
      ctx.dispatch({ type: "cancel-env-edit" });
      return true;
    }
    ctx.exit();
    return true;
  }

  if (ctx.key.escape) {
    if (ctx.state.interactionMode === "env-edit") {
      ctx.dispatch({ type: "cancel-env-edit" });
      return true;
    }

    if (ctx.state.screen !== "shell") {
      ctx.dispatch({ type: "close-review" });
      return true;
    }

    ctx.exit();
    return true;
  }

  return false;
}

/**
 * Routes stdin while the shell is in env-edit mode via `getEnvEditInputActions`.
 */
export function mcpInkShellInputTryEnvEditMode(ctx: McpInkShellInputContext): boolean {
  if (ctx.state.interactionMode !== "env-edit") {
    return false;
  }

  const actions = getEnvEditInputActions(ctx.input, ctx.key);
  if (actions.length > 0) {
    for (const action of actions) {
      ctx.dispatch(action);
    }
  }
  return true;
}

/**
 * Runs apply from the apply-review screen after `load-start`, mirroring the legacy `x` key IIFE.
 *
 * @remarks
 * **I/O:** impure — awaits apply controller calls and reloads inventory before dispatching results.
 */
function mcpInkShellInputRunApplyReviewExecute(options: {
  ctx: McpInkShellInputContext;
  currentInventory: McpInkInventory;
  selectedSection: McpInkSectionId;
  selectedIndexBySection: McpInkState["selectedIndexBySection"];
}): void {
  const { ctx, currentInventory, selectedSection, selectedIndexBySection } = options;
  const { projectRoot, dispatch, state } = ctx;

  void (async () => {
    const baseContextResult = await loadApplyBaseContext(projectRoot);

    if (!baseContextResult.success) {
      dispatch({
        type: "load-success",
        inventory: currentInventory,
        noticeMessage: baseContextResult.error,
        selectedSection,
        selectedIndexBySection,
        draftServicePreferences: state.draftServicePreferences,
        draftEnvValues: state.draftEnvValues,
        draftEditorSelections: state.draftEditorSelections,
      });
      return;
    }

    const applyPlan = buildMcpApplyPlan({
      enabledServers: baseContextResult.data.enabledServers,
      allTargets: baseContextResult.data.allTargets,
      requestedEditorId: null,
      includeOpencodeGlobal: false,
    });

    if (applyPlan.status !== "ready") {
      dispatch({
        type: "load-success",
        inventory: currentInventory,
        noticeMessage: applyPlan.noOpReason,
        selectedSection,
        selectedIndexBySection,
        draftServicePreferences: state.draftServicePreferences,
        draftEnvValues: state.draftEnvValues,
        draftEditorSelections: state.draftEditorSelections,
      });
      return;
    }

    const executionResult = await executeApplyPlan({
      projectRoot,
      stateFilePath: baseContextResult.data.stateFilePath,
      state: baseContextResult.data.state,
      env: baseContextResult.data.env,
      enabledServers: baseContextResult.data.enabledServers,
      targets: applyPlan.targets,
      force: false,
      quiet: true,
    });
    const inventory = await loadMcpInkInventory({ projectRoot });

    dispatch({
      type: "load-success",
      inventory,
      noticeMessage: null,
      selectedSection,
      selectedIndexBySection,
      draftServicePreferences: {},
      draftEnvValues: {},
      draftEditorSelections: {},
    });
    dispatch({
      type: "show-apply-result",
      result: executionResult,
    });
  })();
}

/**
 * Handles apply-review overlay keys (b close, x apply, r refresh) and always consumes when that screen is active.
 *
 * @remarks
 * **I/O:** impure — may start async apply execution and inventory reload.
 */
export function mcpInkShellInputTryApplyReviewScreen(ctx: McpInkShellInputContext): boolean {
  if (ctx.state.screen !== "apply-review") {
    return false;
  }

  if (ctx.input === "b") {
    ctx.dispatch({ type: "close-review" });
    return true;
  }

  if (ctx.input === "x" && ctx.state.inventory) {
    const currentInventory = ctx.state.inventory;
    const selectedSection = ctx.state.selectedSection;
    const selectedIndexBySection = ctx.state.selectedIndexBySection;
    const hasStagedChanges = hasStagedApplyChanges(ctx.state);

    if (hasStagedChanges) {
      ctx.dispatch({
        type: "load-success",
        inventory: currentInventory,
        noticeMessage: "Save staged service, env, and editor changes before running apply.",
        selectedSection,
        selectedIndexBySection,
        draftServicePreferences: ctx.state.draftServicePreferences,
        draftEnvValues: ctx.state.draftEnvValues,
        draftEditorSelections: ctx.state.draftEditorSelections,
      });
      return true;
    }

    ctx.dispatch({ type: "load-start" });
    mcpInkShellInputRunApplyReviewExecute({
      ctx,
      currentInventory,
      selectedSection,
      selectedIndexBySection,
    });
    return true;
  }

  if (ctx.input === "r") {
    ctx.dispatch({ type: "refresh-requested" });
  }
  return true;
}

/**
 * Handles apply-result overlay keys (b back, r refresh).
 */
export function mcpInkShellInputTryApplyResultScreen(ctx: McpInkShellInputContext): boolean {
  if (ctx.state.screen !== "apply-result") {
    return false;
  }

  if (ctx.input === "b") {
    ctx.dispatch({ type: "close-review" });
    return true;
  }

  if (ctx.input === "r") {
    ctx.dispatch({ type: "refresh-requested" });
  }
  return true;
}

/**
 * Handles editor-result overlay keys (b back, r refresh).
 */
export function mcpInkShellInputTryEditorResultScreen(ctx: McpInkShellInputContext): boolean {
  if (ctx.state.screen !== "editor-result") {
    return false;
  }

  if (ctx.input === "b") {
    ctx.dispatch({ type: "close-review" });
    return true;
  }

  if (ctx.input === "r") {
    ctx.dispatch({ type: "refresh-requested" });
  }
  return true;
}

/**
 * Handles `r` for diagnostics validation runs vs generic inventory refresh.
 *
 * @remarks
 * **I/O:** impure — may read schema files and validate MCP configs on disk.
 */
export function mcpInkShellInputTryRefreshKey(ctx: McpInkShellInputContext): boolean {
  if (ctx.input !== "r") {
    return false;
  }

  if (
    ctx.state.screen === "shell"
    && ctx.state.status === "ready"
    && ctx.state.selectedSection === "diagnostics"
  ) {
    const schemaProblem = assertMcpSchemaFilesPresent();
    if (schemaProblem) {
      ctx.dispatch({ type: "notice", message: schemaProblem });
      return true;
    }
    const summary = validateMcpConfigFiles(ctx.projectRoot);
    ctx.dispatch({ type: "diagnostics-complete", summary });
    return true;
  }

  ctx.dispatch({ type: "refresh-requested" });
  return true;
}

/**
 * Opens the apply preview overlay when the browse shell receives `a`.
 */
export function mcpInkShellInputTryApplyOpen(ctx: McpInkShellInputContext): boolean {
  if (ctx.input !== "a") {
    return false;
  }
  ctx.dispatch({ type: "open-apply-review" });
  return true;
}

/**
 * Handles j/k/h movement keys and arrow equivalents for list/section selection.
 */
export function mcpInkShellInputTryMovementKeys(ctx: McpInkShellInputContext): boolean {
  if (ctx.key.upArrow || ctx.input === "k") {
    ctx.dispatch({ type: "select-previous-item" });
    return true;
  }

  if (ctx.key.downArrow || ctx.input === "j") {
    ctx.dispatch({ type: "select-next-item" });
    return true;
  }

  if (ctx.key.leftArrow || ctx.input === "h") {
    ctx.dispatch({ type: "select-previous-section" });
    return true;
  }

  return false;
}

/**
 * Saves staged service preference drafts when `s` is pressed on the services section.
 *
 * @remarks
 * **I/O:** impure — awaits service controller persistence and reloads inventory.
 */
export function mcpInkShellInputTrySaveServicesSection(ctx: McpInkShellInputContext): boolean {
  const { state, dispatch, projectRoot, isSavingServices, setIsSavingServices } = ctx;
  if (
    state.selectedSection !== "services"
    || Object.keys(state.draftServicePreferences).length === 0
    || isSavingServices
  ) {
    return false;
  }

  const currentInventory = state.inventory;
  const currentServiceIndex = state.selectedIndexBySection.services;
  const stagedPreferences = { ...state.draftServicePreferences };

  setIsSavingServices(true);
  dispatch({ type: "load-start" });

  void (async () => {
    const controllerContext = await loadServiceControllerContext(projectRoot);

    if (!controllerContext.success) {
      if (currentInventory) {
        dispatch({
          type: "load-success",
          inventory: currentInventory,
          noticeMessage: controllerContext.error,
          selectedSection: "services",
          selectedIndexBySection: { services: currentServiceIndex },
          draftServicePreferences: stagedPreferences,
        });
      } else {
        dispatch({
          type: "load-error",
          errorMessage: controllerContext.error,
        });
      }
      setIsSavingServices(false);
      return;
    }

    const saveResult = await saveServicePreferenceChanges(
      controllerContext.data.stateFilePath,
      controllerContext.data.state,
      stagedPreferences
    );

    if (!saveResult.success) {
      if (currentInventory) {
        dispatch({
          type: "load-success",
          inventory: currentInventory,
          noticeMessage: saveResult.error,
          selectedSection: "services",
          selectedIndexBySection: { services: currentServiceIndex },
          draftServicePreferences: stagedPreferences,
        });
      } else {
        dispatch({
          type: "load-error",
          errorMessage: saveResult.error,
        });
      }
      setIsSavingServices(false);
      return;
    }

    const inventory = await loadMcpInkInventory({ projectRoot });
    dispatch({
      type: "load-success",
      inventory,
      noticeMessage: `Saved ${Object.keys(stagedPreferences).length} staged service change(s).`,
      selectedSection: "services",
      selectedIndexBySection: { services: currentServiceIndex },
      draftServicePreferences: {},
    });
    setIsSavingServices(false);
  })();
  return true;
}

/**
 * Saves staged env var drafts when `s` is pressed on the env section.
 *
 * @remarks
 * **I/O:** impure — awaits env controller writes and reloads inventory.
 */
export function mcpInkShellInputTrySaveEnvVarsSection(ctx: McpInkShellInputContext): boolean {
  const { state, dispatch, projectRoot, isSavingEnvValues, setIsSavingEnvValues } = ctx;
  if (
    state.selectedSection !== "envVars"
    || Object.keys(state.draftEnvValues).length === 0
    || isSavingEnvValues
  ) {
    return false;
  }

  const currentInventory = state.inventory;
  const currentEnvIndex = state.selectedIndexBySection.envVars;
  const stagedEnvValues = { ...state.draftEnvValues };

  setIsSavingEnvValues(true);
  dispatch({ type: "load-start" });

  void (async () => {
    const controllerContext = await loadEnvControllerContext(projectRoot);

    if (!controllerContext.success) {
      if (currentInventory) {
        dispatch({
          type: "load-success",
          inventory: currentInventory,
          noticeMessage: controllerContext.error,
          selectedSection: "envVars",
          selectedIndexBySection: { envVars: currentEnvIndex },
          draftEnvValues: stagedEnvValues,
        });
      } else {
        dispatch({
          type: "load-error",
          errorMessage: controllerContext.error,
        });
      }
      setIsSavingEnvValues(false);
      return;
    }

    let currentEnvContext: McpEnvControllerContext = controllerContext.data;

    for (const [envVarName, value] of Object.entries(stagedEnvValues)) {
      const saveResult = await saveManagedEnvVar(
        currentEnvContext.envFilePath,
        currentEnvContext.stateFilePath,
        currentEnvContext.state,
        currentEnvContext.env,
        envVarName,
        value
      );

      if (!saveResult.success) {
        if (currentInventory) {
          dispatch({
            type: "load-success",
            inventory: currentInventory,
            noticeMessage: saveResult.error,
            selectedSection: "envVars",
            selectedIndexBySection: { envVars: currentEnvIndex },
            draftEnvValues: stagedEnvValues,
          });
        } else {
          dispatch({
            type: "load-error",
            errorMessage: saveResult.error,
          });
        }
        setIsSavingEnvValues(false);
        return;
      }

      currentEnvContext = {
        ...currentEnvContext,
        state: saveResult.data.state,
        env: saveResult.data.env,
      };
    }

    const inventory = await loadMcpInkInventory({ projectRoot });
    dispatch({
      type: "load-success",
      inventory,
      noticeMessage: `Saved ${Object.keys(stagedEnvValues).length} staged env change(s).`,
      selectedSection: "envVars",
      selectedIndexBySection: { envVars: currentEnvIndex },
      draftEnvValues: {},
    });
    setIsSavingEnvValues(false);
  })();
  return true;
}

/**
 * Runs queued editor writes when `s` is pressed on the editors section.
 *
 * @remarks
 * **I/O:** impure — awaits editor controller execution and reloads inventory.
 */
export function mcpInkShellInputTrySaveEditorsSection(ctx: McpInkShellInputContext): boolean {
  const { state, dispatch, projectRoot, isSavingEditors, setIsSavingEditors } = ctx;
  if (
    state.selectedSection !== "editors"
    || Object.keys(state.draftEditorSelections).length === 0
    || isSavingEditors
  ) {
    return false;
  }

  const currentInventory = state.inventory;
  const currentEditorIndex = state.selectedIndexBySection.editors;
  const stagedEditorSelections = { ...state.draftEditorSelections };

  setIsSavingEditors(true);
  dispatch({ type: "load-start" });

  void (async () => {
    const controllerContext = await loadEditorControllerContext(projectRoot);

    if (!controllerContext.success) {
      if (currentInventory) {
        dispatch({
          type: "load-success",
          inventory: currentInventory,
          noticeMessage: controllerContext.error,
          selectedSection: "editors",
          selectedIndexBySection: { editors: currentEditorIndex },
          draftEditorSelections: stagedEditorSelections,
        });
      } else {
        dispatch({
          type: "load-error",
          errorMessage: controllerContext.error,
        });
      }
      setIsSavingEditors(false);
      return;
    }

    if (controllerContext.data.enabledServers.length === 0) {
      dispatch({
        type: "load-success",
        inventory: currentInventory!,
        noticeMessage: "No servers enabled. Configure services before writing editor configs.",
        selectedSection: "editors",
        selectedIndexBySection: { editors: currentEditorIndex },
        draftEditorSelections: stagedEditorSelections,
      });
      setIsSavingEditors(false);
      return;
    }

    const executionResult = await executeEditorSelections({
      projectRoot,
      stateFilePath: controllerContext.data.stateFilePath,
      state: controllerContext.data.state,
      env: controllerContext.data.env,
      enabledServers: controllerContext.data.enabledServers,
      selections: parseEditorSelections(stagedEditorSelections),
    });

    const remainingDraftEditorSelections = Object.fromEntries(
      executionResult.items
        .filter((item) => item.outcome !== "success")
        .map((item) => [getEditorSelectionKey(item.editorId, item.scope), true])
    ) as Record<string, true>;

    const inventory = await loadMcpInkInventory({ projectRoot });
    dispatch({
      type: "load-success",
      inventory,
      noticeMessage: null,
      selectedSection: "editors",
      selectedIndexBySection: { editors: currentEditorIndex },
      draftEditorSelections: remainingDraftEditorSelections,
    });
    dispatch({
      type: "show-editor-result",
      result: executionResult,
    });
    setIsSavingEditors(false);
  })();
  return true;
}

/**
 * Dispatches section-specific save handlers for the `s` key (always consumes `s`).
 */
export function mcpInkShellInputTrySaveKey(ctx: McpInkShellInputContext): boolean {
  if (ctx.input !== "s") {
    return false;
  }
  if (mcpInkShellInputTrySaveServicesSection(ctx)) {
    return true;
  }
  if (mcpInkShellInputTrySaveEnvVarsSection(ctx)) {
    return true;
  }
  if (mcpInkShellInputTrySaveEditorsSection(ctx)) {
    return true;
  }
  return true;
}

/**
 * Starts inline env editing for the selected env row when `e` is pressed.
 *
 * @remarks
 * **I/O:** impure — awaits env controller context before dispatching `start-env-edit`.
 */
export function mcpInkShellInputTryEnvEditStart(ctx: McpInkShellInputContext): boolean {
  if (ctx.input !== "e" || ctx.state.selectedSection !== "envVars") {
    return false;
  }

  const inventory = ctx.state.inventory;
  if (!inventory) {
    return true;
  }

  const selectedEnvVar = inventory.envVars[ctx.state.selectedIndexBySection.envVars];
  if (!selectedEnvVar) {
    return true;
  }

  void (async () => {
    const controllerContext = await loadEnvControllerContext(ctx.projectRoot);
    if (!controllerContext.success) {
      ctx.dispatch({
        type: "load-success",
        inventory,
        noticeMessage: controllerContext.error,
        selectedSection: "envVars",
        selectedIndexBySection: {
          envVars: ctx.state.selectedIndexBySection.envVars,
        },
      });
      return;
    }

    const initialValue =
      ctx.state.draftEnvValues[selectedEnvVar.name]
      ?? controllerContext.data.env[selectedEnvVar.name]
      ?? "";
    ctx.dispatch({
      type: "start-env-edit",
      envVarName: selectedEnvVar.name,
      initialValue,
    });
  })();
  return true;
}

/**
 * Cycles service preference when space/enter is pressed on the services section.
 */
export function mcpInkShellInputTrySpaceOrReturn(ctx: McpInkShellInputContext): boolean {
  if (ctx.input !== " " && !ctx.key.return) {
    return false;
  }
  if (ctx.state.selectedSection === "services") {
    ctx.dispatch({ type: "cycle-service-preference" });
  }
  return true;
}

/**
 * Clears staged drafts for services/env/editors when `c` is pressed on a matching section.
 */
export function mcpInkShellInputTryClearKey(ctx: McpInkShellInputContext): boolean {
  if (ctx.input !== "c") {
    return false;
  }

  if (ctx.state.selectedSection === "services") {
    ctx.dispatch({ type: "clear-service-preference" });
    return true;
  }

  if (ctx.state.selectedSection === "envVars") {
    ctx.dispatch({ type: "clear-env-draft" });
    return true;
  }

  if (ctx.state.selectedSection === "editors") {
    ctx.dispatch({ type: "clear-editor-targets" });
  }
  return true;
}

/**
 * Toggles editor write targets (p/g/i) while the editors section is focused.
 */
export function mcpInkShellInputTryEditorSectionKeys(ctx: McpInkShellInputContext): boolean {
  if (ctx.state.selectedSection !== "editors") {
    return false;
  }

  if (ctx.input === "p") {
    ctx.dispatch({ type: "toggle-editor-target", scope: "project" });
    return true;
  }

  if (ctx.input === "g") {
    ctx.dispatch({ type: "toggle-editor-target", scope: "global" });
    return true;
  }

  if (ctx.input === "i") {
    ctx.dispatch({ type: "toggle-editor-target", scope: "instructions" });
    return true;
  }

  return false;
}

/**
 * Advances to the next shell section on right-arrow, `l`, or tab.
 */
export function mcpInkShellInputTryNextSection(ctx: McpInkShellInputContext): void {
  if (ctx.key.rightArrow || ctx.input === "l" || ctx.key.tab) {
    ctx.dispatch({ type: "select-next-section" });
  }
}
