/**
 * @fileoverview Jest unit tests for the MCP apply controller.
 * @testing Jest unit: npm test -- --runInBand scripts/controllers/apply-controller.unit.test.ts
 * @see scripts/README.md - Top-level MCP workflow guide for these test helpers.
 * @see scripts/controllers/apply-controller.ts - apply-controller controller module under test in this Jest suite.
 * @see scripts/lib/types.ts - Shared MCP state types imported by this Jest suite.
 * @documentation reviewed=2026-04-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { describe, expect, it } from "@jest/globals";
import {
  buildApplyBackupEditorState,
  buildApplyTargets,
  buildMcpApplyPlan,
  getServersForApplyTarget,
  parseMcpApplyArgs,
} from "./apply-controller";
import type { McpState } from "../lib/types";
import { getServersByIds } from "../servers";

/**
 * Deterministic MCP-state fixture for apply-controller targeting and server-selection assertions.
 *
 * @remarks
 * PURITY: In-memory literals only. Paths stay under `/tmp` with fixed timestamps so expectations stay
 * diff-stable. Mixes enabled Cursor project scope, OpenCode/Codex globals, and paired HTTP/stdio
 * Firecrawl servers to exercise policy skips and transport preferences.
 *
 * @returns Editor scopes and service preferences aligned with the suite's snapshot expectations.
 */
function createState(): McpState {
  return {
    version: "1.0.0",
    enabledServers: ["firecrawl-http", "firecrawl-stdio"],
    servicePreferences: {
      firecrawl: {
        preference: "prefer-http",
        lastModified: "2026-03-12T00:00:00.000Z",
      },
    },
    serverSettings: {},
    envVars: {},
    editors: {
      cursor: {
        project: {
          enabled: true,
          configPath: "/tmp/project/.cursor/mcp.json",
          lastSync: null,
          lastBackup: null,
        },
        global: {
          enabled: false,
          configPath: "/tmp/home/.cursor/mcp.json",
          lastSync: null,
          lastBackup: null,
        },
      },
      "opencode-cli": {
        project: {
          enabled: false,
          configPath: "/tmp/project/.opencode.json",
          lastSync: null,
          lastBackup: null,
        },
        global: {
          enabled: true,
          configPath: "/tmp/home/.config/opencode/opencode.json",
          lastSync: null,
          lastBackup: null,
        },
      },
      "codex-cli": {
        project: {
          enabled: false,
          configPath: "/tmp/project/.codex/config.toml",
          lastSync: null,
          lastBackup: null,
        },
        global: {
          enabled: true,
          configPath: "/tmp/home/.codex/config.toml",
          lastSync: null,
          lastBackup: null,
        },
      },
    },
    lastModified: "2026-03-12T00:00:00.000Z",
    lastModifiedBy: "setup",
  };
}

describe("apply-controller", () => {
  it("parses CLI arguments including editor flags and policy flags", () => {
    expect(
      parseMcpApplyArgs([
        "--editor",
        "cursor",
        "--dry-run",
        "--include-opencode-global",
        "--quiet",
      ])
    ).toEqual({
      dryRun: true,
      force: false,
      quiet: true,
      includeOpencodeGlobal: true,
      editorId: "cursor",
      showHelp: false,
    });
  });

  it("builds apply targets from enabled editor scopes", () => {
    expect(buildApplyTargets(createState())).toEqual([
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
      {
        editorId: "codex-cli",
        editorName: "Codex CLI",
        scope: "global",
        configPath: "/tmp/home/.codex/config.toml",
      },
    ]);
  });

  it("marks opencode global as policy-skipped by default", () => {
    const state = createState();
    const enabledServers = getServersByIds(state.enabledServers);
    const plan = buildMcpApplyPlan({
      enabledServers,
      allTargets: buildApplyTargets(state),
      requestedEditorId: null,
      includeOpencodeGlobal: false,
    });

    expect(plan.status).toBe("ready");
    expect(plan.targets.map((target) => `${target.editorId}:${target.scope}`)).toEqual([
      "cursor:project",
      "codex-cli:global",
    ]);
    expect(plan.policySkippedTargets.map((target) => `${target.target.editorId}:${target.target.scope}`)).toEqual([
      "opencode-cli:global",
    ]);
  });

  it("returns an editor-not-enabled no-op when a requested editor is unavailable", () => {
    const state = createState();
    const enabledServers = getServersByIds(state.enabledServers);
    const plan = buildMcpApplyPlan({
      enabledServers,
      allTargets: buildApplyTargets(state),
      requestedEditorId: "windsurf",
      includeOpencodeGlobal: false,
    });

    expect(plan.status).toBe("editor-not-enabled");
    expect(plan.noOpReason).toContain("windsurf");
  });

  it("builds a backup subset only for targeted editor scopes", () => {
    const state = createState();
    const backupState = buildApplyBackupEditorState(state, [
      {
        editorId: "cursor",
        editorName: "Cursor",
        scope: "project",
        configPath: "/tmp/project/.cursor/mcp.json",
      },
      {
        editorId: "codex-cli",
        editorName: "Codex CLI",
        scope: "global",
        configPath: "/tmp/home/.codex/config.toml",
      },
    ]);

    expect(Object.keys(backupState)).toEqual(["cursor", "codex-cli"]);
    expect(backupState.cursor.project.enabled).toBe(true);
    expect(backupState.cursor.global.enabled).toBe(false);
    expect(backupState["codex-cli"].project.enabled).toBe(false);
    expect(backupState["codex-cli"].global.enabled).toBe(true);
  });

  it("filters to stdio servers for stdio-only editors when service preferences exist", () => {
    const state = createState();
    const enabledServers = getServersByIds(state.enabledServers);

    expect(
      getServersForApplyTarget(state, enabledServers, "codex-cli").map((server) => server.id)
    ).toEqual(["firecrawl-stdio"]);
    expect(
      getServersForApplyTarget(state, enabledServers, "cursor").map((server) => server.id)
    ).toEqual(["firecrawl-http"]);
  });

  it("includes Asana's stdio bridge for both stdio-only and HTTP-capable editors", () => {
    const baseState = createState();
    const state: McpState = {
      ...baseState,
      enabledServers: ["asana-http-bridge-stdio"],
      servicePreferences: {
        asana: {
          preference: "stdio-only",
          lastModified: "2026-05-12T00:00:00.000Z",
        },
      },
    };
    const enabledServers = getServersByIds(state.enabledServers);

    expect(
      getServersForApplyTarget(state, enabledServers, "codex-cli").map((server) => server.id)
    ).toEqual(["asana-http-bridge-stdio"]);
    expect(
      getServersForApplyTarget(state, enabledServers, "cursor").map((server) => server.id)
    ).toEqual(["asana-http-bridge-stdio"]);
  });
});
