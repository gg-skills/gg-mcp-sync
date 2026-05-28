/**
 * @fileoverview `os`, `child_process.execSync`, and `process` stand-ins for MCP Jest suites that branch on platform, PATH, or installed CLIs.
 * @example
 * ```ts
 * const cfg = createMockProcessConfig();
 * cfg.installedClis.add("cursor");
 * const execSync = createExecSyncMock(cfg);
 * execSync("cursor --version"); // "0.25.0"
 * ```
 * @testing Jest unit: npm test -- --runInBand scripts/mocks/process-mock.ts
 * @see scripts/README.md - Top-level MCP workflow guide for these test helpers.
 * @documentation reviewed=2026-04-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { jest } from "@jest/globals";

/**
 * Shape of the mock process/os configuration used by process mock helpers.
 * @remarks
 * I/O: No external resources touched.
 * PURITY: Pure data container; mock implementations are produced by factory functions.
 */
export interface MockProcessConfig {
  platform: NodeJS.Platform;
  homeDir: string;
  cwd: string;
  env: Record<string, string>;
  installedClis: Set<string>;
}

/**
 * Seed a deterministic darwin-style home, cwd, and empty env/CLI registry for process-related mocks.
 */
export function createMockProcessConfig(): MockProcessConfig {
  return {
    platform: "darwin",
    homeDir: "/Users/testuser",
    cwd: "/Users/testuser/projects/test-project",
    env: {},
    installedClis: new Set(),
  };
}

/**
 * Build `homedir`, `platform`, and `type` jest mocks aligned with `config.platform`.
 */
export function createOsMocks(config: MockProcessConfig) {
  return {
    homedir: jest.fn(() => config.homeDir),
    platform: jest.fn(() => config.platform),
    type: jest.fn(() => {
      switch (config.platform) {
        case "darwin":
          return "Darwin";
        case "linux":
          return "Linux";
        case "win32":
          return "Windows_NT";
        default:
          return "Unknown";
      }
    }),
  };
}

/**
 * Simulate `execSync` version probes and CLI presence using `config.installedClis` and stubbed `--version` output.
 * @remarks Unknown CLIs throw with `status` 127; version strings are fixed literals for stable assertions.
 */
export function createExecSyncMock(config: MockProcessConfig) {
  return jest.fn((command: string) => {
    // Parse command to check CLI availability
    const parts = command.split(" ");
    const cli = parts[0];

    // Check if CLI is "installed"
    if (!config.installedClis.has(cli)) {
      const error = new Error(`Command failed: ${command}`);
      (error as Error & { status: number }).status = 127;
      throw error;
    }

    // Return mock version output for common CLIs
    if (parts.includes("--version") || parts.includes("-v")) {
      const versions: Record<string, string> = {
        code: "1.85.0",
        cursor: "0.25.0",
        windsurf: "1.0.0",
        zed: "0.120.0",
        claude: "1.0.0",
        gemini: "1.0.0",
        npm: "10.0.0",
        npx: "10.0.0",
        node: "20.0.0",
      };
      return versions[cli] || "1.0.0";
    }

    return "";
  });
}

/**
 * Return a `jest.fn` that always resolves the current working directory to `config.cwd` for hermetic path logic.
 */
export function mockProcessCwd(config: MockProcessConfig) {
  return jest.fn(() => config.cwd);
}

/**
 * Build a shallow `process.env` snapshot with HOME/USER/PATH defaults merged over `config.env`.
 */
export function createMockEnv(config: MockProcessConfig): Record<string, string | undefined> {
  return {
    HOME: config.homeDir,
    USER: "testuser",
    PATH: "/usr/local/bin:/usr/bin:/bin",
    ...config.env,
  };
}
