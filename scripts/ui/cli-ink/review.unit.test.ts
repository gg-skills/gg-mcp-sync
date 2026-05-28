/**
 * @fileoverview Jest unit tests for the MCP Ink UI.
 *
 * Flow: inventory snapshots -> apply review models and derived target lists for Ink previews.
 *
 * @testing Jest unit: npm test -- --runInBand scripts/ui/cli-ink/review.unit.test.ts
 * @see scripts/README.md - Top-level MCP workflow guide for these test helpers.
 * @see scripts/ui/cli-ink/reducer.ts - reducer Ink UI module exercised by this Jest suite.
 * @see scripts/ui/cli-ink/review.ts - review Ink UI module exercised by this Jest suite.
 * @documentation reviewed=2026-04-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { describe, expect, it } from "@jest/globals";
import { createInitialMcpInkState } from "./reducer";
import {
  buildApplyReviewModel,
  buildApplyTargetsFromInventory,
} from "./review";
import type { McpInkInventory, McpInkState } from "./types";

/**
 * Builds a deterministic MCP Ink inventory fixture for review helper assertions in this suite.
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
        preference: "disabled",
        enabledServerIds: [],
        envVars: ["MCP_FIRECRAWL_API_KEY"],
        missingEnvVars: [],
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
            configPath: "/tmp/project/.cursor/mcp.json",
            exists: true,
            managedServerCount: 0,
            lastSync: null,
            lastBackup: null,
          },
          global: {
            scope: "global",
            supported: true,
            enabled: false,
            configPath: "/tmp/home/.cursor/mcp.json",
            exists: true,
            managedServerCount: 0,
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
      {
        id: "opencode-cli",
        name: "OpenCode CLI",
        type: "cli",
        installed: true,
        supportsHttp: true,
        scopes: {
          project: {
            scope: "project",
            supported: false,
            enabled: false,
            configPath: null,
            exists: null,
            managedServerCount: null,
            lastSync: null,
            lastBackup: null,
          },
          global: {
            scope: "global",
            supported: true,
            enabled: true,
            configPath: "/tmp/home/.config/opencode/opencode.json",
            exists: true,
            managedServerCount: 0,
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
      totalServices: 1,
      enabledServices: 0,
      servicesMissingEnv: 0,
      totalEnvVars: 1,
      setEnvVars: 1,
      emptyEnvVars: 0,
      missingEnvVars: 0,
      installedEditors: 2,
      enabledEditorScopes: 2,
      warnings: 0,
    },
    warnings: [],
  };
}

describe("mcp ink review helpers", () => {
  it("builds apply targets only from enabled project/global scopes", () => {
    expect(buildApplyTargetsFromInventory(createInventory())).toEqual([
      {
        editorId: "cursor",
        editorName: "Cursor",
        scope: "project",
        configPath: "/tmp/project/.cursor/mcp.json",
      },
      {
        editorId: "opencode-cli",
        editorName: "OpenCode CLI",
        scope: "global",
        configPath: "/tmp/home/.config/opencode/opencode.json",
      },
    ]);
  });

  it("builds an apply preview that reflects staged shell changes and policy skips", () => {
    const inventory = createInventory();
    const state: McpInkState = {
      ...createInitialMcpInkState(),
      status: "ready",
      inventory,
      draftServicePreferences: {
        firecrawl: "prefer-http",
      },
      draftEnvValues: {
        MCP_FIRECRAWL_API_KEY: "new-secret",
      },
      draftEditorSelections: {
        "cursor:global": true,
      },
    };

    const review = buildApplyReviewModel(inventory, state);

    expect(review.plan.status).toBe("ready");
    expect(review.previewEnabledServerIds).toEqual(["firecrawl-http", "firecrawl-stdio"]);
    expect(review.stagedEditorChangeCount).toBe(1);
    expect(review.stagedEditorWrites).toEqual([
      {
        editorId: "cursor",
        editorName: "Cursor",
        scope: "global",
        description: "~/.cursor/mcp.json",
      },
    ]);
    expect(review.plan.targets.map((target) => `${target.editorId}:${target.scope}`)).toEqual([
      "cursor:project",
    ]);
    expect(
      review.plan.policySkippedTargets.map((target) => `${target.target.editorId}:${target.target.scope}`)
    ).toEqual(["opencode-cli:global"]);
    expect(review.notices).toContain(
      "Preview includes staged shell changes that are not saved to disk yet."
    );
    expect(review.notices).toContain(
      "Direct mcp-sync apply still reads .mcp-sync/state.json from disk until queued editor writes run."
    );
  });
});
