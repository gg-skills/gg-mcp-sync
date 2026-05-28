/**
 * @fileoverview Manages MCP editor config writes, instructions files, and enabled-server synchronization.
 *
 * Flow: loaded editor controller context -> preview and selection state -> config or instructions writes.
 *
 * @testing Jest unit: npm test -- scripts/controllers/editor-controller.unit.test.ts
 * @see scripts/manage-editors.ts - CLI entrypoint that invokes this controller.
 * @see scripts/ui/cli-ink/review.ts - Ink review surface that renders editor selections and outcomes.
 * @documentation reviewed=2026-04-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */
import { writeFile } from "fs/promises";
import { join } from "path";
import { getEditorById } from "../editors";
import { ENV_FILE_NAME, readEnvFile } from "../lib/env";
import { ensureDir, expandTilde, toDisplayPath } from "../lib/file-utils";
import { applyStateSettingsToServerTemplates } from "../lib/server-settings";
import {
  enableEditorScope,
  formatTimestamp,
  markModified,
  readState,
  recordEditorSync,
  STATE_FILE_NAME,
  writeState,
} from "../lib/state";
import type {
  EditorAdapter,
  EnvVars,
  McpServerTemplate,
  McpState,
  Result,
} from "../lib/types";
import { getServersByIds } from "../servers";
import { MCP_SYNC_INSTRUCTIONS_DIR_NAME } from "../lib/storage-paths";

const INSTRUCTIONS_DIR = MCP_SYNC_INSTRUCTIONS_DIR_NAME;

/**
 * Scopes under which an editor configuration can be managed.
 *
 * - "project" — project-level .cursor/mcp.json, .windsurf/mcp.json, etc.
 * - "global" — user-level ~/.cursor/mcp.json, etc.
 * - "instructions" — written to .mcp-sync/instructions/<editorId>.md for UI-only tools
 */
export type McpManagedEditorScope = "project" | "global" | "instructions";

/**
 * Loaded `.mcp-sync/env`, `.mcp-sync/state.json`, and enabled server templates for editor flows.
 */
export interface McpEditorControllerContext {
  projectRoot: string;
  envFilePath: string;
  stateFilePath: string;
  env: EnvVars;
  state: McpState;
  enabledServers: McpServerTemplate[];
}

/**
 * One user-selected editor action (project config, global config, or generated instructions).
 */
export interface McpEditorSelection {
  editorId: string;
  scope: McpManagedEditorScope;
}

/**
 * Human-readable preview row for Ink review before executing editor selections.
 */
export interface McpEditorPreviewItem {
  editorId: string;
  editorName: string;
  scope: McpManagedEditorScope;
  description: string;
}

/**
 * Per-selection execution outcome surfaced in CLI and Ink summaries.
 */
export interface McpEditorExecutionItem {
  editorId: string;
  editorName: string;
  scope: McpManagedEditorScope;
  outcome: "success" | "warning" | "error";
  message: string;
}

/**
 * Roll-up counters and updated state after executing editor selections.
 *
 * @remarks
 * When `stateWriteError` is set, per-item successes may not be fully persisted; callers should surface the write failure distinctly from item errors.
 */
export interface McpEditorExecutionResult {
  nextState: McpState;
  items: McpEditorExecutionItem[];
  successCount: number;
  warningCount: number;
  errorCount: number;
  stateWriteError: string | null;
}

/**
 * Resolves an absolute MCP config filesystem path for a supported editor scope.
 *
 * @remarks
 * PURITY: path resolution only — no filesystem I/O.
 * Returns null when the adapter has no configured path for the requested scope.
 *
 * @agent.internal
 *
 * @param editor - Adapter carrying project/global path templates from the registry
 * @param scope - Whether to join under the project root or expand a user-global path
 * @param projectRoot - Absolute project directory used only when scope is project
 * @returns Target config path suitable for previews and persisted sync metadata
 */
