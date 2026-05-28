/**
 * @fileoverview Jest unit tests for the shared MCP command catalog.
 *
 * Flow: catalog entries + preview helpers -> stable ids and formatting for CLI launch surfaces.
 *
 * @testing Jest unit: npm test -- --runInBand scripts/ui/shared/command-catalog.unit.test.ts
 * @see scripts/README.md - Top-level MCP workflow guide for these test helpers.
 * @see scripts/ui/shared/command-catalog.ts - Shared MCP command-catalog module under test in this Jest suite.
 * @documentation reviewed=2026-04-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { describe, expect, it } from "@jest/globals";
import {
  findMcpCatalogEntry,
  formatMcpCommandPreview,
  MCP_COMMAND_CATALOG,
} from "./command-catalog";

describe("command-catalog", () => {
  it("includes ink and opentui entries", () => {
    expect(findMcpCatalogEntry("mcp:cli:ink")).toBeDefined();
    expect(findMcpCatalogEntry("mcp:cli:opentui")).toBeDefined();
    expect(MCP_COMMAND_CATALOG.length).toBeGreaterThanOrEqual(8);
  });

  it("formatMcpCommandPreview appends args directly", () => {
    expect(formatMcpCommandPreview("mcp-sync validate", ["--quiet"])).toBe(
      "mcp-sync validate --quiet"
    );
  });
});
