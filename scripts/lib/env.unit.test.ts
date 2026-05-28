/**
 * @fileoverview Jest unit tests for MCP library helpers.
 * @testing Jest unit: npm test -- --runInBand scripts/lib/env.unit.test.ts
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
  ENV_FILE_NAME,
  ENV_EXAMPLE_FILE_NAME,
  readEnvFile,
  getEnvVar,
  isEnvVarSet,
  validateEnvVars,
  getMissingVarsForServers,
  generateEnvContent,
  updateEnvVar,
  writeEnvFile,
  updateEnvFileVar,
  ENV_TEMPLATE_COMMENTS,
  ENV_TEMPLATE_VALUES,
  generateEnvTemplate,
  createEnvTemplate,
  maskSecret,
  getEnvVarStatus,
} = await Promise.resolve(import("./env"));

describe("env", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================================================
  // Constants
  // ==========================================================================

  describe("constants", () => {
    it("ENV_FILE_NAME is .mcp-sync/env", () => {
      expect(ENV_FILE_NAME).toBe(".mcp-sync/env");
    });

    it("ENV_EXAMPLE_FILE_NAME is .mcp-sync/env.example", () => {
      expect(ENV_EXAMPLE_FILE_NAME).toBe(".mcp-sync/env.example");
    });

    it("ENV_TEMPLATE_COMMENTS has expected keys", () => {
      expect(ENV_TEMPLATE_COMMENTS).toHaveProperty(
        "MCP_CHROME_DEVTOOLS_ENABLE_USAGE_STATISTICS"
      );
      expect(ENV_TEMPLATE_COMMENTS).toHaveProperty(
        "MCP_CHROME_DEVTOOLS_ENABLE_UPDATE_CHECKS"
      );
      expect(ENV_TEMPLATE_COMMENTS).toHaveProperty("MCP_FIRECRAWL_API_KEY");
      expect(ENV_TEMPLATE_COMMENTS).toHaveProperty("MCP_MONGODB_CONNECTION_STRING");
    });

    it("ENV_TEMPLATE_VALUES has expected keys", () => {
      expect(ENV_TEMPLATE_VALUES).toHaveProperty(
        "MCP_CHROME_DEVTOOLS_ENABLE_USAGE_STATISTICS"
      );
      expect(ENV_TEMPLATE_VALUES).toHaveProperty(
        "MCP_CHROME_DEVTOOLS_ENABLE_UPDATE_CHECKS"
      );
      expect(ENV_TEMPLATE_VALUES).toHaveProperty("MCP_FIRECRAWL_API_KEY");
      expect(ENV_TEMPLATE_VALUES).toHaveProperty("MCP_ZAI_API_KEY");
    });
  });

  // ==========================================================================
  // Read Functions
  // ==========================================================================

  describe("readEnvFile", () => {
    it("returns empty object when file does not exist", async () => {
      (mockFs.existsSync as jest.MockedFunction<typeof mockFs.existsSync>).mockReturnValue(false);

      const result = await readEnvFile("/test/.mcp-sync/env");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({});
      }
    });

    it("parses key=value pairs", async () => {
      (mockFs.existsSync as jest.MockedFunction<typeof mockFs.existsSync>).mockReturnValue(true);
      (mockFsPromises.readFile as jest.MockedFunction<typeof mockFsPromises.readFile>).mockResolvedValue(
        "KEY1=value1\nKEY2=value2" as unknown as Awaited<ReturnType<typeof mockFsPromises.readFile>>
      );

      const result = await readEnvFile("/test/.mcp-sync/env");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.KEY1).toBe("value1");
        expect(result.data.KEY2).toBe("value2");
      }
    });

    it("handles quoted values", async () => {
      (mockFs.existsSync as jest.MockedFunction<typeof mockFs.existsSync>).mockReturnValue(true);
      (mockFsPromises.readFile as jest.MockedFunction<typeof mockFsPromises.readFile>).mockResolvedValue(
        'KEY="quoted value"' as unknown as Awaited<ReturnType<typeof mockFsPromises.readFile>>
      );

      const result = await readEnvFile("/test/.mcp-sync/env");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.KEY).toBe("quoted value");
      }
    });

    it("ignores comments", async () => {
      (mockFs.existsSync as jest.MockedFunction<typeof mockFs.existsSync>).mockReturnValue(true);
      (mockFsPromises.readFile as jest.MockedFunction<typeof mockFsPromises.readFile>).mockResolvedValue(
        "# Comment\nKEY=value" as unknown as Awaited<ReturnType<typeof mockFsPromises.readFile>>
      );

      const result = await readEnvFile("/test/.mcp-sync/env");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.KEY).toBe("value");
        expect(result.data["# Comment"]).toBeUndefined();
      }
    });

    it("returns error on read failure", async () => {
      (mockFs.existsSync as jest.MockedFunction<typeof mockFs.existsSync>).mockReturnValue(true);
      (mockFsPromises.readFile as jest.MockedFunction<typeof mockFsPromises.readFile>).mockRejectedValue(
        new Error("Permission denied")
      );

      const result = await readEnvFile("/test/.mcp-sync/env");

      expect(result.success).toBe(false);
    });
  });

  describe("getEnvVar", () => {
    it("returns value for existing variable", () => {
      const env = { KEY: "value" };
      expect(getEnvVar(env, "KEY")).toBe("value");
    });

    it("returns undefined for missing variable", () => {
      const env = { KEY: "value" };
      expect(getEnvVar(env, "MISSING")).toBeUndefined();
    });
  });

  describe("isEnvVarSet", () => {
    it("returns true for non-empty value", () => {
      const env = { KEY: "value" };
      expect(isEnvVarSet(env, "KEY")).toBe(true);
    });

    it("returns false for empty string", () => {
      const env = { KEY: "" };
      expect(isEnvVarSet(env, "KEY")).toBe(false);
    });

    it("returns false for whitespace-only value", () => {
      const env = { KEY: "   " };
      expect(isEnvVarSet(env, "KEY")).toBe(false);
    });

    it("returns false for undefined variable", () => {
      const env = {};
      expect(isEnvVarSet(env, "KEY")).toBe(false);
    });
  });

  // ==========================================================================
  // Validation Functions
  // ==========================================================================

  describe("validateEnvVars", () => {
    it("returns valid when all vars present", () => {
      const env = { KEY1: "value1", KEY2: "value2" };
      const result = validateEnvVars(env, ["KEY1", "KEY2"]);

      expect(result.isValid).toBe(true);
      expect(result.setVars).toEqual(["KEY1", "KEY2"]);
      expect(result.missingVars).toEqual([]);
      expect(result.emptyVars).toEqual([]);
    });

    it("detects missing variables", () => {
      const env = { KEY1: "value1" };
      const result = validateEnvVars(env, ["KEY1", "KEY2"]);

      expect(result.isValid).toBe(false);
      expect(result.missingVars).toEqual(["KEY2"]);
    });

    it("detects empty variables", () => {
      const env = { KEY1: "value1", KEY2: "" };
      const result = validateEnvVars(env, ["KEY1", "KEY2"]);

      expect(result.isValid).toBe(false);
      expect(result.emptyVars).toEqual(["KEY2"]);
    });

    it("returns valid for empty required list", () => {
      const result = validateEnvVars({}, []);

      expect(result.isValid).toBe(true);
    });
  });

  describe("getMissingVarsForServers", () => {
    it("returns missing vars grouped by server", () => {
      const env = { VAR1: "set" };
      const serverEnvVars = new Map([
        ["server1", ["VAR1", "VAR2"]],
        ["server2", ["VAR3"]],
      ]);

      const result = getMissingVarsForServers(env, serverEnvVars);

      expect(result.get("server1")).toEqual(["VAR2"]);
      expect(result.get("server2")).toEqual(["VAR3"]);
    });

    it("omits servers with all vars set", () => {
      const env = { VAR1: "set", VAR2: "set" };
      const serverEnvVars = new Map([
        ["server1", ["VAR1", "VAR2"]],
        ["server2", ["VAR3"]],
      ]);

      const result = getMissingVarsForServers(env, serverEnvVars);

      expect(result.has("server1")).toBe(false);
      expect(result.has("server2")).toBe(true);
    });
  });

  // ==========================================================================
  // Write Functions
  // ==========================================================================

  describe("generateEnvContent", () => {
    it("generates key=value format", () => {
      const vars = { KEY1: "value1", KEY2: "value2" };
      const content = generateEnvContent(vars);

      expect(content).toContain("KEY1=value1");
      expect(content).toContain("KEY2=value2");
    });

    it("quotes values with spaces", () => {
      const vars = { KEY: "value with spaces" };
      const content = generateEnvContent(vars);

      expect(content).toContain('KEY="value with spaces"');
    });

    it("escapes quotes in values", () => {
      const vars = { KEY: 'value with "quotes"' };
      const content = generateEnvContent(vars);

      expect(content).toContain('\\"');
    });

    it("includes comments when provided", () => {
      const vars = { KEY: "value" };
      const comments = { KEY: "This is a comment" };
      const content = generateEnvContent(vars, comments);

      expect(content).toContain("# This is a comment");
    });
  });

  describe("updateEnvVar", () => {
    it("updates existing variable", () => {
      const content = "KEY=old";
      const result = updateEnvVar(content, "KEY", "new");

      expect(result).toBe("KEY=new");
    });

    it("adds new variable at end", () => {
      const content = "EXISTING=value";
      const result = updateEnvVar(content, "NEW", "newvalue");

      expect(result).toContain("EXISTING=value");
      expect(result).toContain("NEW=newvalue");
    });

    it("preserves other variables", () => {
      const content = "KEY1=value1\nKEY2=value2\nKEY3=value3";
      const result = updateEnvVar(content, "KEY2", "updated");

      expect(result).toContain("KEY1=value1");
      expect(result).toContain("KEY2=updated");
      expect(result).toContain("KEY3=value3");
    });

    it("quotes values with special characters", () => {
      const content = "KEY=old";
      const result = updateEnvVar(content, "KEY", "value with $pecial chars");

      expect(result).toContain('"value with $pecial chars"');
    });
  });

  describe("writeEnvFile", () => {
    it("writes formatted content to file", async () => {
      (mockFsPromises.writeFile as jest.MockedFunction<typeof mockFsPromises.writeFile>).mockResolvedValue(undefined);

      const vars = { KEY: "value" };
      const result = await writeEnvFile("/test/.mcp-sync/env", vars);

      expect(result.success).toBe(true);
      expect(mockFsPromises.writeFile).toHaveBeenCalledWith(
        "/test/.mcp-sync/env",
        expect.stringContaining("KEY=value"),
        "utf-8"
      );
    });

    it("returns error on write failure", async () => {
      (mockFsPromises.writeFile as jest.MockedFunction<typeof mockFsPromises.writeFile>).mockRejectedValue(
        new Error("Permission denied")
      );

      const result = await writeEnvFile("/test/.mcp-sync/env", {});

      expect(result.success).toBe(false);
    });
  });

  describe("updateEnvFileVar", () => {
    it("updates variable in existing file", async () => {
      (mockFs.existsSync as jest.MockedFunction<typeof mockFs.existsSync>).mockReturnValue(true);
      (mockFsPromises.readFile as jest.MockedFunction<typeof mockFsPromises.readFile>).mockResolvedValue(
        "KEY=old" as unknown as Awaited<ReturnType<typeof mockFsPromises.readFile>>
      );
      (mockFsPromises.writeFile as jest.MockedFunction<typeof mockFsPromises.writeFile>).mockResolvedValue(undefined);

      const result = await updateEnvFileVar("/test/.mcp-sync/env", "KEY", "new");

      expect(result.success).toBe(true);
      expect(mockFsPromises.writeFile).toHaveBeenCalledWith(
        "/test/.mcp-sync/env",
        "KEY=new",
        "utf-8"
      );
    });

    it("creates file with variable if missing", async () => {
      (mockFs.existsSync as jest.MockedFunction<typeof mockFs.existsSync>).mockReturnValue(false);
      (mockFsPromises.writeFile as jest.MockedFunction<typeof mockFsPromises.writeFile>).mockResolvedValue(undefined);

      const result = await updateEnvFileVar("/test/.mcp-sync/env", "KEY", "value");

      expect(result.success).toBe(true);
    });
  });

  // ==========================================================================
  // Template Functions
  // ==========================================================================

  describe("generateEnvTemplate", () => {
    it("includes header comment", () => {
      const template = generateEnvTemplate();

      expect(template).toContain("MCP Server Environment Variables");
    });

    it("includes all standard env vars", () => {
      const template = generateEnvTemplate();

      expect(template).toContain("MCP_APIFY_API_TOKEN");
      expect(template).toContain("MCP_CHROME_DEVTOOLS_ENABLE_USAGE_STATISTICS");
      expect(template).toContain("MCP_CHROME_DEVTOOLS_ENABLE_UPDATE_CHECKS");
      expect(template).toContain("MCP_FIRECRAWL_API_KEY");
      expect(template).toContain("MCP_MONGODB_CONNECTION_STRING");
      expect(template).toContain("MCP_ZAI_API_KEY");
    });

    it("includes placeholder values", () => {
      const template = generateEnvTemplate();

      expect(template).toContain("your-");
    });
  });

  describe("createEnvTemplate", () => {
    it("writes template to file", async () => {
      (mockFsPromises.writeFile as jest.MockedFunction<typeof mockFsPromises.writeFile>).mockResolvedValue(undefined);

      const result = await createEnvTemplate("/test/.mcp-sync/env.example");

      expect(result.success).toBe(true);
      expect(mockFsPromises.writeFile).toHaveBeenCalled();
    });

    it("returns error on write failure", async () => {
      (mockFsPromises.writeFile as jest.MockedFunction<typeof mockFsPromises.writeFile>).mockRejectedValue(
        new Error("Permission denied")
      );

      const result = await createEnvTemplate("/test/.mcp-sync/env.example");

      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // Utility Functions
  // ==========================================================================

  describe("maskSecret", () => {
    it("masks long secrets showing first and last 4 chars", () => {
      const secret = "super-secret-api-key-12345";
      const masked = maskSecret(secret);

      expect(masked).toBe("supe...2345");
    });

    it("masks short secrets completely", () => {
      const secret = "short";
      const masked = maskSecret(secret);

      expect(masked).toBe("****");
    });

    it("masks 8-char secrets completely", () => {
      const secret = "12345678";
      const masked = maskSecret(secret);

      expect(masked).toBe("****");
    });
  });

  describe("getEnvVarStatus", () => {
    it("returns 'set' for non-empty value", () => {
      const env = { KEY: "value" };
      expect(getEnvVarStatus(env, "KEY")).toBe("set");
    });

    it("returns 'empty' for empty string", () => {
      const env = { KEY: "" };
      expect(getEnvVarStatus(env, "KEY")).toBe("empty");
    });

    it("returns 'empty' for whitespace-only value", () => {
      const env = { KEY: "   " };
      expect(getEnvVarStatus(env, "KEY")).toBe("empty");
    });

    it("returns 'missing' for undefined variable", () => {
      const env = {};
      expect(getEnvVarStatus(env, "KEY")).toBe("missing");
    });
  });
});