function getEditorConfigPath(
  editor: EditorAdapter,
  scope: "project" | "global",
  projectRoot: string
): string | null {
  const config = scope === "project" ? editor.projectConfig : editor.globalConfig;
  if (!config) {
    return null;
  }

  if (scope === "project") {
    return join(projectRoot, config.path);
  }

  return expandTilde(config.path);
}

/**
 * Builds the per-editor markdown path under `.mcp-sync/instructions/`.
 *
 * @remarks
 * PURITY: path join only — callers perform reads and writes.
 *
 * @agent.internal
 *
 * @param projectRoot - Absolute workspace root that hosts `.mcp-sync/instructions`
 * @param editorId - Stable editor key used as the markdown filename stem
 * @returns Joined filesystem path presented in previews and written by `writeInstructions`
 */
function getInstructionsPath(projectRoot: string, editorId: string): string {
  return join(projectRoot, INSTRUCTIONS_DIR, `${editorId}.md`);
}

/**
 * Writes generated MCP instructions for UI-only tooling into the workspace tree.
 *
 * @remarks
 * I/O: ensures `.mcp-sync/instructions/` exists and overwrites `{editorId}.md` using UTF-8 encoding.
 *
 * @agent.internal
 *
 * @param projectRoot - Workspace root containing the instructions directory
 * @param editorId - Filename stem for the persisted markdown artifact
 * @param content - Full instructions payload returned from the adapter generator
 * @returns Resolves once the file write completes or rejects when the filesystem rejects the operation
 */
async function writeInstructions(
  projectRoot: string,
  editorId: string,
  content: string
): Promise<void> {
  const dir = join(projectRoot, INSTRUCTIONS_DIR);
  await ensureDir(dir);
  await writeFile(getInstructionsPath(projectRoot, editorId), content, "utf-8");
}

/**
 * Load the shared context needed for editor management operations.
 *
 * @param projectRoot - Absolute path to the project root
 * @returns Result containing the editor controller context or an error string
 *
 * @remarks
 * Reads the state file and env file from the project root. Returns success=false
 * if either read fails. On success, data contains projectRoot, file paths,
 * parsed env, state, and enabled server templates derived from state.enabledServers.
 */
export async function loadEditorControllerContext(
  projectRoot: string
): Promise<Result<McpEditorControllerContext, string>> {
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
      enabledServers: applyStateSettingsToServerTemplates(
        getServersByIds(stateResult.data.enabledServers),
        stateResult.data.serverSettings
      ),
    },
  };
}

/**
 * Build a human-readable preview of editor selections for display in the review screen.
 *
 * @param projectRoot - Project root path (used to resolve relative instruction paths)
 * @param selections - Array of editor-scope selection pairs
 * @returns Array of preview items with editor identity, scope, and a display description
 *
 * @remarks
 * For "instructions" scope, the description shows the target .md path under .mcp-sync/instructions/.
 * For project/global scopes, the description shows the resolved config path.
 * Skips any selections whose editorId is not found in the registry.
 */
export function buildEditorSelectionPreview(
  projectRoot: string,
  selections: McpEditorSelection[]
): McpEditorPreviewItem[] {
  const items: McpEditorPreviewItem[] = [];

  for (const selection of selections) {
    const editor = getEditorById(selection.editorId);
    if (!editor) {
      continue;
    }

    if (selection.scope === "instructions") {
      items.push({
        editorId: editor.id,
        editorName: editor.name,
        scope: selection.scope,
        description: `Generate instructions -> ${toDisplayPath(
          getInstructionsPath(projectRoot, editor.id)
        )}`,
      });
      continue;
    }

    const path = getEditorConfigPath(editor, selection.scope, projectRoot);
    items.push({
      editorId: editor.id,
      editorName: editor.name,
      scope: selection.scope,
      description: path ? toDisplayPath(path) : "N/A",
    });
  }

  return items;
}

