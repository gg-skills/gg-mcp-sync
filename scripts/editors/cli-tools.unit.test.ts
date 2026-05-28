/**
 * @fileoverview Jest unit tests for MCP editor registry and adapter behavior.
 * @testing Jest unit: npm test -- --runInBand scripts/editors/cli-tools.unit.test.ts
 * @see scripts/README.md - Top-level MCP workflow guide for these test helpers.
 * @see scripts/lib/types.ts - Shared MCP state types imported by this Jest suite.
 * @documentation reviewed=2026-04-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import type { EditorAdapter, EnvVars, McpServerTemplate } from "../lib/types";

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

jest.unstable_mockModule("child_process", () => ({
  execSync: jest.fn(),
  spawnSync: jest.fn(),
  spawn: jest.fn(),
  exec: jest.fn(),
  execFile: jest.fn(),
  execFileSync: jest.fn(),
  fork: jest.fn(),
}));

const mockFsPromises = await Promise.resolve(import("fs/promises"));
const mockFs = await Promise.resolve(import("fs"));
const mockChildProcess = await Promise.resolve(import("child_process"));
const { parse: parseToml } = await Promise.resolve(import("smol-toml"));

// Import adapters
const { claudeCliAdapter } = await Promise.resolve(import("./claude-cli"));
const { geminiCliAdapter } = await Promise.resolve(import("./gemini-cli"));
const { amazonqCliAdapter } = await Promise.resolve(import("./amazonq-cli"));
const { clineCliAdapter } = await Promise.resolve(import("./cline-cli"));
const { auggieCliAdapter } = await Promise.resolve(import("./auggie-cli"));
const { ampCliAdapter } = await Promise.resolve(import("./amp-cli"));
const { factoryCliAdapter } = await Promise.resolve(import("./factory-cli"));
const { traeCliAdapter } = await Promise.resolve(import("./trae-cli"));
const { gooseCliAdapter } = await Promise.resolve(import("./goose-cli"));
const { codexCliAdapter } = await Promise.resolve(import("./codex-cli"));
const { opencodeCliAdapter } = await Promise.resolve(import("./opencode-cli"));
const { kimiCliAdapter } = await Promise.resolve(import("./kimi-cli"));
const { asanaHttpBridgeStdio } = await Promise.resolve(
  import("../servers/asana-http-bridge-stdio")
);

describe("CLI Tool Adapters", () => {
  // Mock server template for testing writeConfig
  // Removed unused testEnv and mockServer declarations that were not referenced
  // in any test cases. The adapter tests validate structure and metadata only.

  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Registers nested Jest suites that assert a CLI adapter's shared contract surface.
   *
   * @remarks
   * Centralizes repeated id/name/type, optional project/global config, format keys, and
   * method-presence checks across editor CLI adapters.
   *
   * @param adapter - Adapter instance under test.
   * @param options - Expected identifiers and which config branches to assert.
   */
  function testCliTool(adapter: EditorAdapter, options: {
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

      it("has cli type", () => {
        expect(adapter.type).toBe("cli");
      });

      if (options.hasProjectConfig !== false && adapter.projectConfig) {
        it("has project config location", () => {
          expect(adapter.projectConfig).toBeDefined();
        });
      }

      if (options.hasGlobalConfig !== false && adapter.globalConfig) {
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
  // Claude CLI
  // ==========================================================================

  testCliTool(claudeCliAdapter, {
    expectedId: "claude-cli",
    expectedName: "Claude Code CLI",
    hasGlobalConfig: false,  // Claude CLI uses project config only
    format: "mcpServers",
  });

  describe("claudeCliAdapter specifics", () => {
    it("uses project config only (no global config)", () => {
      expect(claudeCliAdapter.globalConfig).toBeUndefined();
      expect(claudeCliAdapter.projectConfig).toBeDefined();
    });

    it("detects installation by checking CLI", async () => {
      (mockChildProcess.execSync as jest.MockedFunction<typeof mockChildProcess.execSync>).mockReturnValue(
        Buffer.from("claude 1.0.0")
      );

      // The adapter might check for directory existence instead
      (mockFs.existsSync as jest.MockedFunction<typeof mockFs.existsSync>).mockReturnValue(true);
      (mockFs.statSync as jest.MockedFunction<typeof mockFs.statSync>).mockReturnValue({
        isDirectory: () => true,
      } as ReturnType<typeof mockFs.statSync>);

      const result = await claudeCliAdapter.detectInstalled();
      expect(typeof result).toBe("boolean");
    });
  });

  // ==========================================================================
  // Gemini CLI
  // ==========================================================================

  testCliTool(geminiCliAdapter, {
    expectedId: "gemini-cli",
    expectedName: "Gemini CLI",
    format: "mcpServers",
    configFormat: "json",
  });

  describe("geminiCliAdapter specifics", () => {
    it("global config path contains gemini", () => {
      expect(geminiCliAdapter.globalConfig?.path.toLowerCase()).toContain("gemini");
    });
  });

  // ==========================================================================
  // Kimi CLI
  // ==========================================================================

  testCliTool(kimiCliAdapter, {
    expectedId: "kimi-cli",
    expectedName: "Kimi CLI",
    hasProjectConfig: false,
    format: "mcpServers",
    configFormat: "json",
  });

  describe("kimiCliAdapter specifics", () => {
    it("uses global Kimi MCP config", () => {
      expect(kimiCliAdapter.projectConfig).toBeUndefined();
      expect(kimiCliAdapter.globalConfig?.path).toBe("~/.kimi/mcp.json");
    });
  });

  // ==========================================================================
  // Amazon Q CLI
  // ==========================================================================

  testCliTool(amazonqCliAdapter, {
    expectedId: "amazonq-cli",
    expectedName: "Amazon Q CLI",
    format: "mcpServers",
    configFormat: "json",
  });

  describe("amazonqCliAdapter specifics", () => {
    it("global config path contains amazon", () => {
      const path = amazonqCliAdapter.globalConfig?.path.toLowerCase();
      expect(path?.includes("amazon") || path?.includes("aws")).toBe(true);
    });
  });

  // ==========================================================================
  // Cline CLI
  // ==========================================================================

  testCliTool(clineCliAdapter, {
    expectedId: "cline-cli",
    expectedName: "Cline CLI",
    format: "mcpServers",
    configFormat: "json",
  });

  // ==========================================================================
  // Auggie CLI
  // ==========================================================================

  testCliTool(auggieCliAdapter, {
    expectedId: "auggie-cli",
    expectedName: "Auggie CLI",
    format: "mcpServers",
    configFormat: "json",
  });

  // ==========================================================================
  // Amp CLI
  // ==========================================================================

  testCliTool(ampCliAdapter, {
    expectedId: "amp-cli",
    expectedName: "Amp CLI",
    format: "amp.mcpServers",
    configFormat: "json",
  });

  describe("ampCliAdapter specifics", () => {
    it("uses amp.mcpServers key format", () => {
      expect(ampCliAdapter.format).toBe("amp.mcpServers");
    });
  });

  // ==========================================================================
  // Factory CLI
  // ==========================================================================

  testCliTool(factoryCliAdapter, {
    expectedId: "factory-cli",
    expectedName: "Factory CLI",
    format: "mcpServers",
    configFormat: "json",
  });

  // ==========================================================================
  // Trae CLI
  // ==========================================================================

  testCliTool(traeCliAdapter, {
    expectedId: "trae-cli",
    expectedName: "Trae CLI",
    format: "mcp_servers",
    configFormat: "yaml",
  });

  describe("traeCliAdapter specifics", () => {
    it("uses YAML config format", () => {
      expect(traeCliAdapter.globalConfig?.format).toBe("yaml");
    });

    it("uses mcp_servers key format", () => {
      expect(traeCliAdapter.format).toBe("mcp_servers");
    });
  });

  // ==========================================================================
  // Goose CLI
  // ==========================================================================

  testCliTool(gooseCliAdapter, {
    expectedId: "goose-cli",
    expectedName: "Goose CLI",
    format: "extensions",
    configFormat: "yaml",
  });

  describe("gooseCliAdapter specifics", () => {
    it("uses YAML config format", () => {
      expect(gooseCliAdapter.globalConfig?.format).toBe("yaml");
    });

    it("uses extensions key format", () => {
      expect(gooseCliAdapter.format).toBe("extensions");
    });
  });

  // ==========================================================================
  // Codex CLI
  // ==========================================================================

  testCliTool(codexCliAdapter, {
    expectedId: "codex-cli",
    expectedName: "Codex CLI",
    format: "mcp",
    configFormat: "toml",
  });

  describe("codexCliAdapter specifics", () => {
    it("uses TOML config format", () => {
      expect(codexCliAdapter.globalConfig?.format).toBe("toml");
    });

    it("uses mcp key format", () => {
      expect(codexCliAdapter.format).toBe("mcp");
    });

    it("reads startup_timeout_sec from existing config", async () => {
      (mockFsPromises.access as jest.Mock).mockResolvedValue(undefined);
      (mockFsPromises.readFile as jest.Mock).mockResolvedValue(`
[mcp_servers.serena-stdio]
command = "uvx"
args = ["--from", "git+https://github.com/oraios/serena", "serena", "start-mcp-server"]
startup_timeout_sec = 120
`);

      const config = await codexCliAdapter.readConfig("global");
      const serenaConfig = config?.servers["serena-stdio"];

      expect(serenaConfig).toMatchObject({
        command: "uvx",
        startup_timeout_sec: 120,
      });
    });

    it("preserves existing startup_timeout_sec during writes", async () => {
      const testEnv: EnvVars = {};
      const serenaServer: McpServerTemplate = {
        id: "serena-stdio",
        name: "Serena",
        transport: "stdio",
        package: "serena",
        envVars: [],
        configs: {
          standard: () => ({
            command: "uvx",
            args: ["--from", "git+https://github.com/oraios/serena", "serena", "start-mcp-server"],
          }),
          codex: () => ({
            command: "uvx",
            args: ["--from", "git+https://github.com/oraios/serena", "serena", "start-mcp-server"],
          }),
        },
      };

      (mockFs.existsSync as jest.Mock)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(true)
        .mockReturnValue(true);
      (mockFsPromises.access as jest.Mock).mockResolvedValue(undefined);
      (mockFsPromises.readFile as jest.Mock).mockResolvedValue(`
[mcp_servers.serena-stdio]
command = "uvx"
args = ["--from", "git+https://github.com/oraios/serena", "serena", "start-mcp-server"]
startup_timeout_sec = 120
`);
      (mockFsPromises.mkdir as jest.Mock).mockResolvedValue(undefined);
      (mockFsPromises.writeFile as jest.Mock).mockResolvedValue(undefined);
      (mockFsPromises.copyFile as jest.Mock).mockResolvedValue(undefined);
      (mockFsPromises.readdir as jest.Mock).mockResolvedValue([]);

      const result = await codexCliAdapter.writeConfig("global", [serenaServer], testEnv);
      const writtenContent = (mockFsPromises.writeFile as jest.Mock).mock.calls[0]?.[1] as string;

      expect(result.success).toBe(true);
      expect(writtenContent).toContain("startup_timeout_sec = 120");
    });

    it("writes Codex bridge command args as valid TOML strings", async () => {
      const testEnv: EnvVars = {
        MCP_ASANA_CLIENT_ID: "test-asana-client-id",
        MCP_ASANA_CLIENT_SECRET: "test-asana-client-secret",
      };

      (mockFs.existsSync as jest.Mock).mockReturnValue(true);
      (mockFsPromises.access as jest.Mock).mockResolvedValue(undefined);
      (mockFsPromises.readFile as jest.Mock).mockResolvedValue("");
      (mockFsPromises.mkdir as jest.Mock).mockResolvedValue(undefined);
      (mockFsPromises.writeFile as jest.Mock).mockResolvedValue(undefined);

      const result = await codexCliAdapter.writeConfig("project", [asanaHttpBridgeStdio], testEnv);
      const writtenContent = (mockFsPromises.writeFile as jest.Mock).mock.calls[0]?.[1] as string;
      const parsed = parseToml(writtenContent) as {
        mcp_servers?: Record<string, { command?: string; args?: string[] }>;
      };
      const asanaConfig = parsed.mcp_servers?.["asana-http-bridge-stdio"];

      expect(result.success).toBe(true);
      expect(parsed.mcp_servers?.["asana-http"]).toBeUndefined();
      expect(parsed.mcp_servers?.["asana-http-stdio-bridge"]).toBeUndefined();
      expect(asanaConfig?.command).toBe("node");
      expect(asanaConfig?.args?.[0]).toContain("asana-http-bridge-stdio.mjs");
      expect(asanaConfig?.args?.[0]).not.toContain("test-asana-client-id");
    });
  });

  // ==========================================================================
  // OpenCode CLI
  // ==========================================================================

  testCliTool(opencodeCliAdapter, {
    expectedId: "opencode-cli",
    expectedName: "OpenCode CLI",
    format: "mcp-opencode",
    configFormat: "json",
  });

  describe("opencodeCliAdapter specifics", () => {
    it("uses flat mcp key format", () => {
      expect(opencodeCliAdapter.format).toBe("mcp-opencode");
    });
  });

  // ==========================================================================
  // Common Behavior Tests
  // ==========================================================================

  describe("common CLI adapter behavior", () => {
    const allCliAdapters = [
      claudeCliAdapter,
      geminiCliAdapter,
      amazonqCliAdapter,
      clineCliAdapter,
      auggieCliAdapter,
      ampCliAdapter,
      factoryCliAdapter,
      traeCliAdapter,
      gooseCliAdapter,
      codexCliAdapter,
      opencodeCliAdapter,
      kimiCliAdapter,
    ];

    it("all adapters have type cli", () => {
      allCliAdapters.forEach((adapter) => {
        expect(adapter.type).toBe("cli");
      });
    });

    it("most adapters have global config (CLIs typically use global config)", () => {
      // Claude CLI is the exception - it uses project config only
      const adaptersWithGlobalConfig = allCliAdapters.filter(
        (adapter) => adapter.id !== "claude-cli"
      );
      adaptersWithGlobalConfig.forEach((adapter) => {
        expect(adapter.globalConfig).toBeDefined();
      });
    });

    it("global config paths are home-relative or absolute", () => {
      allCliAdapters.forEach((adapter) => {
        if (adapter.globalConfig) {
          const path = adapter.globalConfig.path;
          expect(path.startsWith("~") || path.startsWith("/")).toBe(true);
        }
      });
    });

    it("config formats are valid", () => {
      const validFormats = ["json", "jsonc", "yaml", "toml"];
      allCliAdapters.forEach((adapter) => {
        if (adapter.globalConfig) {
          expect(validFormats).toContain(adapter.globalConfig.format);
        }
      });
    });

    it("unique adapter ids", () => {
      const ids = allCliAdapters.map((a) => a.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  // ==========================================================================
  // Config Format Variations
  // ==========================================================================

  describe("config format variations", () => {
    it("JSON adapters use appropriate keys", () => {
      // Note: claudeCliAdapter excluded as it uses project config only
      const jsonAdapters = [
        geminiCliAdapter,
        kimiCliAdapter,
        amazonqCliAdapter,
        clineCliAdapter,
        auggieCliAdapter,
        factoryCliAdapter,
        opencodeCliAdapter,
      ];

      jsonAdapters.forEach((adapter) => {
        expect(adapter.globalConfig?.format).toBe("json");
      });
    });

    it("YAML adapters have correct format", () => {
      expect(traeCliAdapter.globalConfig?.format).toBe("yaml");
      expect(gooseCliAdapter.globalConfig?.format).toBe("yaml");
    });

    it("TOML adapter has correct format", () => {
      expect(codexCliAdapter.globalConfig?.format).toBe("toml");
    });
  });
});
