/**
 * @fileoverview MCP editor registry barrel that assembles every editor adapter and exposes category filters for consumers.
 *
 * Flow: per-editor adapter modules -> registry barrel -> typed category filters for CLI and Ink surfaces.
 *
 * @example
 * ```typescript
 * import { getCliTools, getStandaloneEditors } from "./index";
 * 
 * const cliEditors = getCliTools();
 * const standaloneEditors = getStandaloneEditors();
 * ```
 *
 * @testing Jest unit: npm test -- scripts/editors/editor-registry.unit.test.ts
 * @see scripts/editors/editor-registry.unit.test.ts - Jest unit tests that verify registry metadata completeness and categorization.
 * @documentation reviewed=2026-04-30 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import type { EditorAdapter } from "../lib/types";

// VSCode Extensions
import { cursorAdapter } from "./cursor";
import { windsurfAdapter } from "./windsurf";
import { vscodeAdapter } from "./vscode";
import { clineExtAdapter } from "./cline-ext";
import { factoryExtAdapter } from "./factory-ext";
import { verdentExtAdapter } from "./verdent-ext";
import { augmentExtAdapter } from "./augment-ext";
import { codyExtAdapter } from "./cody-ext";
import { traeExtAdapter } from "./trae-ext";
import { kiloCodeExtAdapter } from "./kilo-code-ext";
import { rooCodeExtAdapter } from "./roo-code-ext";
import { qodoTabnineExtAdapter } from "./qodo-tabnine-ext";
import { continueExtAdapter } from "./continue-ext";

// CLI Tools
import { claudeCliAdapter } from "./claude-cli";
import { geminiCliAdapter } from "./gemini-cli";
import { amazonqCliAdapter } from "./amazonq-cli";
import { clineCliAdapter } from "./cline-cli";
import { auggieCliAdapter } from "./auggie-cli";
import { ampCliAdapter } from "./amp-cli";
import { factoryCliAdapter } from "./factory-cli";
import { traeCliAdapter } from "./trae-cli";
import { gooseCliAdapter } from "./goose-cli";
import { codexCliAdapter } from "./codex-cli";
import { opencodeCliAdapter } from "./opencode-cli";
import { crushCliAdapter } from "./crush-cli";
import { piCliAdapter } from "./pi-cli";
import { kimiCliAdapter } from "./kimi-cli";

// Standalone Editors
import { zedAdapter } from "./zed";
import { antigravityAdapter } from "./antigravity";
import { jetbrainsAdapter } from "./jetbrains";
import { factoryIdeAdapter } from "./factory-ide";
import { verdentDeckAdapter } from "./verdent-deck";
import { kiroAdapter } from "./kiro";
import { warpTerminalAdapter } from "./warp-terminal";
import { windsurfNextAdapter } from "./windsurf-next";

// Additional VSCode Extensions (UI-only)
import { refactExtAdapter } from "./refact-ext";

// Web-based
import { replitAdapter } from "./replit";

/**
 * All editor adapters.
 */
export const editors: EditorAdapter[] = [
  // VSCode Extensions
  cursorAdapter,
  windsurfAdapter,
  vscodeAdapter,
  clineExtAdapter,
  factoryExtAdapter,
  verdentExtAdapter,
  augmentExtAdapter,
  codyExtAdapter,
  traeExtAdapter,
  kiloCodeExtAdapter,
  rooCodeExtAdapter,
  qodoTabnineExtAdapter,
  continueExtAdapter,
  refactExtAdapter,
  // CLI Tools
  claudeCliAdapter,
  geminiCliAdapter,
  amazonqCliAdapter,
  clineCliAdapter,
  auggieCliAdapter,
  ampCliAdapter,
  factoryCliAdapter,
  traeCliAdapter,
  gooseCliAdapter,
  codexCliAdapter,
  opencodeCliAdapter,
  crushCliAdapter,
  piCliAdapter,
  kimiCliAdapter,
  // Standalone Editors
  zedAdapter,
  antigravityAdapter,
  jetbrainsAdapter,
  factoryIdeAdapter,
  verdentDeckAdapter,
  kiroAdapter,
  warpTerminalAdapter,
  windsurfNextAdapter,
  // Web-based
  replitAdapter,
];

/**
 * Return the editor adapter matching the given identifier, or undefined if not found.
 */
export function getEditorById(id: string): EditorAdapter | undefined {
  return editors.find((e) => e.id === id);
}

/**
 * Return all editor adapters whose type matches the requested category.
 */
export function getEditorsByType(type: EditorAdapter["type"]): EditorAdapter[] {
  return editors.filter((e) => e.type === type);
}

/**
 * Get all VSCode extension adapters.
 */
export function getVscodeExtensions(): EditorAdapter[] {
  return editors.filter((e) => e.type === "vscode-ext");
}

/**
 * Get all CLI tool adapters.
 */
export function getCliTools(): EditorAdapter[] {
  return editors.filter((e) => e.type === "cli");
}

/**
 * Get all standalone editor adapters.
 */
export function getStandaloneEditors(): EditorAdapter[] {
  return editors.filter((e) => e.type === "standalone");
}

/**
 * Get all web-based adapters.
 */
export function getWebEditors(): EditorAdapter[] {
  return editors.filter((e) => e.type === "web");
}

/**
 * Get editors that support project-level config.
 */
export function getEditorsWithProjectConfig(): EditorAdapter[] {
  return editors.filter((e) => e.projectConfig !== undefined);
}

/**
 * Get editors that support global config.
 */
export function getEditorsWithGlobalConfig(): EditorAdapter[] {
  return editors.filter((e) => e.globalConfig !== undefined);
}

/**
 * Get editors that are UI-only (no file-based config).
 */
export function getUiOnlyEditors(): EditorAdapter[] {
  return editors.filter((e) => e.format === "ui-only");
}

// Re-export individual adapters
export {
  // VSCode Extensions
  cursorAdapter,
  windsurfAdapter,
  vscodeAdapter,
  clineExtAdapter,
  factoryExtAdapter,
  verdentExtAdapter,
  augmentExtAdapter,
  codyExtAdapter,
  traeExtAdapter,
  kiloCodeExtAdapter,
  rooCodeExtAdapter,
  qodoTabnineExtAdapter,
  continueExtAdapter,
  refactExtAdapter,
  // CLI Tools
  claudeCliAdapter,
  geminiCliAdapter,
  amazonqCliAdapter,
  clineCliAdapter,
  auggieCliAdapter,
  ampCliAdapter,
  factoryCliAdapter,
  traeCliAdapter,
  gooseCliAdapter,
  codexCliAdapter,
  opencodeCliAdapter,
  crushCliAdapter,
  piCliAdapter,
  kimiCliAdapter,
  // Standalone Editors
  zedAdapter,
  antigravityAdapter,
  jetbrainsAdapter,
  factoryIdeAdapter,
  verdentDeckAdapter,
  kiroAdapter,
  warpTerminalAdapter,
  windsurfNextAdapter,
  // Web-based
  replitAdapter,
};
