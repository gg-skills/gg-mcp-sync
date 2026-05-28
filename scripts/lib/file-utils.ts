/**
 * @fileoverview Provides file-system and path helpers for MCP configuration workflows.
 *
 * Flow: paths and filesystem checks -> normalized display and mutation helpers.
 *
 * @example
 * ```typescript
 * const root = getProjectRoot();
 * ```
 *
 * @testing Jest unit: npm test
 * @see scripts/lib/backup.ts - Uses these helpers for backup management.
 * @see scripts/lib/dry-run.ts - Uses these helpers for dry-run validation.
 * @documentation reviewed=2026-04-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { readFile, writeFile, mkdir, access, stat, readdir, unlink } from "fs/promises";
import { existsSync, constants } from "fs";
import { dirname, join, resolve, basename } from "path";
import { homedir } from "os";
import type { Result, ConfigFormat } from "./types";

// =============================================================================
// Path Resolution
// =============================================================================

/**
 * Expand ~ to home directory in paths.
 */
export function expandTilde(path: string): string {
  if (path.startsWith("~/")) {
    return join(homedir(), path.slice(2));
  }
  if (path === "~") {
    return homedir();
  }
  return path;
}

/**
 * Resolve a path, expanding ~ and making absolute.
 */
export function resolvePath(path: string, basePath?: string): string {
  const expanded = expandTilde(path);
  if (basePath) {
    return resolve(basePath, expanded);
  }
  return resolve(expanded);
}

/**
 * Get the project root directory.
 */
export function getProjectRoot(): string {
  // Assuming we're running from the scripts directory
  // or the project root
  return process.cwd();
}

/**
 * Check if a path is inside the project directory.
 */
export function isProjectPath(path: string, projectRoot: string): boolean {
  const resolved = resolvePath(path);
  return resolved.startsWith(projectRoot);
}

/**
 * Convert absolute path to display path (with ~ for home).
 */
export function toDisplayPath(absolutePath: string): string {
  const home = homedir();
  if (absolutePath.startsWith(home)) {
    return "~" + absolutePath.slice(home.length);
  }
  return absolutePath;
}

// =============================================================================
// File Operations
// =============================================================================

/**
 * Read a file with error handling.
 */
export async function readFileSafe(filePath: string): Promise<Result<string, string>> {
  try {
    const resolved = resolvePath(filePath);
    const content = await readFile(resolved, "utf-8");
    return { success: true, data: content };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Failed to read file: ${message}` };
  }
}

/**
 * Write a file with error handling, creating directories if needed.
 */
export async function writeFileSafe(
  filePath: string,
  content: string
): Promise<Result<void, string>> {
  try {
    const resolved = resolvePath(filePath);
    await ensureDir(dirname(resolved));
    await writeFile(resolved, content, "utf-8");
    return { success: true, data: undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Failed to write file: ${message}` };
  }
}

/**
 * Check if a file exists.
 */
export function fileExists(filePath: string): boolean {
  const resolved = resolvePath(filePath);
  return existsSync(resolved);
}

/**
 * Check if a file exists and is readable.
 */
