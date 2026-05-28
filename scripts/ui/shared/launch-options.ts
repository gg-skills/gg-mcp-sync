/**
 * @fileoverview Parses MCP shell launcher flags and resolves the initial shell target.
 *
 * Flow: argv -> parsed launch target -> selected section and notice text.
 *
 * @example
 * ```typescript
 * const parsed = parseMcpShellLaunchOptions(["--section", "services"]);
 * ```
 *
 * @testing Jest unit: npm test
 * @see scripts/ui/cli-ink/launch-options.ts - Re-exports this parser for the Ink launcher.
 * @see scripts/ui/cli-opentui/app.tsx - Consumes the resolved launch target in OpenTUI.
 * @documentation reviewed=2026-04-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import type {
  McpShellInventory,
  McpShellLaunchTarget,
  McpShellSectionId,
} from "./shell-types";

/**
 * Result of parsing `mcp:cli:*` argv for help vs an optional focused launch target.
 */
export interface McpShellLaunchOptionsParseResult {
  helpRequested: boolean;
  target: McpShellLaunchTarget | null;
}

/**
 * Normalized shell boot state: which tab is active, per-section row focus, and any UX notice.
 */
export interface McpShellResolvedLaunchTarget {
  selectedSection: McpShellSectionId;
  selectedIndexBySection: Partial<Record<McpShellSectionId, number>>;
  noticeMessage: string | null;
}

const HELP_TEXT = `Usage: mcp-sync ink -- [options]

Options:
  --section <services|env|editors|diagnostics|schemas>  Start in a section.
  --service <service-name>          Focus a specific MCP service.
  --env <var-name>                  Focus a specific MCP environment variable.
  --editor <editor-id-or-name>      Focus a specific editor.
  --help                            Show this help output.
`;

/**
 * Maps `--section` argv values and common aliases to a canonical shell section id.
 *
 * @remarks
 * **PURITY:** pure string normalization; returns `null` when the token does not match any known section.
 */
function normalizeSection(value: string): McpShellSectionId | null {
  switch (value.toLowerCase()) {
    case "services":
    case "service":
      return "services";
    case "env":
    case "envs":
    case "envvar":
    case "envvars":
    case "environment":
      return "envVars";
    case "editors":
    case "editor":
      return "editors";
    case "diagnostics":
    case "validate":
    case "validation":
      return "diagnostics";
    case "schemas":
    case "schema":
      return "schemas";
    default:
      return null;
  }
}

/**
 * Normalizes user-supplied match strings for case-insensitive inventory comparisons.
 *
 * @remarks
 * **PURITY:** trims whitespace and lowercases the input only.
 */
function normalizeValue(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Returns the static `--help` text for the MCP shell launchers.
 */
export function getMcpShellHelpText(): string {
  return HELP_TEXT;
}

/**
 * Parses MCP shell argv into a help flag and at most one section or entity focus target.
 *
 * @remarks
 * **THROWS:** on unknown flags, missing flag values, or conflicting `--service` / `--env` / `--editor`.
 */
export function parseMcpShellLaunchOptions(argv: string[]): McpShellLaunchOptionsParseResult {
  let section: McpShellSectionId | null = null;
  let target: McpShellLaunchTarget | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (current === "--help") {
      return { helpRequested: true, target: null };
    }

    if (current === "--section") {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new Error("--section requires a value.");
      }

      const normalizedSection = normalizeSection(nextValue);
      if (!normalizedSection) {
        throw new Error(`Unsupported section '${nextValue}'.`);
      }

      section = normalizedSection;
      index += 1;
      continue;
    }

    if (current === "--service" || current === "--env" || current === "--editor") {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new Error(`${current} requires a value.`);
      }

      if (target) {
        throw new Error("Use only one of --service, --env, or --editor at a time.");
      }

      if (current === "--service") {
        target = {
          section: "services",
          matchKind: "service",
          matchValue: nextValue,
        };
      }

      if (current === "--env") {
        target = {
          section: "envVars",
          matchKind: "envVar",
          matchValue: nextValue,
        };
      }

      if (current === "--editor") {
        target = {
          section: "editors",
          matchKind: "editor",
          matchValue: nextValue,
        };
      }

      index += 1;
      continue;
    }

    throw new Error(`Unknown mcp:cli:ink option '${current}'.`);
  }

  if (target) {
    return { helpRequested: false, target };
  }

  if (section) {
    return {
      helpRequested: false,
      target: {
        section,
        matchKind: "section",
        matchValue: null,
      },
    };
  }

  return { helpRequested: false, target: null };
}

/**
 * Maps a parsed launch target onto inventory indices and human-readable notices.
 *
 * @remarks
 * **I/O:** pure — only reads the provided `inventory` snapshot; unknown matches degrade to defaults
 * with a notice instead of throwing.
 */
export function resolveMcpShellLaunchTarget(
  inventory: McpShellInventory,
  target: McpShellLaunchTarget | null
): McpShellResolvedLaunchTarget {
  if (!target) {
    return {
      selectedSection: "services",
      selectedIndexBySection: {},
      noticeMessage: null,
    };
  }

  if (target.matchKind === "section") {
    return {
      selectedSection: target.section,
      selectedIndexBySection: {},
      noticeMessage: `Started in the ${target.section} section.`,
    };
  }

  const matchValue = normalizeValue(target.matchValue ?? "");

  if (target.matchKind === "service") {
    const index = inventory.services.findIndex((item) => {
      return (
        normalizeValue(item.id) === matchValue ||
        normalizeValue(item.serviceName) === matchValue
      );
    });

    return {
      selectedSection: "services",
      selectedIndexBySection: index >= 0 ? { services: index } : {},
      noticeMessage:
        index >= 0
          ? `Focused service '${inventory.services[index]?.serviceName ?? target.matchValue}'.`
          : `Service '${target.matchValue}' was not found; showing the default service list.`,
    };
  }

  if (target.matchKind === "envVar") {
    const index = inventory.envVars.findIndex((item) => {
      return normalizeValue(item.name) === matchValue;
    });

    return {
      selectedSection: "envVars",
      selectedIndexBySection: index >= 0 ? { envVars: index } : {},
      noticeMessage:
        index >= 0
          ? `Focused env var '${inventory.envVars[index]?.name ?? target.matchValue}'.`
          : `Env var '${target.matchValue}' was not found; showing the env inventory.`,
    };
  }

  const index = inventory.editors.findIndex((item) => {
    return (
      normalizeValue(item.id) === matchValue || normalizeValue(item.name) === matchValue
    );
  });

  return {
    selectedSection: "editors",
    selectedIndexBySection: index >= 0 ? { editors: index } : {},
    noticeMessage:
      index >= 0
        ? `Focused editor '${inventory.editors[index]?.name ?? target.matchValue}'.`
        : `Editor '${target.matchValue}' was not found; showing the editor inventory.`,
  };
}
