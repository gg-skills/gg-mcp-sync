/**
 * @fileoverview Jest unit tests for MCP library helpers.
 * @testing Jest unit: npm test -- --runInBand scripts/lib/file-utils.unit.test.ts
 * @see scripts/README.md - Top-level MCP workflow guide for these test helpers.
 * @documentation reviewed=2026-04-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import { homedir } from "os";
import { resolve, join } from "path";

// Mock modules before imports
jest.unstable_mockModule("fs/promises", () => ({
  readFile: jest.fn<() => Promise<string>>(),
  writeFile: jest.fn<() => Promise<void>>(),
  mkdir: jest.fn<() => Promise<void>>(),
  access: jest.fn<() => Promise<void>>(),
  stat: jest.fn<() => Promise<{ size: number; mtime: Date; isDirectory: () => boolean }>>(),
  readdir: jest.fn<() => Promise<string[]>>(),
  unlink: jest.fn<() => Promise<void>>(),
}));

jest.unstable_mockModule("fs", () => ({
  existsSync: jest.fn<() => boolean>(),
  constants: { R_OK: 4, W_OK: 2 },
  statSync: jest.fn<() => { size: number; mtime: Date; isDirectory: () => boolean }>(),
}));

const mockFsPromises = await Promise.resolve(import("fs/promises"));
const mockFs = await Promise.resolve(import("fs"));

/**
 * Shared Jest mock function type for fs and fs/promises assertions in this suite.
 *
 * @remarks
 * Keeps `mockResolvedValue`, `mockRejectedValue`, and `mockReturnValue` ergonomics on mocks
 * loaded after `jest.unstable_mockModule`, where inferred typings are too loose for direct use.
 */
type MockFn = ReturnType<typeof jest.fn>;

// Import the module under test after mocks are set up
const {
  expandTilde,
  resolvePath,
  getProjectRoot,
  isProjectPath,
  toDisplayPath,
  readFileSafe,
  writeFileSafe,
  fileExists,
  isFileReadable,
  isFileWritable,
  getFileInfo,
  deleteFile,
  ensureDir,
  dirExists,
  listFiles,
  listFilesWithPaths,
  detectFormatFromExtension,
  detectFormatFromContent,
  generateTimestamp,
  parseTimestampFromBackup,
  isSamePath,
  getFilename,
  getDirectory,
} = await Promise.resolve(import("./file-utils"));

