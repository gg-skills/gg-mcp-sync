/**
 * @fileoverview Defines the core MCP configuration, server, editor, and result types used across the utility.
 *
 * Flow: server templates + editor adapters + file formats -> shared config and result types.
 *
 * @example
 * ```typescript
 * const transport: McpTransport = "stdio";
 * ```
 *
 * @testing Jest unit: npm test
 * @see scripts/lib/env.ts - Uses these shared environment and result types.
 * @see scripts/lib/config-writer.ts - Serializes the shared server config types.
 * @documentation reviewed=2026-04-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

// =============================================================================
// Environment & Configuration Types
// =============================================================================

/** Environment variables map */
export type EnvVars = Record<string, string>;

/** Transport type for MCP servers */
export type McpTransport = "stdio" | "http";

/** Editor type classification */
export type EditorType = "vscode-ext" | "cli" | "standalone" | "web";

/** Configuration file format */
export type ConfigFormat = "json" | "jsonc" | "yaml" | "toml";

/** Configuration key format in the file */
export type ConfigKeyFormat =
  | "mcpServers" // Standard: { mcpServers: { ... } }
  | "servers" // VSCode: { servers: { ... } }
  | "context_servers" // Zed: { context_servers: { ... } }
  | "mcp" // Nested mcp format: { mcp: { servers: { ... } } }
  | "mcp-opencode" // OpenCode: { mcp: { ... } } (flat, servers directly under mcp)
  | "mcp-crush" // Crush: { mcp: { ... } } (flat, servers directly under mcp)
  | "mcp_servers" // Trae CLI YAML
  | "extensions" // Goose CLI YAML
  | "amp.mcpServers" // Amp CLI
  | "openctx.providers" // Cody OpenCtx
  | "ui-only"; // Manual UI configuration

// =============================================================================
// MCP Server Configuration (output format)
// =============================================================================

/** Standard stdio server config */
export interface StdioServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/** HTTP/SSE server config */
export interface HttpServerConfig {
  type?: "http" | "sse";
  url: string;
  headers?: Record<string, string>;
  auth?: Record<string, string>;
}

/** VSCode-specific stdio config */
export interface VscodeStdioServerConfig extends StdioServerConfig {
  type: "stdio";
}

/** VSCode-specific HTTP/SSE config */
export interface VscodeHttpServerConfig extends HttpServerConfig {
  type: "http" | "sse";
}

/** Union used by server templates that can return either VSCode MCP transport shape. */
export type VscodeServerConfig = VscodeStdioServerConfig | VscodeHttpServerConfig;

/** OpenCode-specific config */
export interface OpenCodeServerConfig {
  type: "local" | "remote";
  command?: string[];
  url?: string;
  environment?: Record<string, string>;
  oauth?: false | { clientId: string; clientSecret: string; scope?: string };
  timeout?: number;
}

/** Zed context server config */
export interface ZedServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/** Configuration shape for a Goose CLI extension entry. */
export interface GooseExtensionConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  timeout?: number;
}

/** Codex TOML server config */
export interface CodexServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  startup_timeout_sec?: number;
}

/** Continue YAML server config */
export interface ContinueServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/** Crush CLI stdio server config */
export interface CrushStdioServerConfig {
  type: "stdio";
  command: string;
  args?: string[];
  env?: Record<string, string>;
  timeout?: number;
  disabled?: boolean;
  disabled_tools?: string[];
}

/** Crush CLI HTTP/SSE server config */
export interface CrushHttpServerConfig {
  type: "http" | "sse";
  url: string;
  headers?: Record<string, string>;
  timeout?: number;
  disabled?: boolean;
  disabled_tools?: string[];
}

/** Union of all possible server configs */
export type McpServerConfig =
  | StdioServerConfig
  | HttpServerConfig
  | VscodeStdioServerConfig
  | VscodeHttpServerConfig
  | OpenCodeServerConfig
  | ZedServerConfig
  | GooseExtensionConfig
  | CodexServerConfig
  | ContinueServerConfig
  | CrushStdioServerConfig
  | CrushHttpServerConfig;

// =============================================================================
// MCP Server Template (input definition)
// =============================================================================

/** Config generators for different editor formats */
export interface ServerConfigGenerators {
  /** Standard mcpServers format (Cursor, Windsurf, Claude CLI, etc.) */
  standard: (env: EnvVars) => StdioServerConfig | HttpServerConfig;
  /** VSCode native MCP format */
  vscode?: (env: EnvVars) => VscodeStdioServerConfig | VscodeHttpServerConfig;
  /** OpenCode format */
  opencode?: (env: EnvVars) => OpenCodeServerConfig;
  /** Zed context_servers format */
  zed?: (env: EnvVars) => ZedServerConfig;
  /** Goose extensions format */
  goose?: (env: EnvVars) => GooseExtensionConfig;
  /** Codex TOML format */
  codex?: (env: EnvVars) => CodexServerConfig;
  /** Continue YAML format */
  continue?: (env: EnvVars) => ContinueServerConfig;
  /** Crush CLI format (supports stdio, http, and sse transports) */
  crush?: (env: EnvVars) => CrushStdioServerConfig | CrushHttpServerConfig;
}

