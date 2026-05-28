/**
 * @fileoverview Ink component for rendering captured CLI output with semantic domain and level-based
 * color mapping, plus utility functions for color determination and line truncation.
 *
 * This file owns the captured-output renderer used by delegate and intent apps to display
 * domain-colored and level-priority output blocks.
 * Color priority: ERROR/FATAL > WARN > DEBUG/TRACE > PERF > domain > source.
 *
 * @testing CLI manual: cd scripts && npx tsx delegate/ui/cli-ink/app.tsx (requires interactive TTY)
 * @see scripts/shared/ink-ui/bridge-task.ts - Task bridge that streams lines consumed by this renderer.
 * @see scripts/shared/ink-ui/status.tsx - Tone semantics used as fallback when domain/level are unset.
 * @documentation reviewed=2026-04-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import React from "react";
import { Box, Text } from "ink";

/**
 * Supported log levels for color mapping
 */
export type InkLogLevel = "INFO" | "DEBUG" | "WARN" | "ERROR" | "TRACE" | "FATAL" | "PERF" | "HTTP";

/**
 * Supported operational domains for semantic coloring
 */
export type InkDomain =
  | "PIPELINE"
  | "LLM"
  | "EXTERNAL"
  | "DB"
  | "HTTP"
  | "PERF"
  | "SYSTEM"
  | undefined;

/**
 * Extended line interface with semantic metadata for enhanced coloring
 */
export interface InkCapturedOutputLine {
  source: string;
  text: string;
  /** Operational domain for semantic coloring */
  domain?: InkDomain;
  /** Log level for priority-based coloring */
  level?: InkLogLevel;
}

/**
 * Determines the appropriate color for a log line based on source, domain, and level.
 * Implements semantic hierarchy: level takes priority, then domain, then source.
 */
export function inkCliDefaultLineColor(
  source: string,
  domain?: InkDomain,
  level?: InkLogLevel
): "gray" | "red" | "white" | "cyan" | "green" | "yellow" | "blue" | "magenta" {
  // Level-based coloring (highest priority)
  if (level === "ERROR" || level === "FATAL") {
    return "red";
  }
  if (level === "WARN") {
    return "yellow";
  }
  if (level === "DEBUG" || level === "TRACE") {
    return "gray";
  }
  if (level === "PERF") {
    return "cyan";
  }

  // Domain-based coloring (secondary priority)
  if (domain === "LLM") {
    return "green";
  }
  if (domain === "PIPELINE") {
    return "cyan";
  }
  if (domain === "EXTERNAL") {
    return "yellow";
  }
  if (domain === "DB") {
    return "magenta";
  }
  if (domain === "HTTP") {
    return "gray";
  }
  if (domain === "PERF") {
    return "cyan";
  }

  // Source-based fallback
  if (source === "stderr") {
    return "red";
  }
  if (source === "bridge") {
    return "gray";
  }

  return "white";
}

/**
 * Returns the last `count` items from `lines`, or all items if `lines.length <= count`.
 * @param lines - The source array to slice.
 * @param count - Maximum number of trailing items to return.
 */
export function sliceRecentLines<T>(lines: readonly T[], count: number): T[] {
  if (lines.length <= count) {
    return [...lines];
  }

  return lines.slice(lines.length - count);
}

/**
 * Renders domain as a subtle colored prefix
 */
function renderDomainPrefix(domain: InkDomain): React.ReactNode {
  if (!domain) return null;

  const domainColorMap: Record<string, "cyan" | "green" | "yellow" | "magenta" | "gray"> = {
    PIPELINE: "cyan",
    LLM: "green",
    EXTERNAL: "yellow",
    DB: "magenta",
    HTTP: "gray",
    PERF: "cyan",
    SYSTEM: "gray",
  };

  const color = domainColorMap[domain] ?? "gray";
  return (
    <Text color={color} dimColor>
      [{domain}]{" "}
    </Text>
  );
}

/**
 * Renders a log line with semantic coloring based on domain and level.
 * Level indicators take priority, followed by domain context.
 */
export function InkCapturedOutputBlock({
  title,
  lines,
  maxLines,
  lineColor = inkCliDefaultLineColor,
  bracketSource = false,
  showDomain = false,
}: {
  title: string;
  lines: readonly InkCapturedOutputLine[];
  maxLines: number;
  lineColor?: (source: string, domain?: InkDomain, level?: InkLogLevel) => "gray" | "red" | "white" | "cyan" | "green" | "yellow" | "blue" | "magenta";
  bracketSource?: boolean;
  /** Show domain prefix for additional context */
  showDomain?: boolean;
}): React.ReactNode {
  const recent = sliceRecentLines(lines, maxLines);

  return (
    <Box flexDirection="column" marginTop={title ? 1 : 0}>
      {title ? <Text bold>{title}</Text> : null}
      {recent.map((line, index) => (
        <Text key={`${line.source}:${index}`} color={lineColor(line.source, line.domain, line.level)}>
          {showDomain && renderDomainPrefix(line.domain)}
          {bracketSource ? `[${line.source}] ${line.text}` : line.text}
        </Text>
      ))}
    </Box>
  );
}
