/**
 * @fileoverview Jest unit tests for the MCP services controller.
 * @testing Jest unit: npm test -- --runInBand scripts/controllers/services-controller.unit.test.ts
 * @see scripts/README.md - Top-level MCP workflow guide for these test helpers.
 * @see scripts/lib/state.ts - state library helper under test in this Jest suite.
 * @see scripts/controllers/services-controller.ts - services-controller controller module under test in this Jest suite.
 * @documentation reviewed=2026-04-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { describe, expect, it } from "@jest/globals";
import { createDefaultState } from "../lib/state";
import {
  applyServicePreferenceChangesToState,
  buildManagedServiceInfo,
  initializeServicePreferences,
  summarizeServicePreferenceChanges,
} from "./services-controller";

describe("services-controller", () => {
  it("builds managed service info with current preferences and env gaps", () => {
    const state = {
      ...createDefaultState(),
      servicePreferences: {
        firecrawl: {
          preference: "prefer-http" as const,
          lastModified: "2026-03-12T00:00:00.000Z",
        },
      },
    };

    const services = buildManagedServiceInfo(state, {
      MCP_FIRECRAWL_API_KEY: "secret",
      MCP_ZAI_API_KEY: "",
    });
    const chromeDevtools = services.find((service) => service.name === "chrome-devtools");
    const firecrawl = services.find((service) => service.name === "firecrawl");
    const zai = services.find((service) => service.name === "zai-vision");

    expect(chromeDevtools?.hasStdio).toBe(true);
    expect(chromeDevtools?.hasHttp).toBe(false);
    expect(chromeDevtools?.missingEnvVars).toEqual([
      "MCP_CHROME_DEVTOOLS_ENABLE_UPDATE_CHECKS",
      "MCP_CHROME_DEVTOOLS_ENABLE_USAGE_STATISTICS",
    ]);
    expect(firecrawl?.currentPreference).toBe("prefer-http");
    expect(firecrawl?.missingEnvVars).toEqual([]);
    expect(zai?.missingEnvVars).toContain("MCP_ZAI_API_KEY");
  });

  it("initializes service preferences from legacy enabled servers", () => {
    const state = {
      ...createDefaultState(),
      enabledServers: ["firecrawl-http", "firecrawl-stdio"],
    };

    const nextState = initializeServicePreferences(state);

    expect(nextState.servicePreferences?.firecrawl?.preference).toBe("prefer-http");
  });

  it("applies service preference changes and updates enabled servers", () => {
    const state = {
      ...createDefaultState(),
      servicePreferences: {
        firecrawl: {
          preference: "prefer-http" as const,
          lastModified: "2026-03-12T00:00:00.000Z",
        },
      },
      enabledServers: ["firecrawl-http", "firecrawl-stdio"],
    };

    const nextState = applyServicePreferenceChangesToState(state, {
      firecrawl: "stdio-only",
      mongodb: "stdio-only",
    });

    expect(nextState.servicePreferences?.firecrawl?.preference).toBe("stdio-only");
    expect(nextState.servicePreferences?.mongodb?.preference).toBe("stdio-only");
    expect(nextState.enabledServers).toEqual(["firecrawl-stdio", "mongodb-stdio"]);
  });

  it("summarizes preference changes against the current service inventory", () => {
    const summaries = summarizeServicePreferenceChanges(
      [
        {
          name: "firecrawl",
          hasStdio: true,
          hasHttp: true,
          stdioPackage: "firecrawl-mcp",
          httpUrl: "https://firecrawl.example.com",
          currentPreference: "prefer-http",
          envVars: ["MCP_FIRECRAWL_API_KEY"],
          missingEnvVars: [],
        },
      ],
      { firecrawl: "stdio-only" }
    );

    expect(summaries).toEqual([
      {
        serviceName: "firecrawl",
        previousPreference: "prefer-http",
        nextPreference: "stdio-only",
      },
    ]);
  });
});
