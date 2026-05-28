/**
 * @fileoverview Jest unit tests for MCP library helpers.
 * @testing Jest unit: npm test -- --runInBand scripts/lib/jsonc.unit.test.ts
 * @see scripts/README.md - Top-level MCP workflow guide for these test helpers.
 * @see scripts/lib/jsonc.ts - jsonc library helper under test in this Jest suite.
 * @documentation reviewed=2026-04-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { describe, it, expect } from "@jest/globals";

import {
  parseJsonc,
  parseJsoncSafe,
  parseJsonOrJsonc,
  modifyJsonc,
  modifyJsoncMultiple,
  deleteJsoncPath,
  getValueAtPath,
  hasPath,
  mergeServersIntoJsonc,
  removeServersFromJsonc,
  isValidJsonc,
  formatParseErrors,
  stringifyJson,
  stringifyJsonWithNewline,
} from "./jsonc";

describe("jsonc", () => {
  // ==========================================================================
  // Parse Functions
  // ==========================================================================

  describe("parseJsonc", () => {
    it("parses valid JSON", () => {
      const content = '{"key": "value", "num": 42}';
      const result = parseJsonc(content);

      expect(result.hasErrors).toBe(false);
      expect(result.data).toEqual({ key: "value", num: 42 });
    });

    it("parses JSONC with single-line comments", () => {
      const content = `{
        // This is a comment
        "key": "value"
      }`;
      const result = parseJsonc(content);

      expect(result.hasErrors).toBe(false);
      expect(result.data).toEqual({ key: "value" });
    });

    it("parses JSONC with multi-line comments", () => {
      const content = `{
        /* Multi-line
           comment */
        "key": "value"
      }`;
      const result = parseJsonc(content);

      expect(result.hasErrors).toBe(false);
      expect(result.data).toEqual({ key: "value" });
    });

    it("allows trailing commas", () => {
      const content = '{"key": "value",}';
      const result = parseJsonc(content);

      expect(result.hasErrors).toBe(false);
      expect(result.data).toEqual({ key: "value" });
    });

    it("allows empty content", () => {
      const result = parseJsonc("");

      expect(result.hasErrors).toBe(false);
    });

    it("reports errors for invalid content", () => {
      const content = '{"key": invalid}';
      const result = parseJsonc(content);

      expect(result.hasErrors).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe("parseJsoncSafe", () => {
    it("returns success result for valid JSONC", () => {
      const content = '{"key": "value"}';
      const result = parseJsoncSafe(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ key: "value" });
      }
    });

    it("returns error result for invalid JSONC", () => {
      const content = '{"key": }';
      const result = parseJsoncSafe(content);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Parse errors");
      }
    });
  });

  describe("parseJsonOrJsonc", () => {
    it("parses valid JSON directly", () => {
      const content = '{"key": "value"}';
      const result = parseJsonOrJsonc(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ key: "value" });
      }
    });

    it("falls back to JSONC for content with comments", () => {
      const content = `{
        // comment
        "key": "value"
      }`;
      const result = parseJsonOrJsonc(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ key: "value" });
      }
    });

    it("returns error for completely invalid content", () => {
      const content = "not json at all {{{";
      const result = parseJsonOrJsonc(content);

      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // Modify Functions
  // ==========================================================================

  describe("modifyJsonc", () => {
    it("adds a new key to empty object", () => {
      const content = "{}";
      const result = modifyJsonc(content, ["key"], "value");

      const parsed = JSON.parse(result);
      expect(parsed.key).toBe("value");
    });

    it("updates existing key", () => {
      const content = '{"key": "old"}';
      const result = modifyJsonc(content, ["key"], "new");

      const parsed = JSON.parse(result);
      expect(parsed.key).toBe("new");
    });

    it("adds nested key", () => {
      const content = '{"parent": {}}';
      const result = modifyJsonc(content, ["parent", "child"], "value");

      const parsed = JSON.parse(result);
      expect(parsed.parent.child).toBe("value");
    });

    it("preserves comments", () => {
      const content = `{
  // Important comment
  "existing": "value"
}`;
      const result = modifyJsonc(content, ["newKey"], "newValue");

      expect(result).toContain("// Important comment");
    });

    it("handles array values", () => {
      const content = "{}";
      const result = modifyJsonc(content, ["arr"], [1, 2, 3]);

      const parsed = JSON.parse(result);
      expect(parsed.arr).toEqual([1, 2, 3]);
    });

    it("handles object values", () => {
      const content = "{}";
      const result = modifyJsonc(content, ["obj"], { nested: true });

      const parsed = JSON.parse(result);
      expect(parsed.obj).toEqual({ nested: true });
    });
  });

  describe("modifyJsoncMultiple", () => {
    it("applies multiple modifications", () => {
      const content = "{}";
      const result = modifyJsoncMultiple(content, [
        { path: ["key1"], value: "value1" },
        { path: ["key2"], value: "value2" },
        { path: ["key3"], value: 42 },
      ]);

      const parsed = JSON.parse(result);
      expect(parsed.key1).toBe("value1");
      expect(parsed.key2).toBe("value2");
      expect(parsed.key3).toBe(42);
    });

    it("handles nested modifications", () => {
      const content = '{"parent": {}}';
      const result = modifyJsoncMultiple(content, [
        { path: ["parent", "child1"], value: 1 },
        { path: ["parent", "child2"], value: 2 },
      ]);

      const parsed = JSON.parse(result);
      expect(parsed.parent.child1).toBe(1);
      expect(parsed.parent.child2).toBe(2);
    });
  });

  describe("deleteJsoncPath", () => {
    it("deletes top-level key", () => {
      const content = '{"keep": 1, "delete": 2}';
      const result = deleteJsoncPath(content, ["delete"]);

      const parsed = JSON.parse(result);
      expect(parsed.keep).toBe(1);
      expect(parsed.delete).toBeUndefined();
    });

    it("deletes nested key", () => {
      const content = '{"parent": {"keep": 1, "delete": 2}}';
      const result = deleteJsoncPath(content, ["parent", "delete"]);

      const parsed = JSON.parse(result);
      expect(parsed.parent.keep).toBe(1);
      expect(parsed.parent.delete).toBeUndefined();
    });

    it("handles missing key gracefully", () => {
      const content = '{"key": "value"}';
      const result = deleteJsoncPath(content, ["missing"]);

      const parsed = JSON.parse(result);
      expect(parsed.key).toBe("value");
    });
  });

  // ==========================================================================
  // Helper Functions
  // ==========================================================================

  describe("getValueAtPath", () => {
    it("gets top-level value", () => {
      const data = { key: "value" };
      const result = getValueAtPath(data, ["key"]);
      expect(result).toBe("value");
    });

    it("gets nested value", () => {
      const data = { parent: { child: "value" } };
      const result = getValueAtPath(data, ["parent", "child"]);
      expect(result).toBe("value");
    });

    it("returns undefined for missing path", () => {
      const data = { key: "value" };
      const result = getValueAtPath(data, ["missing"]);
      expect(result).toBeUndefined();
    });

    it("returns undefined for null data", () => {
      const result = getValueAtPath(null, ["key"]);
      expect(result).toBeUndefined();
    });

    it("handles array indices", () => {
      const data = { arr: ["a", "b", "c"] };
      const result = getValueAtPath(data, ["arr", 1]);
      expect(result).toBe("b");
    });
  });

  describe("hasPath", () => {
    it("returns true for existing path", () => {
      const data = { key: "value" };
      expect(hasPath(data, ["key"])).toBe(true);
    });

    it("returns true for nested existing path", () => {
      const data = { parent: { child: "value" } };
      expect(hasPath(data, ["parent", "child"])).toBe(true);
    });

    it("returns false for missing path", () => {
      const data = { key: "value" };
      expect(hasPath(data, ["missing"])).toBe(false);
    });
  });

  describe("mergeServersIntoJsonc", () => {
    it("merges servers into empty config", () => {
      const content = '{"mcpServers": {}}';
      const servers = {
        "server1": { command: "npx", args: ["pkg1"] },
      };
      const result = mergeServersIntoJsonc(content, ["mcpServers"], servers);

      const parsed = JSON.parse(result);
      expect(parsed.mcpServers["server1"]).toEqual({ command: "npx", args: ["pkg1"] });
    });

    it("preserves existing servers", () => {
      const content = '{"mcpServers": {"existing": {"command": "cmd"}}}';
      const servers = {
        "new": { command: "new-cmd" },
      };
      const result = mergeServersIntoJsonc(content, ["mcpServers"], servers);

      const parsed = JSON.parse(result);
      expect(parsed.mcpServers["existing"]).toEqual({ command: "cmd" });
      expect(parsed.mcpServers["new"]).toEqual({ command: "new-cmd" });
    });

    it("overrides servers with same key", () => {
      const content = '{"mcpServers": {"server": {"command": "old"}}}';
      const servers = {
        "server": { command: "new" },
      };
      const result = mergeServersIntoJsonc(content, ["mcpServers"], servers);

      const parsed = JSON.parse(result);
      expect(parsed.mcpServers["server"]).toEqual({ command: "new" });
    });

    it("creates key path if missing", () => {
      const content = "{}";
      const servers = {
        "server": { command: "cmd" },
      };
      const result = mergeServersIntoJsonc(content, ["mcpServers"], servers);

      const parsed = JSON.parse(result);
      expect(parsed.mcpServers["server"]).toEqual({ command: "cmd" });
    });
  });

  describe("removeServersFromJsonc", () => {
    it("removes specified server", () => {
      const content = '{"mcpServers": {"keep": {}, "remove": {}}}';
      const result = removeServersFromJsonc(content, ["mcpServers"], ["remove"]);

      const parsed = JSON.parse(result);
      expect(parsed.mcpServers["keep"]).toEqual({});
      expect(parsed.mcpServers["remove"]).toBeUndefined();
    });

    it("removes multiple servers", () => {
      const content = '{"mcpServers": {"a": {}, "b": {}, "c": {}}}';
      const result = removeServersFromJsonc(content, ["mcpServers"], ["a", "c"]);

      const parsed = JSON.parse(result);
      expect(Object.keys(parsed.mcpServers)).toEqual(["b"]);
    });

    it("handles removing non-existent server", () => {
      const content = '{"mcpServers": {"existing": {}}}';
      const result = removeServersFromJsonc(content, ["mcpServers"], ["missing"]);

      const parsed = JSON.parse(result);
      expect(parsed.mcpServers["existing"]).toEqual({});
    });
  });

  // ==========================================================================
  // Validation Functions
  // ==========================================================================

  describe("isValidJsonc", () => {
    it("returns true for valid JSON", () => {
      expect(isValidJsonc('{"key": "value"}')).toBe(true);
    });

    it("returns true for valid JSONC", () => {
      expect(isValidJsonc('{"key": "value"} // comment')).toBe(true);
    });

    it("returns false for invalid content", () => {
      expect(isValidJsonc('{"key": }')).toBe(false);
    });

    it("returns true for empty content", () => {
      expect(isValidJsonc("")).toBe(true);
    });
  });

  describe("formatParseErrors", () => {
    it("formats parse errors", () => {
      const content = '{"key": }';
      const result = parseJsonc(content);
      const formatted = formatParseErrors(result.errors);

      expect(formatted.length).toBeGreaterThan(0);
      expect(formatted[0]).toContain("offset");
    });
  });

  // ==========================================================================
  // Stringify Functions
  // ==========================================================================

  describe("stringifyJson", () => {
    it("stringifies with default indentation", () => {
      const data = { key: "value" };
      const result = stringifyJson(data);

      expect(result).toBe('{\n  "key": "value"\n}');
    });

    it("stringifies with custom indentation", () => {
      const data = { key: "value" };
      const result = stringifyJson(data, 4);

      expect(result).toBe('{\n    "key": "value"\n}');
    });
  });

  describe("stringifyJsonWithNewline", () => {
    it("adds trailing newline", () => {
      const data = { key: "value" };
      const result = stringifyJsonWithNewline(data);

      expect(result.endsWith("\n")).toBe(true);
    });

    it("only adds single trailing newline", () => {
      const data = { key: "value" };
      const result = stringifyJsonWithNewline(data);

      expect(result.endsWith("\n\n")).toBe(false);
    });
  });
});