/**
 * MCP server definition template.
 *
 * ## Multi-Transport Servers
 *
 * Some MCP services offer both stdio and HTTP transports. When this is the case,
 * create separate server templates for each transport with the transport suffix
 * in the ID:
 *
 * - `firecrawl-stdio` - Local process via `firecrawl-mcp` package
 * - `firecrawl-http` - Cloud API via HTTP endpoint
 *
 * Both can be enabled simultaneously in `.mcp-sync/state.json`:
 * - HTTP-capable editors (Cursor, Windsurf, Claude CLI) get both
 * - Stdio-only editors (Codex, Amp, Goose) get only the stdio version
 *
 * This allows users to enable the appropriate transport for each editor
 * without manual configuration.
 *
 * ## Naming Convention
 *
 * Server IDs should follow the pattern: `{service}-{transport}`
 * - `{service}` - The underlying service name (e.g., "firecrawl", "apify")
 * - `{transport}` - Either "stdio" or "http"
 *
 * This convention enables the `getServersByService()` helper to group
 * related servers for display in the UI.
 */
export interface McpServerTemplate {
  /** Unique identifier with transport suffix (e.g., "firecrawl-stdio", "firecrawl-http") */
  id: string;
  /** Legacy config keys/ids that should be cleaned up during managed rewrites */
  legacyIds?: string[];
  /** Human-readable name */
  name: string;
  /** Transport type - determines which editors can use this server */
  transport: McpTransport;
  /** npm package for stdio servers (ignored for http) */
  package?: string;
  /** URL template for http servers (may contain {VAR_NAME} placeholders) */
  url?: string;
  /** Required environment variable names */
  envVars: string[];
  /** Config generators for each editor format */
  configs: ServerConfigGenerators;
}

// =============================================================================
// Editor Adapter Types
// =============================================================================

/** Configuration file location */
export interface ConfigLocation {
  /** Path (absolute or with ~ for home) */
  path: string;
  /** JSON key for the servers object */
  key: ConfigKeyFormat;
  /** File format */
  format: ConfigFormat;
}

/** Dry-run result before writing */
export interface DryRunResult {
  success: boolean;
  targetPath: string;
  operation: "create" | "update" | "backup" | "skip";
  currentContent: string | null;
  proposedContent: string;
  diff: string;
  errors: string[];
  warnings: string[];
}

/**
 * Editor adapter interface.
 *
 * ## Transport Filtering
 *
 * Editors that only support stdio transport MUST filter the `servers` array
 * in `writeConfig()` to exclude HTTP servers:
 *
 * ```typescript
 * const stdioServers = servers.filter((s) => s.transport === "stdio");
 * const skippedServers = servers.filter((s) => s.transport !== "stdio");
 * ```
 *
 * When HTTP servers are skipped, include a warning in the result:
 *
 * ```typescript
 * warnings: skippedServers.length > 0
 *   ? [`Skipped ${skippedServers.length} HTTP server(s) (${name} supports stdio only).`]
 *   : []
 * ```
 *
 * This ensures that when both `firecrawl-stdio` and `firecrawl-http` are enabled,
 * stdio-only editors receive only `firecrawl-stdio` without error.
 *
 * ## HTTP-Capable Editors
 *
 * Editors that support both transports (Cursor, Windsurf, VSCode, etc.) should
 * include ALL servers passed to `writeConfig()`, using the appropriate config
 * format for each transport type.
 */
export interface EditorAdapter {
  /** Unique identifier (e.g., "cursor") */
  id: string;
  /** Human-readable name */
  name: string;
  /** Editor type classification */
  type: EditorType;
  /** Whether the editor supports HTTP/SSE transport (defaults to true if not specified) */
  supportsHttp?: boolean;
  /** Project-level config location (if supported) */
  projectConfig?: ConfigLocation;
  /** Global config location (if supported) */
  globalConfig?: ConfigLocation;
  /** Primary config format */
  format: ConfigKeyFormat;

  /** Check if the editor/tool is installed */
  detectInstalled(): Promise<boolean>;

  /** Read current MCP config from file */
  readConfig(scope: "project" | "global"): Promise<McpConfigFile | null>;

