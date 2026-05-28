/**
 * @fileoverview Jest unit tests for persisted MCP state server-settings mappings.
 * @testing Jest unit: npm test -- --runInBand scripts/lib/server-settings.unit.test.ts
 * @see scripts/lib/server-settings.ts - Applies canonical state settings to editor-specific config generators.
 * @documentation reviewed=2026-05-12 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { describe, expect, it } from "@jest/globals";
import type { EnvVars, McpServerTemplate } from "./types";
import { applyStateSettingsToServerTemplates } from "./server-settings";

const testEnv: EnvVars = {};

/**
 * Factory for a Serena stdio MCP server template used as a stable unit-test fixture.
 *
 * @remarks
 * PURITY: Synchronous; no filesystem or network I/O. The returned `McpServerTemplate` carries
 * representative per-editor `configs` generators so `applyStateSettingsToServerTemplates` can be
 * exercised across codex, goose, crush, opencode, and standard shapes without depending on
 * persisted disk state.
 */
function createTemplate(): McpServerTemplate {
  return {
    id: "serena-stdio",
    name: "Serena",
    transport: "stdio",
    package: "serena",
    envVars: [],
    configs: {
      standard: () => ({
        command: "uvx",
        args: ["serena"],
      }),
      opencode: () => ({
        type: "local",
        command: ["uvx", "serena"],
      }),
      goose: () => ({
        name: "serena",
        command: "uvx",
        args: ["serena"],
      }),
      codex: () => ({
        command: "uvx",
        args: ["serena"],
      }),
      crush: () => ({
        type: "stdio",
        command: "uvx",
        args: ["serena"],
      }),
    },
  };
}

describe("server-settings", () => {
  it("maps startupTimeoutSeconds to editor-specific timeout fields", () => {
    const [wrapped] = applyStateSettingsToServerTemplates([createTemplate()], {
      "serena-stdio": {
        startupTimeoutSeconds: 120,
      },
    });

    expect(wrapped.configs.codex?.(testEnv)).toMatchObject({
      startup_timeout_sec: 120,
    });
    expect(wrapped.configs.goose?.(testEnv)).toMatchObject({
      timeout: 120,
    });
    expect(wrapped.configs.crush?.(testEnv)).toMatchObject({
      timeout: 120,
    });
    expect(wrapped.configs.opencode?.(testEnv)).toMatchObject({
      timeout: 120000,
    });
  });

  it("leaves unsupported generator outputs unchanged", () => {
    const [wrapped] = applyStateSettingsToServerTemplates([createTemplate()], {
      "serena-stdio": {
        startupTimeoutSeconds: 120,
      },
    });

    expect(wrapped.configs.standard(testEnv)).toEqual({
      command: "uvx",
      args: ["serena"],
    });
  });
});
