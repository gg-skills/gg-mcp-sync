/**
 * @fileoverview Ink terminal UI primitives for status rendering: badge colors, boolean chips,
 * option toggles, and choice selectors with tone-driven color semantics.
 *
 * This file owns all shared Ink status components used by delegate and intent CLI apps.
 * Tone matrix:
 * - ready / staged / editing / info → cyan (positive flow)
 * - blocked / warning → yellow (caution)
 * - destructive → red (danger)
 * - muted → gray (inactive)
 *
 * @testing CLI manual: cd scripts && npx tsx delegate/ui/cli-ink/app.tsx (requires interactive TTY)
 * @testing CLI manual: cd scripts && npx tsx intent/ui/cli-ink/app.tsx (requires interactive TTY)
 * @see scripts/shared/cli-interactive/framework.ts - Interactive session that uses these components for command orchestration.
 * @see scripts/shared/ink-ui/bridge-task.ts - Task execution renderer that streams output with status tone.
 * @documentation reviewed=2026-04-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import React from "react";
import { Box, Text } from "ink";

/** Color tone semantics for status badges: maps intent to terminal color. */
export type InkStatusTone =
  | "ready"
  | "blocked"
  | "staged"
  | "editing"
  | "warning"
  | "destructive"
  | "info"
  | "muted";

/**
 * Resolves a status tone to an Ink `Text` color token for badge rendering.
 *
 * @remarks
 * Implements the same tone-to-color matrix described in this file's overview (e.g. blocked and
 * warning share yellow; staged, editing, and info share cyan).
 */
function getInkStatusColor(
  tone: InkStatusTone,
): "green" | "yellow" | "red" | "cyan" | "gray" {
  switch (tone) {
    case "ready":
      return "green";
    case "blocked":
    case "warning":
      return "yellow";
    case "staged":
    case "editing":
    case "info":
      return "cyan";
    case "destructive":
      return "red";
    case "muted":
      return "gray";
  }
}

/** Renders a single bracketed status badge in the tone color. */
export function InkStatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: InkStatusTone;
}): React.ReactNode {
  return <Text color={getInkStatusColor(tone)}>[{label}]</Text>;
}

/** Renders yes/no chips showing which of the two states is active for a boolean value. */
export function InkBooleanChips({
  value,
}: {
  value: boolean;
}): React.ReactNode {
  return (
    <Box>
      <InkStatusBadge label="yes" tone={value ? "ready" : "muted"} />
      <Text color="gray"> </Text>
      <InkStatusBadge label="no" tone={value ? "muted" : "warning"} />
    </Box>
  );
}

/**
 * Renders a labeled boolean option with active/inactive tone-driven chips and an optional shortcut hint.
 * The "yes" chip takes `activeTone` when `value` is true and `inactiveTone` when false.
 * The "no" chip takes `inactiveTone` when `value` is true and `"warning"` when false.
 */
export function InkOptionToggle({
  label,
  shortcut,
  value,
  activeTone = "ready",
  inactiveTone = "muted",
}: {
  label: string;
  shortcut?: string;
  value: boolean;
  activeTone?: InkStatusTone;
  inactiveTone?: InkStatusTone;
}): React.ReactNode {
  return (
    <Box>
      <Text>
        {label} {shortcut ? `[${shortcut}]` : ""}:{" "}
      </Text>
      <InkStatusBadge label="yes" tone={value ? activeTone : inactiveTone} />
      <Text color="gray"> </Text>
      <InkStatusBadge label="no" tone={value ? inactiveTone : "warning"} />
    </Box>
  );
}

/**
 * Renders a labeled choice among mutually exclusive options, highlighting the active choice with
 * `activeTone` and all others with `inactiveTone`.
 */
export function InkOptionSelector({
  label,
  shortcut,
  value,
  choices,
  activeTone = "ready",
  inactiveTone = "muted",
}: {
  label: string;
  shortcut?: string;
  value: string;
  choices: { value: string; label: string }[];
  activeTone?: InkStatusTone;
  inactiveTone?: InkStatusTone;
}): React.ReactNode {
  return (
    <Box>
      <Text>
        {label} {shortcut ? `[${shortcut}]` : ""}:{" "}
      </Text>
      {choices.map((choice, index) => (
        <React.Fragment key={choice.value}>
          <InkStatusBadge
            label={choice.label}
            tone={value === choice.value ? activeTone : inactiveTone}
          />
          {index < choices.length - 1 ? <Text color="gray"> </Text> : null}
        </React.Fragment>
      ))}
    </Box>
  );
}

const inkStatus = {
  InkStatusBadge,
  InkBooleanChips,
  InkOptionToggle,
  InkOptionSelector,
};

export default inkStatus;
