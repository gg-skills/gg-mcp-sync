/**
 * @fileoverview Jest unit tests for the MCP Ink UI.
 *
 * Flow: env-edit input helpers -> sanitization and action wiring assertions for Ink state.
 *
 * @testing Jest unit: npm test -- --runInBand scripts/ui/cli-ink/app-input.unit.test.ts
 * @see scripts/README.md - Top-level MCP workflow guide for these test helpers.
 * @see scripts/ui/cli-ink/app.tsx - MCP Ink app module exercised by this Jest suite.
 * @documentation reviewed=2026-04-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { describe, expect, it } from "@jest/globals";
import {
  getEnvEditInputActions,
  sanitizeEnvEditInput,
} from "./app";

describe("mcp ink env-edit input helpers", () => {
  it("removes carriage returns and newlines from staged input", () => {
    expect(sanitizeEnvEditInput("abc\r\ndef")).toBe("abcdef");
  });

  it("preserves typed text before submitting when return arrives in the same chunk", () => {
    expect(getEnvEditInputActions("x\r", { return: true })).toEqual([
      {
        type: "append-env-edit",
        value: "x",
      },
      {
        type: "submit-env-edit",
      },
    ]);
  });

  it("ignores control-only input while editing", () => {
    expect(getEnvEditInputActions("x", { ctrl: true })).toEqual([]);
  });
});