/**
 * Execute editor selection operations: write configs or generate instructions.
 *
 * @param options - Execution options
 * @param options.projectRoot - Project root path
 * @param options.stateFilePath - Path to the state file
 * @param options.state - Current MCP state
 * @param options.env - Environment variables
 * @param options.enabledServers - Enabled server templates
 * @param options.selections - Editor-scope pairs to process
 * @returns Execution result with per-editor outcomes and updated state
 *
 * @remarks
 * For "instructions" scope, calls editor.generateInstructions() and writes the
 * result to .mcp-sync/instructions/<editorId>.md. For project/global scopes, calls
 * the editor's writeConfig(). The process is run from projectRoot to ensure
 * relative path resolution works correctly for project-scoped configs.
 *
 * Each item records outcome (success/warning/error), the editor identity, scope,
 * and a message. Aggregate counts and any state-write error are included.
 */
export async function executeEditorSelections(options: {
  projectRoot: string;
  stateFilePath: string;
  state: McpState;
  env: EnvVars;
  enabledServers: McpServerTemplate[];
  selections: McpEditorSelection[];
}): Promise<McpEditorExecutionResult> {
  const { projectRoot, stateFilePath, env, enabledServers, selections } = options;
  let nextState = options.state;
  const items: McpEditorExecutionItem[] = [];
  let successCount = 0;
  let warningCount = 0;
  let errorCount = 0;

  for (const selection of selections) {
    const editor = getEditorById(selection.editorId);
    if (!editor) {
      items.push({
        editorId: selection.editorId,
        editorName: selection.editorId,
        scope: selection.scope,
        outcome: "error",
        message: "Unknown editor",
      });
      errorCount++;
      continue;
    }

    try {
      if (selection.scope === "instructions") {
        if (!editor.generateInstructions) {
          items.push({
            editorId: editor.id,
            editorName: editor.name,
            scope: selection.scope,
            outcome: "warning",
            message: "No instruction generator available",
          });
          warningCount++;
          continue;
        }

        const instructions = editor.generateInstructions(enabledServers, env);
        await writeInstructions(projectRoot, editor.id, instructions);
        items.push({
          editorId: editor.id,
          editorName: editor.name,
          scope: selection.scope,
          outcome: "success",
          message: `Instructions saved to ${INSTRUCTIONS_DIR}/${editor.id}.md`,
        });
        successCount++;
        continue;
      }

      const path = getEditorConfigPath(editor, selection.scope, projectRoot);
      if (!path) {
        items.push({
          editorId: editor.id,
          editorName: editor.name,
          scope: selection.scope,
          outcome: "warning",
          message: "Not supported",
        });
        warningCount++;
        continue;
      }

      const result = await writeEditorConfigInProjectRoot({
        editor,
        scope: selection.scope,
        enabledServers,
        env,
        projectRoot,
      });
      if (result.success) {
        nextState = enableEditorScope(nextState, editor.id, selection.scope, path);
        nextState = recordEditorSync(nextState, editor.id, selection.scope);
        items.push({
          editorId: editor.id,
          editorName: editor.name,
          scope: selection.scope,
          outcome: "success",
          message: result.operation,
        });
        successCount++;
        continue;
      }

      items.push({
        editorId: editor.id,
        editorName: editor.name,
        scope: selection.scope,
        outcome: "error",
        message: result.errors.join(", "),
      });
      errorCount++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      items.push({
        editorId: editor.id,
        editorName: editor.name,
        scope: selection.scope,
        outcome: "error",
        message,
      });
      errorCount++;
    }
  }

  nextState = markModified(nextState, "manage-editors");
  const stateWriteResult = await writeState(stateFilePath, nextState);
  const stateWriteError = stateWriteResult.success
    ? null
    : `Failed to write state: ${stateWriteResult.error}`;

  if (stateWriteError) {
    errorCount++;
  }

  return {
    nextState,
    items,
    successCount,
    warningCount,
    errorCount,
    stateWriteError,
  };
}

