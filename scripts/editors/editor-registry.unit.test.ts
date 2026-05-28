/**
 * @fileoverview Jest unit tests for the MCP editor registry (`scripts/editors/index.ts`).
 * Owned by the MCP editor-adapter subsystem. Agent-facing role: verifies editor
 * metadata completeness, type categorization, config-location coverage, and ID
 * naming conventions so that adding or removing an editor adapter does not
 * silently break downstream consumers.
 * @testing Jest unit: npm test -- --runInBand scripts/editors/editor-registry.unit.test.ts
 * @see scripts/README.md - MCP subsystem overview and editor adapter documentation.
 * @see scripts/editors/index.ts - Editor registry barrel under test.
 * @documentation reviewed=2026-04-30 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { describe, it, expect } from "@jest/globals";

import {
  editors,
  getEditorById,
  getEditorsByType,
  getVscodeExtensions,
  getCliTools,
  getStandaloneEditors,
  getWebEditors,
  getEditorsWithProjectConfig,
  getEditorsWithGlobalConfig,
  getUiOnlyEditors,
} from "./index";

const EXPECTED_VSCODE_EXTENSION_IDS = [
  "cursor",
  "windsurf",
  "vscode",
  "cline-ext",
  "factory-ext",
  "verdent-ext",
  "augment-ext",
  "cody-ext",
  "trae-ext",
  "kilo-code-ext",
  "roo-code-ext",
  "qodo-tabnine-ext",
  "continue-ext",
  "refact-ext",
] as const;

const EXPECTED_CLI_IDS = [
  "claude-cli",
  "gemini-cli",
  "amazonq-cli",
  "cline-cli",
  "auggie-cli",
  "amp-cli",
  "factory-cli",
  "trae-cli",
  "goose-cli",
  "codex-cli",
  "opencode-cli",
  "crush-cli",
  "pi-cli",
  "kimi-cli",
] as const;

const EXPECTED_STANDALONE_IDS = [
  "zed",
  "antigravity",
  "jetbrains",
  "factory-ide",
  "verdent-deck",
  "kiro",
  "warp-terminal",
  "windsurf-next",
] as const;

const EXPECTED_WEB_IDS = ["replit"] as const;

describe("Editor Registry", () => {
  // ==========================================================================
  // editors Array
  // ==========================================================================

  describe("editors array", () => {
    it("contains all expected editors", () => {
      expect(editors.length).toBe(
        EXPECTED_VSCODE_EXTENSION_IDS.length +
          EXPECTED_CLI_IDS.length +
          EXPECTED_STANDALONE_IDS.length +
          EXPECTED_WEB_IDS.length
      );
    });

    it("has unique ids", () => {
      const ids = editors.map((e) => e.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it("all editors have required properties", () => {
      editors.forEach((editor) => {
        expect(editor.id).toBeTruthy();
        expect(editor.name).toBeTruthy();
        expect(["vscode-ext", "cli", "standalone", "web"]).toContain(editor.type);
        expect(editor.format).toBeTruthy();
        expect(typeof editor.detectInstalled).toBe("function");
        expect(typeof editor.readConfig).toBe("function");
        expect(typeof editor.writeConfig).toBe("function");
      });
    });
  });

  // ==========================================================================
  // getEditorById
  // ==========================================================================

  describe("getEditorById", () => {
    it("returns editor for valid id", () => {
      const editor = getEditorById("cursor");

      expect(editor).toBeDefined();
      expect(editor?.id).toBe("cursor");
      expect(editor?.name).toBe("Cursor");
    });

    it("returns undefined for invalid id", () => {
      const editor = getEditorById("non-existent");

      expect(editor).toBeUndefined();
    });

    it("finds editors of all types", () => {
      expect(getEditorById("cursor")).toBeDefined(); // vscode-ext
      expect(getEditorById("claude-cli")).toBeDefined(); // cli
      expect(getEditorById("zed")).toBeDefined(); // standalone
      expect(getEditorById("replit")).toBeDefined(); // web
    });
  });

  // ==========================================================================
  // getEditorsByType
  // ==========================================================================

  describe("getEditorsByType", () => {
    it("returns only vscode-ext editors", () => {
      const result = getEditorsByType("vscode-ext");

      expect(result.length).toBe(EXPECTED_VSCODE_EXTENSION_IDS.length);
      result.forEach((editor) => {
        expect(editor.type).toBe("vscode-ext");
      });
    });

    it("returns only cli editors", () => {
      const result = getEditorsByType("cli");

      expect(result.length).toBe(EXPECTED_CLI_IDS.length);
      result.forEach((editor) => {
        expect(editor.type).toBe("cli");
      });
    });

    it("returns only standalone editors", () => {
      const result = getEditorsByType("standalone");

      expect(result.length).toBe(EXPECTED_STANDALONE_IDS.length);
      result.forEach((editor) => {
        expect(editor.type).toBe("standalone");
      });
    });

    it("returns only web editors", () => {
      const result = getEditorsByType("web");

      expect(result.length).toBe(EXPECTED_WEB_IDS.length);
      result.forEach((editor) => {
        expect(editor.type).toBe("web");
      });
    });
  });

  // ==========================================================================
  // Type-Specific Getters
  // ==========================================================================

  describe("getVscodeExtensions", () => {
    it("returns 14 VSCode extension adapters", () => {
      const result = getVscodeExtensions();

      expect(result.length).toBe(EXPECTED_VSCODE_EXTENSION_IDS.length);
    });

    it("includes expected adapters", () => {
      const ids = getVscodeExtensions().map((e) => e.id);

      expect(ids).toEqual(expect.arrayContaining(EXPECTED_VSCODE_EXTENSION_IDS));
    });

    it("all have vscode-ext type", () => {
      const result = getVscodeExtensions();
      result.forEach((editor) => {
        expect(editor.type).toBe("vscode-ext");
      });
    });
  });

  describe("getCliTools", () => {
    it("returns all CLI tool adapters", () => {
      const result = getCliTools();

      expect(result.length).toBe(EXPECTED_CLI_IDS.length);
    });

    it("includes expected adapters", () => {
      const ids = getCliTools().map((e) => e.id);

      expect(ids).toEqual(expect.arrayContaining(EXPECTED_CLI_IDS));
    });

    it("all have cli type", () => {
      const result = getCliTools();
      result.forEach((editor) => {
        expect(editor.type).toBe("cli");
      });
    });
  });

  describe("getStandaloneEditors", () => {
    it("returns 8 standalone editor adapters", () => {
      const result = getStandaloneEditors();

      expect(result.length).toBe(EXPECTED_STANDALONE_IDS.length);
    });

    it("includes expected adapters", () => {
      const ids = getStandaloneEditors().map((e) => e.id);

      expect(ids).toEqual(expect.arrayContaining(EXPECTED_STANDALONE_IDS));
    });

    it("all have standalone type", () => {
      const result = getStandaloneEditors();
      result.forEach((editor) => {
        expect(editor.type).toBe("standalone");
      });
    });
  });

  describe("getWebEditors", () => {
    it("returns 1 web editor adapter", () => {
      const result = getWebEditors();

      expect(result.length).toBe(EXPECTED_WEB_IDS.length);
    });

    it("includes replit", () => {
      const ids = getWebEditors().map((e) => e.id);

      expect(ids).toEqual(expect.arrayContaining(EXPECTED_WEB_IDS));
    });

    it("all have web type", () => {
      const result = getWebEditors();
      result.forEach((editor) => {
        expect(editor.type).toBe("web");
      });
    });
  });

  // ==========================================================================
  // Config Location Getters
  // ==========================================================================

  describe("getEditorsWithProjectConfig", () => {
    it("returns editors with project config", () => {
      const result = getEditorsWithProjectConfig();

      expect(result.length).toBeGreaterThan(0);
      result.forEach((editor) => {
        expect(editor.projectConfig).toBeDefined();
      });
    });

    it("includes cursor and windsurf", () => {
      const ids = getEditorsWithProjectConfig().map((e) => e.id);

      expect(ids).toContain("cursor");
      expect(ids).toContain("windsurf");
    });

    it("includes cli tools with project config", () => {
      const ids = getEditorsWithProjectConfig().map((e) => e.id);

      // Claude CLI has project config (.mcp.json)
      expect(ids.includes("claude-cli")).toBe(true);
    });
  });

  describe("getEditorsWithGlobalConfig", () => {
    it("returns editors with global config", () => {
      const result = getEditorsWithGlobalConfig();

      expect(result.length).toBeGreaterThan(0);
      result.forEach((editor) => {
        expect(editor.globalConfig).toBeDefined();
      });
    });

    it("includes most editors", () => {
      const result = getEditorsWithGlobalConfig();

      // Most editors have global config
      expect(result.length).toBeGreaterThan(20);
    });

    it("does not include ui-only editors", () => {
      const result = getEditorsWithGlobalConfig();
      const ids = result.map((e) => e.id);

      // UI-only editors have no file-based config
      expect(ids.includes("replit")).toBe(false);
    });
  });

  describe("getUiOnlyEditors", () => {
    it("returns ui-only editors", () => {
      const result = getUiOnlyEditors();

      expect(result.length).toBeGreaterThan(0);
      result.forEach((editor) => {
        expect(editor.format).toBe("ui-only");
      });
    });

    it("includes expected ui-only editors", () => {
      const ids = getUiOnlyEditors().map((e) => e.id);

      expect(ids).toContain("augment-ext");
      expect(ids).toContain("continue-ext");
      expect(ids).toContain("refact-ext");
      expect(ids).toContain("replit");
    });

    it("editors without file config have generateInstructions method", () => {
      const result = getUiOnlyEditors();
      // Only ui-only editors without any config location need generateInstructions
      const editorsWithoutConfig = result.filter(
        (e) => !e.projectConfig && !e.globalConfig
      );
      editorsWithoutConfig.forEach((editor) => {
        expect(typeof editor.generateInstructions).toBe("function");
      });
    });
  });

  // ==========================================================================
  // Editor Consistency
  // ==========================================================================

  describe("editor consistency", () => {
    it("all ids follow naming convention", () => {
      editors.forEach((editor) => {
        // IDs should be lowercase with hyphens
        expect(editor.id).toMatch(/^[a-z0-9-]+$/);
      });
    });

    it("all editors have non-empty names", () => {
      editors.forEach((editor) => {
        expect(editor.name.length).toBeGreaterThan(0);
      });
    });

    it("format values are valid", () => {
      const validFormats = [
        "mcpServers",
        "servers",
        "context_servers",
        "mcp",
        "mcp_servers",
        "extensions",
        "amp.mcpServers",
        "mcp-opencode",
        "mcp-crush",
        "openctx.providers",
        "ui-only",
      ];

      editors.forEach((editor) => {
        expect(validFormats).toContain(editor.format);
      });
    });

    it("file-based editors have config locations", () => {
      const fileBasedEditors = editors.filter((e) => e.format !== "ui-only");
      fileBasedEditors.forEach((editor) => {
        const hasConfig = editor.projectConfig !== undefined || editor.globalConfig !== undefined;
        expect(hasConfig).toBe(true);
      });
    });

    it("ui-only editors without config have generateInstructions", () => {
      const uiOnlyEditors = editors.filter((e) => e.format === "ui-only");
      // Only ui-only editors without any config location need generateInstructions
      const editorsWithoutConfig = uiOnlyEditors.filter(
        (e) => !e.projectConfig && !e.globalConfig
      );
      editorsWithoutConfig.forEach((editor) => {
        expect(typeof editor.generateInstructions).toBe("function");
      });
    });
  });

  // ==========================================================================
  // Type Distribution
  // ==========================================================================

  describe("type distribution", () => {
    it("vscode-ext + cli + standalone + web = total", () => {
      const vscode = getVscodeExtensions().length;
      const cli = getCliTools().length;
      const standalone = getStandaloneEditors().length;
      const web = getWebEditors().length;

      expect(vscode + cli + standalone + web).toBe(editors.length);
    });

    it("most editors are vscode-ext or cli", () => {
      const vscode = getVscodeExtensions().length;
      const cli = getCliTools().length;

      expect(vscode + cli).toBeGreaterThan(editors.length / 2);
    });
  });
});
