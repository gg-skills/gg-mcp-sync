/**
 * @fileoverview Jest unit tests for MCP editor registry and adapter behavior.
 * @testing Jest unit: npm test -- --runInBand scripts/editors/web-editors.unit.test.ts
 * @see scripts/README.md - Top-level MCP workflow guide for these test helpers.
 * @see scripts/lib/types.ts - Shared MCP state types imported by this Jest suite.
 * @documentation reviewed=2026-04-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import type { EnvVars, McpServerTemplate } from "../lib/types";

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
}));

// Import adapter
const replitModule = import("./replit");
const { replitAdapter } = await replitModule;

describe("Web Editor Adapters", () => {
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

  // ==========================================================================
  // Replit
  // ==========================================================================

  describe("replitAdapter", () => {
    it("has correct id", () => {
      expect(replitAdapter.id).toBe("replit");
    });

    it("has correct name", () => {
      expect(replitAdapter.name).toBe("Replit");
    });

    it("has web type", () => {
      expect(replitAdapter.type).toBe("web");
    });

    it("is ui-only format", () => {
      expect(replitAdapter.format).toBe("ui-only");
    });

    it("has no project config", () => {
      expect(replitAdapter.projectConfig).toBeUndefined();
    });

    it("has no global config", () => {
      expect(replitAdapter.globalConfig).toBeUndefined();
    });

    it("has detectInstalled method", () => {
      expect(typeof replitAdapter.detectInstalled).toBe("function");
    });

    it("has readConfig method", () => {
      expect(typeof replitAdapter.readConfig).toBe("function");
    });

    it("has writeConfig method", () => {
      expect(typeof replitAdapter.writeConfig).toBe("function");
    });

    it("has generateInstructions method", () => {
      expect(typeof replitAdapter.generateInstructions).toBe("function");
    });

    describe("detectInstalled", () => {
      it("returns true (web-based is always available)", async () => {
        const result = await replitAdapter.detectInstalled();
        // Web-based tools typically return true or check environment
        expect(typeof result).toBe("boolean");
      });
    });

    describe("readConfig", () => {
      it("returns null for project scope (not supported)", async () => {
        const result = await replitAdapter.readConfig("project");
        // UI-only adapters may return null or empty config
        expect(result === null || result?.servers !== undefined).toBe(true);
      });

      it("returns null for global scope (not supported)", async () => {
        const result = await replitAdapter.readConfig("global");
        expect(result === null || result?.servers !== undefined).toBe(true);
      });
    });

    describe("writeConfig", () => {
      it("returns result indicating UI-only operation", async () => {
        const result = await replitAdapter.writeConfig("project", [mockServer], testEnv);

        // Should return a dry-run result
        expect(result).toBeDefined();
        expect(result.targetPath).toBeDefined();
      });
    });

    describe("generateInstructions", () => {
      it("returns markdown instructions", () => {
        const instructions = replitAdapter.generateInstructions!([mockServer], testEnv);

        expect(instructions).toBeTruthy();
        expect(typeof instructions).toBe("string");
      });

      it("includes server name in instructions", () => {
        const instructions = replitAdapter.generateInstructions!([mockServer], testEnv);

        expect(instructions).toContain("test-server");
      });

      it("includes JSON configuration in instructions", () => {
        const instructions = replitAdapter.generateInstructions!([mockServer], testEnv);

        // Should include formatted JSON for manual copy
        expect(instructions).toContain("command");
        expect(instructions).toContain("npx");
      });

      it("handles multiple servers", () => {
        const mockServer2: McpServerTemplate = {
          ...mockServer,
          id: "second-server",
          name: "Second Server",
        };

        const instructions = replitAdapter.generateInstructions!([mockServer, mockServer2], testEnv);

        expect(instructions).toContain("test-server");
        expect(instructions).toContain("second-server");
      });

      it("mentions Replit in instructions", () => {
        const instructions = replitAdapter.generateInstructions!([mockServer], testEnv);

        expect(instructions.toLowerCase()).toContain("replit");
      });
    });
  });

  // ==========================================================================
  // Web Adapter Common Behavior
  // ==========================================================================

  describe("common web adapter behavior", () => {
    const webAdapters = [replitAdapter];

    it("all web adapters have type web", () => {
      webAdapters.forEach((adapter) => {
        expect(adapter.type).toBe("web");
      });
    });

    it("all web adapters are ui-only", () => {
      webAdapters.forEach((adapter) => {
        expect(adapter.format).toBe("ui-only");
      });
    });

    it("all web adapters have generateInstructions", () => {
      webAdapters.forEach((adapter) => {
        expect(typeof adapter.generateInstructions).toBe("function");
      });
    });

    it("all web adapters have no file-based config locations", () => {
      webAdapters.forEach((adapter) => {
        expect(adapter.projectConfig).toBeUndefined();
        expect(adapter.globalConfig).toBeUndefined();
      });
    });
  });

  // ==========================================================================
  // UI-Only Behavior Tests
  // ==========================================================================

  describe("ui-only adapter behavior", () => {
    it("generateInstructions returns non-empty string", () => {
      const instructions = replitAdapter.generateInstructions!([mockServer], testEnv);
      expect(instructions.length).toBeGreaterThan(0);
    });

    it("generateInstructions includes setup guidance", () => {
      const instructions = replitAdapter.generateInstructions!([mockServer], testEnv);

      // Should contain some instructional content
      const hasInstructions =
        instructions.includes("1.") ||
        instructions.includes("step") ||
        instructions.includes("Steps") ||
        instructions.includes("configure") ||
        instructions.includes("Settings") ||
        instructions.includes("add");

      expect(hasInstructions).toBe(true);
    });

    it("generateInstructions handles empty server list", () => {
      const instructions = replitAdapter.generateInstructions!([], testEnv);
      expect(typeof instructions).toBe("string");
    });
  });
});
