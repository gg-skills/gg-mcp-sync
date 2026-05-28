/**
 * @fileoverview Interactive TTY framework for guided CLI workflows: colorized terminal output,
 * structured prompts, list selection, command execution, and npm script orchestration.
 *
 * This file owns the `CliInteractiveSession` and all companion helpers used by delegate and intent
 * UI entrypoints that need structured user interaction in a terminal.
 * Flow: prompt -> session state -> user choice -> command execution -> result display.
 *
 * @testing CLI: cd scripts && npx tsx delegate/ui/cli-ink/app.tsx (requires interactive TTY)
 * @testing CLI: cd scripts && npx tsx intent/ui/cli-ink/app.tsx (requires interactive TTY)
 * @see scripts/shared/ink-ui/bridge-task.ts - Child-process bridge that runs the spawned command under an Ink session.
 * @see scripts/shared/ink-ui/status.tsx - Ink status primitives (badge, toggle, chips) used by interactive sessions.
 * @documentation reviewed=2026-04-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { spawn } from "node:child_process";
import readline from "node:readline/promises";

/** Named ANSI foreground colors used when styling stderr output in interactive TTY flows. */
type CliInteractive_ColorName = "blue" | "cyan" | "green" | "magenta" | "red" | "yellow";

/** Sentinel for yes/no prompts when Enter accepts the hinted default (`y/N` vs `Y/n`). */
type CliInteractive_DefaultPrompt = "n" | "y";

/** Option descriptor for list-based interactive selection. */
export type CliInteractiveListOption<TValue extends string> = {
  description?: string;
  label?: string;
  value: TValue;
};

const CLI_INTERACTIVE_SAFE_SHELL_TOKEN_PATTERN = /^[A-Za-z0-9_./:@%+=,-]+$/u;

const CLI_INTERACTIVE_COLOR_CODES: Record<
  CliInteractive_ColorName | "bold" | "reset",
  string
> = {
  blue: "\u001B[34m",
  bold: "\u001B[1m",
  cyan: "\u001B[36m",
  green: "\u001B[32m",
  magenta: "\u001B[35m",
  red: "\u001B[31m",
  reset: "\u001B[0m",
  yellow: "\u001B[33m",
};

/** Thrown when the user cancels an interactive flow via SIGINT. */
export class CliInteractiveCancelledError extends Error {
  /** Creates an error signalling cooperative cancellation during readline prompting. */
  constructor() {
    super("Interactive flow cancelled.");
  }
}

/** Thrown when a spawned command exits with a non-zero code. */
export class CliInteractiveCommandFailedError extends Error {
  readonly exitCode: number;

  /** Creates an error carrying the failed command preview and its non-zero exit code. */
  constructor(options: { command: string; exitCode: number }) {
    super(`Command failed (${options.exitCode}): ${options.command}`);
    this.exitCode = options.exitCode;
  }
}

/** Stateful interactive TTY session: output styling, structured prompts, and command orchestration. */
export class CliInteractiveSession {
  private cancelled = false;

