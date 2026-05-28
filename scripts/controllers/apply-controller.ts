/**
 * @fileoverview Applies MCP editor and server target changes with backup, skip, and state-write handling.
 *
 * Flow: parsed apply args and selected editor target -> backup and target plan -> execution result and state update.
 *
 * @testing Jest unit: npm test -- scripts/controllers/apply-controller.unit.test.ts
 * @see scripts/apply-config.ts - CLI entrypoint that builds and runs the apply controller flow.
 * @see scripts/ui/cli-ink/review.ts - Interactive review surface that reuses the apply plan output.
 * @documentation reviewed=2026-04-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */
import { join } from "path";
import { ENV_FILE_NAME, readEnvFile } from "../lib/env";
import { applyStateSettingsToServerTemplates } from "../lib/server-settings";
import {
  markModified,
  readState,
  recordEditorBackup,
  recordEditorSync,
  STATE_FILE_NAME,
  writeState,
} from "../lib/state";
import type {
  DryRunResult,
  EnvVars,
  McpServerTemplate,
  McpState,
  Result,
} from "../lib/types";
import { backupAllConfigs } from "../backup-configs";
import { getEditorById } from "../editors";
import { getAllServerIds, getServersByIds, getServersForEditor } from "../servers";

/**
 * Parsed CLI flags and editor targeting for the MCP apply-config flow.
 *
 * @remarks
 * `dryRun` suppresses writes; `force` continues after backup failures; `editorId` scopes targets when set.
 */
export interface ParsedMcpApplyArgs {
  dryRun: boolean;
  force: boolean;
  quiet: boolean;
  includeOpencodeGlobal: boolean;
  editorId: string | null;
  showHelp: boolean;
}

/**
 * Resolved filesystem destination for writing one editor MCP configuration.
 */
export interface McpApplyTarget {
  editorId: string;
  editorName: string;
  scope: "project" | "global";
  configPath: string;
}

/**
 * Target excluded by apply policy with a stable, user-facing reason string.
 */
export interface McpApplySkippedTarget {
  target: McpApplyTarget;
  reason: string;
}

/**
 * Shared inputs loaded before planning or executing an apply pass.
 *
 * @remarks
 * Mirrors `.mcp-sync/env` and `.mcp-sync/state.json` plus derived enabled server templates and computed targets.
 */
export interface McpApplyBaseContext {
  projectRoot: string;
  envFilePath: string;
  stateFilePath: string;
  env: EnvVars;
  state: McpState;
  enabledServers: McpServerTemplate[];
  allTargets: McpApplyTarget[];
}

/**
 * High-level readiness outcome when building an apply plan.
 */
export type McpApplyPlanStatus =
  | "ready"
  | "no-enabled-servers"
  | "no-enabled-editors"
  | "editor-not-enabled"
  | "no-targets-after-policy";

/**
 * Apply plan with filtered targets, policy skips, and optional no-op messaging.
 */
export interface McpApplyPlan {
  status: McpApplyPlanStatus;
  requestedEditorId: string | null;
  targets: McpApplyTarget[];
  policySkippedTargets: McpApplySkippedTarget[];
  noOpReason: string | null;
}

/**
 * Element type derived from backupAllConfigs' resolved array shape.
 *
 * @remarks
 * Reuses scripts/backup-configs row typing for `McpApplyExecutionResult.backupResults` without duplicating the backup helper's export surface.
 */
type McpApplyBackupResult = Awaited<ReturnType<typeof backupAllConfigs>>[number];

/**
 * Per-target apply outcome row for logs, Ink review, and exit summaries.
 */
export interface McpApplyExecutionItem {
  target: McpApplyTarget;
  outcome: "success" | "skip" | "error";
  operation: DryRunResult["operation"] | null;
  message: string;
  warnings: string[];
}

/**
 * Aggregate apply result including backup rows, per-target tallies, and optional state persistence errors.
 *
 * @remarks
 * `nextState` may reflect in-memory mutations even when `stateWriteError` is set; treat persistence as best-effort until cleared.
 */
export interface McpApplyExecutionResult {
  status: "completed" | "blocked-by-backup-error";
  nextState: McpState;
  backupResults: McpApplyBackupResult[];
  items: McpApplyExecutionItem[];
  successCount: number;
  skipCount: number;
  errorCount: number;
  stateWriteError: string | null;
}

