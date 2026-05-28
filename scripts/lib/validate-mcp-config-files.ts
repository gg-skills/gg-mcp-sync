/**
 * @fileoverview Validates MCP config files, schema descriptors, and validation summaries.
 *
 * Flow: workspace root + schema files + config targets -> validation summary output.
 *
 * @example
 * ```typescript
 * const summary = validateMcpConfigFiles(process.cwd());
 * ```
 *
 * @testing Jest unit: npm test
 * @see scripts/ui/cli-ink/app.tsx - Consumes the validation summary in the Ink shell.
 * @see scripts/ui/cli-opentui/app.tsx - Consumes the validation summary in the OpenTUI shell.
 * @documentation reviewed=2026-04-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import Ajv from "ajv";
import yaml from "js-yaml";
import { parse as parseToml } from "smol-toml";
import type { ConfigFormat, ConfigKeyFormat } from "./types";
import { editors } from "../editors";
import { parseJsonOrJsonc } from "./jsonc";
import { expandTilde } from "./file-utils";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

/** Resolved directory containing `mcp-*.schema.json` (sibling of this `lib/` folder). */
export function getMcpSchemasDir(): string {
  return join(MODULE_DIR, "..", "schemas");
}

/**
 * Ordered schema slugs matching bundled `mcp-*.schema.json` files under `schemas/`.
 *
 * @remarks
 * PURITY: Constant ordering drives UI row counts; keep aligned with `getSchemaPathMap`.
 */
export const MCP_SCHEMA_KEYS = ["standard", "vscode", "opencode", "crush", "amp", "zed", "trae", "goose", "codex"] as const;

/** Rows in the MCP shell “schemas” section (one per schema file). */
export function getMcpSchemaPanelRowCount(): number {
  return MCP_SCHEMA_KEYS.length;
}

/** Union of known bundled MCP JSON-schema identifiers. */
export type McpSchemaKey = (typeof MCP_SCHEMA_KEYS)[number];

/**
 * Maps ConfigKeyFormat values to their corresponding McpSchemaKey.
 * Only formats with existing JSON schemas are included.
 * Formats without entries (YAML, TOML, JSONC, ui-only) are skipped during validation.
 */
const CONFIG_KEY_TO_SCHEMA: Partial<Record<ConfigKeyFormat, McpSchemaKey>> = {
  mcpServers: "standard",
  servers: "vscode",
  "mcp-opencode": "opencode",
  "mcp-crush": "crush",
  "amp.mcpServers": "amp",
  context_servers: "zed",
  mcp_servers: "trae",
  extensions: "goose",
  mcp: "codex",
};

/** One row in the shell “schemas” panel listing a schema key and its absolute path. */
export interface McpSchemaDescriptor {
  schemaKey: McpSchemaKey;
  fileName: string;
  absPath: string;
}

/** Editor-derived config file to validate, including format and project vs global scope. */
export interface McpConfigTargetDescriptor {
  /** Path: relative to project root (project scope) or absolute (global scope) */
  relativePath: string;
  schema: McpSchemaKey;
  description: string;
  /** File format for parsing (json, jsonc, yaml, toml). Defaults to json. */
  format: ConfigFormat;
  /** Whether this is a project-scoped or global config */
  scope: "project" | "global";
}

/** Per-file Ajv outcome for diagnostics rendering (valid, skipped missing, or invalid with errors). */
export interface McpValidatedConfigFileResult {
  file: string;
  description: string;
  valid: boolean;
  errors: string[];
  skipped: boolean;
}

/** Aggregate counters after validating every discovered MCP config target. */
export interface McpValidateMcpConfigFilesSummary {
  results: McpValidatedConfigFileResult[];
  validatedCount: number;
  validCount: number;
  invalidCount: number;
  skippedCount: number;
}

/**
 * Resolves bundled MCP schema keys to absolute JSON-schema paths under `schemasDir`.
 *
 * @remarks
 * PURITY: Path map must stay aligned with `MCP_SCHEMA_KEYS` and `listMcpSchemaDescriptors`.
 */
function getSchemaPathMap(schemasDir: string): Record<McpSchemaKey, string> {
  return {
    standard: join(schemasDir, "mcp-standard.schema.json"),
    vscode: join(schemasDir, "mcp-vscode.schema.json"),
    opencode: join(schemasDir, "mcp-opencode.schema.json"),
    crush: join(schemasDir, "mcp-crush.schema.json"),
    amp: join(schemasDir, "mcp-amp.schema.json"),
    zed: join(schemasDir, "mcp-zed.schema.json"),
    trae: join(schemasDir, "mcp-trae.schema.json"),
    goose: join(schemasDir, "mcp-goose.schema.json"),
    codex: join(schemasDir, "mcp-codex.schema.json"),
  };
}

/**
 * Schema files on disk for UI listing (paths absolute).
 */
export function listMcpSchemaDescriptors(schemasDir: string = getMcpSchemasDir()): McpSchemaDescriptor[] {
  const map = getSchemaPathMap(schemasDir);
  return MCP_SCHEMA_KEYS.map((schemaKey) => {
    const fileName = schemaKey === "standard" ? "mcp-standard.schema.json" : `mcp-${schemaKey}.schema.json`;
    return {
      schemaKey,
      fileName,
      absPath: map[schemaKey],
    };
  });
}

/**
 * Config files examined by validation, derived from the editors registry.
 *
 * Includes both project-scoped configs (relative paths) and global configs
 * (`~`-prefixed paths resolved to absolute). Deduplicates by resolved path
 * so that editors sharing the same config file (e.g., Factory CLI/Ext/IDE
 * all using `.factory/mcp.json`) produce only one validation target.
 */
