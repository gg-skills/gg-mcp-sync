/**
 * @fileoverview Ink chrome primitives: screen headers with app branding, panels with optional badges,
 * panel sections, and column dividers for composing rich terminal UIs.
 *
 * This file owns the structural Ink components used to scaffold delegate and intent CLI apps.
 *
 * @testing CLI manual: cd scripts && npx tsx delegate/ui/cli-ink/app.tsx (requires interactive TTY)
 * @see scripts/shared/ink-ui/status.tsx - Status badge and tone semantics used by chrome components.
 * @see scripts/shared/ink-ui/command-preview.tsx - Command preview component rendered inside chrome panels.
 * @documentation reviewed=2026-04-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import React from "react";
import { Box, Text } from "ink";
import { InkStatusBadge, type InkStatusTone } from "./status";

/** Top-of-screen header with app name, optional title + badge, description, summary, and notice lines. */
export function InkScreenHeader({
  appName,
  title,
  description,
  summary,
  notice,
  badgeLabel,
  badgeTone,
}: {
  appName: string;
  title?: string;
  description?: string;
  summary?: React.ReactNode;
  notice?: string | null;
  badgeLabel?: string | null;
  badgeTone?: InkStatusTone;
}): React.ReactNode {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color="green">
        {appName}
      </Text>
      {title || badgeLabel ? (
        <Box>
          {title ? <Text bold>{title}</Text> : null}
          {title && badgeLabel ? <Text> </Text> : null}
          {badgeLabel && badgeTone ? (
            <InkStatusBadge label={badgeLabel} tone={badgeTone} />
          ) : null}
        </Box>
      ) : null}
      {description ? <Text color="gray">{description}</Text> : null}
      {summary ? <Box>{summary}</Box> : null}
      {notice ? <Text color="yellow">{notice}</Text> : null}
    </Box>
  );
}

/** Named panel with optional subtitle, badge, footer hint, and arbitrary children. */
export function InkPanel({
  title,
  subtitle,
  badgeLabel,
  badgeTone,
  footerHint,
  children,
}: {
  title: string;
  subtitle?: string;
  badgeLabel?: string | null;
  badgeTone?: InkStatusTone;
  footerHint?: string;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <Box flexDirection="column">
      <Box>
        <Text bold>{title}</Text>
        {badgeLabel && badgeTone ? (
          <>
            <Text> </Text>
            <InkStatusBadge label={badgeLabel} tone={badgeTone} />
          </>
        ) : null}
      </Box>
      {subtitle ? <Text color="gray">{subtitle}</Text> : null}
      {children}
      {footerHint ? <Text color="gray">{footerHint}</Text> : null}
    </Box>
  );
}

/** A titled section inside a panel with a bold title and indented children. */
export function InkPanelSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <Box marginTop={1} flexDirection="column">
      <Text bold>{title}</Text>
      {children}
    </Box>
  );
}

/** A 1-column vertical divider with gray pipe character, used to separate layout columns. */
export function InkColumnDivider(): React.ReactNode {
  return (
    <Box width={1}>
      <Text color="gray">|</Text>
    </Box>
  );
}

const inkChrome = {
  InkScreenHeader,
  InkPanel,
  InkPanelSection,
  InkColumnDivider,
};

export default inkChrome;
