/**
 * @fileoverview Unit-test suite owning behavioral contracts for
 *   scripts/lib/validate-mcp-config-files.ts. Validates config-file
 *   enumeration across the editor registry, JSON validation against per-editor
 *   schemas, summary formatting, and schema presence assertions.
 * @testing Jest unit: npm test -- --runInBand scripts/lib/validate-mcp-config-files.unit.test.ts
 * @see scripts/README.md - MCP subsystem overview and editor adapter documentation.
 * @see scripts/lib/validate-mcp-config-files.ts - Config validation module under test.
 * @documentation reviewed=2026-04-30 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { describe, expect, it } from "@jest/globals";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  assertMcpSchemaFilesPresent,
  formatMcpValidationSummaryLines,
  getMcpConfigTargets,
  validateMcpConfigFiles,
} from "./validate-mcp-config-files";

describe("validateMcpConfigFiles", () => {
  it("marks missing config files as skipped", () => {
    const dir = mkdtempSync(join(tmpdir(), "mcp-validate-"));
    const targets = getMcpConfigTargets(dir);
    const summary = validateMcpConfigFiles(dir);
    expect(summary.results.length).toBe(targets.length);
    // Project-scoped configs in a temp dir will all be skipped (no config files there).
    // Global configs may or may not exist on this machine.
    const projectTargets = targets.filter((t) => t.scope === "project");
    const projectResults = summary.results.filter((r) =>
      projectTargets.some((t) => r.file === join(dir, t.relativePath))
    );
    expect(projectResults.length).toBe(projectTargets.length);
    for (const r of projectResults) {
      expect(r.skipped).toBe(true);
    }
    // Global configs may be invalid on this machine (e.g., empty files), so we
    // only assert project configs in a temp dir are all skipped — no global assertions.
  });

  it("formats summary lines without throwing", () => {
    const dir = mkdtempSync(join(tmpdir(), "mcp-validate-fmt-"));
    const summary = validateMcpConfigFiles(dir);
    const lines = formatMcpValidationSummaryLines(summary);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[lines.length - 1]).toContain("Summary");
  });

  it("assertMcpSchemaFilesPresent returns null when schemas exist", () => {
    expect(assertMcpSchemaFilesPresent()).toBeNull();
  });

  it("derives correct number of targets from editor registry", () => {
    const targets = getMcpConfigTargets("/dummy");
    const projectTargets = targets.filter((t) => t.scope === "project");
    const globalTargets = targets.filter((t) => t.scope === "global");
    // 17 unique project-scoped paths + 27 global paths = 44 total
    // If this fails, an editor was added/removed — update the counts after verifying
    expect(projectTargets.length).toBe(17);
    expect(globalTargets.length).toBe(27);
    expect(targets.length).toBe(44);
    // All targets must have a valid schema key
    for (const t of targets) {
      expect(["standard", "vscode", "opencode", "crush", "amp", "zed", "trae", "goose", "codex"]).toContain(t.schema);
    }
    // No duplicate paths
    const paths = targets.map((t) => t.relativePath);
    expect(new Set(paths).size).toBe(paths.length);
    // All global paths must be absolute (resolved from ~)
    for (const t of globalTargets) {
      expect(t.relativePath.startsWith("/")).toBe(true);
    }
  });

  it("deduplicates editors sharing the same config path", () => {
    const targets = getMcpConfigTargets("/dummy");
    // Factory CLI, Factory Ext, and Factory IDE all share .factory/mcp.json (project)
    // and ~/.factory/mcp.json (global). Only one target per path should exist.
    const factoryProjectTargets = targets.filter(
      (t) => t.relativePath === ".factory/mcp.json"
    );
    expect(factoryProjectTargets.length).toBe(1);
    const factoryGlobalTargets = targets.filter(
      (t) => t.relativePath.endsWith("/.factory/mcp.json") && t.scope === "global"
    );
    expect(factoryGlobalTargets.length).toBe(1);
  });
});
