/**
 * @fileoverview Jest unit tests for the MCP Ink UI.
 *
 * Flow: inventory-driven actions -> reducer transitions and validation side effects for Ink state.
 *
 * @testing Jest unit: npm test -- --runInBand scripts/ui/cli-ink/reducer.unit.test.ts
 * @see scripts/README.md - Top-level MCP workflow guide for these test helpers.
 * @see scripts/ui/cli-ink/reducer.ts - reducer Ink UI module exercised by this Jest suite.
 * @see scripts/lib/state.ts - state library helper under test in this Jest suite.
 * @documentation reviewed=2026-04-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { describe, expect, it } from "@jest/globals";
import {
  createInitialMcpInkState,
  mcpInkReducer,
} from "./reducer";
import { createDefaultState } from "../../lib/state";
import { validateMcpConfigFiles } from "../../lib/validate-mcp-config-files";
import type { McpInkInventory } from "./types";

/**
 * Builds a deterministic MCP Ink inventory fixture for reducer assertions in this suite.
 *
 * @remarks
 * PURITY: Synchronous canned payload only; frozen timestamps and stable rows keep expectations
 * stable across test runs without filesystem or CLI I/O.
 */
function createInventory(): McpInkInventory {
  return {
    projectRoot: "/tmp/project",
    loadedAt: "2026-03-12T00:00:00.000Z",
    filePresence: {
      stateFile: true,
      envFile: true,
      envExampleFile: true,
      instructionsDir: false,
    },
    services: [
      {
        id: "firecrawl",
        serviceName: "firecrawl",
        transports: ["stdio", "http"],
        preference: "prefer-http",
        enabledServerIds: ["firecrawl-http", "firecrawl-stdio"],
        envVars: ["MCP_FIRECRAWL_API_KEY"],
        missingEnvVars: [],
      },
      {
        id: "mongodb",
        serviceName: "mongodb",
        transports: ["stdio"],
        preference: "disabled",
        enabledServerIds: [],
        envVars: ["MCP_MONGODB_CONNECTION_STRING"],
        missingEnvVars: ["MCP_MONGODB_CONNECTION_STRING"],
      },
    ],
    envVars: [
      {
        name: "MCP_FIRECRAWL_API_KEY",
        status: "set",
        maskedValue: "abcd...9999",
        requiredBy: ["firecrawl"],
        lastValidated: "2026-03-12T00:00:00.000Z",
      },
    ],
    editors: [
      {
        id: "cursor",
        name: "Cursor",
        type: "vscode-ext",
        installed: true,
        supportsHttp: true,
        scopes: {
          project: {
            scope: "project",
            supported: true,
            enabled: true,
            configPath: "~/.cursor/mcp.json",
            exists: true,
            managedServerCount: 2,
            lastSync: "2026-03-12T00:00:00.000Z",
            lastBackup: null,
          },
          global: {
            scope: "global",
            supported: true,
            enabled: false,
            configPath: "~/.cursor/mcp.json",
            exists: true,
            managedServerCount: 2,
            lastSync: null,
            lastBackup: null,
          },
          instructions: {
            scope: "instructions",
            supported: false,
            enabled: false,
            configPath: null,
            exists: null,
            managedServerCount: null,
            lastSync: null,
            lastBackup: null,
          },
        },
        notes: [],
      },
    ],
    summary: {
      totalServices: 2,
      enabledServices: 1,
      servicesMissingEnv: 1,
      totalEnvVars: 1,
      setEnvVars: 1,
      emptyEnvVars: 0,
      missingEnvVars: 0,
      installedEditors: 1,
      enabledEditorScopes: 1,
      warnings: 0,
    },
    warnings: [],
  };
}

