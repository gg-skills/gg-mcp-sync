/**
 * @fileoverview Ink layout primitives: column dividers and panel stacks for composing multi-section terminal UIs.
 *
 * This file owns the layout components shared by delegate and intent CLI apps.
 *
 * @testing CLI manual: cd scripts && npx tsx delegate/ui/cli-ink/app.tsx (requires interactive TTY)
 * @see scripts/shared/ink-ui/chrome.tsx - Screen header and panel chrome that often contains these layout primitives.
 * @documentation reviewed=2026-04-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import React from "react";
import { Box, Text } from "ink";

/** A 1-column vertical divider with gray pipe character. */
export function InkColumnDivider(): React.ReactNode {
  return (
    <Box width={1}>
      <Text color="gray">|</Text>
    </Box>
  );
}

/** A vertical stack of child nodes in a column flex container. */
export function InkPanelStack({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  return <Box flexDirection="column">{children}</Box>;
}

const inkLayout = {
  InkColumnDivider,
  InkPanelStack,
};

export default inkLayout;