/**
 * Parse raw CLI arguments into structured apply options.
 *
 * @param args - Raw string array from process.argv
 * @returns Parsed apply arguments including dry-run, force, editor targeting, and help flags
 *
 * @remarks
 * Recognizes `--dry-run`/`-n`, `--force`/`-f`, `--quiet`/`-q`, `--include-opencode-global`,
 * `--editor`/`-e` with value, and positional editorId. Flags after `--` are ignored.
 */
export function parseMcpApplyArgs(args: string[]): ParsedMcpApplyArgs {
  const result: ParsedMcpApplyArgs = {
    dryRun: false,
    force: false,
    quiet: false,
    includeOpencodeGlobal: false,
    editorId: null,
    showHelp: false,
  };

  for (const arg of args) {
    if (arg === "--dry-run" || arg === "-n") {
      result.dryRun = true;
    } else if (arg === "--force" || arg === "-f") {
      result.force = true;
    } else if (arg === "--quiet" || arg === "-q") {
      result.quiet = true;
    } else if (arg === "--include-opencode-global") {
      result.includeOpencodeGlobal = true;
    } else if (arg === "--help" || arg === "-h") {
      result.showHelp = true;
    } else if (arg === "--editor" || arg === "-e") {
      continue;
    } else if (!arg.startsWith("-")) {
      result.editorId = arg;
    }
  }

  const editorFlagIndex = args.indexOf("--editor");
  if (editorFlagIndex !== -1 && args[editorFlagIndex + 1]) {
    result.editorId = args[editorFlagIndex + 1];
  }

  const shortEditorFlagIndex = args.indexOf("-e");
  if (shortEditorFlagIndex !== -1 && args[shortEditorFlagIndex + 1]) {
    result.editorId = args[shortEditorFlagIndex + 1];
  }

  return result;
}

/**
 * Build the list of apply targets from current MCP state.
 *
 * @param state - Current MCP state containing editor configuration
 * @returns Array of apply targets for editors that have project or global configs enabled
 *
 * @remarks
 * Project-scoped configs take precedence over global. If a project config is enabled,
 * the global config for that editor is not included. Each target includes the editorId,
 * display name, scope, and resolved config path.
 */
export function buildApplyTargets(state: McpState): McpApplyTarget[] {
  const targets: McpApplyTarget[] = [];

  for (const [editorId, editorState] of Object.entries(state.editors)) {
    const hasProject = editorState.project.enabled && editorState.project.configPath;

    if (hasProject) {
      const editor = getEditorById(editorId);
      targets.push({
        editorId,
        editorName: editor?.name ?? editorId,
        scope: "project",
        configPath: editorState.project.configPath,
      });
    }

    // Skip global when project is enabled — project-scoped configs take precedence
    if (!hasProject && editorState.global.enabled && editorState.global.configPath) {
      const editor = getEditorById(editorId);
      targets.push({
        editorId,
        editorName: editor?.name ?? editorId,
        scope: "global",
        configPath: editorState.global.configPath,
      });
    }
  }

  return targets;
}

/**
 * Load the shared base context needed for apply operations.
 *
 * @param projectRoot - Absolute path to the project root
 * @returns Result containing the base context or an error string
 *
 * @remarks
 * Reads both the state file and env file from the project root. If either read fails,
 * returns a Result with success=false and an error message. On success, the data field
 * contains projectRoot, file paths, parsed env, state, enabled server templates, and
 * all computed apply targets.
 */
export async function loadApplyBaseContext(
  projectRoot: string
): Promise<Result<McpApplyBaseContext, string>> {
  const envFilePath = join(projectRoot, ENV_FILE_NAME);
  const stateFilePath = join(projectRoot, STATE_FILE_NAME);

  const stateResult = await readState(stateFilePath);
  if (!stateResult.success) {
    return {
      success: false,
      error: `Failed to read state: ${stateResult.error}`,
    };
  }

  const envResult = await readEnvFile(envFilePath);
  if (!envResult.success) {
    return {
      success: false,
      error: `Failed to read env file: ${envResult.error}`,
    };
  }

  return {
    success: true,
    data: {
      projectRoot,
      envFilePath,
      stateFilePath,
      env: envResult.data,
      state: stateResult.data,
      enabledServers: getServersByIds(stateResult.data.enabledServers),
      allTargets: buildApplyTargets(stateResult.data),
    },
  };
}

