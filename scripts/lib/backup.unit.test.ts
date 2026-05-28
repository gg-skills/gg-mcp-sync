/**
 * @fileoverview Jest unit tests for MCP library helpers.
 * @testing Jest unit: npm test -- --runInBand scripts/lib/backup.unit.test.ts
 * @see scripts/README.md - Top-level MCP workflow guide for these test helpers.
 * @documentation reviewed=2026-04-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { jest, describe, it, expect, beforeEach } from "@jest/globals";

// Mock modules before imports
jest.unstable_mockModule("fs/promises", () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  mkdir: jest.fn(),
  access: jest.fn(),
  stat: jest.fn(),
  readdir: jest.fn(),
  unlink: jest.fn(),
  copyFile: jest.fn(),
}));

jest.unstable_mockModule("fs", () => ({
  existsSync: jest.fn(),
  constants: { R_OK: 4, W_OK: 2 },
  statSync: jest.fn(),
}));

const fsPromisesModule = import("fs/promises");
const fsModule = import("fs");
const mockFsPromises = await fsPromisesModule;
const mockFs = await fsModule;

// Import the module under test after mocks are set up
const backupModule = import("./backup");
const {
  MAX_BACKUPS,
  BACKUP_SUFFIX_PATTERN,
  createBackup,
  createBackupIfExists,
  listBackups,
  getLatestBackup,
  restoreBackup,
  restoreLatestBackup,
  cleanupOldBackups,
  deleteBackup,
  formatBackupInfo,
  getBackupAge,
} = await backupModule;

describe("backup", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================================================
  // Constants
  // ==========================================================================

  describe("constants", () => {
    it("MAX_BACKUPS is 5", () => {
      expect(MAX_BACKUPS).toBe(5);
    });

    it("BACKUP_SUFFIX_PATTERN matches valid backup names", () => {
      expect(BACKUP_SUFFIX_PATTERN.test("config.json.bak-2024-01-27T14-30-00")).toBe(true);
      expect(BACKUP_SUFFIX_PATTERN.test("config.json.bak-2024-12-31T23-59-59")).toBe(true);
    });

    it("BACKUP_SUFFIX_PATTERN rejects invalid names", () => {
      expect(BACKUP_SUFFIX_PATTERN.test("config.json")).toBe(false);
      expect(BACKUP_SUFFIX_PATTERN.test("config.json.bak")).toBe(false);
      expect(BACKUP_SUFFIX_PATTERN.test("config.json.bak-invalid")).toBe(false);
    });
  });

  // ==========================================================================
  // Backup Creation
  // ==========================================================================

  describe("createBackup", () => {
    it("creates backup of existing file", async () => {
      (mockFs.existsSync as jest.MockedFunction<typeof mockFs.existsSync>).mockReturnValue(true);
      (mockFsPromises.copyFile as jest.MockedFunction<typeof mockFsPromises.copyFile>).mockResolvedValue(undefined);
      (mockFsPromises.stat as jest.MockedFunction<typeof mockFsPromises.stat>).mockResolvedValue({
        size: 1024,
        mtime: new Date(),
        isDirectory: () => false,
        isFile: () => true,
      } as unknown as Awaited<ReturnType<typeof mockFsPromises.stat>>);

      const result = await createBackup("/test/config.json");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.originalPath).toBe("/test/config.json");
        expect(result.data.backupPath).toMatch(/\.bak-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
        expect(result.data.size).toBe(1024);
      }
    });

    it("returns error for missing source file", async () => {
      (mockFs.existsSync as jest.MockedFunction<typeof mockFs.existsSync>).mockReturnValue(false);

      const result = await createBackup("/missing/config.json");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("does not exist");
      }
    });

    it("returns error on copy failure", async () => {
      (mockFs.existsSync as jest.MockedFunction<typeof mockFs.existsSync>).mockReturnValue(true);
      (mockFsPromises.copyFile as jest.MockedFunction<typeof mockFsPromises.copyFile>).mockRejectedValue(
        new Error("Permission denied")
      );

      const result = await createBackup("/test/config.json");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Failed to create backup");
      }
    });
  });

  describe("createBackupIfExists", () => {
    it("creates backup when file exists", async () => {
      (mockFs.existsSync as jest.MockedFunction<typeof mockFs.existsSync>).mockReturnValue(true);
      (mockFsPromises.copyFile as jest.MockedFunction<typeof mockFsPromises.copyFile>).mockResolvedValue(undefined);
      (mockFsPromises.stat as jest.MockedFunction<typeof mockFsPromises.stat>).mockResolvedValue({
        size: 512,
        mtime: new Date(),
        isDirectory: () => false,
        isFile: () => true,
      } as unknown as Awaited<ReturnType<typeof mockFsPromises.stat>>);

      const result = await createBackupIfExists("/test/config.json");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).not.toBeNull();
      }
    });

    it("returns null when file does not exist", async () => {
      (mockFs.existsSync as jest.MockedFunction<typeof mockFs.existsSync>).mockReturnValue(false);

      const result = await createBackupIfExists("/missing/config.json");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeNull();
      }
    });
  });

  // ==========================================================================
  // Backup Listing
  // ==========================================================================

  describe("listBackups", () => {
    it("lists all backups for a file", async () => {
      (mockFsPromises.readdir as jest.MockedFunction<typeof mockFsPromises.readdir>).mockResolvedValue([
        "config.json.bak-2024-01-27T10-00-00",
        "config.json.bak-2024-01-27T12-00-00",
        "config.json.bak-2024-01-27T14-00-00",
        "other-file.json",
      ] as unknown as Awaited<ReturnType<typeof mockFsPromises.readdir>>);
      (mockFsPromises.stat as jest.MockedFunction<typeof mockFsPromises.stat>).mockResolvedValue({
        size: 100,
        mtime: new Date(),
        isDirectory: () => false,
        isFile: () => true,
      } as unknown as Awaited<ReturnType<typeof mockFsPromises.stat>>);

      const result = await listBackups("/test/config.json");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.length).toBe(3);
      }
    });

    it("returns empty array when no backups exist", async () => {
      (mockFsPromises.readdir as jest.MockedFunction<typeof mockFsPromises.readdir>).mockResolvedValue([
        "config.json",
        "other-file.json",
      ] as unknown as Awaited<ReturnType<typeof mockFsPromises.readdir>>);

      const result = await listBackups("/test/config.json");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.length).toBe(0);
      }
    });

    it("sorts backups by timestamp (newest first)", async () => {
      (mockFsPromises.readdir as jest.MockedFunction<typeof mockFsPromises.readdir>).mockResolvedValue([
        "config.json.bak-2024-01-27T08-00-00",
        "config.json.bak-2024-01-27T16-00-00",
        "config.json.bak-2024-01-27T12-00-00",
      ] as unknown as Awaited<ReturnType<typeof mockFsPromises.readdir>>);
      (mockFsPromises.stat as jest.MockedFunction<typeof mockFsPromises.stat>).mockResolvedValue({
        size: 100,
        mtime: new Date(),
        isDirectory: () => false,
        isFile: () => true,
      } as unknown as Awaited<ReturnType<typeof mockFsPromises.stat>>);

      const result = await listBackups("/test/config.json");

      expect(result.success).toBe(true);
      if (result.success) {
        const timestamps = result.data.map((b) => b.timestamp);
        expect(timestamps[0]).toContain("16:00:00");
        expect(timestamps[1]).toContain("12:00:00");
        expect(timestamps[2]).toContain("08:00:00");
      }
    });
  });

  describe("getLatestBackup", () => {
    it("returns most recent backup", async () => {
      (mockFsPromises.readdir as jest.MockedFunction<typeof mockFsPromises.readdir>).mockResolvedValue([
        "config.json.bak-2024-01-27T08-00-00",
        "config.json.bak-2024-01-27T16-00-00",
      ] as unknown as Awaited<ReturnType<typeof mockFsPromises.readdir>>);
      (mockFsPromises.stat as jest.MockedFunction<typeof mockFsPromises.stat>).mockResolvedValue({
        size: 100,
        mtime: new Date(),
        isDirectory: () => false,
        isFile: () => true,
      } as unknown as Awaited<ReturnType<typeof mockFsPromises.stat>>);

      const result = await getLatestBackup("/test/config.json");

      expect(result.success).toBe(true);
      if (result.success && result.data) {
        expect(result.data.timestamp).toContain("16:00:00");
      }
    });

    it("returns null when no backups exist", async () => {
      (mockFsPromises.readdir as jest.MockedFunction<typeof mockFsPromises.readdir>).mockResolvedValue(
        [] as unknown as Awaited<ReturnType<typeof mockFsPromises.readdir>>
      );

      const result = await getLatestBackup("/test/config.json");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeNull();
      }
    });
  });

  // ==========================================================================
  // Backup Restoration
  // ==========================================================================

  describe("restoreBackup", () => {
    it("restores from valid backup file", async () => {
      (mockFs.existsSync as jest.MockedFunction<typeof mockFs.existsSync>).mockReturnValue(true);
      (mockFsPromises.readFile as jest.MockedFunction<typeof mockFsPromises.readFile>).mockResolvedValue(
        '{"restored": true}' as unknown as Awaited<ReturnType<typeof mockFsPromises.readFile>>
      );
      (mockFsPromises.mkdir as jest.MockedFunction<typeof mockFsPromises.mkdir>).mockResolvedValue(undefined);
      (mockFsPromises.writeFile as jest.MockedFunction<typeof mockFsPromises.writeFile>).mockResolvedValue(undefined);

      const result = await restoreBackup("/test/config.json.bak-2024-01-27T14-30-00");

      expect(result.success).toBe(true);
      expect(mockFsPromises.writeFile).toHaveBeenCalledWith(
        "/test/config.json",
        '{"restored": true}',
        "utf-8"
      );
    });

    it("returns error for invalid backup path format", async () => {
      const result = await restoreBackup("/test/config.json");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Invalid backup file path");
      }
    });

    it("returns error for missing backup file", async () => {
      (mockFs.existsSync as jest.MockedFunction<typeof mockFs.existsSync>).mockReturnValue(false);

      const result = await restoreBackup("/test/config.json.bak-2024-01-27T14-30-00");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("does not exist");
      }
    });
  });

  describe("restoreLatestBackup", () => {
    it("restores from latest backup", async () => {
      (mockFsPromises.readdir as jest.MockedFunction<typeof mockFsPromises.readdir>).mockResolvedValue([
        "config.json.bak-2024-01-27T14-00-00",
      ] as unknown as Awaited<ReturnType<typeof mockFsPromises.readdir>>);
      (mockFsPromises.stat as jest.MockedFunction<typeof mockFsPromises.stat>).mockResolvedValue({
        size: 100,
        mtime: new Date(),
        isDirectory: () => false,
        isFile: () => true,
      } as unknown as Awaited<ReturnType<typeof mockFsPromises.stat>>);
      (mockFs.existsSync as jest.MockedFunction<typeof mockFs.existsSync>).mockReturnValue(true);
      (mockFsPromises.readFile as jest.MockedFunction<typeof mockFsPromises.readFile>).mockResolvedValue(
        '{"content": true}' as unknown as Awaited<ReturnType<typeof mockFsPromises.readFile>>
      );
      (mockFsPromises.mkdir as jest.MockedFunction<typeof mockFsPromises.mkdir>).mockResolvedValue(undefined);
      (mockFsPromises.writeFile as jest.MockedFunction<typeof mockFsPromises.writeFile>).mockResolvedValue(undefined);

      const result = await restoreLatestBackup("/test/config.json");

      expect(result.success).toBe(true);
    });

    it("returns error when no backups exist", async () => {
      (mockFsPromises.readdir as jest.MockedFunction<typeof mockFsPromises.readdir>).mockResolvedValue(
        [] as unknown as Awaited<ReturnType<typeof mockFsPromises.readdir>>
      );

      const result = await restoreLatestBackup("/test/config.json");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("No backups found");
      }
    });
  });

  // ==========================================================================
  // Backup Cleanup
  // ==========================================================================

  describe("cleanupOldBackups", () => {
    it("keeps only the most recent backups", async () => {
      const backupFiles = [
        "config.json.bak-2024-01-27T10-00-00",
        "config.json.bak-2024-01-27T11-00-00",
        "config.json.bak-2024-01-27T12-00-00",
        "config.json.bak-2024-01-27T13-00-00",
        "config.json.bak-2024-01-27T14-00-00",
        "config.json.bak-2024-01-27T15-00-00",
        "config.json.bak-2024-01-27T16-00-00",
      ];
      (mockFsPromises.readdir as jest.MockedFunction<typeof mockFsPromises.readdir>).mockResolvedValue(
        backupFiles as unknown as Awaited<ReturnType<typeof mockFsPromises.readdir>>
      );
      (mockFsPromises.stat as jest.MockedFunction<typeof mockFsPromises.stat>).mockResolvedValue({
        size: 100,
        mtime: new Date(),
        isDirectory: () => false,
        isFile: () => true,
      } as unknown as Awaited<ReturnType<typeof mockFsPromises.stat>>);
      (mockFsPromises.unlink as jest.MockedFunction<typeof mockFsPromises.unlink>).mockResolvedValue(undefined);

      const result = await cleanupOldBackups("/test/config.json");

      expect(result.success).toBe(true);
      if (result.success) {
        // 7 backups - 5 to keep = 2 deleted
        expect(result.data).toBe(2);
      }
    });

    it("does not delete when under limit", async () => {
      (mockFsPromises.readdir as jest.MockedFunction<typeof mockFsPromises.readdir>).mockResolvedValue([
        "config.json.bak-2024-01-27T14-00-00",
        "config.json.bak-2024-01-27T15-00-00",
      ] as unknown as Awaited<ReturnType<typeof mockFsPromises.readdir>>);
      (mockFsPromises.stat as jest.MockedFunction<typeof mockFsPromises.stat>).mockResolvedValue({
        size: 100,
        mtime: new Date(),
        isDirectory: () => false,
        isFile: () => true,
      } as unknown as Awaited<ReturnType<typeof mockFsPromises.stat>>);

      const result = await cleanupOldBackups("/test/config.json");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(0);
      }
      expect(mockFsPromises.unlink).not.toHaveBeenCalled();
    });

    it("accepts custom max backups limit", async () => {
      const backupFiles = [
        "config.json.bak-2024-01-27T10-00-00",
        "config.json.bak-2024-01-27T11-00-00",
        "config.json.bak-2024-01-27T12-00-00",
      ];
      (mockFsPromises.readdir as jest.MockedFunction<typeof mockFsPromises.readdir>).mockResolvedValue(
        backupFiles as unknown as Awaited<ReturnType<typeof mockFsPromises.readdir>>
      );
      (mockFsPromises.stat as jest.MockedFunction<typeof mockFsPromises.stat>).mockResolvedValue({
        size: 100,
        mtime: new Date(),
        isDirectory: () => false,
        isFile: () => true,
      } as unknown as Awaited<ReturnType<typeof mockFsPromises.stat>>);
      (mockFsPromises.unlink as jest.MockedFunction<typeof mockFsPromises.unlink>).mockResolvedValue(undefined);

      const result = await cleanupOldBackups("/test/config.json", 2);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(1); // 3 - 2 = 1 deleted
      }
    });
  });

  describe("deleteBackup", () => {
    it("deletes valid backup file", async () => {
      (mockFsPromises.unlink as jest.MockedFunction<typeof mockFsPromises.unlink>).mockResolvedValue(undefined);

      const result = await deleteBackup("/test/config.json.bak-2024-01-27T14-30-00");

      expect(result.success).toBe(true);
    });

    it("returns error for invalid backup path", async () => {
      const result = await deleteBackup("/test/config.json");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Invalid backup file path");
      }
    });
  });

  // ==========================================================================
  // Utility Functions
  // ==========================================================================

  describe("formatBackupInfo", () => {
    it("formats backup info for display", () => {
      const backup = {
        originalPath: "/test/config.json",
        backupPath: "/test/config.json.bak-2024-01-27T14-30-00",
        timestamp: "2024-01-27T14:30:00.000Z",
        size: 2048,
      };

      const result = formatBackupInfo(backup);

      expect(result).toContain("2KB");
      expect(result).toContain(".bak-2024-01-27T14-30-00");
    });

    it("handles small file sizes", () => {
      const backup = {
        originalPath: "/test/config.json",
        backupPath: "/test/config.json.bak-2024-01-27T14-30-00",
        timestamp: "2024-01-27T14:30:00.000Z",
        size: 100,
      };

      const result = formatBackupInfo(backup);

      expect(result).toContain("0KB");
    });
  });

  describe("getBackupAge", () => {
    it("returns 'just now' for very recent backup", () => {
      const backup = {
        originalPath: "/test/config.json",
        backupPath: "/test/config.json.bak",
        timestamp: new Date().toISOString(),
        size: 100,
      };

      const result = getBackupAge(backup);

      expect(result).toBe("just now");
    });

    it("returns minutes for recent backup", () => {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      const backup = {
        originalPath: "/test/config.json",
        backupPath: "/test/config.json.bak",
        timestamp: tenMinutesAgo.toISOString(),
        size: 100,
      };

      const result = getBackupAge(backup);

      expect(result).toMatch(/\d+ minutes? ago/);
    });

    it("returns hours for older backup", () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
      const backup = {
        originalPath: "/test/config.json",
        backupPath: "/test/config.json.bak",
        timestamp: threeHoursAgo.toISOString(),
        size: 100,
      };

      const result = getBackupAge(backup);

      expect(result).toMatch(/\d+ hours? ago/);
    });

    it("returns 'yesterday' for day-old backup", () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const backup = {
        originalPath: "/test/config.json",
        backupPath: "/test/config.json.bak",
        timestamp: yesterday.toISOString(),
        size: 100,
      };

      const result = getBackupAge(backup);

      expect(result).toBe("yesterday");
    });

    it("returns days for multi-day backup", () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      const backup = {
        originalPath: "/test/config.json",
        backupPath: "/test/config.json.bak",
        timestamp: threeDaysAgo.toISOString(),
        size: 100,
      };

      const result = getBackupAge(backup);

      expect(result).toBe("3 days ago");
    });
  });
});
