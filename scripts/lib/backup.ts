/**
 * @fileoverview Implements backup creation, restoration, and cleanup helpers for MCP config files.
 *
 * Flow: existing config files + retention policy -> backup metadata and file management.
 *
 * @example
 * ```typescript
 * const age = getBackupAge(backup);
 * ```
 *
 * @testing Jest unit: npm test
 * @see scripts/lib/file-utils.ts - Supplies the file-system helpers used here.
 * @see scripts/lib/config-writer.ts - Uses backup helpers before writing config files.
 * @documentation reviewed=2026-04-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { copyFile } from "fs/promises";
import type { Result, BackupInfo } from "./types";
import {
  resolvePath,
  fileExists,
  readFileSafe,
  writeFileSafe,
  deleteFile,
  listFilesWithPaths,
  getFileInfo,
  generateTimestamp,
  parseTimestampFromBackup,
  getFilename,
  getDirectory,
  toDisplayPath,
} from "./file-utils";

// =============================================================================
// Constants
// =============================================================================

/** Maximum number of backups to keep per file */
export const MAX_BACKUPS = 5;

/** Backup file suffix pattern */
export const BACKUP_SUFFIX_PATTERN = /\.bak-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/;

// =============================================================================
// Backup Creation
// =============================================================================

/**
 * Create a backup of a file.
 * Returns the backup path if successful.
 */
export async function createBackup(filePath: string): Promise<Result<BackupInfo, string>> {
  const resolved = resolvePath(filePath);

  // Check if file exists
  if (!fileExists(resolved)) {
    return { success: false, error: `File does not exist: ${toDisplayPath(resolved)}` };
  }

  // Generate backup path
  const timestamp = generateTimestamp();
  const backupPath = `${resolved}.bak-${timestamp}`;

  try {
    // Copy file to backup
    await copyFile(resolved, backupPath);

    // Get file info for metadata
    const infoResult = await getFileInfo(resolved);
    const size = infoResult.success ? infoResult.data.size : 0;

    const backupInfo: BackupInfo = {
      originalPath: resolved,
      backupPath,
      timestamp: new Date().toISOString(),
      size,
    };

    return { success: true, data: backupInfo };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Failed to create backup: ${message}` };
  }
}

/**
 * Create a backup if the file exists.
 * Returns null if file doesn't exist (not an error).
 */
export async function createBackupIfExists(
  filePath: string
): Promise<Result<BackupInfo | null, string>> {
  const resolved = resolvePath(filePath);

  if (!fileExists(resolved)) {
    return { success: true, data: null };
  }

  const result = await createBackup(filePath);
  if (!result.success) {
    return result;
  }

  return { success: true, data: result.data };
}

// =============================================================================
// Backup Listing
// =============================================================================

/**
 * List all backups for a file.
 */
export async function listBackups(filePath: string): Promise<Result<BackupInfo[], string>> {
  const resolved = resolvePath(filePath);
  const dir = getDirectory(resolved);
  const filename = getFilename(resolved);

  // List files in directory that match backup pattern
  const listResult = await listFilesWithPaths(dir, (name) => {
    return name.startsWith(filename) && BACKUP_SUFFIX_PATTERN.test(name);
  });

  if (!listResult.success) {
    return listResult;
  }

  // Get info for each backup
  const backups: BackupInfo[] = [];
  for (const backupPath of listResult.data) {
    const timestamp = parseTimestampFromBackup(backupPath);
    if (!timestamp) {
      continue;
    }

    const infoResult = await getFileInfo(backupPath);
    const size = infoResult.success ? infoResult.data.size : 0;

    backups.push({
      originalPath: resolved,
      backupPath,
      timestamp: timestamp.toISOString(),
      size,
    });
  }

  // Sort by timestamp, newest first
  backups.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return { success: true, data: backups };
}

/**
 * Get the most recent backup for a file.
 */
export async function getLatestBackup(
  filePath: string
): Promise<Result<BackupInfo | null, string>> {
  const listResult = await listBackups(filePath);
  if (!listResult.success) {
    return listResult;
  }

  if (listResult.data.length === 0) {
    return { success: true, data: null };
  }

  return { success: true, data: listResult.data[0] };
}

// =============================================================================
// Backup Restoration
// =============================================================================

/**
 * Restore a file from a backup.
 */
export async function restoreBackup(backupPath: string): Promise<Result<void, string>> {
  const resolved = resolvePath(backupPath);

  // Validate backup path format
  if (!BACKUP_SUFFIX_PATTERN.test(resolved)) {
    return { success: false, error: "Invalid backup file path" };
  }

  // Get original file path
  const originalPath = resolved.replace(BACKUP_SUFFIX_PATTERN, "");

  // Check backup exists
  if (!fileExists(resolved)) {
    return { success: false, error: `Backup file does not exist: ${toDisplayPath(resolved)}` };
  }

  try {
    // Read backup content
    const contentResult = await readFileSafe(resolved);
    if (!contentResult.success) {
      return contentResult;
    }

    // Write to original path
    const writeResult = await writeFileSafe(originalPath, contentResult.data);
    if (!writeResult.success) {
      return writeResult;
    }

    return { success: true, data: undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Failed to restore backup: ${message}` };
  }
}

/**
 * Restore from the latest backup.
 */
export async function restoreLatestBackup(filePath: string): Promise<Result<void, string>> {
  const latestResult = await getLatestBackup(filePath);
  if (!latestResult.success) {
    return latestResult;
  }

  if (!latestResult.data) {
    return { success: false, error: "No backups found" };
  }

  return restoreBackup(latestResult.data.backupPath);
}

// =============================================================================
// Backup Cleanup
// =============================================================================

/**
 * Delete old backups, keeping only the most recent ones.
 */
export async function cleanupOldBackups(
  filePath: string,
  maxBackups: number = MAX_BACKUPS
): Promise<Result<number, string>> {
  const listResult = await listBackups(filePath);
  if (!listResult.success) {
    return listResult;
  }

  const backups = listResult.data;
  if (backups.length <= maxBackups) {
    return { success: true, data: 0 };
  }

  // Delete oldest backups
  const toDelete = backups.slice(maxBackups);
  let deletedCount = 0;

  for (const backup of toDelete) {
    const deleteResult = await deleteFile(backup.backupPath);
    if (deleteResult.success) {
      deletedCount++;
    }
  }

  return { success: true, data: deletedCount };
}

/**
 * Delete a specific backup.
 */
export async function deleteBackup(backupPath: string): Promise<Result<void, string>> {
  const resolved = resolvePath(backupPath);

  // Validate backup path format
  if (!BACKUP_SUFFIX_PATTERN.test(resolved)) {
    return { success: false, error: "Invalid backup file path" };
  }

  return deleteFile(resolved);
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Format backup info for display.
 */
export function formatBackupInfo(backup: BackupInfo): string {
  const date = new Date(backup.timestamp);
  const sizeKb = Math.round(backup.size / 1024);
  return `${toDisplayPath(backup.backupPath)} (${sizeKb}KB, ${date.toLocaleString()})`;
}

/**
 * Get relative age of a backup.
 */
export function getBackupAge(backup: BackupInfo): string {
  const date = new Date(backup.timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) {
    return "just now";
  }
  if (diffMins < 60) {
    return `${diffMins} minute${diffMins === 1 ? "" : "s"} ago`;
  }
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  }
  if (diffDays === 1) {
    return "yesterday";
  }
  if (diffDays < 7) {
    return `${diffDays} days ago`;
  }

  return date.toLocaleDateString();
}
