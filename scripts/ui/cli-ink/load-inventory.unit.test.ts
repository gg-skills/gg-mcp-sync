/**
 * @fileoverview Jest unit tests for the MCP Ink UI.
 *
 * Flow: synthetic state + adapters -> inventory loader merges env, servers, and editor metadata.
 *
 * @testing Jest unit: npm test -- --runInBand scripts/ui/cli-ink/load-inventory.unit.test.ts
 * @see scripts/README.md - Top-level MCP workflow guide for these test helpers.
 * @see scripts/lib/types.ts - Shared MCP state types imported by this Jest suite.
 * @see scripts/lib/state.ts - state library helper under test in this Jest suite.
 * @documentation reviewed=2026-04-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { describe, expect, it } from "@jest/globals";
import type {
  EditorAdapter,
  EnvVars,
  McpConfigFile,
  McpServerTemplate,
  McpState,
} from "../../lib/types";
import { createDefaultState } from "../../lib/state";
import { loadMcpInkInventory } from "./load-inventory";

/**
 * Builds a minimal `McpServerTemplate` fixture for inventory assembly tests.
 *
 * @remarks
 * PURITY: derives `configs.standard` from id and transport only; no filesystem or network I/O.
 */
function createServer(
  id: string,
  transport: "stdio" | "http",
  envVars: string[]
): McpServerTemplate {
  return {
    id,
    name: id,
    transport,
    envVars,
    configs: {
      standard: () =>
        transport === "stdio"
          ? { command: "npx", args: [id] }
          : { url: `https://${id}.example.com` },
    },
  };
}

/**
 * Builds a synthetic `McpConfigFile` with placeholder `mcpServers` entries for editor read paths.
 *
 * @remarks
 * USAGE: `serverCount` controls how many `server-{index}` keys exist so inventory summaries can vary without real JSON.
 */
function createEditorConfig(path: string, serverCount: number): McpConfigFile {
  const servers: Record<string, { command: string }> = {};
  for (let index = 0; index < serverCount; index += 1) {
    servers[`server-${index}`] = { command: "npx" };
  }

  return {
    path,
    format: "json",
    rawContent: "{}",
    servers,
    exists: true,
  };
}

/**
 * Builds a stub `EditorAdapter` that returns `createEditorConfig` results for configured scopes.
 *
 * @remarks
 * `writeConfig` always reports success with a no-op-style payload so apply flows stay out of scope for these tests.
 */
function createEditor(options: {
  id: string;
  name: string;
  supportsHttp?: boolean;
  projectConfigPath?: string;
  globalConfigPath?: string;
  installed?: boolean;
  projectServerCount?: number;
  globalServerCount?: number;
}): EditorAdapter {
  return {
    id: options.id,
    name: options.name,
    type: "cli",
    supportsHttp: options.supportsHttp,
    format: options.projectConfigPath || options.globalConfigPath ? "mcpServers" : "ui-only",
    projectConfig: options.projectConfigPath
      ? {
          path: options.projectConfigPath,
          key: "mcpServers",
          format: "json",
        }
      : undefined,
    globalConfig: options.globalConfigPath
      ? {
          path: options.globalConfigPath,
          key: "mcpServers",
          format: "json",
        }
      : undefined,
    detectInstalled: async () => options.installed ?? true,
    readConfig: async (scope) => {
      if (scope === "project" && options.projectConfigPath) {
        return createEditorConfig(options.projectConfigPath, options.projectServerCount ?? 0);
      }

      if (scope === "global" && options.globalConfigPath) {
        return createEditorConfig(options.globalConfigPath, options.globalServerCount ?? 0);
      }

      return null;
    },
    writeConfig: async () => ({
      success: true,
      targetPath: options.projectConfigPath ?? options.globalConfigPath ?? "noop",
      operation: "skip",
      currentContent: null,
      proposedContent: "{}",
      diff: "",
      errors: [],
      warnings: [],
    }),
  };
}

