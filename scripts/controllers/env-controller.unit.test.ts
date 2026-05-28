/**
 * @fileoverview Jest unit tests for the MCP env controller.
 * @testing Jest unit: npm test -- --runInBand scripts/controllers/env-controller.unit.test.ts
 * @see scripts/README.md - Top-level MCP workflow guide for these test helpers.
 * @see scripts/controllers/env-controller.ts - env-controller controller module under test in this Jest suite.
 * @documentation reviewed=2026-04-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { describe, expect, it } from "@jest/globals";
import { buildManagedEnvVarInfo } from "./env-controller";

describe("env-controller", () => {
  it("builds managed env var info with masked values and statuses", () => {
    const variables = buildManagedEnvVarInfo({
      MCP_FIRECRAWL_API_KEY: "abcd1234secret9999",
      MCP_ZAI_API_KEY: "",
    });

    const firecrawlVar = variables.find((variable) => {
      return variable.name === "MCP_FIRECRAWL_API_KEY";
    });
    const zaiVar = variables.find((variable) => {
      return variable.name === "MCP_ZAI_API_KEY";
    });
    const mongodbVar = variables.find((variable) => {
      return variable.name === "MCP_MONGODB_CONNECTION_STRING";
    });

    expect(firecrawlVar?.status).toBe("set");
    expect(firecrawlVar?.maskedValue).toBe("abcd...9999");
    expect(zaiVar?.status).toBe("empty");
    expect(zaiVar?.maskedValue).toBe("(empty)");
    expect(mongodbVar?.status).toBe("missing");
    expect(mongodbVar?.maskedValue).toBe("(unset)");
  });
});
