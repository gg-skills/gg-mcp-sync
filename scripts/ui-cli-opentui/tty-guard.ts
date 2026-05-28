/**
 * @fileoverview Interactive-terminal guard for OpenTUI entrypoints.
 *
 * Prevents OpenTUI shells from starting when stdin is not attached to an
 * interactive terminal.
 *
 * @testing CLI smoke: run npm run platform:orchestration:cli:opentui from a non-TTY shell.
 * @see scripts/platform-orchestration/ui/cli-opentui/main.tsx - Maintainer shell using this guard.
 * @see scripts/ui-cli-opentui/create-renderer.ts - Renderer helper after the TTY check.
 * @documentation reviewed=2026-04-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

/**
 * Exits the process when stdin is not a TTY so OpenTUI renderers are not invoked headlessly by mistake.
 *
 * @remarks
 * I/O: writes to stderr and sets `process.exitCode` via `process.exit(1)` when stdin is not interactive.
 */
export function openTuiAssertInteractiveStdin(programName: string): void {
  if (!process.stdin.isTTY) {
    console.error(
      `${programName}: stdin is not a TTY. Use --help, --status-json, or --print-plan where supported, or run from an interactive terminal (see README next to the OpenTUI entry).`,
    );
    process.exit(1);
  }
}