  private readonly interface = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
    terminal: true,
  });

  private readonly styleEnabled =
    process.stdout.isTTY && process.stderr.isTTY && process.env.NO_COLOR === undefined;

  /**
   * Wires stdin/stderr readline I/O on a TTY and marks the session cancelled on SIGINT.
   *
   * @remarks
   * Closing the interface cooperates with outstanding `question()` calls.
   */
  constructor() {
    this.interface.on("SIGINT", () => {
      this.cancelled = true;
      this.interface.close();
    });
  }

  /** Releases the underlying readline interface; safe to call more than once. */
  close(): void {
    this.interface.close();
  }

  /** Clears the controlling terminal viewport when stderr is attached to a TTY. */
  clearScreen(): void {
    if (process.stdout.isTTY) {
      process.stderr.write("\u001Bc");
    }
  }

  /** Writes one line (empty by default) to stderr with a trailing newline. */
  writeLine(text = ""): void {
    process.stderr.write(`${text}\n`);
  }

  /** Renders a full-width magenta banner framing the family and focus labels. */
  printHeader(family: string, focus: string): void {
    const width = this.frameWidth();
    this.writeLine("");
    this.writeLine(this.decorate("magenta", "=".repeat(width), true));
    this.writeLine(
      this.decorate(
        "magenta",
        `MCP SYNC // ${family} // ${focus}`.padEnd(width, " "),
        true,
      ),
    );
    this.writeLine(this.decorate("magenta", "=".repeat(width), true));
  }

  /** Renders a cyan ASCII panel title with optional blue subtitle line. */
  printPanelTitle(title: string, subtitle = ""): void {
    const width = this.frameWidth();
    const innerWidth = Math.max(20, width - 4);
    this.writeLine("");
    this.writeLine(this.decorate("cyan", `+${"-".repeat(width - 2)}+`, true));
    this.writeLine(this.decorate("cyan", `| ${this.padRight(title, innerWidth)} |`, true));
    if (subtitle.length > 0) {
      this.writeLine(
        this.decorate(
          "blue",
          `| ${this.padRight(this.truncate(subtitle, innerWidth), innerWidth)} |`,
        ),
      );
    }
    this.writeLine(this.decorate("cyan", `+${"-".repeat(width - 2)}+`, true));
  }

  /** Prints a numbered menu row with balanced label and description columns. */
  printMenuItem(number: string | number, label: string, description: string): void {
    const width = this.frameWidth();
    const innerWidth = Math.max(20, width - 8);
    const labelWidth = Math.min(26, Math.max(10, Math.floor(innerWidth / 2)));
    const descriptionWidth = Math.max(10, innerWidth - labelWidth - 3);
    const numberText = String(number).padStart(2, " ");
    const labelText = this.padRight(this.truncate(label, labelWidth), labelWidth);
    const descriptionText = this.padRight(
      this.truncate(description, descriptionWidth),
      descriptionWidth,
    );
    const line = `  ${numberText}  ${labelText}  ${descriptionText}`;
    if (!this.styleEnabled) {
      this.writeLine(line);
      return;
    }
    this.writeLine(
      [
        "  ",
        this.decorate("magenta", numberText, true),
        "  ",
        this.decorate("cyan", labelText, true),
        "  ",
        this.decorate("blue", descriptionText),
      ].join(""),
    );
  }

  /** Prints a short magenta accent line to separate visual sections. */
  printKicker(text: string): void {
    this.writeLine(this.decorate("magenta", text, true));
  }

  /** Prints auxiliary blue guidance text without badge prefixes. */
  printMicrocopy(text: string): void {
    this.writeLine(this.decorate("blue", text));
  }

  /** Prints a subtle cyan dotted rule between major blocks. */
  printSectionBreak(): void {
    this.writeLine(this.decorate("cyan", `  ${".".repeat(18)}`));
  }

  /** Prints an informational note tagged `[note]` in blue. */
  printNote(text: string): void {
    this.writeLine(this.decorate("blue", `[note] ${text}`));
  }

  /** Prints a success line tagged `[ok]` in green (bold when styling is on). */
  printSuccess(text: string): void {
    this.writeLine(this.decorate("green", `[ok] ${text}`, true));
  }

  /** Prints a warning line tagged `[warn]` in yellow (bold when styling is on). */
  printWarning(text: string): void {
    this.writeLine(this.decorate("yellow", `[warn] ${text}`, true));
  }

  /** Prints an error line tagged `[error]` in red (bold when styling is on). */
  printError(text: string): void {
    this.writeLine(this.decorate("red", `[error] ${text}`, true));
  }

  /** Prints a magenta `[run]` line showing the command about to execute. */
  printCommand(text: string): void {
    this.writeLine(this.decorate("magenta", `[run] ${text}`, true));
  }

  /** Prints a full-width magenta equals rule across the current frame width. */
  printDivider(): void {
    this.writeLine(this.decorate("magenta", "=".repeat(this.frameWidth()), true));
  }

  /**
   * Prompts once on stderr via readline, trimming leading and trailing whitespace.
   *
   * @remarks
   * Cooperative cancellation translates into `CliInteractiveCancelledError`; other errors propagate.
   *
   * @throws {CliInteractiveCancelledError} When SIGINT interrupted the interactive flow.
   */
  async promptReadLine(promptText: string): Promise<string> {
    try {
      const answer = await this.interface.question(
        this.decorate("yellow", promptText, true),
      );
      if (this.cancelled) {
        throw new CliInteractiveCancelledError();
      }
      return answer.trim();
    } catch (error) {
      if (this.cancelled) {
        throw new CliInteractiveCancelledError();
      }
      throw error;
    }
  }

  /** Prompts once; blank answers fall back to the provided default verbatim. */
  async promptWithDefault(promptText: string, defaultValue: string): Promise<string> {
    const answer = await this.promptReadLine(`${promptText} [${defaultValue}]: `);
    return answer.length > 0 ? answer : defaultValue;
  }

  /**
   * Loops until the user submits a non-empty trimmed answer.
   *
   * @remarks
   * Prints `printError` feedback on each invalid attempt without throwing.
   */
  async promptRequired(promptText: string): Promise<string> {
    for (;;) {
      const answer = await this.promptReadLine(`${promptText}: `);
      if (answer.length > 0) {
        return answer;
      }
      this.printError("A value is required.");
    }
  }

  /**
   * Parses a strictly positive decimal integer answer, honoring the default string when blank.
   *
   * @remarks
   * Re-prompts on invalid input rather than throwing.
   */
  async promptPositiveIntegerWithDefault(
    promptText: string,
    defaultValue: number,
  ): Promise<number> {
    for (;;) {
      const answer = await this.promptWithDefault(promptText, String(defaultValue));
      const parsedValue = Number.parseInt(answer, 10);
      if (Number.isInteger(parsedValue) && parsedValue > 0) {
        return parsedValue;
      }
      this.printError("Enter a positive integer.");
    }
  }

  /**
   * Collects yes/no intent; blank Enter accepts the `defaultValue` polarity hint.
   *
   * @remarks
   * Accepts common synonyms (`yes`/`no`); rejects other answers with guided error text.
   */
  async promptYesNo(promptText: string, defaultValue: CliInteractive_DefaultPrompt): Promise<boolean> {
    const defaultSuffix = defaultValue === "y" ? "Y/n" : "y/N";
    for (;;) {
      const answer = await this.promptReadLine(`${promptText} [${defaultSuffix}]: `);
      if (answer.length === 0) {
        return defaultValue === "y";
      }
      const lowered = answer.toLowerCase();
      if (lowered === "y" || lowered === "yes") {
        return true;
      }
      if (lowered === "n" || lowered === "no") {
        return false;
      }
      this.printError("Please answer y or n.");
    }
  }

  /**
   * Parses an inclusive 1-based menu index capped by `max`, looping on invalid parses.
   *
   * @remarks
   * Emits customizable `errorText` or a stock validation message via `printError`.
   */
  async promptMenuSelection(options: {
    errorText?: string;
    max: number;
    prompt: string;
  }): Promise<number> {
    for (;;) {
      const answer = await this.promptReadLine(options.prompt);
      const selectedIndex = Number.parseInt(answer, 10);
      if (Number.isInteger(selectedIndex) && selectedIndex >= 1 && selectedIndex <= options.max) {
        return selectedIndex;
      }
      this.printError(options.errorText ?? "Choose a valid number.");
    }
  }

  /**
   * Renders list options inside a cyan panel then blocks until the user selects a valid index.
   *
   * @throws {Error} When the backing array does not align with the chosen numeric index (defensive guard).
   */
  async chooseFromList<TValue extends string>(options: {
    items: ReadonlyArray<CliInteractiveListOption<TValue>>;
    promptText?: string;
    promptTitle: string;
    promptSubtitle: string;
  }): Promise<TValue> {
    this.printPanelTitle(options.promptTitle, options.promptSubtitle);

    options.items.forEach((item, index) => {
      this.printMenuItem(index + 1, item.label ?? item.value, item.description ?? "");
    });

    const selection = await this.promptMenuSelection({
      max: options.items.length,
      prompt: options.promptText ?? `Choose [1-${options.items.length}]: `,
    });

    const selectedItem = options.items[selection - 1];
    if (selectedItem === undefined) {
      throw new Error("Selected item was not available.");
    }

    return selectedItem.value;
  }

  /**
   * Pauses readline input while spawned children inherit stdout/stderr.
   *
   * @remarks
   * Pair with `resumeAfterCommand` in `finally` blocks to avoid stalled prompts.
   */
  pauseForCommand(): void {
    this.interface.pause();
  }

  /** Resumes readline prompting after pausing around child-process execution. */
  resumeAfterCommand(): void {
    this.interface.resume();
  }

  /** Chooses responsive layout width from `stdout.columns` with sane clamps. */
  private frameWidth(): number {
    const terminalWidth =
      typeof process.stdout.columns === "number" && process.stdout.columns >= 72
        ? process.stdout.columns
        : 118;
    return terminalWidth > 124 ? 124 : terminalWidth;
  }

  /** Truncates with an ellipsis suffix when overflowing the column budget (non-negative widths). */
  private truncate(text: string, width: number): string {
    if (width <= 0) {
      return "";
    }
    if (text.length <= width) {
      return text;
    }
    if (width <= 3) {
      return text.slice(0, width);
    }
    return `${text.slice(0, width - 3)}...`;
  }

  /** Pads ASCII spaces on the right to align fixed-width stderr columns. */
  private padRight(text: string, width: number): string {
    return text.padEnd(width, " ");
  }

  /** Wraps text with ANSI color (and optional bold) when styling is enabled. */
  private decorate(color: CliInteractive_ColorName, text: string, bold = false): string {
    if (!this.styleEnabled) {
      return text;
    }
    const prefix = bold
      ? `${CLI_INTERACTIVE_COLOR_CODES[color]}${CLI_INTERACTIVE_COLOR_CODES.bold}`
      : CLI_INTERACTIVE_COLOR_CODES[color];
    return `${prefix}${text}${CLI_INTERACTIVE_COLOR_CODES.reset}`;
  }
}

