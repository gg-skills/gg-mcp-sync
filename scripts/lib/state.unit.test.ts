/**
 * @fileoverview Jest unit tests for MCP library helpers.
 * @testing Jest unit: npm test -- --runInBand scripts/lib/state.unit.test.ts
 * @see scripts/README.md - Top-level MCP workflow guide for these test helpers.
 * @documentation reviewed=2026-04-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { jest, describe, it, expect, beforeEach } from "@jest/globals";

// Mock modules before imports
jest.unstable_mockModule("fs/promises", () => ({
  mkdir: jest.fn(),
  readFile: jest.fn(),
  writeFile: jest.fn(),
}));

jest.unstable_mockModule("fs", () => ({
  existsSync: jest.fn(),
}));

const mockFsPromises = await Promise.resolve(import("fs/promises"));
const mockFs = await Promise.resolve(import("fs"));

// Import module under test
const {
  STATE_FILE_NAME,
  STATE_VERSION,
  createDefaultState,
  createDefaultEditorScopeState,
  createDefaultEditorState,
  readState,
  writeState,
  enableServer,
  disableServer,
  toggleServer,
  setEnabledServers,
  isServerEnabled,
  updateEnvVarState,
  updateEnvVarsState,
  getEditorState,
  updateEditorState,
  enableEditorScope,
  disableEditorScope,
  recordEditorSync,
  recordEditorBackup,
  markModified,
  formatTimestamp,
  getStateSummary,
  updateServerSettings,
} = await Promise.resolve(import("./state"));

describe("state", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================================================
  // Constants
  // ==========================================================================

  describe("constants", () => {
    it("STATE_FILE_NAME is .mcp-sync/state.json", () => {
      expect(STATE_FILE_NAME).toBe(".mcp-sync/state.json");
    });

    it("STATE_VERSION is 1.0.0", () => {
      expect(STATE_VERSION).toBe("1.0.0");
    });
  });

  // ==========================================================================
  // Default State Creators
  // ==========================================================================

  describe("createDefaultState", () => {
    it("creates state with correct version", () => {
      const state = createDefaultState();
      expect(state.version).toBe("1.0.0");
    });

    it("creates state with empty enabledServers", () => {
      const state = createDefaultState();
      expect(state.enabledServers).toEqual([]);
    });

    it("creates state with empty envVars", () => {
      const state = createDefaultState();
      expect(state.envVars).toEqual({});
    });

    it("creates state with empty serverSettings", () => {
      const state = createDefaultState();
      expect(state.serverSettings).toEqual({});
    });

    it("creates state with empty editors", () => {
      const state = createDefaultState();
      expect(state.editors).toEqual({});
    });

    it("creates state with lastModifiedBy as setup", () => {
      const state = createDefaultState();
      expect(state.lastModifiedBy).toBe("setup");
    });
  });

  describe("createDefaultEditorScopeState", () => {
    it("creates disabled scope state", () => {
      const scope = createDefaultEditorScopeState("/test/path");

      expect(scope.enabled).toBe(false);
      expect(scope.configPath).toBe("/test/path");
      expect(scope.lastSync).toBeNull();
      expect(scope.lastBackup).toBeNull();
    });
  });

  describe("createDefaultEditorState", () => {
    it("creates editor state with both scopes", () => {
      const editor = createDefaultEditorState("/project/path", "/global/path");

      expect(editor.project.configPath).toBe("/project/path");
      expect(editor.global.configPath).toBe("/global/path");
    });

    it("handles null paths", () => {
      const editor = createDefaultEditorState(null, null);

      expect(editor.project.configPath).toBe("");
      expect(editor.global.configPath).toBe("");
    });
  });

  // ==========================================================================
  // Read Functions
  // ==========================================================================

  describe("readState", () => {
    it("returns default state when file does not exist", async () => {
      (mockFs.existsSync as jest.MockedFunction<typeof mockFs.existsSync>).mockReturnValue(false);

      const result = await readState("/test/.mcp-sync/state.json");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.version).toBe("1.0.0");
        expect(result.data.enabledServers).toEqual([]);
      }
    });

    it("reads and parses existing state file", async () => {
      const stateContent = JSON.stringify({
        version: "1.0.0",
        enabledServers: ["server1", "server2"],
        envVars: {},
        editors: {},
        lastModified: "2024-01-27T10:00:00.000Z",
        lastModifiedBy: "setup",
      });
      (mockFs.existsSync as jest.MockedFunction<typeof mockFs.existsSync>).mockReturnValue(true);
      (mockFsPromises.readFile as jest.MockedFunction<typeof mockFsPromises.readFile>).mockResolvedValue(
        stateContent as unknown as Awaited<ReturnType<typeof mockFsPromises.readFile>>
      );

      const result = await readState("/test/.mcp-sync/state.json");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.enabledServers).toEqual(["server1", "server2"]);
        expect(result.data.serverSettings).toEqual({});
      }
    });

    it("returns error for version mismatch", async () => {
      const stateContent = JSON.stringify({
        version: "2.0.0",
        enabledServers: [],
        envVars: {},
        editors: {},
        lastModified: "2024-01-27T10:00:00.000Z",
        lastModifiedBy: "setup",
      });
      (mockFs.existsSync as jest.MockedFunction<typeof mockFs.existsSync>).mockReturnValue(true);
      (mockFsPromises.readFile as jest.MockedFunction<typeof mockFsPromises.readFile>).mockResolvedValue(
        stateContent as unknown as Awaited<ReturnType<typeof mockFsPromises.readFile>>
      );

      const result = await readState("/test/.mcp-sync/state.json");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("version mismatch");
      }
    });

    it("returns error for invalid JSON", async () => {
      (mockFs.existsSync as jest.MockedFunction<typeof mockFs.existsSync>).mockReturnValue(true);
      (mockFsPromises.readFile as jest.MockedFunction<typeof mockFsPromises.readFile>).mockResolvedValue(
        "invalid json" as unknown as Awaited<ReturnType<typeof mockFsPromises.readFile>>
      );

      const result = await readState("/test/.mcp-sync/state.json");

      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // Write Functions
  // ==========================================================================

  describe("writeState", () => {
    it("writes state to file", async () => {
      (mockFsPromises.writeFile as jest.MockedFunction<typeof mockFsPromises.writeFile>).mockResolvedValue(undefined);

      const state = createDefaultState();
      const result = await writeState("/test/.mcp-sync/state.json", state);

      expect(result.success).toBe(true);
      expect(mockFsPromises.writeFile).toHaveBeenCalled();
    });

    it("updates lastModified timestamp", async () => {
      (mockFsPromises.writeFile as jest.MockedFunction<typeof mockFsPromises.writeFile>).mockResolvedValue(undefined);

      const state = createDefaultState();
      const oldTimestamp = state.lastModified;

      // Wait a tiny bit to ensure different timestamp
      await new Promise((r) => setTimeout(r, 10));
      await writeState("/test/.mcp-sync/state.json", state);

      const writtenContent = (mockFsPromises.writeFile as jest.Mock).mock.calls[0][1] as string;
      const writtenState = JSON.parse(writtenContent);

      expect(writtenState.lastModified).not.toBe(oldTimestamp);
    });

    it("returns error on write failure", async () => {
      (mockFsPromises.writeFile as jest.MockedFunction<typeof mockFsPromises.writeFile>).mockRejectedValue(
        new Error("Permission denied")
      );

      const state = createDefaultState();
      const result = await writeState("/test/.mcp-sync/state.json", state);

      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // Server State Functions
  // ==========================================================================

  describe("enableServer", () => {
    it("adds server to enabledServers", () => {
      const state = createDefaultState();
      const newState = enableServer(state, "new-server");

      expect(newState.enabledServers).toContain("new-server");
    });

    it("does not duplicate already enabled server", () => {
      const state = { ...createDefaultState(), enabledServers: ["existing"] };
      const newState = enableServer(state, "existing");

      expect(newState.enabledServers).toEqual(["existing"]);
    });

    it("does not mutate original state", () => {
      const state = createDefaultState();
      enableServer(state, "new-server");

      expect(state.enabledServers).not.toContain("new-server");
    });
  });

  describe("disableServer", () => {
    it("removes server from enabledServers", () => {
      const state = { ...createDefaultState(), enabledServers: ["server1", "server2"] };
      const newState = disableServer(state, "server1");

      expect(newState.enabledServers).toEqual(["server2"]);
    });

    it("handles non-enabled server gracefully", () => {
      const state = createDefaultState();
      const newState = disableServer(state, "missing");

      expect(newState.enabledServers).toEqual([]);
    });
  });

  describe("toggleServer", () => {
    it("enables disabled server", () => {
      const state = createDefaultState();
      const newState = toggleServer(state, "server");

      expect(newState.enabledServers).toContain("server");
    });

    it("disables enabled server", () => {
      const state = { ...createDefaultState(), enabledServers: ["server"] };
      const newState = toggleServer(state, "server");

      expect(newState.enabledServers).not.toContain("server");
    });
  });

  describe("setEnabledServers", () => {
    it("replaces all enabled servers", () => {
      const state = { ...createDefaultState(), enabledServers: ["old1", "old2"] };
      const newState = setEnabledServers(state, ["new1", "new2", "new3"]);

      expect(newState.enabledServers).toEqual(["new1", "new2", "new3"]);
    });
  });

  describe("isServerEnabled", () => {
    it("returns true for enabled server", () => {
      const state = { ...createDefaultState(), enabledServers: ["server"] };
      expect(isServerEnabled(state, "server")).toBe(true);
    });

    it("returns false for disabled server", () => {
      const state = createDefaultState();
      expect(isServerEnabled(state, "server")).toBe(false);
    });
  });

  // ==========================================================================
  // Environment Variable State Functions
  // ==========================================================================

  describe("updateServerSettings", () => {
    it("persists server settings under the concrete server id", () => {
      const state = createDefaultState();
      const newState = updateServerSettings(state, "serena-stdio", {
        startupTimeoutSeconds: 120,
      });

      expect(newState.serverSettings["serena-stdio"]).toEqual({
        startupTimeoutSeconds: 120,
      });
      expect(state.serverSettings["serena-stdio"]).toBeUndefined();
    });
  });

  describe("updateEnvVarState", () => {
    it("updates single env var state", () => {
      const state = createDefaultState();
      const newState = updateEnvVarState(state, "VAR1", true);

      expect(newState.envVars.VAR1).toBeDefined();
      expect(newState.envVars.VAR1.isSet).toBe(true);
    });

    it("includes lastValidated timestamp", () => {
      const state = createDefaultState();
      const newState = updateEnvVarState(state, "VAR1", true);

      expect(newState.envVars.VAR1.lastValidated).toBeDefined();
    });
  });

  describe("updateEnvVarsState", () => {
    it("updates multiple env vars", () => {
      const state = createDefaultState();
      const newState = updateEnvVarsState(state, { VAR1: true, VAR2: false });

      expect(newState.envVars.VAR1.isSet).toBe(true);
      expect(newState.envVars.VAR2.isSet).toBe(false);
    });
  });

  // ==========================================================================
  // Editor State Functions
  // ==========================================================================

  describe("getEditorState", () => {
    it("returns existing editor state", () => {
      const editorState = createDefaultEditorState("/project", "/global");
      const state = { ...createDefaultState(), editors: { cursor: editorState } };

      const result = getEditorState(state, "cursor", "/project", "/global");

      expect(result).toEqual(editorState);
    });

    it("returns default state for new editor", () => {
      const state = createDefaultState();
      const result = getEditorState(state, "new-editor", "/project", "/global");

      expect(result.project.configPath).toBe("/project");
      expect(result.global.configPath).toBe("/global");
    });
  });

  describe("updateEditorState", () => {
    it("adds new editor state", () => {
      const state = createDefaultState();
      const editorState = createDefaultEditorState("/project", "/global");
      const newState = updateEditorState(state, "cursor", editorState);

      expect(newState.editors.cursor).toEqual(editorState);
    });

    it("updates existing editor state", () => {
      const editorState = createDefaultEditorState("/project", "/global");
      const state = { ...createDefaultState(), editors: { cursor: editorState } };

      const updatedEditorState = { ...editorState, project: { ...editorState.project, enabled: true } };
      const newState = updateEditorState(state, "cursor", updatedEditorState);

      expect(newState.editors.cursor.project.enabled).toBe(true);
    });
  });

  describe("enableEditorScope", () => {
    it("enables project scope", () => {
      const state = createDefaultState();
      const newState = enableEditorScope(state, "cursor", "project", "/project/path");

      expect(newState.editors.cursor.project.enabled).toBe(true);
      expect(newState.editors.cursor.project.configPath).toBe("/project/path");
    });

    it("enables global scope", () => {
      const state = createDefaultState();
      const newState = enableEditorScope(state, "cursor", "global", "/global/path");

      expect(newState.editors.cursor.global.enabled).toBe(true);
    });
  });

  describe("disableEditorScope", () => {
    it("disables enabled scope", () => {
      const state = enableEditorScope(createDefaultState(), "cursor", "project", "/path");
      const newState = disableEditorScope(state, "cursor", "project");

      expect(newState.editors.cursor.project.enabled).toBe(false);
    });

    it("handles non-existent editor gracefully", () => {
      const state = createDefaultState();
      const newState = disableEditorScope(state, "missing", "project");

      expect(newState).toEqual(state);
    });
  });

  describe("recordEditorSync", () => {
    it("updates lastSync timestamp", () => {
      const state = enableEditorScope(createDefaultState(), "cursor", "project", "/path");
      const newState = recordEditorSync(state, "cursor", "project");

      expect(newState.editors.cursor.project.lastSync).not.toBeNull();
    });

    it("handles non-existent editor gracefully", () => {
      const state = createDefaultState();
      const newState = recordEditorSync(state, "missing", "project");

      expect(newState).toEqual(state);
    });
  });

  describe("recordEditorBackup", () => {
    it("updates lastBackup timestamp", () => {
      const state = enableEditorScope(createDefaultState(), "cursor", "global", "/path");
      const newState = recordEditorBackup(state, "cursor", "global");

      expect(newState.editors.cursor.global.lastBackup).not.toBeNull();
    });
  });

  // ==========================================================================
  // Modification Tracking
  // ==========================================================================

  describe("markModified", () => {
    it("updates lastModifiedBy", () => {
      const state = createDefaultState();
      const newState = markModified(state, "manage-env");

      expect(newState.lastModifiedBy).toBe("manage-env");
    });

    it("updates lastModified timestamp", async () => {
      const state = createDefaultState();
      const oldTimestamp = state.lastModified;

      // Wait a tiny bit to ensure timestamp changes
      await new Promise((resolve) => setTimeout(resolve, 5));

      const newState = markModified(state, "manage-servers");

      expect(newState.lastModified).not.toBe(oldTimestamp);
    });
  });

  // ==========================================================================
  // Utility Functions
  // ==========================================================================

  describe("formatTimestamp", () => {
    it("returns 'never' for null", () => {
      expect(formatTimestamp(null)).toBe("never");
    });

    it("returns 'just now' for recent timestamp", () => {
      const now = new Date().toISOString();
      expect(formatTimestamp(now)).toBe("just now");
    });

    it("returns minutes ago format", () => {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const result = formatTimestamp(tenMinutesAgo);

      expect(result).toMatch(/\d+m ago/);
    });

    it("returns hours ago format", () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      const result = formatTimestamp(threeHoursAgo);

      expect(result).toMatch(/\d+h ago/);
    });

    it("returns 'yesterday' for day-old timestamp", () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const result = formatTimestamp(yesterday);

      expect(result).toBe("yesterday");
    });

    it("returns days ago format", () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      const result = formatTimestamp(threeDaysAgo);

      expect(result).toBe("3d ago");
    });
  });

  describe("getStateSummary", () => {
    it("returns correct counts", () => {
      const state = {
        ...createDefaultState(),
        enabledServers: ["server1", "server2", "server3"],
        editors: {
          cursor: {
            project: { enabled: true, configPath: "/p", lastSync: null, lastBackup: null },
            global: { enabled: false, configPath: "/g", lastSync: null, lastBackup: null },
          },
          windsurf: {
            project: { enabled: false, configPath: "/p", lastSync: null, lastBackup: null },
            global: { enabled: true, configPath: "/g", lastSync: null, lastBackup: null },
          },
        },
      };

      const summary = getStateSummary(state);

      expect(summary.enabledServers).toBe(3);
      expect(summary.configuredEditors).toBe(2);
    });

    it("returns formatted lastModified", () => {
      const state = createDefaultState();
      const summary = getStateSummary(state);

      expect(typeof summary.lastModified).toBe("string");
    });
  });
});
