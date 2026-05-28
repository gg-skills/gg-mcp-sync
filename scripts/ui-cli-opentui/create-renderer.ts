/**
 * @fileoverview Shared OpenTUI renderer defaults for root CLI entrypoints.
 *
 * Returns the common renderer configuration used by the maintainer shell and
 * related OpenTUI entrypoints.
 *
 * @example
 * const renderer = await openTuiCreateScriptRenderer();
 * createRoot(renderer).render(<App />);
 *
 * @testing Manual TTY smoke: run npm run platform:orchestration:cli:opentui in a TTY.
 * @see scripts/platform-orchestration/ui/cli-opentui/main.tsx - Maintainer shell using this helper.
 * @see scripts/ui-cli-opentui/tty-guard.ts - TTY guard for the same startup path.
 * @documentation reviewed=2026-04-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */
import { createCliRenderer } from "@opentui/core";

/**
 * Factory for the shared OpenTUI CLI renderer used by maintainer and orchestration entrypoints.
 *
 * @remarks
 * I/O: Initializes alternate-screen TTY renderer. USAGE: Call once per process before `createRoot`.
 */
export async function openTuiCreateScriptRenderer() {
  return createCliRenderer({
    autoFocus: true,
    exitOnCtrlC: true,
    exitSignals: ["SIGINT", "SIGTERM"],
    useAlternateScreen: true,
    useMouse: false,
  });
}
