/**
 * @fileoverview In-memory `fs` / `fs/promises` stand-ins for MCP Jest suites so file I/O tests stay hermetic.
 * @example
 * ```ts
 * const mockFs = createMockFileSystem();
 * mockFile(mockFs, "cfg/mcp.json", "{}");
 * const promises = createFsPromisesMocks(mockFs);
 * await promises.readFile("cfg/mcp.json"); // "{}"
 * ```
 * @testing Jest unit: npm test -- --runInBand scripts/mocks/fs-mock.ts
 * @see scripts/README.md - Top-level MCP workflow guide for these test helpers.
 * @documentation reviewed=2026-04-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { jest } from "@jest/globals";

/**
 * Shape of the mock file system state used by fs mock helpers.
 * @remarks
 * I/O: No external resources touched.
 * PURITY: Pure data container; mutation is owned by mock helpers.
 */
export interface MockFileSystem {
  files: Map<string, string>;
  directories: Set<string>;
}

/**
 * Allocate empty in-memory maps for files and directories used by the `fs` mock factories.
 * @remarks Mutations happen only through `mockFile`, `mockDirectory`, and the `createFs*Mocks` jest.fn handlers.
 */
export function createMockFileSystem(): MockFileSystem {
  return {
    files: new Map<string, string>(),
    directories: new Set<string>(),
  };
}

/**
 * Register a file path and ensure parent directory keys exist for `stat` / `readdir` traversal.
 * @remarks Paths use `/` separators; no normalization of `.` or `..` segments.
 */
export function mockFile(fs: MockFileSystem, path: string, content: string): void {
  fs.files.set(path, content);
  // Add all parent directories
  const parts = path.split("/");
  for (let i = 1; i < parts.length; i++) {
    fs.directories.add(parts.slice(0, i).join("/"));
  }
}

/**
 * Register a directory path and parent prefixes so `access` / `stat` treat the path as a directory.
 */
export function mockDirectory(fs: MockFileSystem, path: string): void {
  fs.directories.add(path);
  // Add all parent directories
  const parts = path.split("/");
  for (let i = 1; i < parts.length; i++) {
    fs.directories.add(parts.slice(0, i).join("/"));
  }
}

/**
 * Build `jest.fn` async stand-ins for common `fs/promises` calls backed by `mockFs`.
 * @remarks ENOENT errors mirror Node shape (`code: "ENOENT"`). `readdir` lists immediate children under a prefix path.
 */
export function createFsPromisesMocks(mockFs: MockFileSystem) {
  return {
    readFile: jest.fn(async (path: string) => {
      const content = mockFs.files.get(path);
      if (content === undefined) {
        const error = new Error(`ENOENT: no such file or directory, open '${path}'`);
        (error as NodeJS.ErrnoException).code = "ENOENT";
        throw error;
      }
      return content;
    }),
    writeFile: jest.fn(async (path: string, content: string) => {
      mockFs.files.set(path, content);
    }),
    mkdir: jest.fn(async (path: string) => {
      mockFs.directories.add(path);
    }),
    access: jest.fn(async (path: string) => {
      if (!mockFs.files.has(path) && !mockFs.directories.has(path)) {
        const error = new Error(`ENOENT: no such file or directory, access '${path}'`);
        (error as NodeJS.ErrnoException).code = "ENOENT";
        throw error;
      }
    }),
    stat: jest.fn(async (path: string) => {
      if (mockFs.files.has(path)) {
        return {
          size: mockFs.files.get(path)!.length,
          mtime: new Date(),
          isDirectory: () => false,
          isFile: () => true,
        };
      }
      if (mockFs.directories.has(path)) {
        return {
          size: 0,
          mtime: new Date(),
          isDirectory: () => true,
          isFile: () => false,
        };
      }
      const error = new Error(`ENOENT: no such file or directory, stat '${path}'`);
      (error as NodeJS.ErrnoException).code = "ENOENT";
      throw error;
    }),
    readdir: jest.fn(async (path: string) => {
      const entries: string[] = [];
      const prefix = path.endsWith("/") ? path : path + "/";
      for (const file of mockFs.files.keys()) {
        if (file.startsWith(prefix)) {
          const rest = file.slice(prefix.length);
          const name = rest.split("/")[0];
          if (name && !entries.includes(name)) {
            entries.push(name);
          }
        }
      }
      for (const dir of mockFs.directories) {
        if (dir.startsWith(prefix)) {
          const rest = dir.slice(prefix.length);
          const name = rest.split("/")[0];
          if (name && !entries.includes(name)) {
            entries.push(name);
          }
        }
      }
      return entries;
    }),
    unlink: jest.fn(async (path: string) => {
      if (!mockFs.files.has(path)) {
        const error = new Error(`ENOENT: no such file or directory, unlink '${path}'`);
        (error as NodeJS.ErrnoException).code = "ENOENT";
        throw error;
      }
      mockFs.files.delete(path);
    }),
    copyFile: jest.fn(async (src: string, dest: string) => {
      const content = mockFs.files.get(src);
      if (content === undefined) {
        const error = new Error(`ENOENT: no such file or directory, copyfile '${src}'`);
        (error as NodeJS.ErrnoException).code = "ENOENT";
        throw error;
      }
      mockFs.files.set(dest, content);
    }),
  };
}

/**
 * Build synchronous `existsSync` / `statSync` mocks with the same path semantics as the promises helpers.
 * @remarks `statSync` throws ENOENT when the path is unknown; behavior matches `createFsPromisesMocks` `stat`.
 */
export function createFsSyncMocks(mockFs: MockFileSystem) {
  return {
    existsSync: jest.fn((path: string) => {
      return mockFs.files.has(path) || mockFs.directories.has(path);
    }),
    statSync: jest.fn((path: string) => {
      if (mockFs.files.has(path)) {
        return {
          size: mockFs.files.get(path)!.length,
          mtime: new Date(),
          isDirectory: () => false,
          isFile: () => true,
        };
      }
      if (mockFs.directories.has(path)) {
        return {
          size: 0,
          mtime: new Date(),
          isDirectory: () => true,
          isFile: () => false,
        };
      }
      const error = new Error(`ENOENT: no such file or directory, stat '${path}'`);
      (error as NodeJS.ErrnoException).code = "ENOENT";
      throw error;
    }),
  };
}
