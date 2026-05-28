#!/usr/bin/env -S npx tsx
/**
 * @fileoverview Creates and manages backups of MCP configuration files.
 *
 * Flow: workspace files + backup policy -> backup creation and cleanup.
 *
 * @example
 * ```typescript
 * const command = "mcp-sync backup";
 * ```
 *
 * @testing Manual CLI: mcp-sync backup
 * @see scripts/lib/backup.ts - Implements the backup primitives used by this script.
 * @see scripts/lib/file-utils.ts - Supplies file-system helpers used by backup flows.
 * @documentation reviewed=2026-04-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { join, dirname, basename, resolve } from "path";
import { fileURLToPath } from "url";
import { copyFile, stat } from "fs/promises";
import { readState, writeState, markModified, STATE_FILE_NAME } from "./lib/state";
import { MCP_SYNC_BACKUP_DIR_NAME } from "./lib/storage-paths";
import { resolveMcpSyncProjectRoot } from "./lib/project-root";
import { getEditorById } from "./editors";
import {
  displayHeader,
  displaySection,
  displaySuccess,
  displayError,
  displayInfo,
  colors,
} from "./lib/prompts";
import {
  resolvePath,
  fileExists,
  generateTimestamp,
  toDisplayPath,
  ensureDir,
} from "./lib/file-utils";
import type { BackupInfo, EditorScopeState } from "./lib/types";

// =============================================================================
// Constants
// =============================================================================

/** Backup directory within the target project. */
const BACKUP_DIR = MCP_SYNC_BACKUP_DIR_NAME;

/** Subdirectories for organization */
const PROJECT_BACKUP_SUBDIR = "project";
const GLOBAL_BACKUP_SUBDIR = "global";

// =============================================================================
// Backup Functions
// =============================================================================

/**
 * Outcome of backing up one editor configuration path for a given scope.
 *
 * @remarks
 * `projectBackupPath` is the copy under `.mcp-sync/backups/`; `globalBackupPath` is an optional
 * same-directory `.bak-{timestamp}` sibling for global-scope configs when that copy succeeds.
 */
interface BackupResult {
  editorId: string;
  editorName: string;
  scope: "project" | "global";
  originalPath: string;
  projectBackupPath: string | null;
  globalBackupPath: string | null;
  success: boolean;
  error?: string;
}

/**
 * Create a backup copy of a config file.
 */