export function getMcpConfigTargets(_projectRoot: string): McpConfigTargetDescriptor[] {
  const targets: McpConfigTargetDescriptor[] = [];
  const seenPaths = new Set<string>();

  for (const editor of editors) {
    for (const [scope, configLoc] of [
      ["project", editor.projectConfig],
      ["global", editor.globalConfig],
    ] as const) {
      if (!configLoc) continue;

      const schemaKey = CONFIG_KEY_TO_SCHEMA[configLoc.key];
      if (!schemaKey) continue;

      // For global paths, resolve ~ to absolute; for project paths, keep relative
      const resolvedPath = configLoc.path.startsWith("~")
        ? expandTilde(configLoc.path)
        : configLoc.path;

      if (seenPaths.has(resolvedPath)) continue;
      seenPaths.add(resolvedPath);

      targets.push({
        relativePath: resolvedPath,
        schema: schemaKey,
        description: `${editor.name}${scope === "global" ? " [global]" : ""}`,
        format: configLoc.format,
        scope,
      });
    }
  }

  return targets;
}

/**
 * Verifies every bundled schema file exists on disk before validation runs.
 *
 * @remarks
 * I/O: Reads only `existsSync` checks. Returns first missing schema message or null when complete.
 */
export function assertMcpSchemaFilesPresent(schemasDir: string = getMcpSchemasDir()): string | null {
  const map = getSchemaPathMap(schemasDir);
  for (const key of MCP_SCHEMA_KEYS) {
    const path = map[key];
    if (!existsSync(path)) {
      return `Schema not found: ${key} (${path})`;
    }
  }
  return null;
}

/**
 * Reads a bundled JSON-schema file from disk and parses it into a plain object for Ajv.
 *
 * @remarks
 * I/O: Synchronous filesystem read of `schemaPath`. Throws when the file is unreadable or not valid JSON.
 */
function loadSchema(schemaPath: string): object {
  const content = readFileSync(schemaPath, "utf-8");
  return JSON.parse(content) as object;
}

/**
 * Parse config file content based on format.
 * Returns a plain JS object suitable for Ajv validation.
 */
function parseConfigContent(content: string, format: ConfigFormat): unknown {
  switch (format) {
    case "yaml": {
      return yaml.load(content);
    }
    case "toml": {
      return parseToml(content);
    }
    case "jsonc": {
      const result = parseJsonOrJsonc<unknown>(content);
      if (!result.success) throw new Error("Invalid JSONC");
      return result.data;
    }
    case "json":
    default:
      return JSON.parse(content);
  }
}

/**
 * Validates one MCP config file against its schema, or reports skip/parse failures.
 *
 * @remarks
 * I/O: `existsSync` gate; sync read of config and schema when present. Missing config returns
 * `skipped: true` with `valid: true`. Parse or compile failures surface as `valid: false` with
 * messages in `errors`.
 */
function validateOneConfigFile(
  configPath: string,
  schemaPath: string,
  description: string,
  format: ConfigFormat = "json"
): McpValidatedConfigFileResult {
  if (!existsSync(configPath)) {
    return {
      file: configPath,
      description,
      valid: true,
      errors: [],
      skipped: true,
    };
  }

  try {
    const schema = loadSchema(schemaPath);
    const configContent = readFileSync(configPath, "utf-8");
    const config = parseConfigContent(configContent, format);

    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(schema);
    const valid = validate(config);
    const errors: string[] = [];

    if (!valid && validate.errors) {
      for (const error of validate.errors) {
        const path = error.instancePath || "(root)";
        const message = error.message || "Unknown error";
        errors.push(`${path}: ${message}`);
      }
    }

    return {
      file: configPath,
      description,
      valid: valid === true,
      errors,
      skipped: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      file: configPath,
      description,
      valid: false,
      errors: [`Parse error: ${message}`],
      skipped: false,
    };
  }
}

/**
 * Validate all known MCP config locations under `projectRoot`.
 */
export function validateMcpConfigFiles(
  projectRoot: string,
  schemasDir: string = getMcpSchemasDir()
): McpValidateMcpConfigFilesSummary {
  const schemaPaths = getSchemaPathMap(schemasDir);
  const targets = getMcpConfigTargets(projectRoot);
  const results: McpValidatedConfigFileResult[] = [];

  for (const target of targets) {
    // Global paths are already absolute; project paths are relative to projectRoot
    const configPath = target.scope === "global"
      ? target.relativePath
      : join(projectRoot, target.relativePath);
    const schemaPath = schemaPaths[target.schema];
    results.push(validateOneConfigFile(configPath, schemaPath, target.description, target.format));
  }

  const validated = results.filter((r) => !r.skipped);
  return {
    results,
    validatedCount: validated.length,
    validCount: validated.filter((r) => r.valid).length,
    invalidCount: validated.filter((r) => !r.valid).length,
    skippedCount: results.filter((r) => r.skipped).length,
  };
}

/**
 * Plain-text lines for terminal / Static output (no ANSI).
 */
export function formatMcpValidationSummaryLines(summary: McpValidateMcpConfigFilesSummary): string[] {
  const lines: string[] = [];
  for (const r of summary.results) {
    if (r.skipped) {
      lines.push(`${r.description}: skipped (file missing)`);
    } else if (r.valid) {
      lines.push(`${r.description}: valid`);
    } else {
      lines.push(`${r.description}: invalid`);
      for (const err of r.errors) {
        lines.push(`  → ${err}`);
      }
    }
  }
  lines.push(
    `Summary — valid: ${summary.validCount}, invalid: ${summary.invalidCount}, skipped: ${summary.skippedCount}`
  );
  return lines;
}
