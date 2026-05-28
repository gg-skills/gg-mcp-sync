/**
 * @fileoverview Jest unit tests for the MCP server registry.
 * @testing Jest unit: npm test -- --runInBand scripts/servers/server-registry.unit.test.ts
 * @see scripts/README.md - Top-level MCP workflow guide for these test helpers.
 * @see scripts/servers/index.ts - MCP server registry module under test in this Jest suite.
 * @documentation reviewed=2026-04-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { describe, it, expect } from "@jest/globals";

import {
  servers,
  getServerById,
  getStdioServers,
  getHttpServers,
  getServersByIds,
  getAllEnvVars,
  getEnvVarsForServers,
} from "./index";

describe("Server Registry", () => {
  // ==========================================================================
  // servers Array
  // ==========================================================================

  describe("servers array", () => {
    it("contains 15 servers", () => {
      expect(servers.length).toBe(15);
    });

    it("contains all stdio servers", () => {
      const stdioIds = servers.filter((s) => s.transport === "stdio").map((s) => s.id);
      expect(stdioIds).toContain("augment-context-engine-stdio");
      expect(stdioIds).toContain("apify-stdio");
      expect(stdioIds).toContain("asana-http-bridge-stdio");
      expect(stdioIds).toContain("chrome-devtools-stdio");
      expect(stdioIds).toContain("firecrawl-stdio");
      expect(stdioIds).toContain("mongodb-stdio");
      expect(stdioIds).toContain("playwright-stdio");
      expect(stdioIds).toContain("puppeteer-stdio");
      expect(stdioIds).toContain("serena-stdio");
      expect(stdioIds).toContain("zai-vision-stdio");
    });

    it("contains all http servers", () => {
      const httpIds = servers.filter((s) => s.transport === "http").map((s) => s.id);
      expect(httpIds).toContain("apify-http");
      expect(httpIds).toContain("firecrawl-http");
      expect(httpIds).toContain("zai-web-reader-http");
      expect(httpIds).toContain("zai-web-search-http");
      expect(httpIds).toContain("zai-zread-http");
    });

    it("has unique ids", () => {
      const ids = servers.map((s) => s.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  // ==========================================================================
  // getServerById
  // ==========================================================================

  describe("getServerById", () => {
    it("returns server for valid id", () => {
      const server = getServerById("firecrawl-stdio");

      expect(server).toBeDefined();
      expect(server?.id).toBe("firecrawl-stdio");
      expect(server?.name).toBe("Firecrawl");
    });

    it("returns undefined for invalid id", () => {
      const server = getServerById("non-existent");

      expect(server).toBeUndefined();
    });

    it("finds all server types", () => {
      expect(getServerById("augment-context-engine-stdio")).toBeDefined();
      expect(getServerById("chrome-devtools-stdio")).toBeDefined();
      expect(getServerById("mongodb-stdio")).toBeDefined();
      expect(getServerById("serena-stdio")).toBeDefined();
      expect(getServerById("asana-http-bridge-stdio")).toBeDefined();
      expect(getServerById("firecrawl-http")).toBeDefined();
      expect(getServerById("zai-vision-stdio")).toBeDefined();
    });
  });

  // ==========================================================================
  // getStdioServers
  // ==========================================================================

  describe("getStdioServers", () => {
    it("returns only stdio servers", () => {
      const stdioServers = getStdioServers();

      expect(stdioServers.length).toBe(10);
      stdioServers.forEach((server) => {
        expect(server.transport).toBe("stdio");
      });
    });

    it("returns servers with package property", () => {
      const stdioServers = getStdioServers();

      stdioServers.forEach((server) => {
        expect(server.package).toBeDefined();
      });
    });

    it("includes all expected stdio servers", () => {
      const ids = getStdioServers().map((s) => s.id);

      expect(ids).toContain("augment-context-engine-stdio");
      expect(ids).toContain("apify-stdio");
      expect(ids).toContain("asana-http-bridge-stdio");
      expect(ids).toContain("chrome-devtools-stdio");
      expect(ids).toContain("firecrawl-stdio");
      expect(ids).toContain("mongodb-stdio");
      expect(ids).toContain("playwright-stdio");
      expect(ids).toContain("puppeteer-stdio");
      expect(ids).toContain("serena-stdio");
      expect(ids).toContain("zai-vision-stdio");
    });
  });

  // ==========================================================================
  // getHttpServers
  // ==========================================================================

  describe("getHttpServers", () => {
    it("returns only http servers", () => {
      const httpServers = getHttpServers();

      expect(httpServers.length).toBe(5);
      httpServers.forEach((server) => {
        expect(server.transport).toBe("http");
      });
    });

    it("returns servers with url property", () => {
      const httpServers = getHttpServers();

      httpServers.forEach((server) => {
        expect(server.url).toBeDefined();
      });
    });

    it("includes all expected http servers", () => {
      const ids = getHttpServers().map((s) => s.id);

      expect(ids).toContain("apify-http");
      expect(ids).toContain("firecrawl-http");
      expect(ids).toContain("zai-web-reader-http");
      expect(ids).toContain("zai-web-search-http");
      expect(ids).toContain("zai-zread-http");
    });
  });

  // ==========================================================================
  // getServersByIds
  // ==========================================================================

  describe("getServersByIds", () => {
    it("returns servers for valid ids", () => {
      const result = getServersByIds(["firecrawl-stdio", "mongodb-stdio"]);

      expect(result.length).toBe(2);
      expect(result.map((s) => s.id)).toContain("firecrawl-stdio");
      expect(result.map((s) => s.id)).toContain("mongodb-stdio");
    });

    it("returns empty array for empty input", () => {
      const result = getServersByIds([]);

      expect(result).toEqual([]);
    });

    it("filters out invalid ids", () => {
      const result = getServersByIds(["firecrawl-stdio", "non-existent", "mongodb-stdio"]);

      expect(result.length).toBe(2);
    });

    it("returns empty for all invalid ids", () => {
      const result = getServersByIds(["invalid1", "invalid2"]);

      expect(result).toEqual([]);
    });

    it("handles mixed stdio and http servers", () => {
      const result = getServersByIds(["firecrawl-stdio", "firecrawl-http"]);

      expect(result.length).toBe(2);
      expect(result.some((s) => s.transport === "stdio")).toBe(true);
      expect(result.some((s) => s.transport === "http")).toBe(true);
    });
  });

  // ==========================================================================
  // getAllEnvVars
  // ==========================================================================

  describe("getAllEnvVars", () => {
    it("returns array of unique env vars", () => {
      const envVars = getAllEnvVars();

      expect(Array.isArray(envVars)).toBe(true);
      expect(new Set(envVars).size).toBe(envVars.length);
    });

    it("includes expected env vars", () => {
      const envVars = getAllEnvVars();

      expect(envVars).toContain("MCP_ASANA_CLIENT_ID");
      expect(envVars).toContain("MCP_ASANA_CLIENT_SECRET");
      expect(envVars).toContain("MCP_CHROME_DEVTOOLS_ENABLE_USAGE_STATISTICS");
      expect(envVars).toContain("MCP_CHROME_DEVTOOLS_ENABLE_UPDATE_CHECKS");
      expect(envVars).toContain("MCP_FIRECRAWL_API_KEY");
      expect(envVars).toContain("MCP_MONGODB_CONNECTION_STRING");
      expect(envVars).toContain("MCP_ZAI_API_KEY");
    });

    it("returns sorted array", () => {
      const envVars = getAllEnvVars();
      const sorted = [...envVars].sort();

      expect(envVars).toEqual(sorted);
    });

    it("does not include duplicates from shared vars", () => {
      const envVars = getAllEnvVars();

      // MCP_ZAI_API_KEY is used by multiple servers
      const zaiCount = envVars.filter((v) => v === "MCP_ZAI_API_KEY").length;
      expect(zaiCount).toBe(1);
    });
  });

  // ==========================================================================
  // getEnvVarsForServers
  // ==========================================================================

  describe("getEnvVarsForServers", () => {
    it("returns env vars mapped to server ids", () => {
      const result = getEnvVarsForServers(["firecrawl-stdio", "mongodb-stdio"]);

      expect(result instanceof Map).toBe(true);
      expect(result.has("MCP_FIRECRAWL_API_KEY")).toBe(true);
      expect(result.has("MCP_MONGODB_CONNECTION_STRING")).toBe(true);
    });

    it("maps env var to servers that use it", () => {
      const result = getEnvVarsForServers(["firecrawl-stdio", "mongodb-stdio"]);

      expect(result.get("MCP_FIRECRAWL_API_KEY")).toContain("firecrawl-stdio");
      expect(result.get("MCP_MONGODB_CONNECTION_STRING")).toContain("mongodb-stdio");
    });

    it("groups shared env vars", () => {
      // Both ZAI servers use the same API key
      const result = getEnvVarsForServers(["zai-vision-stdio", "zai-web-reader-http"]);

      const zaiKeyServers = result.get("MCP_ZAI_API_KEY");
      expect(zaiKeyServers?.length).toBe(2);
      expect(zaiKeyServers).toContain("zai-vision-stdio");
      expect(zaiKeyServers).toContain("zai-web-reader-http");
    });

    it("returns empty map for empty input", () => {
      const result = getEnvVarsForServers([]);

      expect(result.size).toBe(0);
    });

    it("returns empty map for invalid server ids", () => {
      const result = getEnvVarsForServers(["invalid1", "invalid2"]);

      expect(result.size).toBe(0);
    });

    it("handles servers with no env vars", () => {
      const result = getEnvVarsForServers(["playwright-stdio"]);

      // Playwright has no env vars
      expect(result.size).toBe(0);
    });

    it("combines servers with and without env vars", () => {
      const result = getEnvVarsForServers(["playwright-stdio", "firecrawl-stdio"]);

      expect(result.has("MCP_FIRECRAWL_API_KEY")).toBe(true);
      expect(result.get("MCP_FIRECRAWL_API_KEY")).toContain("firecrawl-stdio");
    });
  });

  // ==========================================================================
  // Server Consistency
  // ==========================================================================

  describe("server consistency", () => {
    it("all servers have required properties", () => {
      servers.forEach((server) => {
        expect(server.id).toBeTruthy();
        expect(server.name).toBeTruthy();
        expect(["stdio", "http"]).toContain(server.transport);
        expect(Array.isArray(server.envVars)).toBe(true);
        expect(server.configs).toBeDefined();
        expect(typeof server.configs.standard).toBe("function");
      });
    });

    it("all stdio servers have packages", () => {
      const stdioServers = getStdioServers();
      stdioServers.forEach((server) => {
        expect(server.package).toBeTruthy();
      });
    });

    it("all http servers have urls", () => {
      const httpServers = getHttpServers();
      httpServers.forEach((server) => {
        expect(server.url).toBeTruthy();
      });
    });

    it("server ids match transport suffix", () => {
      servers.forEach((server) => {
        if (server.transport === "stdio") {
          expect(server.id).toMatch(/-stdio$/);
        } else {
          expect(server.id).toMatch(/-http$/);
        }
      });
    });
  });
});
