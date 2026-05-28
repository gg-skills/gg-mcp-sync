/**
 * @fileoverview Jest unit tests for MCP library helpers.
 * @testing Jest unit: npm test -- --runInBand scripts/lib/config-writer.unit.test.ts
 * @see scripts/README.md - Top-level MCP workflow guide for these test helpers.
 * @documentation reviewed=2026-04-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { jest, describe, it, expect, beforeEach } from "@jest/globals";

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

const mockFsPromisesModule = import("fs/promises");
const mockFsModule = import("fs");
const mockFsPromises = await mockFsPromisesModule;
const mockFs = await mockFsModule;

// Import module under test
const configWriterModule = import(new URL("./config-writer", import.meta.url).href);
const {
  getKeyPath,
  generateConfigContent,
  mergeWithExisting,
  writeConfig,
  removeServersFromConfig,
  createMinimalConfig,
  hasConfiguredServers,
  getConfiguredServerIds,
  serializeToYamlContinue,
} = await configWriterModule;

describe("config-writer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================================================
  // Key Path Helpers
  // ==========================================================================

  describe("getKeyPath", () => {
    it("returns ['mcpServers'] for mcpServers format", () => {
      expect(getKeyPath("mcpServers")).toEqual(["mcpServers"]);
    });

    it("returns ['servers'] for servers format", () => {
      expect(getKeyPath("servers")).toEqual(["servers"]);
    });

    it("returns ['context_servers'] for Zed format", () => {
      expect(getKeyPath("context_servers")).toEqual(["context_servers"]);
    });

    it("returns ['mcp'] for flat OpenCode format", () => {
      expect(getKeyPath("mcp-opencode")).toEqual(["mcp"]);
    });

    it("returns ['mcp_servers'] for Trae format", () => {
      expect(getKeyPath("mcp_servers")).toEqual(["mcp_servers"]);
    });

    it("returns ['extensions'] for Goose format", () => {
      expect(getKeyPath("extensions")).toEqual(["extensions"]);
    });

    it("returns ['amp.mcpServers'] for Amp format", () => {
      expect(getKeyPath("amp.mcpServers")).toEqual(["amp.mcpServers"]);
    });

    it("returns ['openctx.providers'] for Cody format", () => {
      expect(getKeyPath("openctx.providers")).toEqual(["openctx.providers"]);
    });

    it("returns empty array for ui-only format", () => {
      expect(getKeyPath("ui-only")).toEqual([]);
    });

    it("defaults to mcpServers for unknown format", () => {
      expect(getKeyPath("unknown" as never)).toEqual(["mcpServers"]);
    });
  });

  // ==========================================================================
  // Content Generation
  // ==========================================================================

  describe("generateConfigContent", () => {
    const sampleServers = {
      "test-server": {
        command: "npx",
        args: ["-y", "test-mcp"],
        env: { API_KEY: "test-key" },
      },
    };

    it("generates JSON content with mcpServers key", () => {
      const result = generateConfigContent(sampleServers, "mcpServers", "json");
      const parsed = JSON.parse(result);

      expect(parsed.mcpServers).toBeDefined();
      expect(parsed.mcpServers["test-server"]).toEqual(sampleServers["test-server"]);
    });

    it("generates JSON content with servers key", () => {
      const result = generateConfigContent(sampleServers, "servers", "json");
      const parsed = JSON.parse(result);

      expect(parsed.servers).toBeDefined();
      expect(parsed.servers["test-server"]).toEqual(sampleServers["test-server"]);
    });

    it("generates JSON content with flat mcp key for OpenCode", () => {
      const result = generateConfigContent(sampleServers, "mcp-opencode", "json");
      const parsed = JSON.parse(result);

      expect(parsed.mcp).toBeDefined();
      expect(parsed.mcp["test-server"]).toEqual(sampleServers["test-server"]);
      expect(parsed.mcp.servers).toBeUndefined();
    });

    it("merges with existing content when provided", () => {
      const existing = '{"other": "value", "mcpServers": {"existing": {}}}';
      const result = generateConfigContent(sampleServers, "mcpServers", "json", existing);
      const parsed = JSON.parse(result);

      expect(parsed.other).toBe("value");
      expect(parsed.mcpServers["test-server"]).toBeDefined();
    });
  });

  describe("serializeToYamlContinue", () => {
    // Note: This test requires js-yaml which uses require() internally
    // ESM mocking doesn't intercept require() calls
    it.skip("generates YAML for Continue format - skipped due to ESM/require incompatibility", () => {
      const config = {
        command: "npx",
        args: ["-y", "test-mcp"],
        env: { API_KEY: "key" },
      };

      const result = serializeToYamlContinue("test-server", config);

      expect(result).toContain("name: test-server");
      expect(result).toContain("command: npx");
    });
  });

  // ==========================================================================
  // Merge Operations
  // ==========================================================================

  describe("mergeWithExisting", () => {
    it("returns new content when file does not exist", async () => {
      (mockFs.existsSync as jest.MockedFunction<typeof mockFs.existsSync>).mockReturnValue(false);

      const servers = { "new-server": { command: "cmd" } };
      const result = await mergeWithExisting(
        "/test/config.json",
        servers,
        "mcpServers",
        "json",
        {}
      );

      expect(result.success).toBe(true);
      if (result.success) {
        const parsed = JSON.parse(result.data);
        expect(parsed.mcpServers["new-server"]).toEqual({ command: "cmd" });
      }
    });

    it("merges with existing servers when preserveExisting is true", async () => {
      const existingContent = '{"mcpServers": {"existing": {"command": "old"}}}';
      (mockFs.existsSync as jest.MockedFunction<typeof mockFs.existsSync>).mockReturnValue(true);
      (mockFsPromises.readFile as jest.MockedFunction<typeof mockFsPromises.readFile>).mockResolvedValue(
        existingContent as unknown as Awaited<ReturnType<typeof mockFsPromises.readFile>>
      );

      const servers = { "new-server": { command: "new" } };
      const result = await mergeWithExisting(
        "/test/config.json",
        servers,
        "mcpServers",
        "json",
        { preserveExisting: true }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        const parsed = JSON.parse(result.data);
        expect(parsed.mcpServers["existing"]).toBeDefined();
        expect(parsed.mcpServers["new-server"]).toBeDefined();
      }
    });

    it("migrates legacy nested OpenCode servers when preserving existing content", async () => {
      const existingContent = '{"mcp":{"servers":{"existing":{"type":"local","command":["npx","old"]}}}}';
      (mockFs.existsSync as jest.MockedFunction<typeof mockFs.existsSync>).mockReturnValue(true);
      (mockFsPromises.readFile as jest.MockedFunction<typeof mockFsPromises.readFile>).mockResolvedValue(
        existingContent as unknown as Awaited<ReturnType<typeof mockFsPromises.readFile>>
      );

      const servers = { "new-server": { type: "local", command: ["npx", "new"] } };
      const result = await mergeWithExisting(
        "/test/opencode.json",
        servers,
        "mcp-opencode",
        "json",
        { preserveExisting: true }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        const parsed = JSON.parse(result.data);
        expect(parsed.mcp.existing).toBeDefined();
        expect(parsed.mcp["new-server"]).toBeDefined();
        expect(parsed.mcp.servers).toBeUndefined();
      }
    });

    it("removes specified servers when removeServerIds is provided", async () => {
      const existingContent = '{"mcpServers": {"keep": {}, "remove": {}}}';
      (mockFs.existsSync as jest.MockedFunction<typeof mockFs.existsSync>).mockReturnValue(true);
      (mockFsPromises.readFile as jest.MockedFunction<typeof mockFsPromises.readFile>).mockResolvedValue(
        existingContent as unknown as Awaited<ReturnType<typeof mockFsPromises.readFile>>
      );

      const result = await mergeWithExisting(
        "/test/config.json",
        {},
        "mcpServers",
        "json",
        { preserveExisting: true, removeServerIds: ["remove"] }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        const parsed = JSON.parse(result.data);
        expect(parsed.mcpServers["keep"]).toBeDefined();
        expect(parsed.mcpServers["remove"]).toBeUndefined();
      }
    });
  });

  // ==========================================================================
  // Write Operations
  // ==========================================================================

  describe("writeConfig", () => {
    // Note: writeConfig uses require("fs") internally which bypasses ESM mocks
    // These tests would require actual filesystem or CommonJS test infrastructure
    it.skip("writes config successfully - skipped due to ESM/require incompatibility", async () => {
      (mockFs.existsSync as jest.MockedFunction<typeof mockFs.existsSync>).mockReturnValue(false);
      (mockFsPromises.access as jest.MockedFunction<typeof mockFsPromises.access>).mockResolvedValue(undefined);
      (mockFsPromises.mkdir as jest.MockedFunction<typeof mockFsPromises.mkdir>).mockResolvedValue(undefined);
      (mockFsPromises.writeFile as jest.MockedFunction<typeof mockFsPromises.writeFile>).mockResolvedValue(undefined);

      const servers = { "test-server": { command: "cmd" } };
      const result = await writeConfig(
        "/test/config.json",
        servers,
        "mcpServers",
        "json"
      );

      expect(result.success).toBe(true);
      expect(result.dryRun.operation).toBe("create");
    });

    it("skips write when content unchanged", async () => {
      const content = '{\n  "mcpServers": {\n    "test-server": {\n      "command": "cmd"\n    }\n  }\n}\n';
      (mockFs.existsSync as jest.MockedFunction<typeof mockFs.existsSync>).mockReturnValue(true);
      (mockFsPromises.readFile as jest.MockedFunction<typeof mockFsPromises.readFile>).mockResolvedValue(
        content as unknown as Awaited<ReturnType<typeof mockFsPromises.readFile>>
      );
      (mockFsPromises.access as jest.MockedFunction<typeof mockFsPromises.access>).mockResolvedValue(undefined);

      const servers = { "test-server": { command: "cmd" } };
      const result = await writeConfig(
        "/test/config.json",
        servers,
        "mcpServers",
        "json"
      );

      expect(result.success).toBe(true);
      expect(result.dryRun.operation).toBe("skip");
    });

    it("creates backup for global files when requested", async () => {
      const existingContent = '{"mcpServers": {}}';
      (mockFs.existsSync as jest.MockedFunction<typeof mockFs.existsSync>).mockReturnValue(true);
      (mockFsPromises.readFile as jest.MockedFunction<typeof mockFsPromises.readFile>).mockResolvedValue(
        existingContent as unknown as Awaited<ReturnType<typeof mockFsPromises.readFile>>
      );
      (mockFsPromises.access as jest.MockedFunction<typeof mockFsPromises.access>).mockResolvedValue(undefined);
      (mockFsPromises.mkdir as jest.MockedFunction<typeof mockFsPromises.mkdir>).mockResolvedValue(undefined);
      (mockFsPromises.writeFile as jest.MockedFunction<typeof mockFsPromises.writeFile>).mockResolvedValue(undefined);
      (mockFsPromises.copyFile as jest.MockedFunction<typeof mockFsPromises.copyFile>).mockResolvedValue(undefined);
      (mockFsPromises.stat as jest.MockedFunction<typeof mockFsPromises.stat>).mockResolvedValue({
        size: 100,
        mtime: new Date(),
        isDirectory: () => false,
        isFile: () => true,
      } as unknown as Awaited<ReturnType<typeof mockFsPromises.stat>>);
      (mockFsPromises.readdir as jest.MockedFunction<typeof mockFsPromises.readdir>).mockResolvedValue(
        [] as unknown as Awaited<ReturnType<typeof mockFsPromises.readdir>>
      );

      const servers = { "new-server": { command: "cmd" } };
      const result = await writeConfig(
        "/test/config.json",
        servers,
        "mcpServers",
        "json",
        { createBackup: true }
      );

      expect(result.success).toBe(true);
      expect(result.backupPath).toBeDefined();
    });
  });

  describe("removeServersFromConfig", () => {
    it("removes specified servers from config", async () => {
      const existingContent = '{"mcpServers": {"keep": {}, "remove": {}}}';
      (mockFs.existsSync as jest.MockedFunction<typeof mockFs.existsSync>).mockReturnValue(true);
      (mockFsPromises.readFile as jest.MockedFunction<typeof mockFsPromises.readFile>).mockResolvedValue(
        existingContent as unknown as Awaited<ReturnType<typeof mockFsPromises.readFile>>
      );
      (mockFsPromises.access as jest.MockedFunction<typeof mockFsPromises.access>).mockResolvedValue(undefined);
      (mockFsPromises.mkdir as jest.MockedFunction<typeof mockFsPromises.mkdir>).mockResolvedValue(undefined);
      (mockFsPromises.writeFile as jest.MockedFunction<typeof mockFsPromises.writeFile>).mockResolvedValue(undefined);

      const result = await removeServersFromConfig(
        "/test/config.json",
        ["remove"],
        "mcpServers",
        "json"
      );

      expect(result.success).toBe(true);
    });
  });

  describe("createMinimalConfig", () => {
    // Note: createMinimalConfig uses require("fs") internally which bypasses ESM mocks
    it.skip("creates minimal empty config - skipped due to ESM/require incompatibility", async () => {
      (mockFs.existsSync as jest.MockedFunction<typeof mockFs.existsSync>).mockReturnValue(false);
      (mockFsPromises.access as jest.MockedFunction<typeof mockFsPromises.access>).mockResolvedValue(undefined);
      (mockFsPromises.mkdir as jest.MockedFunction<typeof mockFsPromises.mkdir>).mockResolvedValue(undefined);
      (mockFsPromises.writeFile as jest.MockedFunction<typeof mockFsPromises.writeFile>).mockResolvedValue(undefined);

      const result = await createMinimalConfig(
        "/test/config.json",
        "mcpServers",
        "json"
      );

      expect(result.success).toBe(true);
    });
  });

  // ==========================================================================
  // Utility Functions
  // ==========================================================================

  describe("hasConfiguredServers", () => {
    it("returns true when servers exist", async () => {
      const content = '{"mcpServers": {"server": {}}}';
      (mockFs.existsSync as jest.MockedFunction<typeof mockFs.existsSync>).mockReturnValue(true);
      (mockFsPromises.readFile as jest.MockedFunction<typeof mockFsPromises.readFile>).mockResolvedValue(
        content as unknown as Awaited<ReturnType<typeof mockFsPromises.readFile>>
      );

      const result = await hasConfiguredServers("/test/config.json", "mcpServers");

      expect(result).toBe(true);
    });

    it("returns false when no servers exist", async () => {
      const content = '{"mcpServers": {}}';
      (mockFs.existsSync as jest.MockedFunction<typeof mockFs.existsSync>).mockReturnValue(true);
      (mockFsPromises.readFile as jest.MockedFunction<typeof mockFsPromises.readFile>).mockResolvedValue(
        content as unknown as Awaited<ReturnType<typeof mockFsPromises.readFile>>
      );

      const result = await hasConfiguredServers("/test/config.json", "mcpServers");

      expect(result).toBe(false);
    });

    it("returns false when file does not exist", async () => {
      (mockFs.existsSync as jest.MockedFunction<typeof mockFs.existsSync>).mockReturnValue(false);

      const result = await hasConfiguredServers("/missing/config.json", "mcpServers");

      expect(result).toBe(false);
    });
  });

  describe("getConfiguredServerIds", () => {
    it("returns list of server IDs", async () => {
      const content = '{"mcpServers": {"server1": {}, "server2": {}}}';
      (mockFs.existsSync as jest.MockedFunction<typeof mockFs.existsSync>).mockReturnValue(true);
      (mockFsPromises.readFile as jest.MockedFunction<typeof mockFsPromises.readFile>).mockResolvedValue(
        content as unknown as Awaited<ReturnType<typeof mockFsPromises.readFile>>
      );

      const result = await getConfiguredServerIds("/test/config.json", "mcpServers");

      expect(result).toEqual(["server1", "server2"]);
    });

    it("returns empty array when no servers", async () => {
      const content = '{"mcpServers": {}}';
      (mockFs.existsSync as jest.MockedFunction<typeof mockFs.existsSync>).mockReturnValue(true);
      (mockFsPromises.readFile as jest.MockedFunction<typeof mockFsPromises.readFile>).mockResolvedValue(
        content as unknown as Awaited<ReturnType<typeof mockFsPromises.readFile>>
      );

      const result = await getConfiguredServerIds("/test/config.json", "mcpServers");

      expect(result).toEqual([]);
    });

    it("returns empty array when file missing", async () => {
      (mockFs.existsSync as jest.MockedFunction<typeof mockFs.existsSync>).mockReturnValue(false);

      const result = await getConfiguredServerIds("/missing/config.json", "mcpServers");

      expect(result).toEqual([]);
    });
  });
});
