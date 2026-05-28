/**
 * @fileoverview Jest unit tests for the MCP Ink UI.
 *
 * Flow: synthetic inventory + Ink render -> smoke assertions for shell output and reducer wiring.
 *
 * @testing Jest unit: npm test -- --runInBand scripts/ui/cli-ink/app-render.unit.test.ts
 * @see scripts/README.md - Top-level MCP workflow guide for these test helpers.
 * @see scripts/ui/cli-ink/app.tsx - MCP Ink app module exercised by this Jest suite.
 * @see scripts/ui/cli-ink/reducer.ts - reducer Ink UI module exercised by this Jest suite.
 * @documentation reviewed=2026-04-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { describe, expect, it } from "@jest/globals";
import { PassThrough } from "node:stream";
import React from "react";
import { render } from "ink";
import { McpInkShell } from "./app";
import { createInitialMcpInkState } from "./reducer";
import type { McpInkInventory, McpInkState } from "./types";

/**
 * Builds a deterministic synthetic MCP inventory snapshot for Ink shell render assertions.
 *
 * @remarks
 * Mirrors scanner-shaped fields without filesystem or live environment coupling so output stays stable across CI.
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
      warnings: 1,
    },
    warnings: ["No .mcp-sync/instructions directory exists yet for manual editor guidance."],
  };
}

describe("McpInkShell", () => {
  it("renders the shell with summary and selected detail", async () => {
    const inventory = createInventory();
    const state: McpInkState = {
      ...createInitialMcpInkState(),
      status: "ready",
      inventory,
    };
    const stdout = new PassThrough();
    Object.assign(stdout, {
      columns: 120,
      rows: 40,
      isTTY: true,
    });
    let output = "";
    stdout.on("data", (chunk: Buffer | string) => {
      output += chunk.toString();
    });

    const instance = render(React.createElement(McpInkShell, { inventory, state }), {
      stdout: stdout as unknown as NodeJS.WriteStream,
      stdin: process.stdin,
      stderr: process.stderr,
      debug: true,
      patchConsole: false,
    });
    const exitPromise = instance.waitUntilExit();

    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    instance.unmount();
    await exitPromise;

    expect(output).toContain("MCP Ink");
    expect(output).toContain("Services");
    expect(output).toContain("firecrawl");
    expect(output).toContain("Summary");
    expect(output).toContain("Warnings");
  });
});
