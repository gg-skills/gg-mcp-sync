/**
 * @fileoverview Loads the MCP shell inventory from state, env, server, and editor sources.
 *
 * Flow: workspace root + dependencies -> shell inventory summary and warnings.
 *
 * @example
 * ```typescript
 * const inventory = await loadMcpShellInventory({ projectRoot: process.cwd() });
 * ```
 *
 * @testing Jest unit: npm test
 * @see scripts/ui/cli-ink/load-inventory.ts - Re-exports the inventory loader for the Ink app.
 * @see scripts/ui/cli-opentui/app.tsx - Consumes the loaded inventory in OpenTUI.
 * @documentation reviewed=2026-04-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { existsSync } from "fs";
import { join } from "path";
import { editors } from "../../editors";
import {
  ENV_EXAMPLE_FILE_NAME,
  ENV_FILE_NAME,
  getEnvVarStatus,
  maskSecret,
  readEnvFile,
} from "../../lib/env";
import { resolvePath, toDisplayPath } from "../../lib/file-utils";
import { createDefaultState, readState, STATE_FILE_NAME } from "../../lib/state";
import { MCP_SYNC_INSTRUCTIONS_DIR_NAME } from "../../lib/storage-paths";
import type {
  EditorAdapter,
  EnvVars,
  McpConfigFile,
  McpServerTemplate,
  McpState,
  TransportPreference,
} from "../../lib/types";
import { inferPreferenceFromEnabled, servers } from "../../servers";
import type {
  McpShellEditorItem,
  McpShellEditorScopeItem,
  McpShellEnvVarItem,
  McpShellFilePresence,
  McpShellInventory,
  McpShellInventorySummary,
  McpShellServiceItem,
  McpShellScopeId,
} from "./shell-types";

const INSTRUCTIONS_DIR_NAME = MCP_SYNC_INSTRUCTIONS_DIR_NAME;

/**
 * Dependency injection contract for `loadMcpShellInventory`.
 *
 * @remarks
 * **I/O:** reads state, env files, and filesystem via injected dependencies.
 * **PURITY:** impure — depends on filesystem and external state.
 */
export interface McpShellInventoryDependencies {
  readState: typeof readState;
  readEnvFile: typeof readEnvFile;
  pathExists: (path: string) => boolean;
  serverRegistry: McpServerTemplate[];
  editorRegistry: EditorAdapter[];
}

const defaultDependencies: McpShellInventoryDependencies = {
  readState,
  readEnvFile,
  pathExists: existsSync,
  serverRegistry: servers,
  editorRegistry: editors,
};

/**
 * Derives the logical MCP service label from a server id by stripping known transport suffixes.
 *
 * @remarks
 * **PURITY:** pure string transform — recognizes `-stdio` and `-http` tails only.
 * @param serverId - Identifier that may embed transport as a trailing segment.
 */
function getServiceName(serverId: string): string {
  if (serverId.endsWith("-stdio")) {
    return serverId.slice(0, -6);
  }

  if (serverId.endsWith("-http")) {
    return serverId.slice(0, -5);
  }

  return serverId;
}

/**
 * Groups registered MCP server variants under shared service keys for preference and env-var rollups.
 *
 * @remarks
 * **PURITY:** pure partitioning — rollup key uses `getServiceName` semantics.
 * @param serverRegistry - Variant templates that may share the same stem before transport suffix.
 */
function groupServersByService(
  serverRegistry: McpServerTemplate[]
): Map<string, McpServerTemplate[]> {
  const grouped = new Map<string, McpServerTemplate[]>();

  for (const server of serverRegistry) {
    const serviceName = getServiceName(server.id);
    const existing = grouped.get(serviceName) ?? [];
    grouped.set(serviceName, [...existing, server]);
  }

  return grouped;
}

/**
 * Resolves transport preference for a service from persisted preferences or inferred enabled transports.
 *
 * @remarks
 * **PURITY:** pure read of the provided state snapshot — no filesystem access.
 * @param serviceName - Service stem grouping stdio/http variants (`getServiceName` output shape).
 */