/**
 * Build the apply plan from enabled servers and targets, applying policy filters.
 *
 * @param options - Configuration that controls server selection, editor scoping, and policy filtering for the apply plan
 * @param options.enabledServers - Currently enabled server templates
 * @param options.allTargets - All computed apply targets
 * @param options.requestedEditorId - Optional editor ID to scope the plan to
 * @param options.includeOpencodeGlobal - Whether to include opencode-cli global config
 * @returns Complete apply plan with status, targets, and policy-skipped entries
 *
 * @remarks
 * Returns early with a noOpReason when:
 * - No servers are enabled
 * - No editors have configs
 * - Requested editor is not enabled
 * - All targets were filtered by policy (e.g., opencode-cli global by default)
 *
 * The policy skip reason for opencode-cli global is:
 * "OpenCode global apply is skipped by default. Use --include-opencode-global to write ~/.config/opencode/opencode.json."
 */
export function buildMcpApplyPlan(options: {
  enabledServers: McpServerTemplate[];
  allTargets: McpApplyTarget[];
  requestedEditorId: string | null;
  includeOpencodeGlobal: boolean;
}): McpApplyPlan {
  const { enabledServers, allTargets, requestedEditorId, includeOpencodeGlobal } = options;

  if (enabledServers.length === 0) {
    return {
      status: "no-enabled-servers",
      requestedEditorId,
      targets: [],
      policySkippedTargets: [],
      noOpReason: "No servers enabled. Run 'mcp-sync manage-servers' to enable servers.",
    };
  }

  if (allTargets.length === 0) {
    return {
      status: "no-enabled-editors",
      requestedEditorId,
      targets: [],
      policySkippedTargets: [],
      noOpReason: "No editors enabled. Run 'mcp-sync manage-editors' to enable editors.",
    };
  }

  const requestedTargets =
    requestedEditorId === null
      ? allTargets
      : allTargets.filter((target) => target.editorId === requestedEditorId);

  if (requestedEditorId !== null && requestedTargets.length === 0) {
    return {
      status: "editor-not-enabled",
      requestedEditorId,
      targets: [],
      policySkippedTargets: [],
      noOpReason: `Editor '${requestedEditorId}' is not enabled. Run 'mcp-sync manage-editors' to enable it.`,
    };
  }

  const policySkippedTargets = requestedTargets
    .filter((target) => {
      return (
        target.editorId === "opencode-cli" &&
        target.scope === "global" &&
        !includeOpencodeGlobal
      );
    })
    .map((target) => ({
      target,
      reason:
        "OpenCode global apply is skipped by default. Use --include-opencode-global to write ~/.config/opencode/opencode.json.",
    }));

  const targets = requestedTargets.filter((target) => {
    return !policySkippedTargets.some((skippedTarget) => {
      return (
        skippedTarget.target.editorId === target.editorId &&
        skippedTarget.target.scope === target.scope
      );
    });
  });

  if (targets.length === 0) {
    return {
      status: "no-targets-after-policy",
      requestedEditorId,
      targets,
      policySkippedTargets,
      noOpReason: "No editor configurations remain after apply policy filtering.",
    };
  }

  return {
    status: "ready",
    requestedEditorId,
    targets,
    policySkippedTargets,
    noOpReason: null,
  };
}

/**
 * Build the editor state snapshot to pass to the backup step.
 *
 * @param state - Current MCP state
 * @param targets - Apply targets that will be backed up
 * @returns Partial editors state with only the targeted scopes marked as enabled
 *
 * @remarks
 * Only the scopes (project/global) present in the targets list are marked as enabled
 * in the returned editor state. Other scopes are set to enabled=false. This snapshot
 * is used to determine which existing configs should be backed up before being overwritten.
 */
export function buildApplyBackupEditorState(
  state: McpState,
  targets: McpApplyTarget[]
): McpState["editors"] {
  const editorsToBackup: McpState["editors"] = {};

  for (const { editorId, scope } of targets) {
    const editorState = state.editors[editorId];
    if (!editorState) {
      continue;
    }

    if (!editorsToBackup[editorId]) {
      editorsToBackup[editorId] = {
        project: { ...editorState.project, enabled: false },
        global: { ...editorState.global, enabled: false },
      };
    }

    editorsToBackup[editorId][scope].enabled = true;
  }

  return editorsToBackup;
}

/**
 * Get the servers to apply for a specific editor target.
 *
 * @param state - Current MCP state (used for service preferences)
 * @param enabledServers - All enabled server templates
 * @param editorId - Target editor identifier
 * @returns Filtered server list appropriate for the editor's transport capability
 *
 * @remarks
 * If the editor does not support HTTP transport, HTTP servers are filtered out. Bridge servers
 * that editors launch as local processes should be registered as stdio templates.
 * Service preferences from state.servicePreferences are respected to select the
 * preferred transport variant per service.
 */
