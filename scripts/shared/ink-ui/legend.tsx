/**
 * @fileoverview Ink legend component for rendering keyboard shortcut hints with styled key badges
 * and descriptions inside terminal UIs.
 *
 * This file owns the legend renderer used by delegate and intent CLI apps to show keyboard bindings.
 *
 * @testing CLI manual: cd scripts && npx tsx delegate/ui/cli-ink/app.tsx (requires interactive TTY)
 * @see scripts/shared/ink-ui/chrome.tsx - Chrome components (panels, headers) that may contain a legend.
 * @documentation reviewed=2026-04-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import React from "react";
import { Box, Text } from "ink";

/**
 * Renders a legend block with an optional title and a list of lines.
 * Lines containing ` | ` are split into key-badge + description pairs; other lines are rendered gray.
 */
export function InkLegend({
  lines,
  title = "Keys",
}: {
  lines: readonly string[];
  title?: string | null;
}): React.ReactNode {
  return (
    <Box marginTop={1} flexDirection="column" gap={0}>
      {title ? (
        <Box marginBottom={1}>
          <Text bold>{title}</Text>
        </Box>
      ) : null}
      
      {lines.map((line, lineIndex) => {
        const hasPrefix = line.startsWith("Keys: ");
        const cleanLine = hasPrefix ? line.slice(6).trim() : line.trim();
        
        if (!cleanLine.includes(" | ") && !hasPrefix) {
          return (
            <Text key={lineIndex} color="gray">
              {line}
            </Text>
          );
        }

        const segments = cleanLine.split(" | ");
        return (
          <Box key={lineIndex} flexDirection="row" flexWrap="wrap">
            {segments.map((segment, segIndex) => {
              const trimmed = segment.trim();
              if (!trimmed) return null;
              
              const firstSpace = trimmed.indexOf(" ");
              const keyCombo = firstSpace > -1 ? trimmed.slice(0, firstSpace) : trimmed;
              const desc = firstSpace > -1 ? trimmed.slice(firstSpace + 1) : "";

              return (
                <Box key={segIndex} marginRight={3} marginBottom={1}>
                  <Text color="black" backgroundColor="white" bold>
                    {` ${keyCombo} `}
                  </Text>
                  {desc ? <Text color="gray"> {desc}</Text> : null}
                </Box>
              );
            })}
          </Box>
        );
      })}
    </Box>
  );
}

const inkLegend = {
  InkLegend,
};

export default inkLegend;