/**
 * Delegates MCP config serialization to an editor adapter while matching cwd expectations for project installs.
 *
 * @remarks
 * For `project` scope, temporarily sets `process.cwd()` to `projectRoot` so adapters that emit
 * relative paths resolve against the managed workspace. `finally` restores the prior cwd even when
 * the adapter throws. Global scope delegates straight through without touching cwd.
 *
 * @param options - Adapter invocation bundle
 * @param options.editor - MCP editor adapter issuing the concrete config write
 * @param options.scope - Project installs adjust cwd once; global writes skip chdir mutation
 * @param options.enabledServers - Templates merged into rendered MCP server entries
 * @param options.env - Resolved env map passed through for placeholders and secrets-aware wiring
 * @param options.projectRoot - Temporary process cwd replacement used only for project scope
 * @returns Dry-run envelope from `writeConfig`, including successes, warnings, and structured errors
 */
async function writeEditorConfigInProjectRoot(options: {
  editor: EditorAdapter;
  scope: "project" | "global";
  enabledServers: McpServerTemplate[];
  env: EnvVars;
  projectRoot: string;
}) {
  const { editor, scope, enabledServers, env, projectRoot } = options;
  if (scope !== "project") {
    return editor.writeConfig(scope, enabledServers, env);
  }

  const previousCwd = process.cwd();
  process.chdir(projectRoot);

  try {
    return await editor.writeConfig(scope, enabledServers, env);
  } finally {
    process.chdir(previousCwd);
  }
}

/**
 * Build the preview items for a single editor's available configuration choices.
 *
 * @param options - Editor and state context
 * @param options.editor - The editor adapter
 * @param options.state - Current MCP state
 * @param options.projectRoot - Project root path
 * @returns Preview items for each supported scope of this editor
 *
 * @remarks
 * For each scope (project/global) that the editor supports, a McpEditorPreviewItem
 * is returned with the config path and last-sync status. When both project and global
 * configs exist, the global entry is annotated with "(ignored when project is enabled)".
 * For UI-only editors, a single "instructions" scope entry is returned.
 */
export function buildEditorChoiceLabel(options: {
  editor: EditorAdapter;
  state: McpState;
  projectRoot: string;
}): McpEditorPreviewItem[] {
  const { editor, state, projectRoot } = options;
  const stateEntry = state.editors[editor.id];
  const typeLabel = `[${editor.type}]`;
  const results: McpEditorPreviewItem[] = [];

  if (editor.projectConfig) {
    const lastSync = stateEntry?.project.lastSync;
    const syncInfo = lastSync ? `synced ${formatTimestamp(lastSync)}` : "not configured";
    results.push({
      editorId: editor.id,
      editorName: editor.name,
      scope: "project",
      description: `${typeLabel} ${editor.projectConfig.path} | Status: ${syncInfo}`,
    });
  }

  if (editor.globalConfig) {
    const lastSync = stateEntry?.global.lastSync;
    const syncInfo = lastSync ? `synced ${formatTimestamp(lastSync)}` : "not configured";
    const path = toDisplayPath(expandTilde(editor.globalConfig.path));
    // When project config is also available, indicate that global is ignored
    const projectNote = editor.projectConfig ? " (ignored when project is enabled)" : "";
    results.push({
      editorId: editor.id,
      editorName: editor.name,
      scope: "global",
      description: `${typeLabel} ${path}${projectNote} | Status: ${syncInfo}`,
    });
  }

  if (editor.format === "ui-only" || (!editor.projectConfig && !editor.globalConfig)) {
    results.push({
      editorId: editor.id,
      editorName: editor.name,
      scope: "instructions",
      description: `${typeLabel} ${toDisplayPath(getInstructionsPath(projectRoot, editor.id))}`,
    });
  }

  return results;
}