export function getServersForApplyTarget(
  state: McpState,
  enabledServers: McpServerTemplate[],
  editorId: string
): McpServerTemplate[] {
  const editor = getEditorById(editorId);
  const selectedServers = (() => {
    if (!editor) {
      return enabledServers;
    }

    const editorSupportsHttp = editor.supportsHttp !== false;
    if (!state.servicePreferences) {
      return enabledServers;
    }

    return getServersForEditor(state.servicePreferences, editorSupportsHttp);
  })();

  return applyStateSettingsToServerTemplates(selectedServers, state.serverSettings);
}

/**
 * Execute the apply plan: backup configs, write new configs, and persist state.
 *
 * @param options - Execution options
 * @param options.projectRoot - Project root path
 * @param options.stateFilePath - Path to the state file
 * @param options.state - Current MCP state
 * @param options.env - Environment variables
 * @param options.enabledServers - Enabled server templates
 * @param options.targets - Apply targets to process
 * @param options.force - Whether to proceed despite backup errors
 * @param options.quiet - Whether to suppress console output
 * @returns Execution result with per-target outcomes and updated state
 *
 * @remarks
 * Execution order:
 * 1. Build backup editor state and run backups (blocked if any fail and force=false)
 * 2. For each target: write the config, record sync, collect per-item results
 * 3. Mark state as modified and write the updated state file
 *
 * Each target result includes outcome (success/skip/error), the operation type,
 * any warnings, and error messages. The aggregate counts and any state-write error
 * are returned in McpApplyExecutionResult.
 */
export async function executeApplyPlan(options: {
  projectRoot: string;
  stateFilePath: string;
  state: McpState;
  env: EnvVars;
  enabledServers: McpServerTemplate[];
  targets: McpApplyTarget[];
  force: boolean;
  quiet?: boolean;
}): Promise<McpApplyExecutionResult> {
  const { projectRoot, stateFilePath, env, enabledServers, targets, force, quiet } = options;
  let nextState = options.state;
  const editorsToBackup = buildApplyBackupEditorState(nextState, targets);
  const backupResults = await backupAllConfigs(projectRoot, editorsToBackup, { quiet });
  const backupErrors = backupResults.filter((result) => !result.success);
  const backupsCreated = backupResults.filter((result) => {
    return result.success && result.projectBackupPath;
  });

  if (backupErrors.length > 0 && !force) {
    return {
      status: "blocked-by-backup-error",
      nextState,
      backupResults,
      items: [],
      successCount: 0,
      skipCount: 0,
      errorCount: backupErrors.length,
      stateWriteError: null,
    };
  }

  for (const result of backupsCreated) {
    nextState = recordEditorBackup(nextState, result.editorId, result.scope);
  }

  const items: McpApplyExecutionItem[] = [];
  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;
  const managedServerIds = getAllServerIds();

  for (const target of targets) {
    const editor = getEditorById(target.editorId);
    if (!editor) {
      items.push({
        target,
        outcome: "error",
        operation: null,
        message: "Editor not found",
        warnings: [],
      });
      errorCount++;
      continue;
    }

    const serversForEditor = getServersForApplyTarget(nextState, enabledServers, target.editorId);

    try {
      const result = await editor.writeConfig(target.scope, serversForEditor, env, {
        removeServerIds: managedServerIds,
      });

      if (result.success) {
        if (result.operation === "skip") {
          items.push({
            target,
            outcome: "skip",
            operation: result.operation,
            message: "no changes",
            warnings: result.warnings,
          });
          skipCount++;
        } else {
          items.push({
            target,
            outcome: "success",
            operation: result.operation,
            message: result.operation,
            warnings: result.warnings,
          });
          nextState = recordEditorSync(nextState, target.editorId, target.scope);
          successCount++;
        }
      } else {
        items.push({
          target,
          outcome: "error",
          operation: result.operation,
          message: result.errors.join(", "),
          warnings: result.warnings,
        });
        errorCount++;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      items.push({
        target,
        outcome: "error",
        operation: null,
        message,
        warnings: [],
      });
      errorCount++;
    }
  }

  nextState = markModified(nextState, "apply-config");
  const stateWriteResult = await writeState(stateFilePath, nextState);
  const stateWriteError = stateWriteResult.success
    ? null
    : `Failed to write state: ${stateWriteResult.error}`;

  if (stateWriteError) {
    errorCount++;
  }

  return {
    status: "completed",
    nextState,
    backupResults,
    items,
    successCount,
    skipCount,
    errorCount,
    stateWriteError,
  };
}