function getPreferenceForService(
  state: McpState,
  serviceName: string
): TransportPreference {
  const explicitPreference = state.servicePreferences?.[serviceName]?.preference;
  if (explicitPreference) {
    return explicitPreference;
  }

  return inferPreferenceFromEnabled(state.enabledServers, serviceName);
}

/**
 * Chooses concrete enabled server ids for one service according to preference and discovered variants.
 *
 * @remarks
 * **PURITY:** pure selection — prefers stdio vs http ordering per preference without touching disks.
 */
function getEnabledServerIdsForPreference(
  variants: McpServerTemplate[],
  preference: TransportPreference
): string[] {
  const stdioVariant = variants.find((server) => server.transport === "stdio");
  const httpVariant = variants.find((server) => server.transport === "http");

  switch (preference) {
    case "disabled":
      return [];
    case "stdio-only":
      return stdioVariant ? [stdioVariant.id] : [];
    case "http-only":
      return httpVariant ? [httpVariant.id] : [];
    case "prefer-stdio":
      return [stdioVariant?.id, httpVariant?.id].filter(
        (value): value is string => typeof value === "string"
      );
    case "prefer-http":
      return [httpVariant?.id, stdioVariant?.id].filter(
        (value): value is string => typeof value === "string"
      );
  }
}

/**
 * Builds the services section of the MCP shell inventory from state, env, and server registry.
 *
 * @remarks
 * **I/O:** pure transform — reads nothing; derives all from arguments.
 * **PURITY:** pure function with no side effects.
 * @param state - Current MCP state including enabled servers and service preferences.
 * @param env - Resolved environment variables map.
 * @param serverRegistry - Registered MCP server templates.
 * @returns Sorted array of `McpShellServiceItem` with transport, preference, and env-var metadata.
 */
export function buildServiceInventory(
  state: McpState,
  env: EnvVars,
  serverRegistry: McpServerTemplate[]
): McpShellServiceItem[] {
  const grouped = groupServersByService(serverRegistry);
  const entries = Array.from(grouped.entries()).sort(([left], [right]) =>
    left.localeCompare(right)
  );

  return entries.map(([serviceName, variants]) => {
    const preference = getPreferenceForService(state, serviceName);
    const envVars = Array.from(
      new Set(variants.flatMap((variant) => variant.envVars))
    ).sort();
    const missingEnvVars = envVars.filter(
      (varName) => getEnvVarStatus(env, varName) !== "set"
    );

    return {
      id: serviceName,
      serviceName,
      transports: variants.map((variant) => variant.transport),
      preference,
      enabledServerIds: getEnabledServerIdsForPreference(variants, preference),
      envVars,
      missingEnvVars,
    };
  });
}

/**
 * Builds the environment variables section of the MCP shell inventory.
 *
 * @remarks
 * **I/O:** pure transform — reads nothing; derives all from arguments.
 * **PURITY:** pure function with no side effects.
 * @param state - Current MCP state including per-variable last-validated timestamps.
 * @param env - Resolved environment variables map.
 * @param serverRegistry - Registered MCP server templates whose `envVars` fields drive required-by tracking.
 * @returns Sorted array of `McpShellEnvVarItem` with status, masked value, and required-by metadata.
 */
