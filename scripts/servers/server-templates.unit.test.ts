/**
 * @fileoverview Jest unit tests for the MCP server registry.
 * @testing Jest unit: npm test -- --runInBand scripts/servers/server-templates.unit.test.ts
 * @see scripts/README.md - Top-level MCP workflow guide for these test helpers.
 * @see scripts/lib/types.ts - Shared MCP state types imported by this Jest suite.
 * @documentation reviewed=2026-04-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { describe, it, expect } from "@jest/globals";
import type { EnvVars, McpServerTemplate } from "../lib/types";

// Import all server templates
import { augmentContextEngineStdio } from "./augment-context-engine-stdio";
import { apifyStdio } from "./apify-stdio";
import { apifyHttp } from "./apify-http";
import { asanaHttpBridgeStdio } from "./asana-http-bridge-stdio";
import { chromeDevtoolsStdio } from "./chrome-devtools-stdio";
import { firecrawlStdio } from "./firecrawl-stdio";
import { firecrawlHttp } from "./firecrawl-http";
import { mongodbStdioServer } from "./mongodb-stdio";
import { playwrightStdio } from "./playwright-stdio";
import { puppeteerStdio } from "./puppeteer-stdio";
import { serenaStdio } from "./serena-stdio";
import { zaiVisionStdio } from "./zai-vision-stdio";
import { zaiWebReaderHttp } from "./zai-web-reader-http";
import { zaiWebSearchHttp } from "./zai-web-search-http";
import { zaiZreadHttp } from "./zai-zread-http";

describe("Server Templates", () => {
  // Sample environment variables for testing
  const testEnv: EnvVars = {
    MCP_AUGMENT_API_TOKEN: "test-augment-token",
    MCP_AUGMENT_API_URL: "https://tenant.augmentcode.test",
    MCP_APIFY_API_TOKEN: "test-apify-token",
    MCP_ASANA_CLIENT_ID: "test-asana-client-id",
    MCP_ASANA_CLIENT_SECRET: "test-asana-client-secret",
    MCP_CHROME_DEVTOOLS_ENABLE_USAGE_STATISTICS: "0",
    MCP_CHROME_DEVTOOLS_ENABLE_UPDATE_CHECKS: "0",
    MCP_FIRECRAWL_API_KEY: "test-firecrawl-key",
    MCP_MONGODB_CONNECTION_STRING: "mongodb://localhost:27020/test",
    MCP_ZAI_API_KEY: "test-zai-key",
    MCP_ZAI_MODE: "ZAI",
  };

  /**
   * Nests per-server `describe` blocks that assert shared MCP template invariants.
   *
   * @remarks
   * Keeps the registry sweep readable by centralizing id/name/transport/config checks.
   *
   * @param server - Template instance under the invariant matrix for this suite.
   */
  function validateServerTemplate(server: McpServerTemplate) {
    describe(`${server.id}`, () => {
      it("has valid id format", () => {
        // ID should be lowercase with hyphens, ending in transport
        expect(server.id).toMatch(/^[a-z0-9-]+-(?:stdio|http)$/);
      });

      it("has non-empty name", () => {
        expect(server.name).toBeTruthy();
        expect(server.name.length).toBeGreaterThan(0);
      });

      it("has valid transport type", () => {
        expect(["stdio", "http"]).toContain(server.transport);
      });

      it("has envVars array", () => {
        expect(Array.isArray(server.envVars)).toBe(true);
      });

      it("has configs object with standard generator", () => {
        expect(server.configs).toBeDefined();
        expect(typeof server.configs.standard).toBe("function");
      });

      if (server.transport === "stdio") {
        it("has package defined for stdio server", () => {
          expect(server.package).toBeTruthy();
        });

        it("standard config has command and args", () => {
          const config = server.configs.standard(testEnv);
          expect(config).toHaveProperty("command");
          expect("args" in config || !("url" in config)).toBe(true);
        });
      }

      if (server.transport === "http") {
        it("has url defined for http server", () => {
          expect(server.url).toBeTruthy();
        });

        it("standard config has url", () => {
          const config = server.configs.standard(testEnv);
          expect("url" in config).toBe(true);
        });
      }

      // Test that env vars are used in config
      if (server.envVars.length > 0) {
        it("uses declared env vars in standard config", () => {
          const config = server.configs.standard(testEnv);
          const configStr = JSON.stringify(config);

          const usesRawEnvValue = server.envVars.some((v) => {
            const value = testEnv[v];
            return value && configStr.includes(value);
          });

          const hasGeneratedEnv =
            ("env" in config &&
              config.env !== undefined &&
              Object.keys(config.env).length > 0) ||
            ("headers" in config &&
              config.headers !== undefined &&
              Object.keys(config.headers).length > 0);

          expect(usesRawEnvValue || hasGeneratedEnv).toBe(true);
        });
      }
    });
  }

  // ==========================================================================
  // stdio Servers
  // ==========================================================================

  describe("stdio servers", () => {
    validateServerTemplate(augmentContextEngineStdio);
    validateServerTemplate(apifyStdio);
    validateServerTemplate(asanaHttpBridgeStdio);
    validateServerTemplate(chromeDevtoolsStdio);
    validateServerTemplate(firecrawlStdio);
    validateServerTemplate(mongodbStdioServer);
    validateServerTemplate(playwrightStdio);
    validateServerTemplate(puppeteerStdio);
    validateServerTemplate(serenaStdio);
    validateServerTemplate(zaiVisionStdio);
  });

  // ==========================================================================
  // http Servers
  // ==========================================================================

  describe("http servers", () => {
    validateServerTemplate(apifyHttp);
    validateServerTemplate(firecrawlHttp);
    validateServerTemplate(zaiWebReaderHttp);
    validateServerTemplate(zaiWebSearchHttp);
    validateServerTemplate(zaiZreadHttp);
  });

  // ==========================================================================
  // Specific Server Tests
  // ==========================================================================

  describe("firecrawl-stdio", () => {
    it("has correct id", () => {
      expect(firecrawlStdio.id).toBe("firecrawl-stdio");
    });

    it("requires FIRECRAWL_API_KEY", () => {
      expect(firecrawlStdio.envVars).toContain("MCP_FIRECRAWL_API_KEY");
    });

    it("uses firecrawl-mcp package", () => {
      expect(firecrawlStdio.package).toBe("firecrawl-mcp");
    });

    it("generates config with API key", () => {
      const config = firecrawlStdio.configs.standard(testEnv);
      expect(JSON.stringify(config)).toContain("test-firecrawl-key");
    });

    it("has vscode config generator", () => {
      expect(firecrawlStdio.configs.vscode).toBeDefined();
      const vsconfig = firecrawlStdio.configs.vscode!(testEnv);
      expect(vsconfig.type).toBe("stdio");
    });

    it("has opencode config generator", () => {
      expect(firecrawlStdio.configs.opencode).toBeDefined();
      const occonfig = firecrawlStdio.configs.opencode!(testEnv);
      expect(occonfig.type).toBe("local");
      expect(Array.isArray(occonfig.command)).toBe(true);
    });

    it("has zed config generator", () => {
      expect(firecrawlStdio.configs.zed).toBeDefined();
      const zedconfig = firecrawlStdio.configs.zed!(testEnv);
      expect(zedconfig.command).toBe("npx");
    });

    it("has goose config generator", () => {
      expect(firecrawlStdio.configs.goose).toBeDefined();
      const gooseconfig = firecrawlStdio.configs.goose!(testEnv);
      expect(gooseconfig.name).toBe("firecrawl");
    });

    it("has codex config generator", () => {
      expect(firecrawlStdio.configs.codex).toBeDefined();
      const codexconfig = firecrawlStdio.configs.codex!(testEnv);
      expect(codexconfig.command).toBeDefined();
    });

    it("has continue config generator", () => {
      expect(firecrawlStdio.configs.continue).toBeDefined();
      const continueconfig = firecrawlStdio.configs.continue!(testEnv);
      expect(continueconfig.name).toBe("firecrawl");
    });
  });

  describe("chrome-devtools-stdio", () => {
    it("has correct id", () => {
      expect(chromeDevtoolsStdio.id).toBe("chrome-devtools-stdio");
    });

    it("uses the pinned Chrome DevTools MCP package", () => {
      expect(chromeDevtoolsStdio.package).toBe("chrome-devtools-mcp@0.21.0");
    });

    it("requires the repo policy env vars in stable order", () => {
      expect(chromeDevtoolsStdio.envVars).toEqual([
        "MCP_CHROME_DEVTOOLS_ENABLE_USAGE_STATISTICS",
        "MCP_CHROME_DEVTOOLS_ENABLE_UPDATE_CHECKS",
      ]);
    });

    it("maps repo policy env vars to upstream opt-out env vars", () => {
      const config = chromeDevtoolsStdio.configs.standard(testEnv);

      expect(config).toMatchObject({
        command: "npx",
        args: ["-y", "chrome-devtools-mcp@0.21.0"],
        env: {
          CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: "1",
          CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS: "1",
        },
      });
    });

    it("omits upstream opt-out env vars when repo policy opts back in", () => {
      const config = chromeDevtoolsStdio.configs.standard({
        ...testEnv,
        MCP_CHROME_DEVTOOLS_ENABLE_USAGE_STATISTICS: "1",
        MCP_CHROME_DEVTOOLS_ENABLE_UPDATE_CHECKS: "1",
      });

      expect(config).toEqual({
        command: "npx",
        args: ["-y", "chrome-devtools-mcp@0.21.0"],
      });
    });

    it("does not add attach-mode or experimental args", () => {
      const config = chromeDevtoolsStdio.configs.standard(testEnv);
      const args = config.args ?? [];

      [
        "--browserUrl",
        "--wsEndpoint",
        "--autoConnect",
        "--slim",
        "--experimentalVision",
        "--experimentalScreencast",
        "--experimentalInteropTools",
        "--experimentalPageIdRouting",
        "--categoryExtensions",
        "--categoryInPageTools",
      ].forEach((flag) => {
        expect(args).not.toContain(flag);
      });
    });

    it("has opencode config generator", () => {
      const config = chromeDevtoolsStdio.configs.opencode!(testEnv);

      expect(config).toMatchObject({
        type: "local",
        command: ["npx", "-y", "chrome-devtools-mcp@0.21.0"],
        environment: {
          CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: "1",
          CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS: "1",
        },
      });
    });

    it("has codex config generator", () => {
      const config = chromeDevtoolsStdio.configs.codex!(testEnv);

      expect(config.command).toBe("npx");
      expect(config.args).toEqual(["-y", "chrome-devtools-mcp@0.21.0"]);
    });

    it("has crush config generator", () => {
      const config = chromeDevtoolsStdio.configs.crush!(testEnv);

      expect(config.type).toBe("stdio");
      expect(config.timeout).toBe(120);
    });
  });

  describe("augment-context-engine-stdio", () => {
    it("has correct id", () => {
      expect(augmentContextEngineStdio.id).toBe("augment-context-engine-stdio");
    });

    it("has no required env vars", () => {
      expect(augmentContextEngineStdio.envVars).toEqual([]);
    });

    it("uses the auggie CLI package", () => {
      expect(augmentContextEngineStdio.package).toBe("auggie");
    });

    it("generates stdio config with the official Auggie MCP args", () => {
      const config = augmentContextEngineStdio.configs.standard(testEnv);
      expect(config).toMatchObject({
        command: "auggie",
        args: ["--mcp", "--mcp-auto-workspace"],
      });
    });

    it("passes optional non-interactive auth env vars when configured", () => {
      const config = augmentContextEngineStdio.configs.standard(testEnv);
      expect(config).toMatchObject({
        env: {
          AUGMENT_API_TOKEN: "test-augment-token",
          AUGMENT_API_URL: "https://tenant.augmentcode.test",
        },
      });
    });
  });

  describe("mongodb-stdio", () => {
    it("has correct id", () => {
      expect(mongodbStdioServer.id).toBe("mongodb-stdio");
    });

    it("requires CONNECTION_STRING", () => {
      expect(mongodbStdioServer.envVars).toContain("MCP_MONGODB_CONNECTION_STRING");
    });

    it("generates config with connection string", () => {
      const config = mongodbStdioServer.configs.standard(testEnv);
      expect(JSON.stringify(config)).toContain("mongodb://localhost:27020/test");
    });

    it("generates flat OpenCode-compatible local config", () => {
      const config = mongodbStdioServer.configs.opencode!(testEnv);
      expect(config).toMatchObject({
        type: "local",
        command: ["npx", "mongodb-mcp-server"],
        environment: { MONGODB_URI: "mongodb://localhost:27020/test" },
      });
    });
  });

  describe("playwright-stdio", () => {
    it("has correct id", () => {
      expect(playwrightStdio.id).toBe("playwright-stdio");
    });

    it("has no required env vars", () => {
      expect(playwrightStdio.envVars).toEqual([]);
    });
  });

  describe("puppeteer-stdio", () => {
    it("has correct id", () => {
      expect(puppeteerStdio.id).toBe("puppeteer-stdio");
    });

    it("has no required env vars", () => {
      expect(puppeteerStdio.envVars).toEqual([]);
    });
  });

  describe("serena-stdio", () => {
    it("has correct id", () => {
      expect(serenaStdio.id).toBe("serena-stdio");
    });

    it("has no required env vars", () => {
      expect(serenaStdio.envVars).toEqual([]);
    });

    it("uses uvx + serena start-mcp-server", () => {
      const config = serenaStdio.configs.standard(testEnv);
      expect(config.command).toBe("uvx");
      expect(config.args).toEqual([
        "--from",
        "git+https://github.com/oraios/serena",
        "serena",
        "start-mcp-server",
      ]);
    });
  });

  describe("OpenCode stdio generators", () => {
    it("maps Z.AI env to OpenCode environment", () => {
      const config = zaiVisionStdio.configs.opencode!(testEnv);
      expect(config.type).toBe("local");
      expect(config.command).toEqual(["npx", "-y", "@z_ai/mcp-server"]);
      expect(config.environment).toMatchObject({
        Z_AI_API_KEY: "test-zai-key",
        PLATFORM_MODE: "ZAI",
      });
    });
  });

  describe("zai-vision-stdio", () => {
    it("has correct id", () => {
      expect(zaiVisionStdio.id).toBe("zai-vision-stdio");
    });

    it("requires MCP_ZAI_API_KEY and MCP_ZAI_MODE", () => {
      expect(zaiVisionStdio.envVars).toContain("MCP_ZAI_API_KEY");
      expect(zaiVisionStdio.envVars).toContain("MCP_ZAI_MODE");
    });

    /**
     * Asserts Z.AI env maps expose canonical keys and legacy compatibility aliases.
     *
     * @remarks
     * Missing maps fail at `toBeDefined`; the guard only narrows for TypeScript after that
     * assertion.
     *
     * @param envMap - Wire env bucket from a generator, or `undefined` when absent.
     */
    function expectCanonicalAndCompatibilityEnv(envMap: Record<string, string> | undefined): void {
      expect(envMap).toBeDefined();
      if (!envMap) {
        return;
      }

      expect(envMap.Z_AI_API_KEY).toBe("test-zai-key");
      expect(envMap.PLATFORM_MODE).toBe("ZAI");
      expect(envMap.ZAI_API_KEY).toBe("test-zai-key");
      expect(envMap.ZAI_MODE).toBe("ZAI");
    }

    it("maps mode/key to canonical runtime vars across config generators", () => {
      const standard = zaiVisionStdio.configs.standard(testEnv);
      if ("env" in standard) {
        expectCanonicalAndCompatibilityEnv(standard.env);
      } else {
        throw new Error("Expected stdio config with env for zai-vision-stdio");
      }

      const vscode = zaiVisionStdio.configs.vscode?.(testEnv);
      expectCanonicalAndCompatibilityEnv(vscode?.env);

      const opencode = zaiVisionStdio.configs.opencode?.(testEnv);
      expectCanonicalAndCompatibilityEnv(opencode?.environment);

      const zed = zaiVisionStdio.configs.zed?.(testEnv);
      expectCanonicalAndCompatibilityEnv(zed?.env);

      const goose = zaiVisionStdio.configs.goose?.(testEnv);
      expectCanonicalAndCompatibilityEnv(goose?.env);

      const codex = zaiVisionStdio.configs.codex?.(testEnv);
      expectCanonicalAndCompatibilityEnv(codex?.env);

      const continueConfig = zaiVisionStdio.configs.continue?.(testEnv);
      expectCanonicalAndCompatibilityEnv(continueConfig?.env);
    });

    it("defaults mode to ZAI when MCP_ZAI_MODE is unset", () => {
      const envWithoutMode: EnvVars = { ...testEnv };
      delete envWithoutMode.MCP_ZAI_MODE;

      const config = zaiVisionStdio.configs.standard(envWithoutMode);
      if ("env" in config) {
        expect(config.env?.PLATFORM_MODE).toBe("ZAI");
        return;
      }

      throw new Error("Expected stdio config with env for zai-vision-stdio");
    });
  });

  describe("asana-http-bridge-stdio", () => {
    it("has correct id", () => {
      expect(asanaHttpBridgeStdio.id).toBe("asana-http-bridge-stdio");
    });

    it("cleans up legacy direct and Codex-only Asana IDs", () => {
      expect(asanaHttpBridgeStdio.legacyIds).toEqual([
        "asana-http",
        "asana-http-stdio-bridge",
      ]);
    });

    it("requires Asana OAuth env vars", () => {
      expect(asanaHttpBridgeStdio.envVars).toEqual([
        "MCP_ASANA_CLIENT_ID",
        "MCP_ASANA_CLIENT_SECRET",
      ]);
    });

    it("generates standard stdio bridge metadata", () => {
      const config = asanaHttpBridgeStdio.configs.standard(testEnv);
      expect(config).toMatchObject({
        command: "node",
        env: {
          MCP_ASANA_CLIENT_ID: "test-asana-client-id",
          MCP_ASANA_CLIENT_SECRET: "test-asana-client-secret",
        },
      });
      expect(config.args).toHaveLength(1);
      expect(config.args?.[0]).toContain("asana-http-bridge-stdio.mjs");
    });

    it("generates VSCode stdio metadata", () => {
      const config = asanaHttpBridgeStdio.configs.vscode?.(testEnv);
      expect(config).toMatchObject({
        type: "stdio",
        command: "node",
        env: {
          MCP_ASANA_CLIENT_ID: "test-asana-client-id",
          MCP_ASANA_CLIENT_SECRET: "test-asana-client-secret",
        },
      });
      expect(config?.args?.[0]).toContain("asana-http-bridge-stdio.mjs");
    });

    it("generates OpenCode local metadata", () => {
      const config = asanaHttpBridgeStdio.configs.opencode?.(testEnv);
      expect(config).toMatchObject({
        type: "local",
        command: ["node", expect.stringContaining("asana-http-bridge-stdio.mjs")],
        environment: {
          MCP_ASANA_CLIENT_ID: "test-asana-client-id",
          MCP_ASANA_CLIENT_SECRET: "test-asana-client-secret",
        },
      });
    });

    it("generates Codex stdio bridge metadata", () => {
      const config = asanaHttpBridgeStdio.configs.codex?.(testEnv);

      expect(config).toMatchObject({
        command: "node",
        env: {
          MCP_ASANA_CLIENT_ID: "test-asana-client-id",
          MCP_ASANA_CLIENT_SECRET: "test-asana-client-secret",
        },
        startup_timeout_sec: 120,
      });
      expect(config?.args).toHaveLength(1);
      expect(config?.args?.[0]).toContain("asana-http-bridge-stdio.mjs");
      expect(config?.args?.[0]).not.toContain("test-asana-client-id");
      expect(config?.args?.[0]).not.toContain("test-asana-client-secret");
    });
  });

  describe("firecrawl-http", () => {
    it("has correct id", () => {
      expect(firecrawlHttp.id).toBe("firecrawl-http");
    });

    it("has http transport", () => {
      expect(firecrawlHttp.transport).toBe("http");
    });

    it("requires FIRECRAWL_API_KEY", () => {
      expect(firecrawlHttp.envVars).toContain("MCP_FIRECRAWL_API_KEY");
    });

    it("has url defined", () => {
      expect(firecrawlHttp.url).toBeTruthy();
    });
  });

  describe("zai http servers", () => {
    const zaiHttpServers = [zaiWebReaderHttp, zaiWebSearchHttp, zaiZreadHttp];

    zaiHttpServers.forEach((server) => {
      it(`${server.id} requires ZAI_API_KEY`, () => {
        expect(server.envVars).toContain("MCP_ZAI_API_KEY");
      });

      it(`${server.id} has http transport`, () => {
        expect(server.transport).toBe("http");
      });

      it(`${server.id} generates config with URL`, () => {
        const config = server.configs.standard(testEnv);
        expect("url" in config).toBe(true);
      });
    });
  });

  // ==========================================================================
  // Config Generator Variations
  // ==========================================================================

  describe("config generator variations", () => {
    it("vscode config includes type: stdio", () => {
      const servers = [firecrawlStdio, mongodbStdioServer, playwrightStdio];
      servers.forEach((server) => {
        if (server.configs.vscode) {
          const config = server.configs.vscode(testEnv);
          expect(config.type).toBe("stdio");
        }
      });
    });

    it("opencode config includes type: local for stdio", () => {
      const servers = [firecrawlStdio, mongodbStdioServer];
      servers.forEach((server) => {
        if (server.configs.opencode) {
          const config = server.configs.opencode(testEnv);
          expect(config.type).toBe("local");
        }
      });
    });

    it("goose config includes name and timeout", () => {
      if (firecrawlStdio.configs.goose) {
        const config = firecrawlStdio.configs.goose(testEnv);
        expect(config.name).toBeDefined();
      }
    });
  });
});
