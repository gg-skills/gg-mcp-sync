/**
 * @fileoverview Writes MCP configurations in JSON, JSONC, YAML, and TOML formats.
 *
 * Flow: server configs + format key path -> serialized config content and write result.
 *
 * @example
 * ```typescript
 * const yamlText = serializeToYamlContinue("server-id", config);
 * ```
 *
 * @testing Jest unit: npm test
 * @see scripts/lib/jsonc.ts - Provides JSONC editing helpers used by this writer.
 * @see scripts/lib/backup.ts - Provides the backup helpers used before writes.
 * @documentation reviewed=2026-04-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import type {
  Result,
  ConfigFormat,
  ConfigKeyFormat,
  DryRunResult,
  McpServerConfig,
  StdioServerConfig,
  HttpServerConfig,
} from "./types";
import { modifyJsonc, stringifyJsonWithNewline, parseJsonOrJsonc } from "./jsonc";
import { dryRunWrite, DryRunOptions } from "./dry-run";
import { createBackupIfExists, cleanupOldBackups } from "./backup";
import { writeFileSafe, readFileSafe, fileExists, resolvePath } from "./file-utils";
import yaml from "js-yaml";

// =============================================================================
// Types
// =============================================================================

/**
 * Type guard: checks if a config is StdioServerConfig (has command, no url).
 */
function isStdioServerConfig(config: McpServerConfig): config is StdioServerConfig {
  return "command" in config && !("url" in config);
}

/**
 * Type guard: checks if a config is HttpServerConfig (has url).
 */
function isHttpServerConfig(config: McpServerConfig): config is HttpServerConfig {
  return "url" in config;
}

/**
 * Options for writeConfig and related operations.
 */
export interface WriteConfigOptions {
  /** Create file if it doesn't exist */
  createIfMissing?: boolean;
  /** Create backup before writing (for global files) */
  createBackup?: boolean;
  /** Preserve existing servers not in the new list */
  preserveExisting?: boolean;
  /** Server IDs to remove (if not preserving all) */
  removeServerIds?: string[];
}

/**
 * Result of a writeConfig operation.
 */
export interface WriteResult {
  success: boolean;
  dryRun: DryRunResult;
  backupPath?: string;
  error?: string;
}

// =============================================================================
// Format-Specific Serializers
// =============================================================================

/**
 * Serialize servers to JSON format.
 */
function serializeToJson(
  servers: Record<string, McpServerConfig>,
  keyPath: string[]
): string {
  let obj: Record<string, unknown> = {};

  // Build nested object from key path
  let current = obj;
  for (let i = 0; i < keyPath.length - 1; i++) {
    current[keyPath[i]] = {};
    current = current[keyPath[i]] as Record<string, unknown>;
  }
  current[keyPath[keyPath.length - 1]] = servers;

  return stringifyJsonWithNewline(obj);
}

/**
 * Serialize servers to YAML format (Goose extensions).
 */
function serializeToYamlExtensions(
  servers: Record<string, McpServerConfig>
): string {

  // Convert to Goose extensions format
  const extensions: Record<string, unknown> = {};
  for (const [id, config] of Object.entries(servers)) {
    if (!isStdioServerConfig(config)) {
      continue;
    }
    extensions[id] = {
      name: id,
      command: config.command,
      args: config.args,
      env: config.env,
      timeout: 300,
    };
  }

  return yaml.dump({ extensions }, { indent: 2, lineWidth: 100 });
}

/**
 * Serialize servers to YAML format (Trae mcp_servers).
 */
function serializeToYamlMcpServers(
  servers: Record<string, McpServerConfig>
): string {

  const mcp_servers: Record<string, unknown> = {};
  for (const [id, config] of Object.entries(servers)) {
    if (isHttpServerConfig(config)) {
      mcp_servers[id] = {
        name: id,
        url: config.url,
        ...(config.headers && { headers: config.headers }),
      };
    } else if (isStdioServerConfig(config)) {
      mcp_servers[id] = {
        name: id,
        command: config.command,
        args: config.args,
        env: config.env,
      };
    }
  }

  return yaml.dump({ mcp_servers }, { indent: 2, lineWidth: 100 });
}

/**
 * Serialize a single server to YAML (Continue format - one file per server).
 */
export function serializeToYamlContinue(
  serverId: string,
  config: McpServerConfig
): string {

  if (!isStdioServerConfig(config)) {
    throw new Error(`serializeToYamlContinue requires StdioServerConfig, got HttpServerConfig for server ${serverId}`);
  }
  const serverYaml = {
    name: serverId,
    command: config.command,
    args: config.args,
    env: config.env,
  };

  return yaml.dump(serverYaml, { indent: 2, lineWidth: 100 });
}

