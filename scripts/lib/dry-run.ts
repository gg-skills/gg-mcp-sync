/**
 * @fileoverview Validates proposed MCP writes without mutating files.
 *
 * Flow: proposed content + format + file state -> dry-run result and diff output.
 *
 * @example
 * ```typescript
 * const result = await dryRunWrite("/tmp/.mcp-sync/env", "A=1\n", { format: "json", createIfMissing: true });
 * ```
 *
 * @testing Jest unit: npm test
 * @see scripts/lib/jsonc.ts - Validates JSONC content before writes.
 * @see scripts/lib/file-utils.ts - Checks file existence and write permissions.
 * @documentation reviewed=2026-04-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import type { DryRunResult, ConfigFormat } from "./types";
import { parseJsonOrJsonc, isValidJsonc } from "./jsonc";
import yaml from "js-yaml";
import {
  resolvePath,
  fileExists,
  readFileSafe,
  isFileWritable,
  toDisplayPath,
} from "./file-utils";

// =============================================================================
// Types
// =============================================================================

/**
 * Controls syntax validation, missing-file behavior, and optional semantic checks for dry runs.
 */
export interface DryRunOptions {
  format: ConfigFormat;
  createIfMissing?: boolean;
  validateContent?: (content: unknown) => string[];
}

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Validate JSON content.
 */
function validateJson(content: string): string[] {
  try {
    JSON.parse(content);
    return [];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return [`Invalid JSON: ${message}`];
  }
}

/**
 * Validate JSONC content.
 */
function validateJsonc(content: string): string[] {
  if (!isValidJsonc(content)) {
    return ["Invalid JSONC: parse error"];
  }
  return [];
}

/**
 * Validate YAML content.
 */
function validateYaml(content: string): string[] {
  try {
    yaml.load(content);
    return [];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return [`Invalid YAML: ${message}`];
  }
}

/**
 * Validate TOML content.
 */
function validateToml(content: string): string[] {
  // Basic TOML validation - just check for obvious syntax errors
  // Full validation would require a TOML parser
  const lines = content.split("\n");
  const errors: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    // Check for invalid section headers
    if (line.startsWith("[") && !line.endsWith("]")) {
      errors.push(`Line ${i + 1}: Unclosed section header`);
    }

    // Check for key-value pairs without equals
    if (!line.startsWith("[") && !line.includes("=") && line.length > 0) {
      // Might be a multi-line value, so just warn
      // errors.push(`Line ${i + 1}: Missing '=' in key-value pair`);
    }
  }

  return errors;
}

/**
 * Validate content based on format.
 */
function validateByFormat(content: string, format: ConfigFormat): string[] {
  switch (format) {
    case "json":
      return validateJson(content);
    case "jsonc":
      return validateJsonc(content);
    case "yaml":
      return validateYaml(content);
    case "toml":
      return validateToml(content);
    default:
      return [];
  }
}

// =============================================================================
// Diff Generation
// =============================================================================

/**
 * Generate a simple diff between two strings.
 */
function generateDiff(current: string | null, proposed: string): string {
  if (current === null) {
    return "[New file]\n" + proposed.split("\n").map((l) => `+ ${l}`).join("\n");
  }

  if (current === proposed) {
    return "[No changes]";
  }

  const currentLines = current.split("\n");
  const proposedLines = proposed.split("\n");
  const diff: string[] = [];

  // Simple line-by-line diff
  const maxLines = Math.max(currentLines.length, proposedLines.length);
  for (let i = 0; i < maxLines; i++) {
    const currentLine = currentLines[i];
    const proposedLine = proposedLines[i];

    if (currentLine === proposedLine) {
      diff.push(`  ${currentLine ?? ""}`);
    } else if (currentLine === undefined) {
      diff.push(`+ ${proposedLine}`);
    } else if (proposedLine === undefined) {
      diff.push(`- ${currentLine}`);
    } else {
      diff.push(`- ${currentLine}`);
      diff.push(`+ ${proposedLine}`);
    }
  }

  // Truncate if too long
  if (diff.length > 50) {
    return diff.slice(0, 25).join("\n") + "\n... (truncated) ...\n" + diff.slice(-25).join("\n");
  }

  return diff.join("\n");
}

