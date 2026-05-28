/**
 * @fileoverview Re-exports the MCP utility library surface for convenience imports.
 *
 * Flow: library modules -> single barrel export surface.
 *
 * @example
 * ```typescript
 * import { createDefaultState } from "./index";
 * ```
 *
 * @testing Jest unit: npm test
 * @see scripts/lib/types.ts - Provides the shared core types re-exported here.
 * @see scripts/setup.ts - Consumes the library surface during setup flows.
 * @documentation reviewed=2026-04-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

// Core types
export * from "./types";

// JSONC parsing
export * from "./jsonc";

// Environment variables
export * from "./env";

// State management
export * from "./state";

// Persisted server settings to adapter-config mappings
export * from "./server-settings";

// File utilities
export * from "./file-utils";

// Backup management
export * from "./backup";

// Dry-run validation
export * from "./dry-run";

// Config writing
export * from "./config-writer";

// Interactive prompts
export * from "./prompts";