/** Enforces that the current process has a TTY on both stdin and stderr; throws otherwise. */
export function assertCliInteractiveTty(commandName: string): void {
  if (process.stdin.isTTY && process.stderr.isTTY) {
    return;
  }
  throw new Error(
    `${commandName} requires an interactive TTY. Run the underlying npm script directly for non-interactive use.`,
  );
}

/**
 * Runs an interactive CLI workflow inside a `CliInteractiveSession`, catching cancellation and
 * command-failure errors and mapping them to process exit codes.
 * @param run - The interactive workflow to execute; receives the session as its only argument.
 */
export async function runCliInteractiveMain(
  run: (session: CliInteractiveSession) => Promise<void>,
): Promise<void> {
  const session = new CliInteractiveSession();
  try {
    await run(session);
  } catch (error) {
    if (error instanceof CliInteractiveCancelledError) {
      session.printWarning("Interactive flow cancelled.");
      process.exitCode = 130;
      return;
    }
    if (error instanceof CliInteractiveCommandFailedError) {
      process.exitCode = error.exitCode;
      return;
    }
    if (error instanceof Error) {
      session.printError(error.message);
      process.exitCode = 1;
      return;
    }
    throw error;
  } finally {
    session.close();
  }
}

/** Quotes a string for safe use inside a single-quoted POSIX shell token. */
export function cliInteractiveShellQuote(value: string): string {
  if (value.length === 0) {
    return "''";
  }
  const escapedValue = value.replace(/'/gu, "'\\''");
  return `'${escapedValue}'`;
}

/**
 * Formats a token for safe shell embedding: passes-through safe tokens and shell-quotes unsafe ones.
 * @param token - The raw token string to format.
 */
export function formatCliInteractiveShellToken(token: string): string {
  if (CLI_INTERACTIVE_SAFE_SHELL_TOKEN_PATTERN.test(token)) {
    return token;
  }
  return cliInteractiveShellQuote(token);
}

/**
 * Builds a human-readable command preview string from a binary and optional args array.
 * Unsafe tokens are shell-quoted; the first token is passed through unquoted.
 */
export function buildCommandPreview(options: {
  args?: ReadonlyArray<string>;
  binary: string;
}): string {
  const commandTokens = [options.binary, ...(options.args ?? [])];
  return commandTokens
    .map((token, index) => {
      if (index === 0) {
        return token;
      }
      return formatCliInteractiveShellToken(token);
    })
    .join(" ");
}

/**
 * Builds a human-readable `npm run <script>` command preview string with optional forwarded args.
 * Wraps `buildCommandPreview` with the `npm run <script> [-- <args>]` pattern.
 */
export function buildNpmRunPreview(options: {
  args?: ReadonlyArray<string>;
  scriptName: string;
}): string {
  const forwardedArgs = options.args ?? [];
  return buildCommandPreview({
    args: [
      "run",
      options.scriptName,
      ...(forwardedArgs.length > 0 ? ["--", ...forwardedArgs] : []),
    ],
    binary: "npm",
  });
}

/**
 * Spawns a binary as a child process with inherited stdio, pausing the readline session during execution.
 * Throws `CliInteractiveCommandFailedError` on non-zero exit unless `allowNonZeroExit` is set.
 */
export async function runCommand(options: {
  allowNonZeroExit?: boolean;
  args?: ReadonlyArray<string>;
  binary: string;
  commandText?: string;
  cwd: string;
  previewBinary?: string;
  session: CliInteractiveSession;
}): Promise<void> {
  const resolvedArgs = [...(options.args ?? [])];
  const commandText =
    options.commandText ??
    buildCommandPreview({
      args: resolvedArgs,
      binary: options.previewBinary ?? options.binary,
    });

  options.session.pauseForCommand();
  try {
    const exitCode = await new Promise<number>((resolve, reject) => {
      const child = spawn(options.binary, resolvedArgs, {
        cwd: options.cwd,
        env: process.env,
        stdio: "inherit",
      });

      child.on("error", reject);
      child.on("exit", (code, signal) => {
        if (signal !== null) {
          resolve(signal === "SIGINT" ? 130 : 1);
          return;
        }
        resolve(code ?? 1);
      });
    });

    if (exitCode !== 0 && options.allowNonZeroExit !== true) {
      throw new CliInteractiveCommandFailedError({
        command: commandText,
        exitCode,
      });
    }
  } finally {
    options.session.resumeAfterCommand();
  }
}

/**
 * Runs an npm script (`npm run <script>`) inside the session's cwd, pausing the readline interface
 * during execution. Forwards all args after `--` to the script.
 */
export async function runNpmScript(options: {
  args?: ReadonlyArray<string>;
  commandText?: string;
  cwd: string;
  scriptName: string;
  session: CliInteractiveSession;
}): Promise<void> {
  const forwardedArgs = options.args ?? [];
  await runCommand({
    args: ["run", options.scriptName, ...(forwardedArgs.length > 0 ? ["--", ...forwardedArgs] : [])],
    binary: resolveNpmExecutable(),
    commandText:
      options.commandText ??
      buildNpmRunPreview({
        args: forwardedArgs,
        scriptName: options.scriptName,
      }),
    cwd: options.cwd,
    previewBinary: "npm",
    session: options.session,
  });
}

/**
 * Prints the command preview via `session.printCommand` then runs it via `runCommand`.
 * Pauses the readline interface during execution.
 */
export async function printAndRunCommand(options: {
  allowNonZeroExit?: boolean;
  args?: ReadonlyArray<string>;
  binary: string;
  commandText?: string;
  cwd: string;
  previewBinary?: string;
  session: CliInteractiveSession;
}): Promise<void> {
  const commandText =
    options.commandText ??
    buildCommandPreview({
      args: options.args,
      binary: options.previewBinary ?? options.binary,
    });
  options.session.printCommand(commandText);
  await runCommand({
    allowNonZeroExit: options.allowNonZeroExit,
    args: options.args,
    binary: options.binary,
    commandText,
    cwd: options.cwd,
    previewBinary: options.previewBinary,
    session: options.session,
  });
}

/**
 * Prints the `npm run <script>` preview via `session.printCommand` then runs it via `runNpmScript`.
 * Pauses the readline interface during execution.
 */
export async function printAndRunNpmScript(options: {
  args?: ReadonlyArray<string>;
  commandText?: string;
  cwd: string;
  scriptName: string;
  session: CliInteractiveSession;
}): Promise<void> {
  const commandText =
    options.commandText ??
    buildNpmRunPreview({
      args: options.args,
      scriptName: options.scriptName,
    });
  options.session.printCommand(commandText);
  await runNpmScript({
    args: options.args,
    commandText,
    cwd: options.cwd,
    scriptName: options.scriptName,
    session: options.session,
  });
}

/**
 * Shows a panel with the command preview, waits for yes/no confirmation, then runs the npm script.
 * Optionally displays a warning before the confirmation prompt.
 */
export async function previewAndRunNpmScript(options: {
  args?: ReadonlyArray<string>;
  confirmPrompt?: string;
  cwd: string;
  defaultConfirm?: "n" | "y";
  description: string;
  panelSubtitle?: string;
  panelTitle?: string;
  scriptName: string;
  session: CliInteractiveSession;
  skipMessage?: string;
  warningText?: string;
}): Promise<void> {
  const commandText = buildNpmRunPreview({
    args: options.args,
    scriptName: options.scriptName,
  });
  options.session.printPanelTitle(
    options.panelTitle ?? "Command Preview",
    options.panelSubtitle ?? options.description,
  );
  options.session.printCommand(commandText);
  if (options.warningText !== undefined) {
    options.session.writeLine("");
    options.session.printWarning(options.warningText);
  }
  options.session.writeLine("");

  const shouldRun = await options.session.promptYesNo(
    options.confirmPrompt ?? "Execute this command",
    options.defaultConfirm ?? "y",
  );

  if (!shouldRun) {
    options.session.printNote(options.skipMessage ?? "Command skipped.");
    return;
  }

  options.session.writeLine("");
  await runNpmScript({
    args: options.args,
    commandText,
    cwd: options.cwd,
    scriptName: options.scriptName,
    session: options.session,
  });
}

/** Resolves the platform-appropriate npm binary name for child-process spawning. */
function resolveNpmExecutable(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}
