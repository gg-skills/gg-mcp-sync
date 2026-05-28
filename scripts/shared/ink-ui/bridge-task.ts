/**
 * @fileoverview Spawns a child process as an Ink CLI task, streaming stdout/stderr lines through
 * callbacks and resolving a structured execution result on completion or cancellation.
 *
 * This file owns the low-level process-bridge used by all delegate and intent Ink apps to run
 * background tasks and report their output.
 * Flow: spawn -> stream lines -> collect result -> resolve promise.
 *
 * @testing CLI manual: cd scripts && npx tsx delegate/ui/cli-ink/app.tsx (requires interactive TTY)
 * @see scripts/shared/cli-interactive/framework.ts - Interactive session wrapper that uses this bridge for command execution.
 * @see scripts/shared/ink-ui/status.tsx - Status tone semantics consumed by renderers of task output.
 * @documentation reviewed=2026-04-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

/** Source stream for a captured output line. */
export type InkCliSessionLineSource = "stdout" | "stderr";

/** A single captured output line with its source stream. */
export interface InkCliSessionLine {
  source: InkCliSessionLineSource;
  text: string;
}

/** The final outcome of a spawned task, including exit metadata and all captured lines. */
export interface InkCliTaskExecutionResult {
  status: "succeeded" | "failed" | "cancelled";
  exitCode: number | null;
  signal: string | null;
  lines: InkCliSessionLine[];
  startedAt: string;
  endedAt: string;
}

/**
 * Injectable spawn surface matching Node `child_process` streaming stdio for tests and stubs.
 *
 * @remarks
 * Callers attach pipe readers to stdout/stderr exactly like the real `spawn` return value.
 */
interface SpawnProcess {
  (
    command: string,
    args: string[],
    options: {
      cwd: string;
      env: NodeJS.ProcessEnv;
      detached: boolean;
      stdio: ["ignore", "pipe", "pipe"];
    },
  ): ChildProcessWithoutNullStreams;
}

/**
 * Side-channel hooks invoked as the bridged subprocess starts and emits output lines.
 *
 * @remarks
 * `onLine` preserves stream identity (`stdout` vs `stderr`) for downstream tone semantics.
 */
interface InkCliTaskCallbacks {
  onStarted: (startedAt: string) => void;
  onLine: (line: InkCliSessionLine) => void;
}

/**
 * Wraps emitted text with its originating stream channel for aggregated task logs.
 */
function createLine(source: InkCliSessionLineSource, text: string): InkCliSessionLine {
  return { source, text };
}

/**
 * Consumes a byte chunk, emits complete newline-terminated lines, and retains a trailing partial fragment.
 *
 * @remarks
 * CRLF endings strip `\r` from emitted lines while keeping buffering stable across fragmented writes.
 */
function appendChunkLines(
  source: InkCliSessionLineSource,
  chunk: string,
  lines: InkCliSessionLine[],
  emitLine: (line: InkCliSessionLine) => void,
  existingBuffer: string,
): string {
  let buffer = existingBuffer + chunk;

  while (true) {
    const newlineIndex = buffer.indexOf("\n");
    if (newlineIndex === -1) {
      break;
    }

    const rawLine = buffer.slice(0, newlineIndex).replace(/\r$/, "");
    buffer = buffer.slice(newlineIndex + 1);
    const line = createLine(source, rawLine);
    lines.push(line);
    emitLine(line);
  }

  return buffer;
}

/**
 * Emits one final line after stream close when the buffer still holds text without a closing newline.
 */
function flushBufferedLine(
  source: InkCliSessionLineSource,
  buffer: string,
  lines: InkCliSessionLine[],
  emitLine: (line: InkCliSessionLine) => void,
): void {
  const trimmed = buffer.replace(/\r$/, "");
  if (trimmed.length === 0) {
    return;
  }

  const line = createLine(source, trimmed);
  lines.push(line);
  emitLine(line);
}

/**
 * Sends `signal` to the child, using process-group kill when the bridge spawned detached on Unix.
 *
 * @remarks
 * Treats `ESRCH` as a benign no-op after exit; propagates unexpected kill failures to the caller.
 */
