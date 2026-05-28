#!/usr/bin/env -S npx tsx
/**
 * @fileoverview Applies the generated MCP configuration to the target workspace.
 *
 * Flow: project root + state and env inputs -> config application pipeline.
 *
 * @example
 * ```typescript
 * const command = "mcp-sync apply";
 * ```
 *
 * @testing Manual CLI: mcp-sync apply
 * @see scripts/lib/config-writer.ts - Writes the managed configuration content used by this command.
 * @see scripts/lib/dry-run.ts - Validates mutations before writing them.
 * @documentation reviewed=2026-04-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { join } from "path";
import {
  STATE_FILE_NAME,
} from "./lib/state";
import { getEditorById, editors } from "./editors";
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
import { select } from "@inquirer/prompts";
import {
  buildMcpApplyPlan,
  executeApplyPlan,
  loadApplyBaseContext,
  parseMcpApplyArgs,
  type McpApplyExecutionItem,
  type McpApplyExecutionResult,
  type McpApplyPlan,
  type McpApplyTarget,
} from "./controllers/apply-controller";
import { resolveMcpSyncProjectRoot } from "./lib/project-root";

/**
 * Prints usage text, option flags, and the list of registered editors for `mcp-sync apply`.
 *
 * @remarks
 * Side effects: renders the apply header via prompts and writes a multiline help template to stdout.
 */
function printHelp(): void {
  displayHeader("Apply MCP Configuration");
  console.log(`
Usage:
  mcp-sync apply                           Apply to all enabled editors
  mcp-sync apply <editor-id>                Apply only to specific editor
  mcp-sync apply --editor <editor-id>       Alternative syntax

Options:
  -e, --editor <id>   Apply only to the specified editor
  -n, --dry-run       Show what would be done without making changes
  -f, --force         Apply without confirmation
  -q, --quiet         Minimal output
  --include-opencode-global
                      Also apply OpenCode global config (~/.config/opencode/opencode.json)
  -h, --help          Show this help

Available editors:
${editors.map((e) => `  ${e.id.padEnd(20)} ${e.name}`).join("\n")}
`);
}

// =============================================================================
// Main
// =============================================================================

/**
 * Surfaces apply base-context load failures and terminates the CLI process.
 *
 * @remarks
 * I/O: stdout via display helpers; ordering matches the inlined pre-refactor branch.
 */
function exitWithApplyBaseContextFailure(options: { error: string }): never {
  const { error } = options;
  displayError(error);
  if (error.startsWith("Failed to read env file:")) {
    displayInfo("Run 'mcp-sync manage-env' first to configure environment variables.");
  } else {
    displayInfo("Run 'mcp-sync setup' first to initialize the MCP configuration.");
  }
  process.exit(1);
}

/**
 * Prints per-target apply outcomes (skip, success, or error) for a completed execution pass.
 *
 * @remarks
 * Skip rows respect `quiet`; success and error rows always print like the pre-refactor loop.
 */
function displayApplyExecutionItems(options: {
  items: McpApplyExecutionItem[];
  quiet: boolean;
}): void {
  const { items, quiet } = options;
  for (const item of items) {
    if (item.outcome === "skip") {
      if (!quiet) {
        displayInfo(`${item.target.editorName} (${item.target.scope}): ${colors.dim(item.message)}`);
        console.log(`    → ${item.target.configPath}`);
      }
      continue;
    }

    if (item.outcome === "success") {
      displaySuccess(`${item.target.editorName} (${item.target.scope}): ${item.message}`);
      console.log(`    → ${item.target.configPath}`);
      continue;
    }

    displayError(`${item.target.editorName} (${item.target.scope}): ${item.message}`);
    console.log(`    → ${item.target.configPath}`);
  }
}

/**
 * Handles terminal no-op outcomes for the initial apply plan before interactive targeting.
 *
 * @returns `true` when the CLI should return without further apply work.
 */
function tryHandleMcpApplyInitialPlanNoOp(plan: McpApplyPlan): boolean {
  if (plan.status === "no-enabled-servers") {
    displayInfo(plan.noOpReason ?? "No servers enabled.");
    return true;
  }
  if (plan.status === "no-enabled-editors") {
    displayInfo(plan.noOpReason ?? "No editors enabled.");
    return true;
  }
  return false;
}

