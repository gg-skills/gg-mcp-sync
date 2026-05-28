/**
 * @fileoverview Parses and edits JSONC files while preserving comments and formatting.
 *
 * Flow: JSON or JSONC content -> parsed structure -> modified serialized output.
 *
 * @example
 * ```typescript
 * const parsed = parseJsonc("{\"mcpServers\":{}}");
 * ```
 *
 * @testing Jest unit: npm test
 * @see scripts/lib/config-writer.ts - Uses JSONC editing helpers when mutating config files.
 * @see scripts/lib/dry-run.ts - Uses JSONC parsing for validation.
 * @documentation reviewed=2026-04-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import {
  parse,
  modify,
  applyEdits,
  ParseError,
  printParseErrorCode,
  FormattingOptions,
  ModificationOptions,
} from "jsonc-parser";
import type { Result } from "./types";

// =============================================================================
// Types
// =============================================================================

/**
 * Result of parsing JSONC content, including any parse errors.
 */
export interface JsoncParseResult<T = unknown> {
  data: T;
  errors: ParseError[];
  hasErrors: boolean;
}

/**
 * Options for modifyJsonc operations.
 */
export interface JsoncModifyOptions {
  formattingOptions?: FormattingOptions;
  isArrayInsertion?: boolean;
}

// =============================================================================
// Default Formatting
// =============================================================================

const DEFAULT_FORMATTING: FormattingOptions = {
  tabSize: 2,
  insertSpaces: true,
  eol: "\n",
};

// =============================================================================
// Parse Functions
// =============================================================================

/**
 * Parse JSONC content, tolerating comments and trailing commas.
 * Returns both parsed data and any parse errors.
 */
export function parseJsonc<T = unknown>(content: string): JsoncParseResult<T> {
  const errors: ParseError[] = [];
  const data = parse(content, errors, {
    allowTrailingComma: true,
    allowEmptyContent: true,
  }) as T;

  return {
    data,
    errors,
    hasErrors: errors.length > 0,
  };
}

/**
 * Parse JSONC and return Result type for error handling.
 */
export function parseJsoncSafe<T = unknown>(content: string): Result<T, string> {
  const result = parseJsonc<T>(content);

  if (result.hasErrors) {
    const errorMessages = result.errors
      .map((e) => `${printParseErrorCode(e.error)} at offset ${e.offset}`)
      .join(", ");
    return { success: false, error: `Parse errors: ${errorMessages}` };
  }

  return { success: true, data: result.data };
}

/** Type guard for parsing JSON with validation. */
function parseJsonWithGuard<T>(content: string): Result<T, string> {
  try {
    const data = JSON.parse(content);
    if (typeof data !== "object" || data === null) {
      return { success: false, error: "Parsed JSON must be an object" };
    }
    return { success: true, data: data as T };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Try to parse as regular JSON first, fall back to JSONC if it fails.
 * This is more efficient for files that don't have comments.
 */
export function parseJsonOrJsonc<T = unknown>(content: string): Result<T, string> {
  // Try standard JSON first (faster)
  const jsonResult = parseJsonWithGuard<T>(content);
  if (jsonResult.success) {
    return jsonResult;
  }
  // Fall back to JSONC parser
  return parseJsoncSafe<T>(content);
}

// =============================================================================
// Modify Functions
// =============================================================================

/**
 * Modify a value at a specific path in JSONC content.
 * Preserves comments and formatting.
 *
 * @param content - Original JSONC content
 * @param path - Path to the value (e.g., ["mcpServers", "my-server"])
 * @param value - New value to set (undefined to delete)
 * @param options - Modification options
 * @returns Modified content string
 */
export function modifyJsonc(
  content: string,
  path: (string | number)[],
  value: unknown,
  options?: JsoncModifyOptions
): string {
  const modifyOptions: ModificationOptions = {
    formattingOptions: options?.formattingOptions ?? DEFAULT_FORMATTING,
    isArrayInsertion: options?.isArrayInsertion ?? false,
  };

  const edits = modify(content, path, value, modifyOptions);
  return applyEdits(content, edits);
}

/**
 * Set multiple values in JSONC content.
 * More efficient than calling modifyJsonc multiple times.
 */
export function modifyJsoncMultiple(
  content: string,
  modifications: Array<{ path: (string | number)[]; value: unknown }>,
  options?: JsoncModifyOptions
): string {
  let result = content;
  for (const mod of modifications) {
    result = modifyJsonc(result, mod.path, mod.value, options);
  }
  return result;
}

/**
 * Delete a value at a specific path in JSONC content.
 */
export function deleteJsoncPath(
  content: string,
  path: (string | number)[],
  options?: JsoncModifyOptions
): string {
  return modifyJsonc(content, path, undefined, options);
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get a value at a specific path from parsed JSONC.
 */
export function getValueAtPath<T = unknown>(
  data: unknown,
  path: (string | number)[]
): T | undefined {
  let current: unknown = data;

  for (const key of path) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current === "object") {
      current = (current as Record<string | number, unknown>)[key];
    } else {
      return undefined;
    }
  }

  return current as T;
}

/**
 * Check if a path exists in parsed JSONC data.
 */
export function hasPath(data: unknown, path: (string | number)[]): boolean {
  return getValueAtPath(data, path) !== undefined;
}

/**
 * Merge servers into existing JSONC content at the specified key.
 * Preserves existing servers not in the new list.
 */
export function mergeServersIntoJsonc(
  content: string,
  keyPath: string[],
  servers: Record<string, unknown>,
  options?: JsoncModifyOptions
): string {
  const parsed = parseJsonc(content);
  const existingServers = getValueAtPath<Record<string, unknown>>(parsed.data, keyPath) ?? {};

  // Merge: new servers override existing ones with same key
  const merged = { ...existingServers, ...servers };

  return modifyJsonc(content, keyPath, merged, options);
}

/**
 * Remove servers from existing JSONC content at the specified key.
 */
export function removeServersFromJsonc(
  content: string,
  keyPath: string[],
  serverIds: string[],
  options?: JsoncModifyOptions
): string {
  const parsed = parseJsonc(content);
  const existingServers = getValueAtPath<Record<string, unknown>>(parsed.data, keyPath) ?? {};

  // Remove specified servers
  const filtered = { ...existingServers };
  for (const id of serverIds) {
    delete filtered[id];
  }

  return modifyJsonc(content, keyPath, filtered, options);
}

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Validate that content is valid JSONC.
 */
export function isValidJsonc(content: string): boolean {
  const result = parseJsonc(content);
  return !result.hasErrors;
}

/**
 * Format error messages from parse errors.
 */
export function formatParseErrors(errors: ParseError[]): string[] {
  return errors.map(
    (e) => `${printParseErrorCode(e.error)} at offset ${e.offset}, length ${e.length}`
  );
}

// =============================================================================
// Stringify Functions
// =============================================================================

/**
 * Stringify to JSON with consistent formatting.
 */
export function stringifyJson(data: unknown, indent: number = 2): string {
  return JSON.stringify(data, null, indent);
}

/**
 * Stringify with trailing newline (standard for config files).
 */
export function stringifyJsonWithNewline(data: unknown, indent: number = 2): string {
  return JSON.stringify(data, null, indent) + "\n";
}