describe("mcpInkReducer", () => {
  it("loads inventory and keeps a valid selection", () => {
    const state = createInitialMcpInkState();
    const nextState = mcpInkReducer(state, {
      type: "load-success",
      inventory: createInventory(),
    });

    expect(nextState.status).toBe("ready");
    expect(nextState.selectedSection).toBe("services");
    expect(nextState.selectedIndexBySection.services).toBe(0);
  });

  it("moves across items and sections", () => {
    let state = mcpInkReducer(createInitialMcpInkState(), {
      type: "load-success",
      inventory: createInventory(),
    });

    state = mcpInkReducer(state, { type: "select-next-item" });
    expect(state.selectedIndexBySection.services).toBe(1);

    state = mcpInkReducer(state, { type: "select-next-section" });
    expect(state.selectedSection).toBe("envVars");

    state = mcpInkReducer(state, { type: "select-next-section" });
    expect(state.selectedSection).toBe("editors");

    state = mcpInkReducer(state, { type: "select-next-section" });
    expect(state.selectedSection).toBe("diagnostics");

    state = mcpInkReducer(state, { type: "select-next-section" });
    expect(state.selectedSection).toBe("schemas");

    state = mcpInkReducer(state, { type: "select-next-section" });
    expect(state.selectedSection).toBe("services");
  });

  it("clamps stale indexes when a new inventory is smaller", () => {
    const initialInventory = createInventory();
    let state = mcpInkReducer(createInitialMcpInkState(), {
      type: "load-success",
      inventory: initialInventory,
    });

    state = mcpInkReducer(state, { type: "select-next-item" });
    expect(state.selectedIndexBySection.services).toBe(1);

    const smallerInventory: McpInkInventory = {
      ...initialInventory,
      services: [initialInventory.services[0]],
    };

    state = mcpInkReducer(state, {
      type: "load-success",
      inventory: smallerInventory,
    });

    expect(state.selectedIndexBySection.services).toBe(0);
  });

  it("cycles and clears staged service preferences", () => {
    let state = mcpInkReducer(createInitialMcpInkState(), {
      type: "load-success",
      inventory: createInventory(),
    });

    state = mcpInkReducer(state, { type: "cycle-service-preference" });
    expect(state.draftServicePreferences.firecrawl).toBe("disabled");

    state = mcpInkReducer(state, { type: "clear-service-preference" });
    expect(state.draftServicePreferences.firecrawl).toBeUndefined();
  });

  it("stages and clears env value edits", () => {
    let state = mcpInkReducer(createInitialMcpInkState(), {
      type: "load-success",
      inventory: createInventory(),
    });

    state = mcpInkReducer(state, {
      type: "select-next-section",
    });
    expect(state.selectedSection).toBe("envVars");

    state = mcpInkReducer(state, {
      type: "start-env-edit",
      envVarName: "MCP_FIRECRAWL_API_KEY",
      initialValue: "secret-old",
    });
    state = mcpInkReducer(state, {
      type: "backspace-env-edit",
    });
    state = mcpInkReducer(state, {
      type: "append-env-edit",
      value: "2",
    });
    state = mcpInkReducer(state, {
      type: "submit-env-edit",
    });

    expect(state.draftEnvValues.MCP_FIRECRAWL_API_KEY).toBe("secret-ol2");

    state = mcpInkReducer(state, { type: "clear-env-draft" });
    expect(state.draftEnvValues.MCP_FIRECRAWL_API_KEY).toBeUndefined();
  });

  it("records diagnostics validation runs", () => {
    let state = mcpInkReducer(createInitialMcpInkState(), {
      type: "load-success",
      inventory: createInventory(),
    });

    const summary = validateMcpConfigFiles(createInventory().projectRoot);
    state = mcpInkReducer(state, {
      type: "diagnostics-complete",
      summary,
    });

    expect(state.diagnosticsResults).toEqual(summary.results);
    expect(state.diagnosticsStaticLines.length).toBeGreaterThan(0);
  });

  it("opens and closes the apply review screen", () => {
    let state = mcpInkReducer(createInitialMcpInkState(), {
      type: "load-success",
      inventory: createInventory(),
    });

    state = mcpInkReducer(state, { type: "open-apply-review" });
    expect(state.screen).toBe("apply-review");

    state = mcpInkReducer(state, { type: "close-review" });
    expect(state.screen).toBe("shell");
  });

  it("shows and clears the editor result screen", () => {
    let state = mcpInkReducer(createInitialMcpInkState(), {
      type: "load-success",
      inventory: createInventory(),
    });

    state = mcpInkReducer(state, {
      type: "show-editor-result",
      result: {
        nextState: createDefaultState(),
        items: [
          {
            editorId: "cursor",
            editorName: "Cursor",
            scope: "project",
            outcome: "success",
            message: "create",
          },
        ],
        successCount: 1,
        warningCount: 0,
        errorCount: 0,
        stateWriteError: null,
      },
    });

    expect(state.screen).toBe("editor-result");
    expect(state.editorResult?.successCount).toBe(1);

    state = mcpInkReducer(state, { type: "close-review" });
    expect(state.screen).toBe("shell");
    expect(state.editorResult).toBeNull();
  });

  it("queues and clears editor write targets", () => {
    let state = mcpInkReducer(createInitialMcpInkState(), {
      type: "load-success",
      inventory: createInventory(),
    });

    state = mcpInkReducer(state, { type: "select-next-section" });
    state = mcpInkReducer(state, { type: "select-next-section" });
    expect(state.selectedSection).toBe("editors");

    state = mcpInkReducer(state, {
      type: "toggle-editor-target",
      scope: "project",
    });
    expect(state.draftEditorSelections["cursor:project"]).toBe(true);

    state = mcpInkReducer(state, {
      type: "toggle-editor-target",
      scope: "project",
    });
    expect(state.draftEditorSelections["cursor:project"]).toBeUndefined();

    state = mcpInkReducer(state, {
      type: "toggle-editor-target",
      scope: "project",
    });
    state = mcpInkReducer(state, {
      type: "clear-editor-targets",
    });
    expect(Object.keys(state.draftEditorSelections)).toEqual([]);
  });
});