export function buildEnvVarInventory(
  state: McpState,
  env: EnvVars,
  serverRegistry: McpServerTemplate[]
): McpShellEnvVarItem[] {
  const grouped = groupServersByService(serverRegistry);
  const requiredByMap = new Map<string, string[]>();

  for (const [serviceName, variants] of grouped.entries()) {
    const envVars = Array.from(
      new Set(variants.flatMap((variant) => variant.envVars))
    );

    for (const varName of envVars) {
      const existing = requiredByMap.get(varName) ?? [];
      requiredByMap.set(varName, [...existing, serviceName]);
    }
  }

  const envVarNames = Array.from(requiredByMap.keys()).sort((left, right) =>
    left.localeCompare(right)
  );

  return envVarNames.map((name) => {
    const status = getEnvVarStatus(env, name);
    const value = env[name];
    const maskedValue =
      status === "set" && value
        ? maskSecret(value)
        : status === "empty"
          ? "(empty)"
          : "(unset)";

    return {
      name,
      status,
      maskedValue,
      requiredBy: (requiredByMap.get(name) ?? []).sort((left, right) =>
        left.localeCompare(right)
      ),
      lastValidated: state.envVars[name]?.lastValidated ?? null,
    };
  });
}

/**
 * Builds a shell inventory scope row signalling that this editor/adapter path is not supported here.
 *
 * @remarks
 * **PURITY:** pure defaults — disables flags and clears paths/counts/sync metadata for UX legibility.
 * @param scope - Which conceptual scope bucket is unsupported (inventory key only).
 */
function createUnsupportedScope(scope: McpShellScopeId): McpShellEditorScopeItem {
  return {
    scope,
    supported: false,
    enabled: false,
    configPath: null,
    exists: null,
    managedServerCount: null,
    lastSync: null,
    lastBackup: null,
  };
}

/**
 * Reads an editor MCP config for a scope, converting adapter failures into a note instead of throwing.
 *
 * @remarks
 * **I/O:** awaits `editor.readConfig` once for the requested scope.
 * **PURITY:** impure via adapter-backed reads — callers always receive an object envelope.
 */
async function readEditorConfigSafe(
  editor: EditorAdapter,
  scope: "project" | "global"
): Promise<{ config: McpConfigFile | null; note: string | null }> {
  try {
    return {
      config: await editor.readConfig(scope),
      note: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      config: null,
      note: `${editor.name} ${scope} config read failed: ${message}`,
    };
  }
}

/**
 * Returns the filesystem path for an editor MCP config scope when the adapter exposes that binding.
 *
 * @remarks
 * **PURITY:** pure path assembly — resolves `projectRoot` for project scopes only via `resolvePath`.
 */
function getResolvedScopePath(
  editor: EditorAdapter,
  scope: "project" | "global",
  projectRoot: string
): string | null {
  const config = scope === "project" ? editor.projectConfig : editor.globalConfig;
  if (!config) {
    return null;
  }

  return scope === "project"
    ? resolvePath(config.path, projectRoot)
    : resolvePath(config.path);
}

/**
 * Composes inventory state for one editor/project-or-global scope, including surfaced read diagnostics.
 *
 * @remarks
 * **I/O:** awaits `readEditorConfigSafe` — inventory rows reflect transient read failures via `notes`.
 */
async function buildEditorScope(
  state: McpState,
  editor: EditorAdapter,
  scope: "project" | "global",
  projectRoot: string
): Promise<{ scopeItem: McpShellEditorScopeItem; notes: string[] }> {
  const resolvedPath = getResolvedScopePath(editor, scope, projectRoot);
  if (!resolvedPath) {
    return {
      scopeItem: createUnsupportedScope(scope),
      notes: [],
    };
  }

  const stateEntry = state.editors[editor.id];
  const scopedState = stateEntry?.[scope];
  const configResult = await readEditorConfigSafe(editor, scope);
  const notes = configResult.note ? [configResult.note] : [];
  const configPath = scopedState?.configPath
    ? toDisplayPath(scopedState.configPath)
    : toDisplayPath(resolvedPath);

  return {
    scopeItem: {
      scope,
      supported: true,
      enabled: scopedState?.enabled ?? false,
      configPath,
      exists: configResult.config?.exists ?? null,
      managedServerCount: configResult.config
        ? Object.keys(configResult.config.servers).length
        : null,
      lastSync: scopedState?.lastSync ?? null,
      lastBackup: scopedState?.lastBackup ?? null,
    },
    notes,
  };
}

