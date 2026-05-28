/**
 * @fileoverview Jest unit tests for the MCP editor controller.
 * @testing Jest unit: npm test -- --runInBand scripts/controllers/editor-controller.unit.test.ts
 * @see scripts/README.md - Top-level MCP workflow guide for these test helpers.
 * @see scripts/controllers/editor-controller.ts - editor-controller controller module under test in this Jest suite.
 * @see scripts/lib/state.ts - state library helper under test in this Jest suite.
 * @documentation reviewed=2026-04-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { afterEach, describe, expect, it } from "@jest/globals";
import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  buildEditorSelectionPreview,
  executeEditorSelections,
} from "./editor-controller";
import { createDefaultState } from "../lib/state";
import { servers } from "../servers";

const tempDirs: string[] = [];

/**
 * Creates a unique temporary directory for editor-controller tests and registers it for teardown.
 *
 * @remarks
 * I/O: allocates an empty directory via `mkdtemp` under the OS temp folder.
 * POST-CONDITION: the absolute path is pushed onto `tempDirs` so `afterEach` removes the tree with
 * `rm(..., { recursive: true, force: true })`.
 */
async function createTempProjectRoot(): Promise<string> {
  const projectRoot = await mkdtemp(join(tmpdir(), "mcp-editor-controller-"));
  tempDirs.push(projectRoot);
  return projectRoot;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0, tempDirs.length).map(async (projectRoot) => {
      await rm(projectRoot, { recursive: true, force: true });
    })
  );
});

describe("editor-controller", () => {
  it("builds preview items for config writes and generated instructions", async () => {
    const projectRoot = await createTempProjectRoot();
    const previewItems = buildEditorSelectionPreview(projectRoot, [
      { editorId: "cursor", scope: "project" },
      { editorId: "codex-cli", scope: "instructions" },
    ]);

    expect(previewItems).toEqual([
      {
        editorId: "cursor",
        editorName: "Cursor",
        scope: "project",
        description: `${projectRoot}/.cursor/mcp.json`,
      },
      {
        editorId: "codex-cli",
        editorName: "Codex CLI",
        scope: "instructions",
        description: `Generate instructions -> ${projectRoot}/.mcp-sync/instructions/codex-cli.md`,
      },
    ]);
  });

  it("executes project config writes and instruction generation through one controller", async () => {
    const projectRoot = await createTempProjectRoot();
    const stateFilePath = join(projectRoot, ".mcp-sync/state.json");
    const state = createDefaultState();
    const enabledServers = [servers[0]];

    const result = await executeEditorSelections({
      projectRoot,
      stateFilePath,
      state,
      env: {},
      enabledServers,
      selections: [
        { editorId: "cursor", scope: "project" },
        { editorId: "codex-cli", scope: "instructions" },
      ],
    });

    expect(result.successCount).toBe(2);
    expect(result.warningCount).toBe(0);
    expect(result.errorCount).toBe(0);
    expect(result.stateWriteError).toBeNull();
    expect(result.nextState.editors.cursor?.project.enabled).toBe(true);

    const cursorConfig = await readFile(join(projectRoot, ".cursor/mcp.json"), "utf-8");
    const codexInstructions = await readFile(
      join(projectRoot, ".mcp-sync/instructions/codex-cli.md"),
      "utf-8"
    );
    const writtenState = await readFile(stateFilePath, "utf-8");

    expect(cursorConfig).toContain("mcpServers");
    expect(codexInstructions.length).toBeGreaterThan(0);
    expect(writtenState).toContain("\"manage-editors\"");
  });
});
