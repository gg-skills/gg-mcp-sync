/**
 * @fileoverview Jest integration coverage for MCP sandbox file operations.
 * @testing Jest integration: npm test -- --runInBand scripts/integration/sandbox-file-ops.integration.test.ts
 * @see scripts/README.md - Top-level MCP workflow guide for these test helpers.
 * @see scripts/lib/file-utils.ts - file-utils library helper under test in this Jest suite.
 * @see scripts/lib/jsonc.ts - jsonc library helper under test in this Jest suite.
 * @documentation reviewed=2026-04-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

// Import actual modules (no mocking)
import {
  readFileSafe,
  writeFileSafe,
  fileExists,
  ensureDir,
  deleteFile,
  detectFormatFromExtension,
  detectFormatFromContent,
} from "../lib/file-utils";
import { parseJsonOrJsonc, modifyJsonc, mergeServersIntoJsonc } from "../lib/jsonc";
import { dryRunWrite, dryRunWriteMultiple } from "../lib/dry-run";
import { generateConfigContent, writeConfig, hasConfiguredServers } from "../lib/config-writer";
import type { McpServerConfig } from "../lib/types";

// Use a unique sandbox directory for each test run
const SANDBOX_DIR = join("/tmp", `mcp-integration-test-${Date.now()}`);

describe("Integration: Sandbox File Operations", () => {
  beforeEach(() => {
    // Create fresh sandbox directory
    if (existsSync(SANDBOX_DIR)) {
      rmSync(SANDBOX_DIR, { recursive: true });
    }
    mkdirSync(SANDBOX_DIR, { recursive: true });
  });

  afterEach(() => {
    // Clean up sandbox
    if (existsSync(SANDBOX_DIR)) {
      rmSync(SANDBOX_DIR, { recursive: true });
    }
  });

  // ==========================================================================
  // File Utils Integration
  // ==========================================================================

  describe("file-utils integration", () => {
    it("writeFileSafe creates file with content", async () => {
      const filePath = join(SANDBOX_DIR, "test.txt");
      const content = "Hello, World!";

      const result = await writeFileSafe(filePath, content);

      expect(result.success).toBe(true);
      expect(existsSync(filePath)).toBe(true);
      expect(readFileSync(filePath, "utf-8")).toBe(content);
    });

    it("writeFileSafe creates parent directories", async () => {
      const filePath = join(SANDBOX_DIR, "nested", "deep", "file.txt");
      const content = "Nested content";

      const result = await writeFileSafe(filePath, content);

      expect(result.success).toBe(true);
      expect(existsSync(filePath)).toBe(true);
    });

    it("readFileSafe reads existing file", async () => {
      const filePath = join(SANDBOX_DIR, "read-test.txt");
      const content = "Test content";
      writeFileSync(filePath, content);

      const result = await readFileSafe(filePath);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(content);
      }
    });

    it("readFileSafe returns error for missing file", async () => {
      const filePath = join(SANDBOX_DIR, "nonexistent.txt");

      const result = await readFileSafe(filePath);

      expect(result.success).toBe(false);
    });

    it("fileExists returns correct value", () => {
      const existingFile = join(SANDBOX_DIR, "exists.txt");
      writeFileSync(existingFile, "test");

      expect(fileExists(existingFile)).toBe(true);
      expect(fileExists(join(SANDBOX_DIR, "missing.txt"))).toBe(false);
    });

    it("ensureDir creates directory", async () => {
      const dirPath = join(SANDBOX_DIR, "new-dir", "sub-dir");

      const result = await ensureDir(dirPath);

      expect(result.success).toBe(true);
      expect(existsSync(dirPath)).toBe(true);
    });

    it("deleteFile removes file", async () => {
      const filePath = join(SANDBOX_DIR, "delete-me.txt");
      writeFileSync(filePath, "to be deleted");

      const result = await deleteFile(filePath);

      expect(result.success).toBe(true);
      expect(existsSync(filePath)).toBe(false);
    });

    it("detectFormatFromExtension works for all formats", () => {
      expect(detectFormatFromExtension("config.json")).toBe("json");
      expect(detectFormatFromExtension("config.jsonc")).toBe("jsonc");
      expect(detectFormatFromExtension("config.yaml")).toBe("yaml");
      expect(detectFormatFromExtension("config.yml")).toBe("yaml");
      expect(detectFormatFromExtension("config.toml")).toBe("toml");
    });

    it("detectFormatFromContent identifies JSON", () => {
      expect(detectFormatFromContent('{"key": "value"}')).toBe("json");
    });

    it("detectFormatFromContent identifies JSONC", () => {
      expect(detectFormatFromContent('// comment\n{"key": "value"}')).toBe("jsonc");
    });

    it("detectFormatFromContent identifies YAML", () => {
      expect(detectFormatFromContent("key: value\nother: 123")).toBe("yaml");
    });
  });

  // ==========================================================================
  // JSONC Integration
  // ==========================================================================

  describe("jsonc integration", () => {
    it("parseJsonOrJsonc parses valid JSON", () => {
      const content = '{"mcpServers": {"test": {"command": "cmd"}}}';

      const result = parseJsonOrJsonc(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.data as Record<string, unknown>).mcpServers).toBeDefined();
      }
    });

    it("parseJsonOrJsonc parses JSONC with comments", () => {
      const content = `{
        // This is a comment
        "mcpServers": {
          "test": {"command": "cmd"}
        }
      }`;

      const result = parseJsonOrJsonc(content);

      expect(result.success).toBe(true);
    });

    it("modifyJsonc adds key at path", () => {
      const content = '{"existing": "value"}';

      const result = modifyJsonc(content, ["new"], { data: "test" });

      // modifyJsonc returns a string directly
      const parsed = JSON.parse(result);
      expect(parsed.new).toEqual({ data: "test" });
      expect(parsed.existing).toBe("value");
    });

    it("mergeServersIntoJsonc adds servers to mcpServers key", () => {
      const content = '{"other": "value"}';
      const servers: Record<string, McpServerConfig> = {
        "test-server": { command: "npx", args: ["-y", "test"] },
      };

      // mergeServersIntoJsonc(content, keyPath, servers)
      const result = mergeServersIntoJsonc(content, ["mcpServers"], servers);

      // Returns a string directly
      const parsed = JSON.parse(result);
      expect(parsed.mcpServers["test-server"]).toBeDefined();
      expect(parsed.other).toBe("value");
    });
  });

  // ==========================================================================
  // Dry-Run Integration
  // ==========================================================================

  describe("dry-run integration", () => {
    it("dryRunWrite validates JSON and returns create operation for new file", async () => {
      const filePath = join(SANDBOX_DIR, "new-config.json");
      const content = '{"mcpServers": {}}';

      const result = await dryRunWrite(filePath, content, {
        format: "json",
        createIfMissing: true,
      });

      expect(result.success).toBe(true);
      expect(result.operation).toBe("create");
      expect(result.diff).toContain("[New file]");
    });

    it("dryRunWrite returns update operation for existing file with changes", async () => {
      const filePath = join(SANDBOX_DIR, "existing-config.json");
      writeFileSync(filePath, '{"old": "content"}');

      const result = await dryRunWrite(filePath, '{"new": "content"}', {
        format: "json",
      });

      expect(result.success).toBe(true);
      expect(result.operation).toBe("update");
    });

    it("dryRunWrite returns skip operation when content unchanged", async () => {
      const filePath = join(SANDBOX_DIR, "unchanged-config.json");
      const content = '{"same": "content"}';
      writeFileSync(filePath, content);

      const result = await dryRunWrite(filePath, content, {
        format: "json",
      });

      expect(result.success).toBe(true);
      expect(result.operation).toBe("skip");
    });

    it("dryRunWrite detects invalid JSON", async () => {
      const filePath = join(SANDBOX_DIR, "invalid.json");

      const result = await dryRunWrite(filePath, '{"invalid: json}', {
        format: "json",
        createIfMissing: true,
      });

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes("Invalid JSON"))).toBe(true);
    });

    it("dryRunWriteMultiple validates multiple files", async () => {
      const results = await dryRunWriteMultiple([
        {
          path: join(SANDBOX_DIR, "multi-1.json"),
          content: '{"a": 1}',
          options: { format: "json", createIfMissing: true },
        },
        {
          path: join(SANDBOX_DIR, "multi-2.json"),
          content: '{"b": 2}',
          options: { format: "json", createIfMissing: true },
        },
      ]);

      expect(results.length).toBe(2);
      expect(results.every((r) => r.success)).toBe(true);
    });
  });

  // ==========================================================================
  // Config Writer Integration
  // ==========================================================================

  describe("config-writer integration", () => {
    it("generateConfigContent creates valid JSON with mcpServers", () => {
      const servers: Record<string, McpServerConfig> = {
        "test-server": { command: "npx", args: ["-y", "test-pkg"] },
      };

      const content = generateConfigContent(servers, "mcpServers", "json");
      const parsed = JSON.parse(content);

      expect(parsed.mcpServers).toBeDefined();
      expect(parsed.mcpServers["test-server"].command).toBe("npx");
    });

    it("generateConfigContent merges with existing content", () => {
      const servers: Record<string, McpServerConfig> = {
        "new-server": { command: "cmd" },
      };
      const existing = '{"other": "value", "mcpServers": {"old": {}}}';

      const content = generateConfigContent(servers, "mcpServers", "json", existing);
      const parsed = JSON.parse(content);

      expect(parsed.other).toBe("value");
      expect(parsed.mcpServers["new-server"]).toBeDefined();
    });

    it("writeConfig creates new file successfully", async () => {
      const filePath = join(SANDBOX_DIR, "write-test.json");
      const servers: Record<string, McpServerConfig> = {
        "test-server": { command: "test" },
      };

      const result = await writeConfig(filePath, servers, "mcpServers", "json", {
        createIfMissing: true,
      });

      expect(result.success).toBe(true);
      expect(result.dryRun.operation).toBe("create");
      expect(existsSync(filePath)).toBe(true);

      const content = readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(content);
      expect(parsed.mcpServers["test-server"]).toBeDefined();
    });

    it("writeConfig skips when content unchanged", async () => {
      const filePath = join(SANDBOX_DIR, "skip-test.json");
      const servers: Record<string, McpServerConfig> = {
        "test-server": { command: "test" },
      };

      // Write initial config
      await writeConfig(filePath, servers, "mcpServers", "json", {
        createIfMissing: true,
      });

      // Write same config again
      const result = await writeConfig(filePath, servers, "mcpServers", "json");

      expect(result.success).toBe(true);
      expect(result.dryRun.operation).toBe("skip");
    });

    it("hasConfiguredServers returns correct values", async () => {
      const emptyPath = join(SANDBOX_DIR, "empty.json");
      const withServersPath = join(SANDBOX_DIR, "with-servers.json");

      writeFileSync(emptyPath, '{"mcpServers": {}}');
      writeFileSync(withServersPath, '{"mcpServers": {"server1": {}}}');

      expect(await hasConfiguredServers(emptyPath, "mcpServers")).toBe(false);
      expect(await hasConfiguredServers(withServersPath, "mcpServers")).toBe(true);
      expect(await hasConfiguredServers(join(SANDBOX_DIR, "missing.json"), "mcpServers")).toBe(false);
    });
  });

  // ==========================================================================
  // End-to-End Config Flow
  // ==========================================================================

  describe("end-to-end config flow", () => {
    it("full flow: dry-run -> write -> read -> verify", async () => {
      const configPath = join(SANDBOX_DIR, "e2e-config.json");
      const servers: Record<string, McpServerConfig> = {
        "firecrawl": {
          command: "npx",
          args: ["-y", "firecrawl-mcp"],
          env: { FIRECRAWL_API_KEY: "test-key" },
        },
      };

      // Step 1: Dry-run to validate
      const dryRunResult = await dryRunWrite(
        configPath,
        generateConfigContent(servers, "mcpServers", "json"),
        { format: "json", createIfMissing: true }
      );
      expect(dryRunResult.success).toBe(true);
      expect(dryRunResult.operation).toBe("create");

      // Step 2: Write config
      const writeResult = await writeConfig(configPath, servers, "mcpServers", "json", {
        createIfMissing: true,
      });
      expect(writeResult.success).toBe(true);

      // Step 3: Read and verify
      const readResult = await readFileSafe(configPath);
      expect(readResult.success).toBe(true);
      if (readResult.success) {
        const parsed = JSON.parse(readResult.data);
        expect(parsed.mcpServers.firecrawl.command).toBe("npx");
        expect(parsed.mcpServers.firecrawl.env.FIRECRAWL_API_KEY).toBe("test-key");
      }

      // Step 4: Verify hasConfiguredServers
      expect(await hasConfiguredServers(configPath, "mcpServers")).toBe(true);
    });

    it("config update preserves existing servers", async () => {
      const configPath = join(SANDBOX_DIR, "preserve-config.json");

      // Write initial config with server1
      const servers1: Record<string, McpServerConfig> = {
        "server1": { command: "cmd1" },
      };
      await writeConfig(configPath, servers1, "mcpServers", "json", {
        createIfMissing: true,
      });

      // Add server2 while preserving server1
      const servers2: Record<string, McpServerConfig> = {
        "server2": { command: "cmd2" },
      };
      await writeConfig(configPath, servers2, "mcpServers", "json", {
        preserveExisting: true,
      });

      // Verify both servers exist
      const content = readFileSync(configPath, "utf-8");
      const parsed = JSON.parse(content);
      expect(parsed.mcpServers.server1).toBeDefined();
      expect(parsed.mcpServers.server2).toBeDefined();
    });
  });
});