describe("loadMcpInkInventory", () => {
  it("builds services, env vars, editors, and warnings from the current state", async () => {
    const state: McpState = {
      ...createDefaultState(),
      enabledServers: ["firecrawl-http", "firecrawl-stdio", "mongodb-stdio"],
      servicePreferences: {
        firecrawl: {
          preference: "prefer-http",
          lastModified: "2026-03-12T00:00:00.000Z",
        },
        mongodb: {
          preference: "stdio-only",
          lastModified: "2026-03-12T00:00:00.000Z",
        },
      },
      envVars: {
        MCP_FIRECRAWL_API_KEY: {
          isSet: true,
          lastValidated: "2026-03-12T00:00:00.000Z",
        },
      },
      editors: {
        cursor: {
          project: {
            enabled: true,
            configPath: "/tmp/project/.cursor/mcp.json",
            lastSync: "2026-03-12T00:00:00.000Z",
            lastBackup: null,
          },
          global: {
            enabled: false,
            configPath: "/tmp/home/.cursor/mcp.json",
            lastSync: null,
            lastBackup: null,
          },
        },
      },
    };
    const env: EnvVars = {
      MCP_FIRECRAWL_API_KEY: "abcd1234secret9999",
      MCP_MONGODB_CONNECTION_STRING: "",
    };
    const serverRegistry = [
      createServer("firecrawl-stdio", "stdio", ["MCP_FIRECRAWL_API_KEY"]),
      createServer("firecrawl-http", "http", ["MCP_FIRECRAWL_API_KEY"]),
      createServer("mongodb-stdio", "stdio", ["MCP_MONGODB_CONNECTION_STRING"]),
    ];
    const editorRegistry = [
      createEditor({
        id: "cursor",
        name: "Cursor",
        projectConfigPath: ".cursor/mcp.json",
        globalConfigPath: "~/.cursor/mcp.json",
        projectServerCount: 2,
      }),
      createEditor({
        id: "opencode-cli",
        name: "OpenCode CLI",
        supportsHttp: false,
        globalConfigPath: "~/.config/opencode/opencode.json",
        globalServerCount: 1,
      }),
    ];

    const inventory = await loadMcpInkInventory({
      projectRoot: "/tmp/project",
      dependencies: {
        readState: async () => ({ success: true, data: state }),
        readEnvFile: async () => ({ success: true, data: env }),
        pathExists: (path) => path.endsWith(".mcp-sync/env"),
        serverRegistry,
        editorRegistry,
      },
    });

    expect(inventory.summary.totalServices).toBe(2);
    expect(inventory.summary.enabledServices).toBe(2);
    expect(inventory.summary.servicesMissingEnv).toBe(1);
    expect(inventory.summary.setEnvVars).toBe(1);
    expect(inventory.summary.emptyEnvVars).toBe(1);
    expect(inventory.summary.installedEditors).toBe(2);
    expect(inventory.summary.enabledEditorScopes).toBe(1);

    expect(inventory.services[0]?.serviceName).toBe("firecrawl");
    expect(inventory.services[0]?.preference).toBe("prefer-http");
    expect(inventory.services[0]?.enabledServerIds).toEqual([
      "firecrawl-http",
      "firecrawl-stdio",
    ]);
    expect(inventory.envVars[0]?.maskedValue).toBe("abcd...9999");
    expect(inventory.editors[1]?.notes).toContain(
      "Global OpenCode writes stay skipped by default during mcp-sync apply."
    );
    expect(inventory.warnings).toContain(
      "No .mcp-sync/state.json found; the shell is showing the first-run empty state."
    );
  });

  it("falls back to empty state when the state file cannot be read", async () => {
    const inventory = await loadMcpInkInventory({
      projectRoot: "/tmp/project",
      dependencies: {
        readState: async () => ({ success: false, error: "broken state file" }),
        readEnvFile: async () => ({ success: true, data: {} }),
        pathExists: () => false,
        serverRegistry: [createServer("firecrawl-stdio", "stdio", ["MCP_FIRECRAWL_API_KEY"])],
        editorRegistry: [],
      },
    });

    expect(inventory.services[0]?.preference).toBe("disabled");
    expect(inventory.warnings).toContain("State file fallback: broken state file");
    expect(inventory.warnings).toContain(
      "No services are enabled yet; direct apply flows are currently a no-op."
    );
  });
});