describe("file-utils", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================================================
  // Path Resolution
  // ==========================================================================

  describe("expandTilde", () => {
    it("expands ~/ to home directory", () => {
      const result = expandTilde("~/test/path");
      expect(result).toBe(join(homedir(), "test/path"));
    });

    it("expands standalone ~ to home directory", () => {
      const result = expandTilde("~");
      expect(result).toBe(homedir());
    });

    it("returns path unchanged if no tilde", () => {
      const result = expandTilde("/absolute/path");
      expect(result).toBe("/absolute/path");
    });

    it("returns relative path unchanged", () => {
      const result = expandTilde("relative/path");
      expect(result).toBe("relative/path");
    });

    it("does not expand ~ in middle of path", () => {
      const result = expandTilde("/some/~/path");
      expect(result).toBe("/some/~/path");
    });
  });

  describe("resolvePath", () => {
    it("resolves relative paths to absolute", () => {
      const result = resolvePath("relative/path");
      expect(result).toBe(resolve("relative/path"));
    });

    it("expands tilde paths", () => {
      const result = resolvePath("~/test");
      expect(result).toBe(join(homedir(), "test"));
    });

    it("keeps absolute paths", () => {
      const result = resolvePath("/absolute/path");
      expect(result).toBe("/absolute/path");
    });

    it("resolves relative to base path when provided", () => {
      const result = resolvePath("subdir", "/base/path");
      expect(result).toBe("/base/path/subdir");
    });
  });

  describe("getProjectRoot", () => {
    it("returns current working directory", () => {
      const result = getProjectRoot();
      expect(result).toBe(process.cwd());
    });
  });

  describe("isProjectPath", () => {
    it("returns true for path inside project root", () => {
      const projectRoot = "/project";
      const result = isProjectPath("/project/src/file.ts", projectRoot);
      expect(result).toBe(true);
    });

    it("returns false for path outside project root", () => {
      const projectRoot = "/project";
      const result = isProjectPath("/other/path", projectRoot);
      expect(result).toBe(false);
    });
  });

  describe("toDisplayPath", () => {
    it("replaces home directory with ~", () => {
      const home = homedir();
      const result = toDisplayPath(`${home}/test/path`);
      expect(result).toBe("~/test/path");
    });

    it("returns path unchanged if not in home", () => {
      const result = toDisplayPath("/other/path");
      expect(result).toBe("/other/path");
    });
  });

  // ==========================================================================
  // File Operations
  // ==========================================================================

  describe("readFileSafe", () => {
    it("reads file successfully", async () => {
      (mockFsPromises.readFile as MockFn).mockResolvedValue("file content");

      const result = await readFileSafe("/test/file.txt");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("file content");
      }
    });

    it("returns error for missing file", async () => {
      const error = new Error("ENOENT: no such file");
      (mockFsPromises.readFile as MockFn).mockRejectedValue(error);

      const result = await readFileSafe("/missing/file.txt");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Failed to read file");
      }
    });
  });

  describe("writeFileSafe", () => {
    it("writes file successfully", async () => {
      (mockFsPromises.mkdir as MockFn).mockResolvedValue(undefined);
      (mockFsPromises.writeFile as MockFn).mockResolvedValue(undefined);

      const result = await writeFileSafe("/test/file.txt", "content");

      expect(result.success).toBe(true);
      expect(mockFsPromises.writeFile).toHaveBeenCalledWith(
        "/test/file.txt",
        "content",
        "utf-8"
      );
    });

    it("creates parent directory if needed", async () => {
      (mockFsPromises.mkdir as MockFn).mockResolvedValue(undefined);
      (mockFsPromises.writeFile as MockFn).mockResolvedValue(undefined);

      await writeFileSafe("/new/dir/file.txt", "content");

      expect(mockFsPromises.mkdir).toHaveBeenCalledWith("/new/dir", { recursive: true });
    });

    it("returns error on write failure", async () => {
      (mockFsPromises.mkdir as MockFn).mockResolvedValue(undefined);
      (mockFsPromises.writeFile as MockFn).mockRejectedValue(new Error("Permission denied"));

      const result = await writeFileSafe("/test/file.txt", "content");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Failed to write file");
      }
    });
  });

  describe("fileExists", () => {
    it("returns true for existing file", () => {
      (mockFs.existsSync as MockFn).mockReturnValue(true);

      const result = fileExists("/existing/file.txt");

      expect(result).toBe(true);
    });

    it("returns false for missing file", () => {
      (mockFs.existsSync as MockFn).mockReturnValue(false);

      const result = fileExists("/missing/file.txt");

      expect(result).toBe(false);
    });
  });

  describe("isFileReadable", () => {
    it("returns true for readable file", async () => {
      (mockFsPromises.access as MockFn).mockResolvedValue(undefined);

      const result = await isFileReadable("/readable/file.txt");

      expect(result).toBe(true);
    });

    it("returns false for unreadable file", async () => {
      (mockFsPromises.access as MockFn).mockRejectedValue(new Error("EACCES"));

      const result = await isFileReadable("/unreadable/file.txt");

      expect(result).toBe(false);
    });
  });

  describe("isFileWritable", () => {
    it("returns true for writable existing file", async () => {
      (mockFs.existsSync as MockFn).mockReturnValue(true);
      (mockFsPromises.access as MockFn).mockResolvedValue(undefined);

      const result = await isFileWritable("/writable/file.txt");

      expect(result).toBe(true);
    });

    it("returns true if parent directory is writable", async () => {
      (mockFs.existsSync as MockFn)
        .mockReturnValueOnce(false) // File doesn't exist
        .mockReturnValueOnce(true); // Parent exists
      (mockFsPromises.access as MockFn).mockResolvedValue(undefined);

      const result = await isFileWritable("/parent/newfile.txt");

      expect(result).toBe(true);
    });

    it("returns false if neither file nor parent is writable", async () => {
      (mockFs.existsSync as MockFn).mockReturnValue(false);

      const result = await isFileWritable("/nonexistent/path/file.txt");

      expect(result).toBe(false);
    });
  });

  describe("getFileInfo", () => {
    it("returns file info for existing file", async () => {
      const mockStats = {
        size: 1024,
        mtime: new Date("2024-01-27T10:00:00Z"),
        isDirectory: () => false,
      };
      (mockFsPromises.stat as MockFn).mockResolvedValue(mockStats);

      const result = await getFileInfo("/test/file.txt");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.size).toBe(1024);
        expect(result.data.isDirectory).toBe(false);
      }
    });

    it("returns error for missing file", async () => {
      (mockFsPromises.stat as MockFn).mockRejectedValue(new Error("ENOENT"));

      const result = await getFileInfo("/missing/file.txt");

      expect(result.success).toBe(false);
    });
  });

  describe("deleteFile", () => {
    it("deletes file successfully", async () => {
      (mockFsPromises.unlink as MockFn).mockResolvedValue(undefined);

      const result = await deleteFile("/test/file.txt");

      expect(result.success).toBe(true);
    });

    it("returns error for missing file", async () => {
      (mockFsPromises.unlink as MockFn).mockRejectedValue(new Error("ENOENT"));

      const result = await deleteFile("/missing/file.txt");

      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // Directory Operations
  // ==========================================================================

  describe("ensureDir", () => {
    it("creates directory successfully", async () => {
      (mockFsPromises.mkdir as MockFn).mockResolvedValue(undefined);

      const result = await ensureDir("/new/directory");

      expect(result.success).toBe(true);
      expect(mockFsPromises.mkdir).toHaveBeenCalledWith("/new/directory", { recursive: true });
    });

    it("returns error on failure", async () => {
      (mockFsPromises.mkdir as MockFn).mockRejectedValue(new Error("Permission denied"));

      const result = await ensureDir("/protected/directory");

      expect(result.success).toBe(false);
    });
  });

  describe("dirExists", () => {
    // Note: dirExists uses both ESM import (existsSync) and require("fs").statSync
    // ESM mocking prevents reliable testing, so we rely on integration tests for dirExists coverage.
  });

  describe("listFiles", () => {
    it("lists all files in directory", async () => {
      (mockFsPromises.readdir as MockFn).mockResolvedValue(["file1.txt", "file2.json", "dir1"]);

      const result = await listFiles("/test/dir");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(["file1.txt", "file2.json", "dir1"]);
      }
    });

    it("filters files with provided filter function", async () => {
      (mockFsPromises.readdir as MockFn).mockResolvedValue(["file1.txt", "file2.json", "file3.txt"]);

      const result = await listFiles("/test/dir", (name) => name.endsWith(".txt"));

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(["file1.txt", "file3.txt"]);
      }
    });

    it("returns error for missing directory", async () => {
      (mockFsPromises.readdir as MockFn).mockRejectedValue(new Error("ENOENT"));

      const result = await listFiles("/missing/dir");

      expect(result.success).toBe(false);
    });
  });

  describe("listFilesWithPaths", () => {
    it("returns full paths for files", async () => {
      (mockFsPromises.readdir as MockFn).mockResolvedValue(["file1.txt", "file2.json"]);

      const result = await listFilesWithPaths("/test/dir");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(["/test/dir/file1.txt", "/test/dir/file2.json"]);
      }
    });
  });

  // ==========================================================================
  // Format Detection
  // ==========================================================================

  describe("detectFormatFromExtension", () => {
    it("detects JSON format", () => {
      expect(detectFormatFromExtension("config.json")).toBe("json");
    });

    it("detects JSONC format", () => {
      expect(detectFormatFromExtension("settings.jsonc")).toBe("jsonc");
    });

    it("detects YAML format from .yaml", () => {
      expect(detectFormatFromExtension("config.yaml")).toBe("yaml");
    });

    it("detects YAML format from .yml", () => {
      expect(detectFormatFromExtension("config.yml")).toBe("yaml");
    });

    it("detects TOML format", () => {
      expect(detectFormatFromExtension("config.toml")).toBe("toml");
    });

    it("defaults to JSON for unknown extensions", () => {
      expect(detectFormatFromExtension("config.unknown")).toBe("json");
      expect(detectFormatFromExtension("noextension")).toBe("json");
    });
  });

  describe("detectFormatFromContent", () => {
    it("detects JSON content", () => {
      const content = '{"key": "value"}';
      expect(detectFormatFromContent(content)).toBe("json");
    });

    it("detects JSONC content with comments", () => {
      const content = '// comment\n{"key": "value"}';
      expect(detectFormatFromContent(content)).toBe("jsonc");
    });

    it("detects YAML content", () => {
      const content = "key: value\nother: 123";
      expect(detectFormatFromContent(content)).toBe("yaml");
    });

    it("detects YAML content with document separator", () => {
      const content = "---\nkey: value";
      expect(detectFormatFromContent(content)).toBe("yaml");
    });

    it("detects TOML content with key = value syntax", () => {
      // Note: Content starting with [ could be JSON array, so use key = value pattern
      const content = "key = \"value\"\n[section]\nother = 123";
      expect(detectFormatFromContent(content)).toBe("toml");
    });
  });

  // ==========================================================================
  // Timestamp Utilities
  // ==========================================================================

  describe("generateTimestamp", () => {
    it("generates filesystem-safe timestamp", () => {
      const timestamp = generateTimestamp();
      // Should match format: 2024-01-27T14-30-00
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
      // Should not contain colons
      expect(timestamp).not.toContain(":");
    });
  });

  describe("parseTimestampFromBackup", () => {
    it("parses valid backup timestamp", () => {
      const filename = "config.json.bak-2024-01-27T14-30-00";
      const result = parseTimestampFromBackup(filename);

      expect(result).toBeInstanceOf(Date);
      expect(result?.toISOString()).toBe("2024-01-27T14:30:00.000Z");
    });

    it("returns null for invalid backup filename", () => {
      const result = parseTimestampFromBackup("config.json");
      expect(result).toBeNull();
    });

    it("returns null for malformed timestamp", () => {
      const result = parseTimestampFromBackup("config.json.bak-invalid");
      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // Path Comparison
  // ==========================================================================

  describe("isSamePath", () => {
    it("returns true for identical paths", () => {
      expect(isSamePath("/test/path", "/test/path")).toBe(true);
    });

    it("returns true for equivalent paths", () => {
      expect(isSamePath("/test/./path", "/test/path")).toBe(true);
    });

    it("returns false for different paths", () => {
      expect(isSamePath("/test/path1", "/test/path2")).toBe(false);
    });
  });

  describe("getFilename", () => {
    it("extracts filename from path", () => {
      expect(getFilename("/path/to/file.txt")).toBe("file.txt");
    });
  });

  describe("getDirectory", () => {
    it("extracts directory from path", () => {
      expect(getDirectory("/path/to/file.txt")).toBe("/path/to");
    });
  });
});