/**
 * Resolves the editor filter after the initial plan, prompting only when appropriate.
 *
 * @remarks
 * Preserves the pre-refactor rule: CLI `editorId` and `quiet` short-circuit prompts; `null` means
 * apply to all enabled editors.
 */
async function resolveApplyTargetEditorIdInteractive(options: {
  cliEditorId: string | null;
  quiet: boolean;
  allTargets: McpApplyTarget[];
}): Promise<string | null> {
  const { cliEditorId, quiet, allTargets } = options;
  if (cliEditorId !== null || quiet) {
    return cliEditorId;
  }

  const enabledEditorIds = [...new Set(allTargets.map((item) => item.editorId))];

  const choice = await select({
    message: "Apply configuration to:",
    choices: [
      { name: `All enabled editors (${enabledEditorIds.length})`, value: "all" },
      { name: "Specific editor...", value: "specific" },
    ],
    default: "all",
  });

  if (choice !== "specific") {
    return null;
  }

  const editorChoices = enabledEditorIds.map((id) => {
    const editor = getEditorById(id);
    const configs = allTargets.filter((item) => item.editorId === id);
    const scopes = configs.map((c) => c.scope).join(" + ");
    return {
      name: `${editor?.name || id} (${scopes})`,
      value: id,
    };
  });

  return select({
    message: "Select editor:",
    choices: editorChoices,
  });
}

/**
 * Prints the filtered apply matrix when not in quiet mode.
 */
function displayApplyConfigurationsPreview(options: {
  targets: McpApplyTarget[];
  quiet: boolean;
}): void {
  const { targets, quiet } = options;
  if (quiet) {
    return;
  }
  displaySection("Configurations to Apply");
  for (const { editorName, scope, configPath } of targets) {
    const scopeLabel = scope === "project" ? colors.project("[Project]") : colors.global("[Global]");
    console.log(`  ${editorName} ${scopeLabel}`);
    console.log(`    → ${configPath}`);
  }
}

/**
 * Surfaces policy skips and terminates early when the rebuilt plan is not ready.
 *
 * @returns `true` when the CLI should return without executing apply.
 */
function tryHandleMcpApplyPlanGate(plan: McpApplyPlan, quiet: boolean): boolean {
  if (plan.policySkippedTargets.length > 0 && !quiet) {
    displayWarning(plan.policySkippedTargets[0].reason);
  }
  if (plan.status !== "ready") {
    displayInfo(plan.noOpReason ?? "No editor configurations remain to apply.");
    return true;
  }
  return false;
}

/**
 * Confirms destructive apply work unless `force` or `quiet` disables the prompt.
 *
 * @returns `false` when the operator cancels; `true` to continue.
 */
async function confirmApplyPlanUnlessForcedOrQuiet(options: {
  force: boolean;
  quiet: boolean;
  targetCount: number;
}): Promise<boolean> {
  const { force, quiet, targetCount } = options;
  if (force || quiet) {
    return true;
  }
  const confirmed = await promptConfirm(
    `\nApply configuration to ${targetCount} editor(s)?`,
    true
  );
  if (!confirmed) {
    displayInfo("Cancelled.");
    return false;
  }
  return true;
}

/**
 * Reports backup outcomes, optional force guidance, and enforces backup-error exits.
 *
 * @remarks
 * Side effects and `process.exit` sequencing match the inlined pre-refactor implementation.
 */
function reportApplyBackupPhase(options: {
  backupResults: McpApplyExecutionResult["backupResults"];
  force: boolean;
  quiet: boolean;
  executionStatus: McpApplyExecutionResult["status"];
}): void {
  const { backupResults, force, quiet, executionStatus } = options;
  const backupErrors = backupResults.filter((r) => !r.success);
  const backupsCreated = backupResults.filter((r) => r.success && r.projectBackupPath);

  if (backupErrors.length > 0) {
    displayError(`Failed to create ${backupErrors.length} backup(s)`);
    for (const result of backupErrors) {
      console.log(`  ${colors.red("→")} ${result.editorName}: ${result.error}`);
    }
    if (!force) {
      displayInfo("Use --force to apply without backups.");
      process.exit(1);
    }
  }

  if (backupsCreated.length > 0) {
    displaySuccess(`Created ${backupsCreated.length} backup(s)`);
  } else if (!quiet) {
    displayInfo("No existing configs to backup");
  }

  if (executionStatus === "blocked-by-backup-error") {
    process.exit(1);
  }
}

