/**
 * @fileoverview Jest unit tests for MCP library helpers.
 * @testing Jest unit: npm test -- --runInBand scripts/lib/dry-run.unit.test.ts
 * @see scripts/README.md - Top-level MCP workflow guide for these test helpers.
 * @documentation reviewed=2026-04-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock modules before imports
jest.unstable_mockModule("fs/promises", () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  mkdir: jest.fn(),
  access: jest.fn(),
  stat: jest.fn(),
  readdir: jest.fn(),
  unlink: jest.fn(),
}));

jest.unstable_mockModule("fs", () => ({
  existsSync: jest.fn(),
  constants: { R_OK: 4, W_OK: 2 },
  statSync: jest.fn(),
}));

const mockFsPromises = await import("fs/promises").then((m) => m);
const mockFs = await import("fs").then((m) => m);

// Import module under test
const {
  dryRunWrite,
  dryRunWriteMultiple,
  allDryRunsSuccessful,
  getDryRunErrors,
  getDryRunWarnings,
  formatDryRunResult,
  formatDryRunResults,
  createSkipResult,
} = await import(pathToFileURL(path.resolve(__dirname, "./dry-run.ts")).href).then((m) => m);

describe("dry-run", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================================================
  // dryRunWrite
  // ==========================================================================

  describe("dryRunWrite", () => {
    // Note: dryRunWrite uses require("fs") internally which bypasses ESM mocks
    // These tests validate only the syntax validation aspect, not the filesystem operations
    it("detects invalid JSON content", async () => {
      const result = await dryRunWrite(
        "/tmp/mcp-test-config.json",
        '{"key": }',
        { format: "json", createIfMissing: true }
      );

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes("Invalid JSON"))).toBe(true);
    });

    it("detects invalid YAML content", async () => {
      (mockFs.existsSync as jest.MockedFunction<typeof mockFs.existsSync>).mockReturnValue(false);
      (mockFsPromises.access as jest.MockedFunction<typeof mockFsPromises.access>).mockResolvedValue(undefined);

      const content = "key: [invalid: yaml";
      const result = await dryRunWrite(
        "/test/config.yaml",
        content,
        { format: "yaml", createIfMissing: true }
      );

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes("Invalid YAML"))).toBe(true);
    });

    it("returns create operation for new file", async () => {
      const result = await dryRunWrite(
        "/tmp/mcp-test-config.json",
        '{"key": "value"}',
        { format: "json", createIfMissing: true }
      );

      expect(result.operation).toBe("create");
    });

    it("returns update operation for existing file with changes", async () => {
      (mockFs.existsSync as jest.MockedFunction<typeof mockFs.existsSync>).mockReturnValue(true);
      (mockFsPromises.readFile as jest.MockedFunction<typeof mockFsPromises.readFile>).mockResolvedValue(
        '{"old": "value"}' as unknown as Awaited<ReturnType<typeof mockFsPromises.readFile>>
      );
      (mockFsPromises.access as jest.MockedFunction<typeof mockFsPromises.access>).mockResolvedValue(undefined);

      const result = await dryRunWrite(
        "/test/config.json",
        '{"new": "value"}',
        { format: "json" }
      );

      expect(result.operation).toBe("update");
    });

    it("returns skip operation when content unchanged", async () => {
      const content = '{"key": "value"}';
      (mockFs.existsSync as jest.MockedFunction<typeof mockFs.existsSync>).mockReturnValue(true);
      (mockFsPromises.readFile as jest.MockedFunction<typeof mockFsPromises.readFile>).mockResolvedValue(
        content as unknown as Awaited<ReturnType<typeof mockFsPromises.readFile>>
      );
      (mockFsPromises.access as jest.MockedFunction<typeof mockFsPromises.access>).mockResolvedValue(undefined);

      const result = await dryRunWrite(
        "/test/config.json",
        content,
        { format: "json" }
      );

      expect(result.operation).toBe("skip");
    });

    it("errors when file missing and createIfMissing is false", async () => {
      (mockFs.existsSync as jest.MockedFunction<typeof mockFs.existsSync>).mockReturnValue(false);
      (mockFsPromises.access as jest.MockedFunction<typeof mockFsPromises.access>).mockResolvedValue(undefined);

      const result = await dryRunWrite(
        "/test/config.json",
        '{"key": "value"}',
        { format: "json", createIfMissing: false }
      );

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes("does not exist"))).toBe(true);
    });

    it("errors when no write permission", async () => {
      (mockFs.existsSync as jest.MockedFunction<typeof mockFs.existsSync>).mockReturnValue(true);
      (mockFsPromises.readFile as jest.MockedFunction<typeof mockFsPromises.readFile>).mockResolvedValue(
        '{}' as unknown as Awaited<ReturnType<typeof mockFsPromises.readFile>>
      );
      (mockFsPromises.access as jest.MockedFunction<typeof mockFsPromises.access>).mockRejectedValue(
        new Error("EACCES")
      );

      const result = await dryRunWrite(
        "/test/config.json",
        '{"key": "value"}',
        { format: "json" }
      );

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes("No write permission"))).toBe(true);
    });

    it("generates diff for new file", async () => {
      (mockFs.existsSync as jest.MockedFunction<typeof mockFs.existsSync>).mockReturnValue(false);
      (mockFsPromises.access as jest.MockedFunction<typeof mockFsPromises.access>).mockResolvedValue(undefined);

      const result = await dryRunWrite(
        "/test/config.json",
        '{"key": "value"}',
        { format: "json", createIfMissing: true }
      );

      expect(result.diff).toContain("[New file]");
      expect(result.diff).toContain("+");
    });

    it("generates diff showing changes", async () => {
      (mockFs.existsSync as jest.MockedFunction<typeof mockFs.existsSync>).mockReturnValue(true);
      (mockFsPromises.readFile as jest.MockedFunction<typeof mockFsPromises.readFile>).mockResolvedValue(
        '{"old": "value"}' as unknown as Awaited<ReturnType<typeof mockFsPromises.readFile>>
      );
      (mockFsPromises.access as jest.MockedFunction<typeof mockFsPromises.access>).mockResolvedValue(undefined);

      const result = await dryRunWrite(
        "/test/config.json",
        '{"new": "value"}',
        { format: "json" }
      );

      expect(result.diff).toContain("-");
      expect(result.diff).toContain("+");
    });

    it("runs custom validation when provided", async () => {
      (mockFs.existsSync as jest.MockedFunction<typeof mockFs.existsSync>).mockReturnValue(false);
      (mockFsPromises.access as jest.MockedFunction<typeof mockFsPromises.access>).mockResolvedValue(undefined);

      /**
       * Test `validateContent` hook that fails when parsed JSON omits `required`.
       *
       * @remarks
       * Covers `dryRunWrite` propagation of custom validation messages into `result.errors`.
       */
      const customValidator = (content: unknown) => {
        const obj = content as { required?: string };
        if (!obj.required) {
          return ["Missing required field"];
        }
        return [];
      };

      const result = await dryRunWrite(
        "/test/config.json",
        '{"key": "value"}',
        { format: "json", createIfMissing: true, validateContent: customValidator }
      );

      expect(result.success).toBe(false);
      expect(result.errors).toContain("Missing required field");
    });
  });

  // ==========================================================================
  // Helper Functions
  // ==========================================================================

  describe("allDryRunsSuccessful", () => {
    it("returns true when all results successful", () => {
      const results = [
        { success: true, targetPath: "/a", operation: "create" as const, currentContent: null, proposedContent: "", diff: "", errors: [], warnings: [] },
        { success: true, targetPath: "/b", operation: "update" as const, currentContent: "", proposedContent: "", diff: "", errors: [], warnings: [] },
      ];

      expect(allDryRunsSuccessful(results)).toBe(true);
    });

    it("returns false when any result failed", () => {
      const results = [
        { success: true, targetPath: "/a", operation: "create" as const, currentContent: null, proposedContent: "", diff: "", errors: [], warnings: [] },
        { success: false, targetPath: "/b", operation: "update" as const, currentContent: "", proposedContent: "", diff: "", errors: ["Error"], warnings: [] },
      ];

      expect(allDryRunsSuccessful(results)).toBe(false);
    });
  });

  describe("getDryRunErrors", () => {
    it("collects all errors from results", () => {
      const results = [
        { success: false, targetPath: "/a.json", operation: "create" as const, currentContent: null, proposedContent: "", diff: "", errors: ["Error 1"], warnings: [] },
        { success: false, targetPath: "/b.json", operation: "update" as const, currentContent: "", proposedContent: "", diff: "", errors: ["Error 2", "Error 3"], warnings: [] },
      ];

      const errors = getDryRunErrors(results);

      expect(errors.length).toBe(3);
      expect(errors[0]).toContain("Error 1");
      expect(errors[1]).toContain("Error 2");
    });
  });

  describe("getDryRunWarnings", () => {
    it("collects all warnings from results", () => {
      const results = [
        { success: true, targetPath: "/a.json", operation: "create" as const, currentContent: null, proposedContent: "", diff: "", errors: [], warnings: ["Warning 1"] },
        { success: true, targetPath: "/b.json", operation: "update" as const, currentContent: "", proposedContent: "", diff: "", errors: [], warnings: ["Warning 2"] },
      ];

      const warnings = getDryRunWarnings(results);

      expect(warnings.length).toBe(2);
      expect(warnings[0]).toContain("Warning 1");
    });
  });

  // ==========================================================================
  // Formatting Functions
  // ==========================================================================

  describe("formatDryRunResult", () => {
    it("formats successful result with checkmark", () => {
      const result = {
        success: true,
        targetPath: "/test/config.json",
        operation: "create" as const,
        currentContent: null,
        proposedContent: "{}",
        diff: "",
        errors: [],
        warnings: [],
      };

      const formatted = formatDryRunResult(result);

      expect(formatted).toContain("✓");
      expect(formatted).toContain("config.json");
      expect(formatted).toContain("create");
    });

    it("formats failed result with X mark", () => {
      const result = {
        success: false,
        targetPath: "/test/config.json",
        operation: "update" as const,
        currentContent: "{}",
        proposedContent: "{}",
        diff: "",
        errors: ["Validation failed"],
        warnings: [],
      };

      const formatted = formatDryRunResult(result);

      expect(formatted).toContain("✗");
      expect(formatted).toContain("Validation failed");
    });

    it("includes warnings in output", () => {
      const result = {
        success: true,
        targetPath: "/test/config.json",
        operation: "update" as const,
        currentContent: "{}",
        proposedContent: "{}",
        diff: "",
        errors: [],
        warnings: ["Consider backup"],
      };

      const formatted = formatDryRunResult(result);

      expect(formatted).toContain("Warning:");
      expect(formatted).toContain("Consider backup");
    });
  });

  describe("formatDryRunResults", () => {
    it("formats multiple results", () => {
      const results = [
        { success: true, targetPath: "/a.json", operation: "create" as const, currentContent: null, proposedContent: "", diff: "", errors: [], warnings: [] },
        { success: true, targetPath: "/b.json", operation: "update" as const, currentContent: "", proposedContent: "", diff: "", errors: [], warnings: [] },
      ];

      const formatted = formatDryRunResults(results);

      expect(formatted).toContain("/a.json");
      expect(formatted).toContain("/b.json");
    });
  });

  describe("createSkipResult", () => {
    it("creates skip result with reason", () => {
      const result = createSkipResult("/test/config.json", "No changes needed");

      expect(result.success).toBe(true);
      expect(result.operation).toBe("skip");
      expect(result.diff).toContain("Skipped");
      expect(result.diff).toContain("No changes needed");
    });
  });
});
