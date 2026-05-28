/**
 * @fileoverview Jest unit tests for the MCP Ink UI.
 *
 * Flow: ink-testing-library render -> minimal Text snapshot to guard harness drift.
 *
 * @testing Jest unit: npm test -- --runInBand scripts/ui/cli-ink/ink-testing-library-smoke.unit.test.ts
 * @see scripts/README.md - Top-level MCP workflow guide for these test helpers.
 * @documentation reviewed=2026-04-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { describe, expect, it } from "@jest/globals";
import React from "react";
import { Text } from "ink";
import { render } from "ink-testing-library";

describe("ink-testing-library smoke", () => {
  it("renders Ink output for MCP UI regression harness", () => {
    const { lastFrame } = render(React.createElement(Text, null, "MCP ink-testing-library ok"));
    expect(lastFrame()).toContain("MCP ink-testing-library ok");
  });
});