/**
 * CLI entrypoint for applying generated MCP configuration to enabled editor targets.
 *
 * @remarks
 * Loads state and env from the workspace, may prompt for editor selection, and drives backup plus
 * config writes through the apply controller. Calls `process.exit` after `--help` or on fatal
 * validation, backup, or apply errors; returns without exiting on user cancel, dry-run, or no-op plans.
 */
async function main(): Promise<void> {
  const projectRoot = resolveMcpSyncProjectRoot(process.cwd());
  const stateFilePath = join(projectRoot, STATE_FILE_NAME);

  // Parse CLI args
  const args = process.argv.slice(2);
  const { dryRun, force, quiet, includeOpencodeGlobal, editorId, showHelp } = parseMcpApplyArgs(args);

  if (showHelp) {
    printHelp();
    process.exit(0);
  }

  // Validate editor ID if specified
  if (editorId !== null) {
    const editor = getEditorById(editorId);
    if (!editor) {
      displayError(`Unknown editor: ${editorId}`);
      displayInfo(`Run 'mcp-sync apply --help' to see available editors.`);
      process.exit(1);
    }
  }

  if (!quiet) {
    displayHeader("Apply MCP Configuration");
  }

  const baseContextResult = await loadApplyBaseContext(projectRoot);
  if (!baseContextResult.success) {
    exitWithApplyBaseContextFailure({ error: baseContextResult.error });
  }
  const state = baseContextResult.data.state;
  const env = baseContextResult.data.env;
  const enabledServers = baseContextResult.data.enabledServers;
  const allTargets = baseContextResult.data.allTargets;

  const initialPlan = buildMcpApplyPlan({
    enabledServers,
    allTargets,
    requestedEditorId: null,
    includeOpencodeGlobal,
  });
  if (tryHandleMcpApplyInitialPlanNoOp(initialPlan)) {
    return;
  }

  if (!quiet) {
    console.log(`\nEnabled servers: ${enabledServers.map((s) => s.id).join(", ")}`);
  }

  const targetEditorId = await resolveApplyTargetEditorIdInteractive({
    cliEditorId: editorId,
    quiet,
    allTargets,
  });

  const applyPlan = buildMcpApplyPlan({
    enabledServers,
    allTargets,
    requestedEditorId: targetEditorId,
    includeOpencodeGlobal,
  });

  if (tryHandleMcpApplyPlanGate(applyPlan, quiet)) {
    return;
  }

  const filteredApply = applyPlan.targets;

  displayApplyConfigurationsPreview({ targets: filteredApply, quiet });

  if (filteredApply.length === 0) {
    displayInfo("No editor configurations remain after apply policy filtering.");
    return;
  }

  if (dryRun) {
    displayInfo("\nDry run mode - no changes will be made.");
    return;
  }

  if (!(await confirmApplyPlanUnlessForcedOrQuiet({ force, quiet, targetCount: filteredApply.length }))) {
    return;
  }

  // Create backups before applying
  if (!quiet) {
    displaySection("Creating Backups");
  }

  const executionResult = await executeApplyPlan({
    projectRoot,
    stateFilePath,
    state,
    env,
    enabledServers,
    targets: filteredApply,
    force,
    quiet,
  });
  reportApplyBackupPhase({
    backupResults: executionResult.backupResults,
    force,
    quiet,
    executionStatus: executionResult.status,
  });

  // Apply configurations
  if (!quiet) {
    displaySection("Applying Configurations");
  }

  displayApplyExecutionItems({ items: executionResult.items, quiet });

  if (executionResult.stateWriteError) {
    displayError(executionResult.stateWriteError);
  }

  // Summary
  if (!quiet) {
    displaySection("Summary");
    console.log(`  ${colors.green("Success")}: ${executionResult.successCount}`);
    console.log(`  ${colors.dim("Skipped")}: ${executionResult.skipCount}`);
    console.log(`  ${colors.red("Errors")}: ${executionResult.errorCount}`);
  }

  if (executionResult.errorCount > 0) {
    process.exit(1);
  }
}

// Run
main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