/**
 * Describes the Markdown instruction pseudo-scope beside managed configs when `.mcp-sync/instructions` applies.
 *
 * @remarks
 * **I/O:** synchronously checks instruction file existence for supported adapters.
 * **PURITY:** impure when supported — uses `existsSync` for the `.md` path probe.
 */
function buildInstructionScope(
  editor: EditorAdapter,
  projectRoot: string
): McpShellEditorScopeItem {
  const supported = editor.format === "ui-only" || (!editor.projectConfig && !editor.globalConfig);
  if (!supported) {
    return createUnsupportedScope("instructions");
  }

  const instructionPath = join(projectRoot, INSTRUCTIONS_DIR_NAME, `${editor.id}.md`);

  return {
    scope: "instructions",
    supported: true,
    enabled: false,
    configPath: toDisplayPath(instructionPath),
    exists: existsSync(instructionPath),
    managedServerCount: null,
    lastSync: null,
    lastBackup: null,
  };
}

/**
 * Queries editor installation via the adapter, collapsing detection errors into a non-throwing envelope.
 *
 * @remarks
 * **I/O:** awaits `editor.detectInstalled` — detection failures downgrade to `installed: false` plus `note`.
 */
async function detectEditorInstalled(editor: EditorAdapter): Promise<{
  installed: boolean;
  note: string | null;
}> {
  try {
    return {
      installed: await editor.detectInstalled(),
      note: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      installed: false,
      note: `${editor.name} install detection failed: ${message}`,
    };
  }
}

/**
 * Builds per-editor inventory rows by probing installs, configs, and instruction paths on disk.
 *
 * @remarks
 * **I/O:** impure — awaits `editor.detectInstalled`, `readConfig`, and checks instruction file
 * existence under `projectRoot`. Parallelizes across editors via `Promise.all`.
 */
export async function buildEditorInventory(
  state: McpState,
  editorRegistry: EditorAdapter[],
  projectRoot: string
): Promise<McpShellEditorItem[]> {
  const sortedEditors = [...editorRegistry].sort((left, right) =>
    left.name.localeCompare(right.name)
  );

  const items = await Promise.all(
    sortedEditors.map(async (editor) => {
      const installResult = await detectEditorInstalled(editor);
      const projectScopeResult = await buildEditorScope(
        state,
        editor,
        "project",
        projectRoot
      );
      const globalScopeResult = await buildEditorScope(
        state,
        editor,
        "global",
        projectRoot
      );
      const notes = [
        ...projectScopeResult.notes,
        ...globalScopeResult.notes,
      ];

      if (installResult.note) {
        notes.push(installResult.note);
      }

      if (editor.id === "opencode-cli") {
        notes.push("Global OpenCode writes stay skipped by default during mcp-sync apply.");
      }

      return {
        id: editor.id,
        name: editor.name,
        type: editor.type,
        installed: installResult.installed,
        supportsHttp: editor.supportsHttp !== false,
        scopes: {
          project: projectScopeResult.scopeItem,
          global: globalScopeResult.scopeItem,
          instructions: buildInstructionScope(editor, projectRoot),
        },
        notes,
      };
    })
  );

  return items;
}

/**
 * Merges loader fallbacks with structural warnings for first-run and misconfiguration UX.
 *
 * @remarks
 * **I/O:** pure — appends human-readable strings only; does not read the filesystem itself.
 */
export function buildInventoryWarnings(
  services: McpShellServiceItem[],
  filePresence: McpShellFilePresence,
  additionalWarnings: string[]
): string[] {
  const warnings = [...additionalWarnings];

  if (!filePresence.stateFile) {
    warnings.push("No .mcp-sync/state.json found; the shell is showing the first-run empty state.");
  }

  if (!filePresence.instructionsDir) {
    warnings.push("No .mcp-sync/instructions directory exists yet for manual editor guidance.");
  }

  if (!services.some((service) => service.preference !== "disabled")) {
    warnings.push("No services are enabled yet; direct apply flows are currently a no-op.");
  }

  if (services.some((service) => service.missingEnvVars.length > 0)) {
    warnings.push("Some enabled or reviewed services are missing required MCP environment values.");
  }

  return warnings;
}