  /**
   * Write MCP config to file.
   *
   * @param scope - "project" or "global" config location
   * @param servers - Servers to add/update in the config
   * @param env - Environment variables for config generation
   * @param options - Optional settings for the write operation
   * @returns DryRunResult with success/failure and any warnings about skipped servers
   */
  writeConfig(
    scope: "project" | "global",
    servers: McpServerTemplate[],
    env: EnvVars,
    options?: {
      /** Server IDs to remove before adding new ones (clears stale managed servers) */
      removeServerIds?: string[];
    }
  ): Promise<DryRunResult>;

  /** Generate manual instructions for UI-only tools */
  generateInstructions?(servers: McpServerTemplate[], env: EnvVars): string;
}

// =============================================================================
// Configuration File Types
// =============================================================================

/** Parsed MCP config file content */
export interface McpConfigFile {
  /** File path */
  path: string;
  /** File format */
  format: ConfigFormat;
  /** Raw file content */
  rawContent: string;
  /** Parsed servers (normalized) */
  servers: Record<string, McpServerConfig>;
  /** Whether the file existed */
  exists: boolean;
}

/** Minimal config structures by format */
export const MINIMAL_CONFIGS: Record<ConfigKeyFormat, unknown> = {
  mcpServers: { mcpServers: {} },
  servers: { servers: {} },
  context_servers: { context_servers: {} },
  mcp: { mcp: { servers: {} } },
  "mcp-opencode": { mcp: {} },
  "mcp-crush": { mcp: {} },
  mcp_servers: { mcp_servers: {} },
  extensions: {}, // YAML - empty object
  "amp.mcpServers": { "amp.mcpServers": {} },
  "openctx.providers": { "openctx.providers": {} },
  "ui-only": {}, // Not applicable
};

// =============================================================================
// State File Types
// =============================================================================

/** Environment variable tracking */
export interface EnvVarState {
  isSet: boolean;
  lastValidated: string; // ISO timestamp
}

/** Tracks whether an editor scope is enabled and when it was last synchronized or backed up. */
export interface EditorScopeState {
  enabled: boolean;
  configPath: string;
  lastSync: string | null; // ISO timestamp
  lastBackup: string | null; // ISO timestamp
}

/** Holds project-level and global-scope MCP configuration states for a single editor. */
export interface EditorState {
  project: EditorScopeState;
  global: EditorScopeState;
}

/**
 * Transport preference for services with multiple transport options.
 *
 * - "disabled" - Service not enabled
 * - "stdio-only" - Only use stdio transport
 * - "http-only" - Only use HTTP transport
 * - "prefer-stdio" - Enable both, but prefer stdio (stdio listed first, used when only one allowed)
 * - "prefer-http" - Enable both, but prefer HTTP (http listed first, used when only one allowed)
 */
export type TransportPreference =
  | "disabled"
  | "stdio-only"
  | "http-only"
  | "prefer-stdio"
  | "prefer-http";

/** Service transport preference state */
export interface ServicePreference {
  /** Transport preference for this service */
  preference: TransportPreference;
  /** Last modified timestamp */
  lastModified: string;
}

/** Persisted server settings keyed by concrete server id (for example `serena-stdio`). */
export interface McpServerSettings {
  /** Canonical startup timeout in seconds; adapters map this to editor-specific field names. */
  startupTimeoutSeconds?: number;
}

/** Full state file schema */
export interface McpState {
  /** Schema version for migrations */
  version: "1.0.0";
  /**
   * Enabled MCP server IDs.
   * @deprecated Use servicePreferences instead for services with multiple transports.
   * Kept for backward compatibility - derived from servicePreferences on save.
   */
  enabledServers: string[];
  /**
   * Transport preferences per service (e.g., "firecrawl" -> "prefer-stdio").
   * Services are identified by base name without transport suffix.
   */
  servicePreferences?: Record<string, ServicePreference>;
  /** Persisted per-server settings keyed by concrete server id. */
  serverSettings: Record<string, McpServerSettings>;
  /** Environment variable states */
  envVars: Record<string, EnvVarState>;
  /** Editor configuration states */
  editors: Record<string, EditorState>;
  /** Last modification timestamp */
  lastModified: string;
  /** Which script last modified the state */
  lastModifiedBy:
    | "setup"
    | "manage-env"
    | "manage-servers"
    | "manage-editors"
    | "apply-config"
    | "external-state-writer";
}

// =============================================================================
// Backup Types
// =============================================================================

/** Backup metadata */
export interface BackupInfo {
  /** Original file path */
  originalPath: string;
  /** Backup file path */
  backupPath: string;
  /** Backup timestamp */
  timestamp: string;
  /** File size in bytes */
  size: number;
}

// =============================================================================
// Utility Types
// =============================================================================

/** Result type for operations that can fail */
export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

/** Async result type */
export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;
