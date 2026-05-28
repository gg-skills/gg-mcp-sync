/**
 * @fileoverview Shared Ink theme tokens for the root script CLI surface.
 *
 * Flow: theme token definitions -> reusable color and component styles for Ink consumers.
 *
 * @testing Manual import verification: npx tsx -e "await import('./scripts/shared/ink-ui/theme.ts');"
 * @see scripts/shared/ink-ui/index.ts - Barrel surface that re-exports the theme values.
 * @documentation reviewed=2026-04-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { extendTheme, defaultTheme, type Theme } from "@inkjs/ui";

/**
 * Platform color palette for ink components
 */
export const platformColors = {
  /** Primary selection highlight */
  selection: "cyan" as const,
  /** App name and success */
  success: "green" as const,
  /** Secondary text, descriptions */
  secondary: "gray" as const,
  /** Warnings and notices */
  warning: "yellow" as const,
  /** Errors and destructive */
  error: "red" as const,
  /** Primary text */
  primary: "white" as const,
  /** Key badge foreground */
  keyFg: "black" as const,
  /** Key badge background */
  keyBg: "white" as const,
} as const;

/**
 * Platform theme extending @inkjs/ui default
 */
export const platformTheme = extendTheme(defaultTheme, {
  components: {
    // Spinner: match cyan highlight
    Spinner: {
      styles: {
        frame: (): { color: string } => ({
          color: platformColors.selection,
        }),
      },
    },
    // Badge: match existing badge colors
    Badge: {
      variants: {
        success: {
          styles: {
            container: (): { backgroundColor: string; color: string } => ({
              backgroundColor: platformColors.success,
              color: platformColors.keyFg,
            }),
          },
        },
        error: {
          styles: {
            container: (): { backgroundColor: string; color: string } => ({
              backgroundColor: platformColors.error,
              color: platformColors.keyFg,
            }),
          },
        },
        warning: {
          styles: {
            container: (): { backgroundColor: string; color: string } => ({
              backgroundColor: platformColors.warning,
              color: platformColors.keyFg,
            }),
          },
        },
        info: {
          styles: {
            container: (): { backgroundColor: string; color: string } => ({
              backgroundColor: platformColors.selection,
              color: platformColors.keyFg,
            }),
          },
        },
      },
    },
    // StatusMessage: match existing tone colors
    StatusMessage: {
      styles: {
        icon: ({ variant }: { variant: string }): { color: string } => {
          switch (variant) {
            case "success":
              return { color: platformColors.success };
            case "error":
              return { color: platformColors.error };
            case "warning":
              return { color: platformColors.warning };
            case "info":
            default:
              return { color: platformColors.selection };
          }
        },
      },
    },
    // Alert: match existing alert tones
    Alert: {
      styles: {
        icon: ({ variant }: { variant: string }): { color: string } => {
          switch (variant) {
            case "success":
              return { color: platformColors.success };
            case "error":
              return { color: platformColors.error };
            case "warning":
              return { color: platformColors.warning };
            case "info":
            default:
              return { color: platformColors.selection };
          }
        },
      },
    },
  },
} satisfies Theme);

/**
 * Concrete `Theme` instance produced by `extendTheme`, including component style overrides for shared Ink CLIs.
 */
export type PlatformTheme = typeof platformTheme;

/**
 * Domain-based colors for operational context in log output.
 * Used to provide semantic coloring based on the operational domain
 * (e.g., LLM calls, pipeline execution, database operations).
 *
 * These colors are intentionally muted/pastel to reduce visual fatigue
 * while still providing meaningful distinction between operational contexts.
 */
export const domainColors = {
  /** Pipeline execution operations - cyan for flow/connectivity */
  PIPELINE: "cyan" as const,
  /** LLM/AI operations - green for growth/generation */
  LLM: "green" as const,
  /** External service calls - yellow for caution/external trust */
  EXTERNAL: "yellow" as const,
  /** Database operations - magenta for data/storage */
  DB: "magenta" as const,
  /** HTTP/network traffic - gray for neutral traffic */
  HTTP: "gray" as const,
  /** Performance monitoring - cyan for timing/metrics */
  PERF: "cyan" as const,
  /** System-level operations - gray for infrastructure */
  SYSTEM: "gray" as const,
} as const;

/**
 * Type representing valid operational domain values
 */
export type DomainType = keyof typeof domainColors;

/**
 * Level-based colors for log priority.
 * ERROR and FATAL use red, WARN uses yellow,
 * DEBUG/TRACE are muted gray, PERF uses cyan.
 */
export const levelColors = {
  INFO: "blue" as const,
  DEBUG: "gray" as const,
  TRACE: "gray" as const,
  WARN: "yellow" as const,
  ERROR: "red" as const,
  FATAL: "red" as const,
  PERF: "cyan" as const,
  HTTP: "gray" as const,
} as const;

/**
 * Type representing valid log level values
 */
export type LevelType = keyof typeof levelColors;