async function createBackupCopy(
  sourcePath: string,
  destPath: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const sourceResolved = resolvePath(sourcePath);
    const destResolved = resolvePath(destPath);

    // Ensure destination directory exists
    await ensureDir(dirname(destResolved));

    // Copy file
    await copyFile(sourceResolved, destResolved);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

/**
 * Generate backup paths for a config file.
 */
function generateBackupPaths(
  projectRoot: string,
  configPath: string,
  editorId: string,
  scope: "project" | "global",
  timestamp: string
): { projectBackup: string; globalBackup: string | null } {
  const resolvedConfig = resolvePath(configPath);
  const filename = basename(resolvedConfig);
  const subdir = scope === "project" ? PROJECT_BACKUP_SUBDIR : GLOBAL_BACKUP_SUBDIR;

  // Project backup: .mcp-sync/backups/{scope}/{editorId}/{filename}.bak-{timestamp}
  const projectBackup = join(
    projectRoot,
    BACKUP_DIR,
    subdir,
    editorId,
    `${filename}.bak-${timestamp}`
  );

  // Global backup: original location with timestamp suffix (only for global configs)
  const globalBackup =
    scope === "global" ? `${resolvedConfig}.bak-${timestamp}` : null;

  return { projectBackup, globalBackup };
}

/**
 * Backup a single configuration file.
 */
async function backupConfig(
  projectRoot: string,
  editorId: string,
  editorName: string,
  scope: "project" | "global",
  configPath: string,
  timestamp: string
): Promise<BackupResult> {
  const resolvedPath = resolvePath(configPath);

  // Check if file exists
  if (!fileExists(resolvedPath)) {
    return {
      editorId,
      editorName,
      scope,
      originalPath: configPath,
      projectBackupPath: null,
      globalBackupPath: null,
      success: true, // Not an error if file doesn't exist
    };
  }

  // Check if it's a regular file (not directory, socket, etc.)
  try {
    const stats = await stat(resolvedPath);
    if (!stats.isFile()) {
      return {
        editorId,
        editorName,
        scope,
        originalPath: configPath,
        projectBackupPath: null,
        globalBackupPath: null,
        success: true, // Not an error - just skip non-files
      };
    }
  } catch (error) {
    console.log(
      `  ${colors.yellow("⚠")} Could not stat file, proceeding with backup: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const { projectBackup, globalBackup } = generateBackupPaths(
    projectRoot,
    configPath,
    editorId,
    scope,
    timestamp
  );

  // Create project backup
  const projectResult = await createBackupCopy(resolvedPath, projectBackup);
  if (!projectResult.success) {
    return {
      editorId,
      editorName,
      scope,
      originalPath: configPath,
      projectBackupPath: null,
      globalBackupPath: null,
      success: false,
      error: `Failed to create project backup: ${projectResult.error}`,
    };
  }

  // Create global backup (for global configs only)
  let globalBackupPath: string | null = null;
  if (globalBackup) {
    const globalResult = await createBackupCopy(resolvedPath, globalBackup);
    if (globalResult.success) {
      globalBackupPath = globalBackup;
    } else {
      // Warn but don't fail - project backup succeeded
      console.log(
        `  ${colors.yellow("⚠")} Could not create in-place backup: ${globalResult.error}`
      );
    }
  }

  return {
    editorId,
    editorName,
    scope,
    originalPath: configPath,
    projectBackupPath: projectBackup,
    globalBackupPath,
    success: true,
  };
}

/**
 * Backup all enabled editor configurations.
 * Returns backup info for each file.
 */
export async function backupAllConfigs(
  projectRoot: string,
  editorStates: Record<string, { project: EditorScopeState; global: EditorScopeState }>,
  _options: { quiet?: boolean } = {}
): Promise<BackupResult[]> {
  const timestamp = generateTimestamp();
  const results: BackupResult[] = [];

  for (const [editorId, editorState] of Object.entries(editorStates)) {
    const editor = getEditorById(editorId);
    const editorName = editor?.name || editorId;

    // Backup project config if enabled
    if (editorState.project.enabled && editorState.project.configPath) {
      const result = await backupConfig(
        projectRoot,
        editorId,
        editorName,
        "project",
        editorState.project.configPath,
        timestamp
      );
      results.push(result);
    }

    // Backup global config if enabled
    if (editorState.global.enabled && editorState.global.configPath) {
      const result = await backupConfig(
        projectRoot,
        editorId,
        editorName,
        "global",
        editorState.global.configPath,
        timestamp
      );
      results.push(result);
    }
  }

  return results;
}

/**
 * Get backup info for a specific config path.
 */
export function getBackupInfo(result: BackupResult): BackupInfo | null {
  if (!result.success || !result.projectBackupPath) {
    return null;
  }

  return {
    originalPath: result.originalPath,
    backupPath: result.projectBackupPath,
    timestamp: new Date().toISOString(),
    size: 0, // Size not tracked for simplicity
  };
}

// =============================================================================
// Main
// =============================================================================

/**
 * CLI entry: read MCP state, create timestamped backups, write refreshed `lastBackup` metadata.
 *
 * @remarks
 * Exits with code 1 when state cannot be read or any backup fails. Supports `--quiet` / `-q` for
 * minimal console output.
 */
async function main(): Promise<void> {
  const projectRoot = resolveMcpSyncProjectRoot(process.cwd());
  const stateFilePath = join(projectRoot, STATE_FILE_NAME);

  // Parse CLI args
  const args = process.argv.slice(2);
  const quiet = args.includes("--quiet") || args.includes("-q");

  if (!quiet) {
    displayHeader("MCP Configuration Backup");
  }

  // Read current state
  const stateResult = await readState(stateFilePath);
  if (!stateResult.success) {
    displayError(`Failed to read state: ${stateResult.error}`);
    displayInfo("Run 'mcp-sync setup' first to initialize the MCP configuration.");
    process.exit(1);
  }
  let state = stateResult.data;

  // Check if any editors are enabled
  const enabledEditors = Object.entries(state.editors).filter(
    ([_, editorState]) => editorState.project.enabled || editorState.global.enabled
  );

  if (enabledEditors.length === 0) {
    displayInfo("No editors enabled. Run 'mcp-sync manage-editors' to enable editors.");
    return;
  }

  if (!quiet) {
    displaySection("Creating Backups");
    console.log(`  Timestamp: ${colors.cyan(generateTimestamp())}`);
    console.log(`  Backup dir: ${colors.dim(join(projectRoot, BACKUP_DIR))}\n`);
  }

  // Create backups
  const results = await backupAllConfigs(projectRoot, state.editors, { quiet });

  // Display results
  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (const result of results) {
    const scopeLabel =
      result.scope === "project"
        ? colors.project("[Project]")
        : colors.global("[Global]");

    if (!result.projectBackupPath && result.success) {
      // File didn't exist
      if (!quiet) {
        displayInfo(`${result.editorName} ${scopeLabel}: ${colors.dim("no file to backup")}`);
      }
      skipCount++;
    } else if (result.success) {
      displaySuccess(`${result.editorName} ${scopeLabel}`);
      console.log(`    → ${toDisplayPath(result.projectBackupPath!)}`);
      if (result.globalBackupPath) {
        console.log(`    → ${toDisplayPath(result.globalBackupPath)}`);
      }
      successCount++;

      // Update state with backup timestamp
      const editorState = state.editors[result.editorId];
      if (editorState) {
        editorState[result.scope].lastBackup = new Date().toISOString();
      }
    } else {
      displayError(`${result.editorName} ${scopeLabel}: ${result.error}`);
      errorCount++;
    }
  }

  // Save updated state
  state = markModified(state, "apply-config");
  await writeState(stateFilePath, state);

  // Summary
  if (!quiet) {
    displaySection("Summary");
    console.log(`  ${colors.green("Backed up")}: ${successCount}`);
    console.log(`  ${colors.dim("Skipped")}: ${skipCount}`);
    console.log(`  ${colors.red("Errors")}: ${errorCount}`);
  }

  if (errorCount > 0) {
    process.exit(1);
  }

  if (successCount > 0 && !quiet) {
    displaySuccess(`\nBackups saved to ${toDisplayPath(join(projectRoot, BACKUP_DIR))}`);
  }
}

// Run only if this is the main module
const isMainModule = process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  main().catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
}
