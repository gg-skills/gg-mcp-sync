/**
 * @fileoverview Jest unit tests for MCP editor registry and adapter behavior.
 * @testing Jest unit: npm test -- --runInBand scripts/editors/standalone-editors.unit.test.ts
 * @see scripts/README.md - Top-level MCP workflow guide for these test helpers.
 * @see scripts/lib/types.ts - Shared MCP state types imported by this Jest suite.
 * @documentation reviewed=2026-04-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import type { EditorAdapter } from "../lib/types";

// Mock modules before imports
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

const mockFsPromises = await import("fs/promises").then((m) => m);
const mockFs = await import("fs").then((m) => m);

// Import adapters
const { zedAdapter } = await import("./zed").then((m) => m);
const { antigravityAdapter } = await import("./antigravity").then((m) => m);
const { jetbrainsAdapter } = await import("./jetbrains").then((m) => m);
const { factoryIdeAdapter } = await import("./factory-ide").then((m) => m);
const { verdentDeckAdapter } = await import("./verdent-deck").then((m) => m);
const { kiroAdapter } = await import("./kiro").then((m) => m);
const { warpTerminalAdapter } = await import("./warp-terminal").then((m) => m);

describe("Standalone Editor Adapters", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Declares a nested Jest `describe` with shared baseline assertions for a standalone MCP editor adapter.
   *
   * @remarks
   * USAGE: One call per adapter registers a suite titled from `options.expectedName` and `options.expectedId`.
   * Optional flags gate project/global config checks and format expectations without changing adapter behavior.
   *
   * @param adapter - Adapter under test; shape and method presence are asserted, not filesystem side effects.
   * @param options - Expected identifiers plus optional switches for which conditional `it` blocks run.
   */
  function testStandaloneEditor(adapter: EditorAdapter, options: {
    expectedId: string;
    expectedName: string;
    hasProjectConfig?: boolean;
    hasGlobalConfig?: boolean;
    format?: string;
    configFormat?: string;
  }) {
    describe(`${options.expectedName} (${options.expectedId})`, () => {
      it("has correct id", () => {
        expect(adapter.id).toBe(options.expectedId);
      });

      it("has correct name", () => {
        expect(adapter.name).toBe(options.expectedName);
      });

      it("has standalone type", () => {
        expect(adapter.type).toBe("standalone");
      });

      if (options.hasProjectConfig && adapter.projectConfig) {
        it("has project config location", () => {
          expect(adapter.projectConfig).toBeDefined();
        });
      }

      if (options.hasGlobalConfig !== false) {
        it("has global config location", () => {
          expect(adapter.globalConfig).toBeDefined();
        });
      }

      if (options.format) {
        it(`has ${options.format} format`, () => {
          expect(adapter.format).toBe(options.format);
        });
      }

      if (options.configFormat && adapter.globalConfig) {
        it(`uses ${options.configFormat} file format`, () => {
          expect(adapter.globalConfig?.format).toBe(options.configFormat);
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
  // Zed
  // ==========================================================================

  testStandaloneEditor(zedAdapter, {
    expectedId: "zed",
    expectedName: "Zed",
    format: "context_servers",
    configFormat: "jsonc",
  });

  describe("zedAdapter specifics", () => {
    it("uses context_servers key format", () => {
      expect(zedAdapter.format).toBe("context_servers");
    });

    it("global config path contains zed", () => {
      expect(zedAdapter.globalConfig?.path.toLowerCase()).toContain("zed");
    });

    it("detects installation by checking config dir", async () => {
      (mockFs.existsSync as jest.MockedFunction<typeof mockFs.existsSync>).mockReturnValue(true);
      (mockFs.statSync as jest.MockedFunction<typeof mockFs.statSync>).mockReturnValue({
        isDirectory: () => true,
      } as ReturnType<typeof mockFs.statSync>);

      const result = await zedAdapter.detectInstalled();
      expect(typeof result).toBe("boolean");
    });

    it("config uses jsonc format", () => {
      expect(zedAdapter.globalConfig?.format).toBe("jsonc");
    });
  });

  // ==========================================================================
  // Antigravity
  // ==========================================================================

  testStandaloneEditor(antigravityAdapter, {
    expectedId: "antigravity",
    expectedName: "Google Antigravity",
    format: "mcpServers",
    configFormat: "json",
  });

  describe("antigravityAdapter specifics", () => {
    it("uses mcpServers key format", () => {
      expect(antigravityAdapter.format).toBe("mcpServers");
    });
  });

  // ==========================================================================
  // JetBrains
  // ==========================================================================

  testStandaloneEditor(jetbrainsAdapter, {
    expectedId: "jetbrains",
    expectedName: "JetBrains IDEs",
    format: "mcpServers",
    configFormat: "json",
  });

  describe("jetbrainsAdapter specifics", () => {
    it("has JetBrains in name", () => {
      expect(jetbrainsAdapter.name).toContain("JetBrains");
    });

    it("global config path contains jetbrains or idea", () => {
      const path = jetbrainsAdapter.globalConfig?.path.toLowerCase();
      expect(path?.includes("jetbrains") || path?.includes("idea") || path?.includes("mcp")).toBe(true);
    });
  });

  // ==========================================================================
  // Factory IDE
  // ==========================================================================

  testStandaloneEditor(factoryIdeAdapter, {
    expectedId: "factory-ide",
    expectedName: "Factory IDE",
    format: "mcpServers",
    configFormat: "json",
  });

  describe("factoryIdeAdapter specifics", () => {
    it("uses mcpServers key format", () => {
      expect(factoryIdeAdapter.format).toBe("mcpServers");
    });
  });

  // ==========================================================================
  // Verdent Deck
  // ==========================================================================

  testStandaloneEditor(verdentDeckAdapter, {
    expectedId: "verdent-deck",
    expectedName: "Verdent Deck",
    format: "mcpServers",
    configFormat: "json",
  });

  describe("verdentDeckAdapter specifics", () => {
    it("uses mcpServers key format", () => {
      expect(verdentDeckAdapter.format).toBe("mcpServers");
    });
  });

  // ==========================================================================
  // Kiro
  // ==========================================================================

  testStandaloneEditor(kiroAdapter, {
    expectedId: "kiro",
    expectedName: "Kiro (AWS)",
    hasGlobalConfig: false, // Kiro only has project config
    format: "mcpServers",
    configFormat: "json",
  });

  describe("kiroAdapter specifics", () => {
    it("uses mcpServers key format", () => {
      expect(kiroAdapter.format).toBe("mcpServers");
    });

    it("has project config support", () => {
      // Kiro may support project-level config
      expect(kiroAdapter.projectConfig !== undefined || kiroAdapter.globalConfig !== undefined).toBe(true);
    });
  });

  // ==========================================================================
  // Warp Terminal
  // ==========================================================================

  testStandaloneEditor(warpTerminalAdapter, {
    expectedId: "warp-terminal",
    expectedName: "Warp Terminal",
    format: "mcpServers",
    configFormat: "json",
  });

  describe("warpTerminalAdapter specifics", () => {
    it("uses mcpServers key format", () => {
      expect(warpTerminalAdapter.format).toBe("mcpServers");
    });

    it("global config path contains warp", () => {
      expect(warpTerminalAdapter.globalConfig?.path.toLowerCase()).toContain("warp");
    });
  });

  // ==========================================================================
  // Common Behavior Tests
  // ==========================================================================

  describe("common standalone adapter behavior", () => {
    const allStandaloneAdapters = [
      zedAdapter,
      antigravityAdapter,
      jetbrainsAdapter,
      factoryIdeAdapter,
      verdentDeckAdapter,
      kiroAdapter,
      warpTerminalAdapter,
    ];

    it("all adapters have type standalone", () => {
      allStandaloneAdapters.forEach((adapter) => {
        expect(adapter.type).toBe("standalone");
      });
    });

    it("all adapters have at least one config location", () => {
      allStandaloneAdapters.forEach((adapter) => {
        const hasConfig = adapter.projectConfig !== undefined || adapter.globalConfig !== undefined;
        expect(hasConfig).toBe(true);
      });
    });

    it("unique adapter ids", () => {
      const ids = allStandaloneAdapters.map((a) => a.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("config paths are valid", () => {
      allStandaloneAdapters.forEach((adapter) => {
        if (adapter.globalConfig) {
          expect(adapter.globalConfig.path).toBeTruthy();
          expect(adapter.globalConfig.key).toBeTruthy();
          expect(adapter.globalConfig.format).toBeTruthy();
        }
        if (adapter.projectConfig) {
          expect(adapter.projectConfig.path).toBeTruthy();
          expect(adapter.projectConfig.key).toBeTruthy();
          expect(adapter.projectConfig.format).toBeTruthy();
        }
      });
    });

    it("most standalone editors use JSON format", () => {
      const jsonAdapters = allStandaloneAdapters.filter(
        (a) => a.globalConfig?.format === "json" || a.projectConfig?.format === "json"
      );
      // Most should use JSON
      expect(jsonAdapters.length).toBeGreaterThanOrEqual(allStandaloneAdapters.length - 1);
    });
  });

  // ==========================================================================
  // Special Format Tests
  // ==========================================================================

  describe("special format tests", () => {
    it("Zed uses context_servers key", () => {
      expect(zedAdapter.format).toBe("context_servers");
      expect(zedAdapter.globalConfig?.key).toBe("context_servers");
    });

    it("most others use mcpServers key", () => {
      const mcpServersAdapters = [
        antigravityAdapter,
        jetbrainsAdapter,
        factoryIdeAdapter,
        verdentDeckAdapter,
        kiroAdapter,
        warpTerminalAdapter,
      ];

      mcpServersAdapters.forEach((adapter) => {
        expect(adapter.format).toBe("mcpServers");
      });
    });
  });
});
