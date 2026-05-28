#!/usr/bin/env -S npx tsx
/**
 * @fileoverview Manages editor configurations in the MCP project state.
 *
 * Flow: project root + editor registry + saved state -> interactive editor configuration flow.
 *
 * @example
 * ```typescript
 * const command = "mcp-sync manage-editors";
 * ```
 *
 * @testing Manual CLI: mcp-sync manage-editors
 * @see scripts/ui/cli-ink/app.tsx - The Ink shell that can launch editor management.
 * @see scripts/ui/cli-interactive/main.ts - The interactive console that can launch editor management.
 * @documentation reviewed=2026-04-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import {
  buildEditorChoiceLabel,
  buildEditorSelectionPreview,
  executeEditorSelections,
  loadEditorControllerContext,
  type McpManagedEditorScope,
} from "./controllers/editor-controller";
import { editors } from "./editors";
import {
  displayHeader,
  displaySection,
  displaySuccess,
  displayError,
  displayInfo,
  displayWarning,
  promptConfirm,
  colors,
} from "./lib/prompts";
import { checkbox } from "@inquirer/prompts";
import { resolveMcpSyncProjectRoot } from "./lib/project-root";
import type { McpState } from "./lib/types";

/**
 * Derives the initial Inquirer `checked` flag for one editor scope row from persisted MCP state.
 */
function isCheckboxCheckedForEditorScope(options: {
  editorId: string;
  scope: McpManagedEditorScope;
  state: McpState;
}): boolean {
  const entry = options.state.editors[options.editorId];
  if (options.scope === "project") {
    return entry?.project.enabled ?? false;
  }
  if (options.scope === "global") {
    return entry?.global.enabled ?? false;
  }
  return false;
}

/**
 * Formats the scope tag shown beside each editor name in the checkbox list (project/global/manual).
 */
function scopeLabelForCheckboxChoice(scope: McpManagedEditorScope): string {
  if (scope === "project") {
    return colors.project("[Project]");
  }
  if (scope === "global") {
    return colors.global("[Global]");
  }
  return colors.dim("(manual setup)");
}

// =============================================================================
// Main
// =============================================================================

/**
 * Interactive CLI entry for selecting which editor configs to apply for enabled MCP servers.
 *
 * @remarks
 * Resolves the target project root. Exits with code 1 when editor controller context
 * cannot be loaded or when the top-level promise rejects; otherwise completes after preview,
 * optional cancel, or successful write attempts.
 */
async function main(): Promise<void> {
  const projectRoot = resolveMcpSyncProjectRoot(process.cwd());

  displayHeader("Editor Configuration");

  const contextResult = await loadEditorControllerContext(projectRoot);
  if (!contextResult.success) {
    displayError(contextResult.error);
    process.exit(1);
  }
  const { stateFilePath, state, env, enabledServers } = contextResult.data;

  // Get enabled servers
  if (enabledServers.length === 0) {
    displayInfo("No servers enabled. Enable servers first with: mcp-sync manage-servers");
    return;
  }

  console.log(`\nEnabled servers: ${enabledServers.map((s) => s.id).join(", ")}`);

  // Sort editors alphabetically by name
  const sortedEditors = [...editors].sort((a, b) => a.name.localeCompare(b.name));

  // Build choices
  /**
   * One Inquirer checkbox row for an editor installation scope (`editorId` + `scope` encoded in value).
   *
   * @remarks
   * `value` stays stable across prompts as `${editor.id}:${scope}` so selections map back to persisted
   * project/global flags and preview/write routing.
   */
  type Choice = { name: string; value: string; checked: boolean };
  const choices: Choice[] = [];

  for (const editor of sortedEditors) {
    const labels = buildEditorChoiceLabel({
      editor,
      state,
      projectRoot,
    });

    for (const label of labels) {
      const checked = isCheckboxCheckedForEditorScope({
        editorId: editor.id,
        scope: label.scope,
        state,
      });
      const scopeLabel = scopeLabelForCheckboxChoice(label.scope);

      choices.push({
        name: `${editor.name} ${scopeLabel}\n      ${label.description}`,
        value: `${editor.id}:${label.scope}`,
        checked,
      });
    }
  }

  // Prompt for selection
  const selected = await checkbox<string>({
    message: "Select editor configurations (space to toggle, enter to confirm):",
    choices,
    pageSize: 25,
  });

  if (selected.length === 0) {
    displayInfo("No editors selected.");
    return;
  }

  // Parse selections, enforcing project-over-global exclusivity
  const toWrite: Array<{ editorId: string; scope: "project" | "global" | "instructions" }> = [];
  const selectedByEditor = new Map<string, Set<string>>();
  for (const s of selected) {
    const [editorId, scope] = s.split(":");
    if (!selectedByEditor.has(editorId)) selectedByEditor.set(editorId, new Set());
    selectedByEditor.get(editorId)!.add(scope);
  }
  for (const [editorId, scopes] of selectedByEditor) {
    if (scopes.has("project") && scopes.has("global")) {
      displayWarning(`${editorId}: project config selected — global will be skipped (project takes precedence)`);
      scopes.delete("global");
    }
    for (const scope of scopes) {
      toWrite.push({ editorId, scope: scope as "project" | "global" | "instructions" });
    }
  }

  // Show what will be written
  displaySection("Configuration Preview");
  const previewItems = buildEditorSelectionPreview(projectRoot, toWrite);
  for (const item of previewItems) {
    console.log(`  ${item.editorName} (${item.scope}): ${item.description}`);
  }

  // Confirm
  const confirmed = await promptConfirm("\nProceed with configuration?", true);
  if (!confirmed) {
    displayInfo("Cancelled.");
    return;
  }

  // Write configurations
  displaySection("Writing Configurations");
  const executionResult = await executeEditorSelections({
    projectRoot,
    stateFilePath,
    state,
    env,
    enabledServers,
    selections: toWrite,
  });

  for (const item of executionResult.items) {
    if (item.outcome === "success") {
      displaySuccess(`${item.editorName} (${item.scope}): ${item.message}`);
      continue;
    }

    if (item.outcome === "warning") {
      displayWarning(`${item.editorName} (${item.scope}): ${item.message}`);
      continue;
    }

    displayError(`${item.editorName} (${item.scope}): ${item.message}`);
  }

  if (executionResult.stateWriteError) {
    displayError(executionResult.stateWriteError);
  }

  // Summary
  displaySection("Summary");
  console.log(`  Success: ${executionResult.successCount}`);
  console.log(`  Warnings: ${executionResult.warningCount}`);
  console.log(`  Errors: ${executionResult.errorCount}`);

  if (executionResult.errorCount > 0) {
    console.log("\nSome configurations failed. Check the errors above.");
  } else {
    displaySuccess("\nAll configurations written successfully!");
  }
}

// Run
main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