/**
 * Aggregates counts for the shell summary panel from already-built inventory slices.
 *
 * @remarks
 * **I/O:** pure — safe to call on any consistent snapshot produced by the other `build*` helpers.
 */
export function buildInventorySummary(
  services: McpShellServiceItem[],
  envVars: McpShellEnvVarItem[],
  editorItems: McpShellEditorItem[],
  warnings: string[]
): McpShellInventorySummary {
  const enabledEditorScopes = editorItems.reduce((count, editor) => {
    const scopeCount = Object.values(editor.scopes).filter((scope) => scope.enabled).length;
    return count + scopeCount;
  }, 0);

  return {
    totalServices: services.length,
    enabledServices: services.filter((service) => service.preference !== "disabled").length,
    servicesMissingEnv: services.filter((service) => service.missingEnvVars.length > 0).length,
    totalEnvVars: envVars.length,
    setEnvVars: envVars.filter((item) => item.status === "set").length,
    emptyEnvVars: envVars.filter((item) => item.status === "empty").length,
    missingEnvVars: envVars.filter((item) => item.status === "missing").length,
    installedEditors: editorItems.filter((editor) => editor.installed).length,
    enabledEditorScopes,
    warnings: warnings.length,
  };
}

/**
 * Loads the full MCP shell inventory for a workspace root using injectable filesystem dependencies.
 *
 * @remarks
 * **I/O:** reads `.mcp-sync/state.json`, `.mcp-sync/env`, env example, instructions dir presence, then composes
 * services/env/editors via the `build*` helpers. Honors `dependencies` overrides for tests.
 */
export async function loadMcpShellInventory(options: {
  projectRoot: string;
  dependencies?: Partial<McpShellInventoryDependencies>;
}): Promise<McpShellInventory> {
  const { projectRoot } = options;
  const dependencies: McpShellInventoryDependencies = {
    ...defaultDependencies,
    ...options.dependencies,
  };

  const stateFilePath = join(projectRoot, STATE_FILE_NAME);
  const envFilePath = join(projectRoot, ENV_FILE_NAME);
  const envExampleFilePath = join(projectRoot, ENV_EXAMPLE_FILE_NAME);
  const instructionsDirPath = join(projectRoot, INSTRUCTIONS_DIR_NAME);

  const filePresence: McpShellFilePresence = {
    stateFile: dependencies.pathExists(stateFilePath),
    envFile: dependencies.pathExists(envFilePath),
    envExampleFile: dependencies.pathExists(envExampleFilePath),
    instructionsDir: dependencies.pathExists(instructionsDirPath),
  };

  const warnings: string[] = [];

  const stateResult = await dependencies.readState(stateFilePath);
  const state = stateResult.success ? stateResult.data : createDefaultState();
  if (!stateResult.success) {
    warnings.push(`State file fallback: ${stateResult.error}`);
  }

  const envResult = await dependencies.readEnvFile(envFilePath);
  const env = envResult.success ? envResult.data : {};
  if (!envResult.success) {
    warnings.push(`Env file fallback: ${envResult.error}`);
  }

  const services = buildServiceInventory(state, env, dependencies.serverRegistry);
  const envVars = buildEnvVarInventory(state, env, dependencies.serverRegistry);
  const editors = await buildEditorInventory(state, dependencies.editorRegistry, projectRoot);
  const inventoryWarnings = buildInventoryWarnings(services, filePresence, warnings);
  const summary = buildInventorySummary(services, envVars, editors, inventoryWarnings);

  return {
    projectRoot: toDisplayPath(projectRoot),
    loadedAt: new Date().toISOString(),
    filePresence,
    services,
    envVars,
    editors,
    summary,
    warnings: inventoryWarnings,
  };
}
