/**
 * @fileoverview Barrel exports for the shared Ink UI component surface.
 *
 * Flow: chrome, legend, status, preview, bridge, and theme modules -> unified Ink helper surface.
 *
 * @example
 * ```typescript
 * import { InkCommandPreview, InkStatusBadge } from "./index.js";
 * ```
 *
 * @testing Manual import verification: npx tsx -e "await import('./scripts/shared/ink-ui/index.ts');"
 * @see scripts/shared/ink-ui/chrome.tsx - Header and panel chrome exports surfaced here.
 * @see scripts/shared/ink-ui/status.tsx - Status chip exports surfaced here.
 * @documentation reviewed=2026-04-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

// Custom platform components
export {
  InkScreenHeader,
  InkPanel,
  InkPanelSection,
  InkColumnDivider,
  type InkStatusTone,
} from "./chrome.js";
export { InkLegend, type InkLegendLines } from "./legend.js";
export {
  InkCapturedOutputBlock,
  inkCliDefaultLineColor,
  type InkCapturedOutputLine,
} from "./captured-output.js";
export {
  InkCommandPreview,
  formatInkCliCommandLine,
} from "./command-preview.js";
export {
  startInkCliTaskProcess,
  type InkCliSessionLine,
  type InkCliTaskExecutionResult,
  type InkCliSessionLineSource,
} from "./bridge-task.js";
export { useStdoutDimensions } from "./use-stdout-dimensions.js";
export {
  InkBooleanChips,
  InkStatusBadge,
  type InkStatusTone as InkStatusToneBadge,
  InkOptionToggle,
  InkOptionSelector,
} from "./status.js";

// Platform theme and ThemeProvider from @inkjs/ui
export { platformTheme, platformColors, type PlatformTheme } from "./theme.js";
export {
  ThemeProvider,
  extendTheme,
  defaultTheme,
  // Commonly usable ink-ui components for convenience
  // Input components
  TextInput,
  EmailInput,
  PasswordInput,
  ConfirmInput,
  // Selection components
  Select,
  MultiSelect,
  // Feedback components
  Spinner,
  ProgressBar,
  Badge,
  StatusMessage,
  Alert,
  // List components
  UnorderedList,
  OrderedList,
  // Theme utilities
  useComponentTheme,
  type ComponentTheme,
} from "@inkjs/ui";
