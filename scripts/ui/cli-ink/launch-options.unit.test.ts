/**
 * @fileoverview Jest unit tests for the MCP Ink UI.
 *
 * Flow: argv fixtures + inventory -> launch option parsing and target resolution assertions.
 *
 * @testing Jest unit: npm test -- --runInBand scripts/ui/cli-ink/launch-options.unit.test.ts
 * @see scripts/README.md - Top-level MCP workflow guide for these test helpers.
 * @see scripts/ui/cli-ink/launch-options.ts - launch-options Ink UI module exercised by this Jest suite.
 * @see scripts/ui/cli-ink/types.ts - types Ink UI module exercised by this Jest suite.
 * @documentation reviewed=2026-04-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { describe, expect, it } from "@jest/globals";
import {
  parseMcpInkLaunchOptions,
  resolveMcpInkLaunchTarget,
} from "./launch-options";
import type { McpInkInventory } from "./types";

/**
 * Builds a deterministic synthetic MCP inventory snapshot for launch-option and target-resolution assertions.
 *
 * @remarks
 * Mirrors scanner-shaped fields without filesystem or live environment coupling so expectations stay stable across CI.
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
      totalServices: 1,
      enabledServices: 1,
      servicesMissingEnv: 0,
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

describe("parseMcpInkLaunchOptions", () => {
  it("parses a section-only launch", () => {
    expect(parseMcpInkLaunchOptions(["--section", "diagnostics"])).toEqual({
      helpRequested: false,
      target: {
        section: "diagnostics",
        matchKind: "section",
        matchValue: null,
      },
    });

    expect(parseMcpInkLaunchOptions(["--section", "env"])).toEqual({
      helpRequested: false,
      target: {
        section: "envVars",
        matchKind: "section",
        matchValue: null,
      },
    });
  });

  it("parses a focused editor launch", () => {
    expect(parseMcpInkLaunchOptions(["--editor", "cursor"])).toEqual({
      helpRequested: false,
      target: {
        section: "editors",
        matchKind: "editor",
        matchValue: "cursor",
      },
    });
  });

  it("rejects competing focus flags", () => {
    expect(() => {
      parseMcpInkLaunchOptions(["--service", "firecrawl", "--editor", "cursor"]);
    }).toThrow("Use only one of --service, --env, or --editor at a time.");
  });
});

describe("resolveMcpInkLaunchTarget", () => {
  it("focuses a matching service", () => {
    const inventory = createInventory();
    const resolved = resolveMcpInkLaunchTarget(inventory, {
      section: "services",
      matchKind: "service",
      matchValue: "firecrawl",
    });

    expect(resolved.selectedSection).toBe("services");
    expect(resolved.selectedIndexBySection.services).toBe(0);
    expect(resolved.noticeMessage).toContain("Focused service");
  });

  it("falls back cleanly when the target is missing", () => {
    const inventory = createInventory();
    const resolved = resolveMcpInkLaunchTarget(inventory, {
      section: "editors",
      matchKind: "editor",
      matchValue: "missing-editor",
    });

    expect(resolved.selectedSection).toBe("editors");
    expect(resolved.selectedIndexBySection.editors).toBeUndefined();
    expect(resolved.noticeMessage).toContain("was not found");
  });
});