function stopChildProcess(options: {
  child: ChildProcessWithoutNullStreams;
  useProcessGroup: boolean;
  signal: NodeJS.Signals;
}): void {
  const { child, useProcessGroup, signal } = options;

  try {
    if (useProcessGroup && typeof child.pid === "number") {
      process.kill(-child.pid, signal);
      return;
    }

    child.kill(signal);
  } catch (error) {
    const code =
      error instanceof Error && "code" in error ? String(error.code) : null;
    if (code === "ESRCH") {
      return;
    }

    throw error;
  }
}

/**
 * Spawns a child process and returns a cancelable handle that streams lines via callbacks.
 * The `callbacks.onStarted` is invoked with an ISO timestamp when the process begins.
 * On cancellation, sends SIGTERM then SIGKILL after 2 s. The resolved result reflects the
 * final exit state: `"succeeded"` (exit 0), `"failed"` (non-zero), or `"cancelled"` (SIGTERM/KILL).
 */
export function startInkCliTaskProcess(options: {
  projectRoot: string;
  command: string;
  args: string[];
  /** When set, used as the full process environment for the child (caller should merge `process.env` when needed). */
  env?: NodeJS.ProcessEnv;
  callbacks: InkCliTaskCallbacks;
  dependencies?: {
    spawnProcess?: SpawnProcess;
  };
}): {
  promise: Promise<InkCliTaskExecutionResult>;
  cancel: () => void;
  lines: InkCliSessionLine[];
  startedAt: string;
} {
  const { projectRoot, command, args, env, callbacks, dependencies } = options;
  const spawnProcess = dependencies?.spawnProcess ?? spawn;
  const useProcessGroup = process.platform !== "win32";
  const child = spawnProcess(command, args, {
    cwd: projectRoot,
    env: env ?? process.env,
    detached: useProcessGroup,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const lines: InkCliSessionLine[] = [];
  const startedAt = new Date().toISOString();
  let stdoutBuffer = "";
  let stderrBuffer = "";
  let cancelled = false;
  let closed = false;
  let forceKillTimer: NodeJS.Timeout | null = null;

  callbacks.onStarted(startedAt);

  const promise = new Promise<InkCliTaskExecutionResult>((resolve, reject) => {
    child.stdout.on("data", (chunk: Buffer | string) => {
      stdoutBuffer = appendChunkLines(
        "stdout",
        chunk.toString(),
        lines,
        callbacks.onLine,
        stdoutBuffer,
      );
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderrBuffer = appendChunkLines(
        "stderr",
        chunk.toString(),
        lines,
        callbacks.onLine,
        stderrBuffer,
      );
    });

    child.once("error", (error) => {
      reject(error);
    });

    child.once("close", (exitCode, signal) => {
      closed = true;
      if (forceKillTimer) {
        clearTimeout(forceKillTimer);
        forceKillTimer = null;
      }
      flushBufferedLine("stdout", stdoutBuffer, lines, callbacks.onLine);
      flushBufferedLine("stderr", stderrBuffer, lines, callbacks.onLine);
      resolve({
        status: cancelled ? "cancelled" : exitCode === 0 ? "succeeded" : "failed",
        exitCode,
        signal,
        lines,
        startedAt,
        endedAt: new Date().toISOString(),
      });
    });
  });

  return {
    promise,
    lines,
    startedAt,
    /**
     * Requests cooperative shutdown with `SIGTERM`, escalating to `SIGKILL` after a short grace window.
     *
     * @remarks
     * Idempotent after `close`; schedules a timer and calls `.unref?.()` so idle processes can exit.
     */
    cancel() {
      cancelled = true;
      if (closed) {
        return;
      }

      stopChildProcess({
        child,
        useProcessGroup,
        signal: "SIGTERM",
      });
      forceKillTimer = setTimeout(() => {
        if (closed) {
          return;
        }
        stopChildProcess({
          child,
          useProcessGroup,
          signal: "SIGKILL",
        });
      }, 2000);
      forceKillTimer.unref?.();
    },
  };
}