// =============================================================================
// Dry-Run Functions
// =============================================================================

/**
 * Perform a dry-run validation for a write operation.
 */
export async function dryRunWrite(
  targetPath: string,
  proposedContent: string,
  options: DryRunOptions
): Promise<DryRunResult> {
  const resolved = resolvePath(targetPath);
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Validate proposed content syntax
  const formatErrors = validateByFormat(proposedContent, options.format);
  errors.push(...formatErrors);

  // 2. Custom validation if provided
  if (options.validateContent) {
    const parseResult = parseJsonOrJsonc(proposedContent);
    if (parseResult.success) {
      const customErrors = options.validateContent(parseResult.data);
      errors.push(...customErrors);
    }
  }

  // 3. Check if file exists
  const exists = fileExists(resolved);
  let currentContent: string | null = null;
  let operation: DryRunResult["operation"] = exists ? "update" : "create";

  if (exists) {
    // 4. Read current content
    const readResult = await readFileSafe(resolved);
    if (readResult.success) {
      currentContent = readResult.data;

      // Check if content would actually change
      if (currentContent === proposedContent) {
        operation = "skip";
      }
    } else {
      warnings.push(`Could not read current file: ${readResult.error}`);
    }
  } else if (!options.createIfMissing) {
    errors.push(`File does not exist: ${toDisplayPath(resolved)}`);
  }

  // 5. Check write permissions
  const writable = await isFileWritable(resolved);
  if (!writable) {
    errors.push(`No write permission: ${toDisplayPath(resolved)}`);
  }

  // 6. Generate diff
  const diff = generateDiff(currentContent, proposedContent);

  return {
    success: errors.length === 0,
    targetPath: resolved,
    operation,
    currentContent,
    proposedContent,
    diff,
    errors,
    warnings,
  };
}

/**
 * Perform dry-run for multiple files.
 */
export async function dryRunWriteMultiple(
  writes: Array<{ path: string; content: string; options: DryRunOptions }>
): Promise<DryRunResult[]> {
  const results: DryRunResult[] = [];

  for (const write of writes) {
    const result = await dryRunWrite(write.path, write.content, write.options);
    results.push(result);
  }

  return results;
}

/**
 * Check if all dry-run results are successful.
 */
export function allDryRunsSuccessful(results: DryRunResult[]): boolean {
  return results.every((r) => r.success);
}

/**
 * Get all errors from dry-run results.
 */
export function getDryRunErrors(results: DryRunResult[]): string[] {
  return results.flatMap((r) => r.errors.map((e) => `${toDisplayPath(r.targetPath)}: ${e}`));
}

/**
 * Get all warnings from dry-run results.
 */
export function getDryRunWarnings(results: DryRunResult[]): string[] {
  return results.flatMap((r) => r.warnings.map((w) => `${toDisplayPath(r.targetPath)}: ${w}`));
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Format dry-run result for display.
 */
export function formatDryRunResult(result: DryRunResult): string {
  const lines: string[] = [];
  const displayPath = toDisplayPath(result.targetPath);

  if (result.success) {
    lines.push(`✓ ${displayPath} (${result.operation})`);
  } else {
    lines.push(`✗ ${displayPath}`);
    for (const error of result.errors) {
      lines.push(`  Error: ${error}`);
    }
  }

  for (const warning of result.warnings) {
    lines.push(`  Warning: ${warning}`);
  }

  return lines.join("\n");
}

/**
 * Format all dry-run results for display.
 */
export function formatDryRunResults(results: DryRunResult[]): string {
  return results.map(formatDryRunResult).join("\n\n");
}

/**
 * Create a dry-run result for a skipped operation.
 */
export function createSkipResult(targetPath: string, reason: string): DryRunResult {
  return {
    success: true,
    targetPath: resolvePath(targetPath),
    operation: "skip",
    currentContent: null,
    proposedContent: "",
    diff: `[Skipped: ${reason}]`,
    errors: [],
    warnings: [],
  };
}
