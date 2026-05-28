/**
 * @fileoverview Unit tests for the Asana HTTP stdio bridge schema normalizer.
 *
 * @testing Jest unit: npm test -- --runInBand scripts/bridges/asana-http-bridge-stdio.unit.test.ts
 * @see scripts/bridges/asana-http-bridge-stdio.mjs - Runtime bridge wrapper under test.
 * @documentation reviewed=2026-05-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { describe, expect, it } from "@jest/globals";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const bridgeModuleDirPath = path.dirname(fileURLToPath(import.meta.url));
const asanaHttpBridgeStdioModulePromise = import(
  pathToFileURL(path.join(bridgeModuleDirPath, "asana-http-bridge-stdio.mjs")).href,
);
const { formatBridgeLogLine, normalizeToolListMessage } = await asanaHttpBridgeStdioModulePromise;

describe("asana-http-bridge-stdio schema normalization", () => {
  it("inlines local property refs in tools/list responses", () => {
    const message = {
      jsonrpc: "2.0",
      id: 1,
      result: {
        tools: [
          {
            name: "create_task_preview_v3",
            inputSchema: {
              type: "object",
              properties: {
                assignee: {
                  type: "string",
                  description: "User gid or email.",
                },
                subtasks: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      assignee: {
                        $ref: "#/properties/assignee",
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      },
    };

    const normalized = normalizeToolListMessage(message);
    const subtaskAssignee =
      normalized.result.tools[0].inputSchema.properties.subtasks.items.properties.assignee;

    expect(subtaskAssignee).toEqual({
      type: "string",
      description: "User gid or email.",
    });
    expect(JSON.stringify(normalized)).not.toContain("\"$ref\"");
  });

  it("leaves non-tool messages unchanged", () => {
    const message = {
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: "2025-11-25",
      },
    };

    expect(normalizeToolListMessage(message)).toBe(message);
  });

  it("prefixes bridge log lines with service and source context", () => {
    expect(formatBridgeLogLine("mcp-remote", "[123] Connecting to remote server")).toBe(
      "[asana-http-bridge-stdio] [mcp-remote] [123] Connecting to remote server"
    );
  });
});
