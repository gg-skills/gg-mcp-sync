/**
 * @fileoverview Defines the neutral MCP shell inventory model shared by Ink and OpenTUI.
 *
 * Flow: service, env, editor, and presence data -> typed shell inventory model.
 *
 * @example
 * ```typescript
 * const sectionId: McpShellSectionId = "services";
 * ```
 *
 * @testing Jest unit: npm test
 * @see scripts/ui/shared/load-inventory.ts - Builds these shell inventory records.
 * @see scripts/ui/cli-ink/types.ts - Maps the shared inventory into Ink-specific aliases.
 * @documentation reviewed=2026-04-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import type {
  EditorType,
  McpTransport,
  TransportPreference,
} from "../../lib/types";

/** Primary shell navigation sections (services, env, editors, diagnostics, schemas). */
export type McpShellSectionId =
  | "services"
  | "envVars"
  | "editors"
  | "diagnostics"
  | "schemas";

/** Config scope axis for editor rows (project tree, global home, or instructions-only). */
export type McpShellScopeId = "project" | "global" | "instructions";

/** Focus target for programmatic list navigation and deep links into the shell. */
export interface McpShellLaunchTarget {
  section: McpShellSectionId;
  matchKind: "section" | "service" | "envVar" | "editor";
  matchValue: string | null;
}

/** Presence flags for onboarding artifacts (.env, instructions, state) under the project root. */
export interface McpShellFilePresence {
  stateFile: boolean;
  envFile: boolean;
  envExampleFile: boolean;
  instructionsDir: boolean;
}

/** One MCP server row with transports, preference, and derived env requirements. */
export interface McpShellServiceItem {
  id: string;
  serviceName: string;
  transports: McpTransport[];
  preference: TransportPreference;
  enabledServerIds: string[];
  envVars: string[];
  missingEnvVars: string[];
}

/** One environment variable row with masking and downstream consumer hints. */
export interface McpShellEnvVarItem {
  name: string;
  status: "set" | "empty" | "missing";
  maskedValue: string;
  requiredBy: string[];
  lastValidated: string | null;
}

/** Per-scope editor capability row (supported, enabled, paths, sync metadata). */
export interface McpShellEditorScopeItem {
  scope: McpShellScopeId;
  supported: boolean;
  enabled: boolean;
  configPath: string | null;
  exists: boolean | null;
  managedServerCount: number | null;
  lastSync: string | null;
  lastBackup: string | null;
}

/** Editor card aggregating identity, install probe, HTTP support, and per-scope rows. */
export interface McpShellEditorItem {
  id: string;
  name: string;
  type: EditorType;
  installed: boolean;
  supportsHttp: boolean;
  scopes: Record<McpShellScopeId, McpShellEditorScopeItem>;
  notes: string[];
}

/** Roll-up counters for shell footer and warning badges. */
export interface McpShellInventorySummary {
  totalServices: number;
  enabledServices: number;
  servicesMissingEnv: number;
  totalEnvVars: number;
  setEnvVars: number;
  emptyEnvVars: number;
  missingEnvVars: number;
  installedEditors: number;
  enabledEditorScopes: number;
  warnings: number;
}

/** Full neutral inventory snapshot produced by `load-inventory` for Ink/OpenTUI shells. */
export interface McpShellInventory {
  projectRoot: string;
  loadedAt: string;
  filePresence: McpShellFilePresence;
  services: McpShellServiceItem[];
  envVars: McpShellEnvVarItem[];
  editors: McpShellEditorItem[];
  summary: McpShellInventorySummary;
  warnings: string[];
}
