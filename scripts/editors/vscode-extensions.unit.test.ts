/**
 * @fileoverview Jest unit tests for MCP editor registry and adapter behavior.
 * @testing Jest unit: npm test -- --runInBand scripts/editors/vscode-extensions.unit.test.ts
 * @see scripts/README.md - Top-level MCP workflow guide for these test helpers.
 * @see scripts/lib/types.ts - Shared MCP state types imported by this Jest suite.
 * @documentation reviewed=2026-04-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import type { EditorAdapter, EnvVars, McpServerTemplate } from "../lib/types";

// Mock modules before imports - include all fs functions that might be required
jest.unstable_mockModule("fs/promises", () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  mkdir: jest.fn(),
  access: jest.fn(),
  stat: jest.fn(),
  readdir: jest.fn(),
  unlink: jest.fn(),
  copyFile: jest.fn(),
}));

jest.unstable_mockModule("fs", () => ({
  existsSync: jest.fn(),
  constants: { R_OK: 4, W_OK: 2 },
  statSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  unlinkSync: jest.fn(),
  mkdirSync: jest.fn(),
  readdirSync: jest.fn(),
}));

// Import adapters
const { cursorAdapter } = await Promise.resolve(import("./cursor"));
const { windsurfAdapter } = await Promise.resolve(import("./windsurf"));
const { vscodeAdapter } = await Promise.resolve(import("./vscode"));
const { clineExtAdapter } = await Promise.resolve(import("./cline-ext"));
const { factoryExtAdapter } = await Promise.resolve(import("./factory-ext"));
const { verdentExtAdapter } = await Promise.resolve(import("./verdent-ext"));
const { augmentExtAdapter } = await Promise.resolve(import("./augment-ext"));
const { codyExtAdapter } = await Promise.resolve(import("./cody-ext"));
const { traeExtAdapter } = await Promise.resolve(import("./trae-ext"));
const { kiloCodeExtAdapter } = await Promise.resolve(import("./kilo-code-ext"));
const { rooCodeExtAdapter } = await Promise.resolve(import("./roo-code-ext"));
const { qodoTabnineExtAdapter } = await Promise.resolve(import("./qodo-tabnine-ext"));
const { continueExtAdapter } = await Promise.resolve(import("./continue-ext"));
const { refactExtAdapter } = await Promise.resolve(import("./refact-ext"));

describe("VSCode Extension Adapters", () => {
  const testEnv: EnvVars = {
    MCP_FIRECRAWL_API_KEY: "test-key",
    MCP_MONGODB_CONNECTION_STRING: "mongodb://localhost/test",
  };

  // Mock server template for testing
  const mockServer: McpServerTemplate = {
    id: "test-server",
    name: "Test Server",
    transport: "stdio",
    package: "test-mcp",
    envVars: ["MCP_FIRECRAWL_API_KEY"],
    configs: {
      standard: () => ({
        command: "npx",
        args: ["-y", "test-mcp"],
        env: { API_KEY: "test-key" },
      }),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Registers a nested Jest suite asserting shared MCP adapter traits for VSCode-family editors.
   *
   * @remarks
   * Emits baseline id/name/type checks plus optional assertions for config locations, persisted
   * JSON shape (`format`), and ui-only tooling paths gated by `options` flags.
   *
   * @param adapter - Editor adapter exercised by the generated `it` cases.
   * @param options - Display labels and switches that determine which conditional tests run.
   */
  function testVscodeExtension(adapter: EditorAdapter, options: {
    expectedId: string;
    expectedName: string;
    hasProjectConfig?: boolean;
    hasGlobalConfig?: boolean;
    format?: string;
    isUiOnly?: boolean;
  }) {
    describe(`${options.expectedName} (${options.expectedId})`, () => {
      it("has correct id", () => {
        expect(adapter.id).toBe(options.expectedId);
      });

      it("has correct name", () => {
        expect(adapter.name).toBe(options.expectedName);
      });

      it("has vscode-ext type", () => {
        expect(adapter.type).toBe("vscode-ext");
      });

      if (options.hasProjectConfig !== false && !options.isUiOnly) {
        it("has project config location", () => {
          expect(adapter.projectConfig).toBeDefined();
        });
      }

      if (options.hasGlobalConfig !== false && !options.isUiOnly) {
        it("has global config location", () => {
          expect(adapter.globalConfig).toBeDefined();
        });
      }

      if (options.format) {
        it(`has ${options.format} format`, () => {
          expect(adapter.format).toBe(options.format);
        });
      }

      if (options.isUiOnly) {
        it("is ui-only format", () => {
          expect(adapter.format).toBe("ui-only");
        });

        it("has generateInstructions method", () => {
          expect(typeof adapter.generateInstructions).toBe("function");
        });
      }

      it("has detectInstalled method", () => {
        expect(typeof adapter.detectInstalled).toBe("function");
      });

      it("has readConfig method", () => {
        expect(typeof adapter.readConfig).toBe("function");
      });

      it("has writeConfig method", () => {
        expect(typeof adapter.writeConfig).toBe("function");
      });
    });
  }

  // ==========================================================================
  // Cursor
  // ==========================================================================

  testVscodeExtension(cursorAdapter, {
    expectedId: "cursor",
    expectedName: "Cursor",
    format: "mcpServers",
  });

  describe("cursorAdapter specifics", () => {
    it("project config path is .cursor/mcp.json", () => {
      expect(cursorAdapter.projectConfig?.path).toBe(".cursor/mcp.json");
    });

    it("global config path is ~/.cursor/mcp.json", () => {
      expect(cursorAdapter.globalConfig?.path).toBe("~/.cursor/mcp.json");
    });
  });

  // ==========================================================================
  // Windsurf
  // ==========================================================================

  testVscodeExtension(windsurfAdapter, {
    expectedId: "windsurf",
    expectedName: "Windsurf",
    format: "mcpServers",
  });

  describe("windsurfAdapter specifics", () => {
    it("project config path is .windsurf/mcp.json", () => {
      expect(windsurfAdapter.projectConfig?.path).toBe(".windsurf/mcp.json");
    });

    it("global config path contains .codeium", () => {
      expect(windsurfAdapter.globalConfig?.path).toContain("codeium");
    });
  });

  // ==========================================================================
  // VSCode Native MCP
  // ==========================================================================

  testVscodeExtension(vscodeAdapter, {
    expectedId: "vscode",
    expectedName: "VSCode (Native MCP)",
    hasGlobalConfig: false,  // VSCode native MCP only has project config
    format: "servers",
  });

  describe("vscodeAdapter specifics", () => {
    it("uses 'servers' key format", () => {
      expect(vscodeAdapter.format).toBe("servers");
      expect(vscodeAdapter.projectConfig?.key).toBe("servers");
    });

    it("project config path is .vscode/mcp.json", () => {
      expect(vscodeAdapter.projectConfig?.path).toBe(".vscode/mcp.json");
    });
  });

  // ==========================================================================
  // Cline Extension
  // ==========================================================================

  testVscodeExtension(clineExtAdapter, {
    expectedId: "cline-ext",
    expectedName: "Cline (VSCode Ext)",
    hasProjectConfig: false,  // Cline ext uses global config only
    format: "mcpServers",
  });

  // ==========================================================================
  // Factory Extension
  // ==========================================================================

  testVscodeExtension(factoryExtAdapter, {
    expectedId: "factory-ext",
    expectedName: "Factory Droid (VSCode Ext)",
    format: "mcpServers",
  });

  // ==========================================================================
  // Verdent Extension
  // ==========================================================================

  testVscodeExtension(verdentExtAdapter, {
    expectedId: "verdent-ext",
    expectedName: "Verdent (VSCode Ext)",
    hasProjectConfig: false,  // May only have global config
    format: "mcpServers",
  });

  // ==========================================================================
  // Augment Extension
  // ==========================================================================

  testVscodeExtension(augmentExtAdapter, {
    expectedId: "augment-ext",
    expectedName: "Augment (VSCode Ext)",
    isUiOnly: true,
  });

  describe("augmentExtAdapter specifics", () => {
    it("has no file-based config", () => {
      expect(augmentExtAdapter.format).toBe("ui-only");
    });

    it("generates instructions for manual setup", () => {
      const instructions = augmentExtAdapter.generateInstructions!([mockServer], testEnv);
      expect(instructions).toContain("Augment");
    });
  });

  // ==========================================================================
  // Cody Extension
  // ==========================================================================

  testVscodeExtension(codyExtAdapter, {
    expectedId: "cody-ext",
    expectedName: "Cody (VSCode Ext)",
    hasProjectConfig: false,  // Cody only has global config
    format: "openctx.providers",  // Cody uses OpenCtx provider pattern
  });

  // ==========================================================================
  // Trae Extension
  // ==========================================================================

  testVscodeExtension(traeExtAdapter, {
    expectedId: "trae-ext",
    expectedName: "Trae (VSCode Ext)",
    hasProjectConfig: false,  // May only have global config
    format: "mcpServers",
  });

  // ==========================================================================
  // Kilo Code Extension
  // ==========================================================================

  testVscodeExtension(kiloCodeExtAdapter, {
    expectedId: "kilo-code-ext",
    expectedName: "Kilo Code (VSCode Ext)",
    format: "mcpServers",
  });

  // ==========================================================================
  // Roo Code Extension
  // ==========================================================================

  testVscodeExtension(rooCodeExtAdapter, {
    expectedId: "roo-code-ext",
    expectedName: "Roo Code (VSCode Ext)",
    format: "mcpServers",
  });

  // ==========================================================================
  // Qodo/Tabnine Extension
  // ==========================================================================

  testVscodeExtension(qodoTabnineExtAdapter, {
    expectedId: "qodo-tabnine-ext",
    expectedName: "Qodo Gen / Tabnine",
    format: "mcpServers",
  });

  // ==========================================================================
  // Continue Extension
  // ==========================================================================

  testVscodeExtension(continueExtAdapter, {
    expectedId: "continue-ext",
    expectedName: "Continue (VSCode Ext)",
    hasGlobalConfig: false,  // Continue only has project config
    format: "ui-only",  // Continue uses ui-only format but has projectConfig
  });

  // ==========================================================================
  // Refact Extension
  // ==========================================================================

  testVscodeExtension(refactExtAdapter, {
    expectedId: "refact-ext",
    expectedName: "Refact.ai (VSCode Ext)",
    isUiOnly: true,
  });

  // ==========================================================================
  // Common Behavior Tests
  // ==========================================================================

  describe("common adapter behavior", () => {
    const allAdapters = [
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
    ];

    it("all adapters have type vscode-ext", () => {
      allAdapters.forEach((adapter) => {
        expect(adapter.type).toBe("vscode-ext");
      });
    });

    it("all adapters have required methods", () => {
      allAdapters.forEach((adapter) => {
        expect(typeof adapter.detectInstalled).toBe("function");
        expect(typeof adapter.readConfig).toBe("function");
        expect(typeof adapter.writeConfig).toBe("function");
      });
    });

    it("unique adapter ids", () => {
      const ids = allAdapters.map((a) => a.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });
});