export async function isFileReadable(filePath: string): Promise<boolean> {
  try {
    const resolved = resolvePath(filePath);
    await access(resolved, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a file exists and is writable, or if we can create it.
 * Walks up the directory tree to find a writable ancestor.
 */
export async function isFileWritable(filePath: string): Promise<boolean> {
  try {
    const resolved = resolvePath(filePath);
    if (existsSync(resolved)) {
      await access(resolved, constants.W_OK);
      return true;
    }
    // File doesn't exist - walk up the tree to find a writable ancestor
    let current = dirname(resolved);
    const root = resolve("/");
    while (current !== root) {
      if (existsSync(current)) {
        await access(current, constants.W_OK);
        return true;
      }
      current = dirname(current);
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Get file metadata including size, modification time, and type.
 */
export async function getFileInfo(filePath: string): Promise<Result<{
  size: number;
  modifiedAt: Date;
  isDirectory: boolean;
}, string>> {
  try {
    const resolved = resolvePath(filePath);
    const stats = await stat(resolved);
    return {
      success: true,
      data: {
        size: stats.size,
        modifiedAt: stats.mtime,
        isDirectory: stats.isDirectory(),
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Failed to get file info: ${message}` };
  }
}

/**
 * Delete a file.
 */
export async function deleteFile(filePath: string): Promise<Result<void, string>> {
  try {
    const resolved = resolvePath(filePath);
    await unlink(resolved);
    return { success: true, data: undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Failed to delete file: ${message}` };
  }
}

// =============================================================================
// Directory Operations
// =============================================================================

/**
 * Ensure a directory exists, creating it recursively if needed.
 */
export async function ensureDir(dirPath: string): Promise<Result<void, string>> {
  try {
    const resolved = resolvePath(dirPath);
    await mkdir(resolved, { recursive: true });
    return { success: true, data: undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Failed to create directory: ${message}` };
  }
}

/**
 * Check if a directory exists.
 */
export function dirExists(dirPath: string): boolean {
  const resolved = resolvePath(dirPath);
  if (!existsSync(resolved)) {
    return false;
  }
  try {
    // Sync check is OK here since we just checked existence
    const stats = require("fs").statSync(resolved);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * List files in a directory.
 */
export async function listFiles(
  dirPath: string,
  filter?: (name: string) => boolean
): Promise<Result<string[], string>> {
  try {
    const resolved = resolvePath(dirPath);
    const entries = await readdir(resolved);
    const filtered = filter ? entries.filter(filter) : entries;
    return { success: true, data: filtered };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Failed to list directory: ${message}` };
  }
}

/**
 * List files with full paths.
 */
export async function listFilesWithPaths(
  dirPath: string,
  filter?: (name: string) => boolean
): Promise<Result<string[], string>> {
  const result = await listFiles(dirPath, filter);
  if (!result.success) {
    return result;
  }
  const resolved = resolvePath(dirPath);
  return {
    success: true,
    data: result.data.map((name) => join(resolved, name)),
  };
}

// =============================================================================
// Format Detection
// =============================================================================

/**
 * Detect config format from file extension.
 */
export function detectFormatFromExtension(filePath: string): ConfigFormat {
  const ext = filePath.toLowerCase().split(".").pop();
  switch (ext) {
    case "yaml":
    case "yml":
      return "yaml";
    case "toml":
      return "toml";
    case "jsonc":
      return "jsonc";
    default:
      return "json";
  }
}

/**
 * Detect config format from content.
 */
export function detectFormatFromContent(content: string): ConfigFormat {
  const trimmed = content.trim();

  // YAML typically starts with key: or ---
  if (trimmed.startsWith("---") || /^[a-zA-Z_][a-zA-Z0-9_]*:\s/m.test(trimmed)) {
    // But could also be JSON starting with a letter (rare)
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
      return "yaml";
    }
  }

  // TOML typically has [sections] or key = value
  if (/^\[[a-zA-Z_][a-zA-Z0-9_.-]*\]/m.test(trimmed) || /^[a-zA-Z_][a-zA-Z0-9_]*\s*=/m.test(trimmed)) {
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
      return "toml";
    }
  }

  // Check for JSON comments (JSONC)
  if (/^\s*\/\/|^\s*\/\*/m.test(trimmed)) {
    return "jsonc";
  }

  // Default to JSON
  return "json";
}

// =============================================================================
// Timestamp Utilities
// =============================================================================

/**
 * Generate a filesystem-safe timestamp.
 */
export function generateTimestamp(): string {
  return new Date().toISOString().replace(/:/g, "-").replace(/\.\d{3}Z$/, "");
}

/**
 * Parse a timestamp from a backup filename.
 */
export function parseTimestampFromBackup(filename: string): Date | null {
  // Format: filename.bak-2024-01-27T14-30-00
  const match = filename.match(/\.bak-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})$/);
  if (!match) {
    return null;
  }
  const isoString = match[1].replace(/-/g, (_match, offset) => {
    // Replace hyphens after T with colons
    return offset > 10 ? ":" : "-";
  });
  return new Date(isoString + "Z");
}

// =============================================================================
// Path Comparison
// =============================================================================

/**
 * Check if two paths point to the same file.
 */
export function isSamePath(path1: string, path2: string): boolean {
  return resolvePath(path1) === resolvePath(path2);
}

/**
 * Get filename from path.
 */
export function getFilename(filePath: string): string {
  return basename(filePath);
}

/**
 * Get directory from path.
 */
export function getDirectory(filePath: string): string {
  return dirname(filePath);
}