/**
 * Serialize servers to TOML format (Codex).
 */
function serializeToToml(servers: Record<string, McpServerConfig>): string {
  const lines: string[] = ["[mcp]", ""];

  for (const [id, config] of Object.entries(servers)) {
    if (!isStdioServerConfig(config)) {
      continue;
    }
    lines.push(`[mcp.servers.${id}]`);
    lines.push(`command = "${config.command}"`);

    if (config.args && config.args.length > 0) {
      const argsStr = config.args.map((a) => `"${a}"`).join(", ");
      lines.push(`args = [${argsStr}]`);
    }

    if (config.env && Object.keys(config.env).length > 0) {
      lines.push("");
      lines.push(`[mcp.servers.${id}.env]`);
      for (const [key, value] of Object.entries(config.env)) {
        lines.push(`${key} = "${value}"`);
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}

// =============================================================================
// Key Path Helpers
// =============================================================================

/**
 * Get the key path for a config format.
 */
export function getKeyPath(keyFormat: ConfigKeyFormat): string[] {
  switch (keyFormat) {
    case "mcpServers":
      return ["mcpServers"];
    case "servers":
      return ["servers"];
    case "context_servers":
      return ["context_servers"];
    case "mcp":
      return ["mcp", "servers"];
    case "mcp-opencode":
    case "mcp-crush":
      return ["mcp"];
    case "mcp_servers":
      return ["mcp_servers"];
    case "extensions":
      return ["extensions"];
    case "amp.mcpServers":
      return ["amp.mcpServers"];
    case "openctx.providers":
      return ["openctx.providers"];
    case "ui-only":
      return [];
    default:
      return ["mcpServers"];
  }
}

/**
 * Normalize parsed config payload into a flat server map for merge/write flows.
 *
 * @remarks
 * For `mcp-opencode`, accepts top-level server entries or a legacy nested `servers` object;
 * non-objects yield an empty map.
 */
function normalizeServersForKeyFormat(
  keyFormat: ConfigKeyFormat,
  value: unknown
): Record<string, McpServerConfig> {
  if (!value || typeof value !== "object") {
    return {};
  }

  if (keyFormat !== "mcp-opencode") {
    return value as Record<string, McpServerConfig>;
  }

  const current = value as Record<string, unknown>;
  const flatServers = Object.fromEntries(
    Object.entries(current).filter(([key, entryValue]) => {
      if (key === "servers") {
        return false;
      }
      return entryValue !== null && typeof entryValue === "object";
    })
  ) as Record<string, McpServerConfig>;

  if (Object.keys(flatServers).length > 0) {
    return flatServers;
  }

  const legacyServers = current.servers;
  if (legacyServers && typeof legacyServers === "object") {
    return legacyServers as Record<string, McpServerConfig>;
  }

  return {};
}

/**
 * Type guard for plain record-style payload traversal after parser boundaries.
 */
function isRecordValue(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

/**
 * Reads a nested value by config key path, returning `undefined` when traversal cannot continue.
 */
function readValueAtKeyPath(value: unknown, keyPath: string[]): unknown {
  let current = value;
  for (const key of keyPath) {
    if (!isRecordValue(current)) {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

/**
 * Parses an existing YAML config into the normalized server map used by merge flows.
 */
function parseExistingYamlServers(
  existingContent: string,
  keyFormat: ConfigKeyFormat
): Record<string, McpServerConfig> {
  try {
    const parsed = yaml.load(existingContent);
    const current = readValueAtKeyPath(parsed, getKeyPath(keyFormat));
    return normalizeServersForKeyFormat(keyFormat, current);
  } catch (error) {
    console.warn(`Failed to parse existing YAML config, falling back to empty: ${error}`);
    return {};
  }
}

/**
 * Parses an existing JSON or JSONC config into the normalized server map used by merge flows.
 */
function parseExistingJsonServers(
  existingContent: string,
  keyFormat: ConfigKeyFormat
): Record<string, McpServerConfig> {
  const parseResult = parseJsonOrJsonc<Record<string, unknown>>(existingContent);
  if (!parseResult.success) {
    return {};
  }
  const current = readValueAtKeyPath(parseResult.data, getKeyPath(keyFormat));
  return normalizeServersForKeyFormat(keyFormat, current);
}

/**
 * Returns the document object that should receive merged YAML server content.
 */
function getYamlBaseDocument(existingContent: string): Record<string, unknown> {
  const parsed = existingContent ? yaml.load(existingContent) : {};
  return isRecordValue(parsed) ? parsed : {};
}

/**
 * Writes a server map into a mutable YAML document at the selected key path.
 */
function setYamlServersAtKeyPath(
  baseDoc: Record<string, unknown>,
  keyPath: string[],
  mergedServers: Record<string, McpServerConfig>
): void {
  let current = baseDoc;
  for (let i = 0; i < keyPath.length - 1; i++) {
    const key = keyPath[i];
    const next = isRecordValue(current[key]) ? current[key] : {};
    current[key] = next;
    current = next;
  }

  if (keyPath.length > 0) {
    current[keyPath[keyPath.length - 1]] = mergedServers;
  }
}

/**
 * Generates YAML merge output while preserving existing document keys where possible.
 */
function mergeServersIntoYamlContent(
  existingContent: string,
  mergedServers: Record<string, McpServerConfig>,
  keyFormat: ConfigKeyFormat,
  fileFormat: ConfigFormat
): string {
  try {
    const baseDoc = getYamlBaseDocument(existingContent);
    setYamlServersAtKeyPath(baseDoc, getKeyPath(keyFormat), mergedServers);
    return yaml.dump(baseDoc, { indent: 2, lineWidth: 100 });
  } catch (error) {
    // Fall back to a minimal YAML document if parsing fails
    console.warn(`Failed to merge YAML, generating minimal document: ${error}`);
    return generateConfigContent(mergedServers, keyFormat, fileFormat);
  }
}

// =============================================================================
// Content Generation
// =============================================================================

/**
 * Generate config content for the specified format.
 */
export function generateConfigContent(
  servers: Record<string, McpServerConfig>,
  keyFormat: ConfigKeyFormat,
  fileFormat: ConfigFormat,
  existingContent?: string
): string {
  // Handle YAML formats
  if (fileFormat === "yaml") {
    if (keyFormat === "extensions") {
      return serializeToYamlExtensions(servers);
    }
    if (keyFormat === "mcp_servers") {
      return serializeToYamlMcpServers(servers);
    }
  }

  // Handle TOML format
  if (fileFormat === "toml") {
    return serializeToToml(servers);
  }

  // Handle JSON/JSONC formats
  const keyPath = getKeyPath(keyFormat);

  // If we have existing content, merge with it
  if (existingContent) {
    return modifyJsonc(existingContent, keyPath, servers);
  }

  // Create new content
  return serializeToJson(servers, keyPath);
}

/**
 * Merge servers with existing config content.
 */
export async function mergeWithExisting(
  filePath: string,
  newServers: Record<string, McpServerConfig>,
  keyFormat: ConfigKeyFormat,
  fileFormat: ConfigFormat,
  options: WriteConfigOptions
): Promise<Result<string, string>> {
  const resolved = resolvePath(filePath);

  // If file doesn't exist, just generate new content
  if (!fileExists(resolved)) {
    const content = generateConfigContent(newServers, keyFormat, fileFormat);
    return { success: true, data: content };
  }

  // Read existing content
  const readResult = await readFileSafe(resolved);
  if (!readResult.success) {
    return readResult;
  }

  const existingContent = readResult.data;

  // Parse existing servers
  let existingServers: Record<string, McpServerConfig> = {};
  if (options.preserveExisting && fileFormat === "yaml") {
    existingServers = parseExistingYamlServers(existingContent, keyFormat);
  } else if (options.preserveExisting) {
    existingServers = parseExistingJsonServers(existingContent, keyFormat);
  }

  // Remove specified servers
  if (options.removeServerIds) {
    for (const id of options.removeServerIds) {
      delete existingServers[id];
    }
  }

  // Merge: new servers override existing
  const mergedServers = { ...existingServers, ...newServers };

  // Generate content
  if (fileFormat === "yaml") {
    const content = mergeServersIntoYamlContent(
      existingContent,
      mergedServers,
      keyFormat,
      fileFormat
    );
    return { success: true, data: content };
  }

  const content = generateConfigContent(mergedServers, keyFormat, fileFormat, existingContent);
  return { success: true, data: content };
}

// =============================================================================
// Write Functions
// =============================================================================

/**
 * Write MCP config to a file with dry-run validation.
 */
export async function writeConfig(
  filePath: string,
  servers: Record<string, McpServerConfig>,
  keyFormat: ConfigKeyFormat,
  fileFormat: ConfigFormat,
  options: WriteConfigOptions = {}
): Promise<WriteResult> {
  const resolved = resolvePath(filePath);

  // Generate content (merging with existing if needed)
  const contentResult = await mergeWithExisting(
    resolved,
    servers,
    keyFormat,
    fileFormat,
    options
  );

  if (!contentResult.success) {
    return {
      success: false,
      dryRun: {
        success: false,
        targetPath: resolved,
        operation: "update",
        currentContent: null,
        proposedContent: "",
        diff: "",
        errors: [contentResult.error],
        warnings: [],
      },
      error: contentResult.error,
    };
  }

  const proposedContent = contentResult.data;

  // Dry-run validation
  const dryRunOptions: DryRunOptions = {
    format: fileFormat,
    createIfMissing: options.createIfMissing ?? true,
  };

  const dryRun = await dryRunWrite(resolved, proposedContent, dryRunOptions);

  if (!dryRun.success) {
    return {
      success: false,
      dryRun,
      error: dryRun.errors.join("; "),
    };
  }

  // Skip if no changes
  if (dryRun.operation === "skip") {
    return {
      success: true,
      dryRun,
    };
  }

  // Create backup if requested (for global files)
  let backupPath: string | undefined;
  if (options.createBackup && fileExists(resolved)) {
    const backupResult = await createBackupIfExists(resolved);
    if (backupResult.success && backupResult.data) {
      backupPath = backupResult.data.backupPath;
      // Cleanup old backups
      await cleanupOldBackups(resolved);
    }
  }

  // Write the file
  const writeResult = await writeFileSafe(resolved, proposedContent);

  if (!writeResult.success) {
    return {
      success: false,
      dryRun,
      backupPath,
      error: writeResult.error,
    };
  }

  return {
    success: true,
    dryRun,
    backupPath,
  };
}

/**
 * Remove servers from a config file.
 */
export async function removeServersFromConfig(
  filePath: string,
  serverIds: string[],
  keyFormat: ConfigKeyFormat,
  fileFormat: ConfigFormat,
  options: WriteConfigOptions = {}
): Promise<WriteResult> {
  return writeConfig(filePath, {}, keyFormat, fileFormat, {
    ...options,
    preserveExisting: true,
    removeServerIds: serverIds,
  });
}

// =============================================================================
// Minimal Config Creation
// =============================================================================

/**
 * Create a minimal empty config file.
 */
export async function createMinimalConfig(
  filePath: string,
  keyFormat: ConfigKeyFormat,
  fileFormat: ConfigFormat
): Promise<WriteResult> {
  return writeConfig(filePath, {}, keyFormat, fileFormat, {
    createIfMissing: true,
    preserveExisting: false,
  });
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if a config file has any MCP servers configured.
 */
export async function hasConfiguredServers(
  filePath: string,
  keyFormat: ConfigKeyFormat
): Promise<boolean> {
  const resolved = resolvePath(filePath);

  if (!fileExists(resolved)) {
    return false;
  }

  const readResult = await readFileSafe(resolved);
  if (!readResult.success) {
    return false;
  }

  const parseResult = parseJsonOrJsonc<Record<string, unknown>>(readResult.data);
  if (!parseResult.success) {
    return false;
  }

  const keyPath = getKeyPath(keyFormat);
  let current: unknown = parseResult.data;
  for (const key of keyPath) {
    if (current && typeof current === "object") {
      current = (current as Record<string, unknown>)[key];
    }
  }

  const servers = normalizeServersForKeyFormat(keyFormat, current);
  return Object.keys(servers).length > 0;
}

/**
 * Get server IDs from a config file.
 */
export async function getConfiguredServerIds(
  filePath: string,
  keyFormat: ConfigKeyFormat
): Promise<string[]> {
  const resolved = resolvePath(filePath);

  if (!fileExists(resolved)) {
    return [];
  }

  const readResult = await readFileSafe(resolved);
  if (!readResult.success) {
    return [];
  }

  const parseResult = parseJsonOrJsonc<Record<string, unknown>>(readResult.data);
  if (!parseResult.success) {
    return [];
  }

  const keyPath = getKeyPath(keyFormat);
  let current: unknown = parseResult.data;
  for (const key of keyPath) {
    if (current && typeof current === "object") {
      current = (current as Record<string, unknown>)[key];
    }
  }

  return Object.keys(normalizeServersForKeyFormat(keyFormat, current));
}
