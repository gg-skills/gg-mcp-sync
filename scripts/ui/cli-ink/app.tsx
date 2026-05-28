/**
 * @fileoverview Renders the MCP Ink shell for services, env vars, editors, diagnostics, and schemas.
 *
 * Flow: launch options + inventory + reducer state -> interactive Ink shell; stdin routes through
 * `cli-ink-app-shell-input-handlers.ts` so the Ink `useInput` hook stays shallow while pure row and
 * draft helpers live in `cli-ink-app-shell-state-helpers.ts`.
 *
 * @example
 * ```typescript
 * const app = <McpInkApp />;
 * ```
 *
 * @testing Jest unit: mcp-sync ink:test
 * @see scripts/ui/cli-ink/reducer.ts - Drives the shell state transitions used by this UI.
 * @see scripts/ui/cli-ink/review.ts - Builds the apply-review model rendered by this UI.
 * @see scripts/ui/shared/load-inventory.ts - Loads the inventory consumed by this UI.
 * @see skills/mcp-sync/scripts/ui/cli-ink/cli-ink-app-shell-state-helpers.ts - Pure selection and draft helpers.
 * @see skills/mcp-sync/scripts/ui/cli-ink/cli-ink-app-shell-input-handlers.ts - Impure stdin routing used by `useInput`.
 * @documentation reviewed=2026-05-15 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import React, { startTransition, useEffect, useReducer, useState } from "react";
import { readFileSync } from "fs";
import { Box, Static, Text, useApp, useInput } from "ink";
import InkChrome from "../../shared/ink-ui/chrome";
import InkLegendModule from "../../shared/ink-ui/legend";
import {
  listMcpSchemaDescriptors,
} from "../../lib/validate-mcp-config-files";
import { findMcpCatalogEntry } from "../shared/command-catalog";
import { resolveMcpInkLaunchTarget } from "./launch-options";
import { formatTimestamp } from "../../lib/state";
import { loadMcpInkInventory } from "./load-inventory";
import {
  createInitialMcpInkState,
  getMcpInkSectionItemCount,
  MCP_INK_SECTIONS,
  mcpInkReducer,
} from "./reducer";
import { buildApplyReviewModel } from "./review";
import type {
  McpInkEditorItem,
  McpInkEnvVarItem,
  McpInkInventory,
  McpInkLaunchTarget,
  McpInkServiceItem,
  McpInkState,
} from "./types";
import {
  formatBool,
  formatDraftEnvValue,
  formatPreferenceLabel,
  getDisplayedServicePreference,
  getNoticeTone,
  getResultTone,
  getSectionLabel,
  getSelectedDiagnostic,
  getSelectedEditor,
  getSelectedEnvVar,
  getSelectedService,
  getStagedEditorScopes,
  hasStagedApplyChanges,
  parseEditorSelections,
} from "./cli-ink-app-shell-state-helpers";
import {
  mcpInkShellInputTryApplyOpen,
  mcpInkShellInputTryApplyResultScreen,
  mcpInkShellInputTryApplyReviewScreen,
  mcpInkShellInputTryClearKey,
  mcpInkShellInputTryEditorResultScreen,
  mcpInkShellInputTryEditorSectionKeys,
  mcpInkShellInputTryEnvEditMode,
  mcpInkShellInputTryEnvEditStart,
  mcpInkShellInputTryMovementKeys,
  mcpInkShellInputTryNextSection,
  mcpInkShellInputTryQuitEscape,
  mcpInkShellInputTryRefreshKey,
  mcpInkShellInputTrySaveKey,
  mcpInkShellInputTrySpaceOrReturn,
  type McpInkShellInputContext,
} from "./cli-ink-app-shell-input-handlers";

export { getEnvEditInputActions, sanitizeEnvEditInput } from "./cli-ink-app-shell-state-helpers";

const { InkColumnDivider, InkPanel, InkPanelSection, InkScreenHeader } =
  InkChrome;
const { InkLegend } = InkLegendModule;

/**
 * Detail panel for the Services section: transports, staging markers, and keyboard hints.
 */
function renderServiceDetail(
  item: McpInkServiceItem | null,
  state: McpInkState
): React.ReactNode {
  if (!item) {
    return <Text color="yellow">No service selected.</Text>;
  }

  const displayedPreference = getDisplayedServicePreference(state, item);
  const isStaged = item.id in state.draftServicePreferences;
  const availablePreferences = ["disabled"];

  if (item.transports.includes("stdio")) {
    availablePreferences.push("stdio-only");
  }

  if (item.transports.includes("http")) {
    availablePreferences.push("http-only");
  }

  if (item.transports.includes("stdio") && item.transports.includes("http")) {
    availablePreferences.push("prefer-stdio", "prefer-http");
  }

  return (
    <Box flexDirection="column">
      <Text bold>{item.serviceName}</Text>
      <Text>
        Preference: {formatPreferenceLabel(displayedPreference)}
        {isStaged ? " (staged)" : ""}
      </Text>
      <Text>Saved preference: {formatPreferenceLabel(item.preference)}</Text>
      <Text>Transports: {item.transports.join(", ") || "none"}</Text>
      <Text>
        Enabled IDs: {item.enabledServerIds.length > 0 ? item.enabledServerIds.join(", ") : "none"}
      </Text>
      <Text>
        Env vars: {item.envVars.length > 0 ? item.envVars.join(", ") : "none"}
      </Text>
      <Text>
        Missing env: {item.missingEnvVars.length > 0 ? item.missingEnvVars.join(", ") : "none"}
      </Text>
      <Text>Cycle options: {availablePreferences.join(" -> ")}</Text>
      <Text color="gray">
        Stage-only for now. Use space or enter to cycle, c to clear.
      </Text>
    </Box>
  );
}

/**
 * Detail panel for Env Vars: masked values, staged drafts, and inline edit buffer when active.
 */
function renderEnvVarDetail(
  item: McpInkEnvVarItem | null,
  state: McpInkState
): React.ReactNode {
  if (!item) {
    return <Text color="yellow">No env var selected.</Text>;
  }

  const stagedValue = state.draftEnvValues[item.name];
  const isEditingCurrentVar =
    state.interactionMode === "env-edit" && state.envEditorName === item.name;

  return (
    <Box flexDirection="column">
      <Text bold>{item.name}</Text>
      <Text>Status: {item.status}</Text>
      <Text>Display value: {item.maskedValue}</Text>
      <Text>
        Staged value: {stagedValue === undefined ? "(none)" : formatDraftEnvValue(stagedValue)}
      </Text>
      <Text>
        Required by: {item.requiredBy.length > 0 ? item.requiredBy.join(", ") : "none"}
      </Text>
      <Text>Last validated: {formatTimestamp(item.lastValidated)}</Text>
      {isEditingCurrentVar ? (
        <Text color="yellow">
          Editing buffer: {formatDraftEnvValue(state.envEditorBuffer)}
        </Text>
      ) : (
        <Text color="gray">
          Press e to edit. While editing: enter stages, escape cancels, c clears staged drafts.
        </Text>
      )}
    </Box>
  );
}

/**
 * Detail panel for Editors: scope support, paths, staged write scopes, and operator hints.
 */
function renderEditorDetail(item: McpInkEditorItem | null, state: McpInkState): React.ReactNode {
  if (!item) {
    return <Text color="yellow">No editor selected.</Text>;
  }

  const stagedScopes = getStagedEditorScopes(state, item.id);

  return (
    <Box flexDirection="column">
      <Text bold>{item.name}</Text>
      <Text>Type: {item.type}</Text>
      <Text>Installed: {formatBool(item.installed)}</Text>
      <Text>Supports HTTP: {formatBool(item.supportsHttp)}</Text>
      <Text>Project scope: {item.scopes.project.supported ? "supported" : "n/a"}</Text>
      <Text>
        Project path: {item.scopes.project.configPath ?? "n/a"}
      </Text>
      <Text>
        Project servers:{" "}
        {item.scopes.project.managedServerCount === null
          ? "n/a"
          : String(item.scopes.project.managedServerCount)}
      </Text>
      <Text>Global scope: {item.scopes.global.supported ? "supported" : "n/a"}</Text>
      <Text>Global path: {item.scopes.global.configPath ?? "n/a"}</Text>
      <Text>
        Global servers:{" "}
        {item.scopes.global.managedServerCount === null
          ? "n/a"
          : String(item.scopes.global.managedServerCount)}
      </Text>
      <Text>
        Instructions: {item.scopes.instructions.supported ? "available" : "n/a"}
      </Text>
      <Text>
        Queued writes: {stagedScopes.length > 0 ? stagedScopes.join(", ") : "none"}
      </Text>
      <Text>
        Last sync: {formatTimestamp(item.scopes.project.lastSync ?? item.scopes.global.lastSync)}
      </Text>
      <Text color="gray">
        Editors: p queues project, g queues global (skipped when project is enabled), i queues instructions, c clears.
      </Text>
      {item.notes.map((note) => (
        <Text key={note} color="yellow">
          Note: {note}
        </Text>
      ))}
    </Box>
  );
}

/**
 * Detail panel for Diagnostics: prompts before validation or per-file Ajv results after a run.
 */
function renderDiagnosticsDetail(state: McpInkState): React.ReactNode {
  const row = getSelectedDiagnostic(state);
  const validateCmd = findMcpCatalogEntry("mcp:validate")?.example ?? "mcp-sync validate";

  if (!row) {
    return (
      <Box flexDirection="column">
        <Text bold>Config validation</Text>
        <Text color="gray">Runs the same checks as {validateCmd} (headless Ajv).</Text>
        <Text color="yellow">Press r to run validation.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold>{row.description}</Text>
      <Text>File: {row.file}</Text>
      <Text>
        Status:{" "}
        {row.skipped ? "skipped" : row.valid ? "valid" : "invalid"}
      </Text>
      {row.errors.length > 0 ? (
        <Box flexDirection="column">
          <Text color="red">Errors</Text>
          {row.errors.map((err) => (
            <Text key={err}>• {err}</Text>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}

/**
 * Detail panel for Schemas: descriptor metadata plus read-only preview text from reducer state.
 */
function renderSchemasDetail(state: McpInkState): React.ReactNode {
  const descriptors = listMcpSchemaDescriptors();
  const idx = state.selectedIndexBySection.schemas;
  const meta = descriptors[idx];
  const preview = state.schemaPreviewText;

  if (!meta) {
    return <Text color="yellow">No schema selected.</Text>;
  }

  return (
    <Box flexDirection="column">
      <Text bold>{meta.schemaKey}</Text>
      <Text color="gray">{meta.absPath}</Text>
      <Text color="gray">Preview (read-only):</Text>
      {preview.length > 0 ? (
        <Text dimColor>{preview}</Text>
      ) : (
        <Text color="gray">Loading…</Text>
      )}
    </Box>
  );
}

/**
 * Routes the middle detail column to the renderer for the active shell section.
 */
function renderDetail(
  inventory: McpInkInventory,
  state: McpInkState
): React.ReactNode {
  switch (state.selectedSection) {
    case "services":
      return renderServiceDetail(getSelectedService(inventory, state), state);
    case "envVars":
      return renderEnvVarDetail(getSelectedEnvVar(inventory, state), state);
    case "editors":
      return renderEditorDetail(getSelectedEditor(inventory, state), state);
    case "diagnostics":
      return renderDiagnosticsDetail(state);
    case "schemas":
      return renderSchemasDetail(state);
  }
}

/**
 * Renders the scrollable list column for the active section with selection and staging markers.
 */
function renderInventoryItems(
  inventory: McpInkInventory,
  state: McpInkState
): React.ReactNode {
  switch (state.selectedSection) {
    case "services":
      return inventory.services.map((item, index) => {
        const isSelected = index === state.selectedIndexBySection.services;
        const marker = isSelected ? ">" : " ";
        const envMarker = item.missingEnvVars.length > 0 ? " !" : "";
        const displayedPreference = getDisplayedServicePreference(state, item);
        const stagedMarker = item.id in state.draftServicePreferences ? " *" : "";

        return (
          <Text key={item.id} color={isSelected ? "cyan" : undefined}>
            {marker} {item.serviceName} [{formatPreferenceLabel(displayedPreference)}]
            {envMarker}
            {stagedMarker}
          </Text>
        );
      });
    case "envVars":
      return inventory.envVars.map((item, index) => {
        const isSelected = index === state.selectedIndexBySection.envVars;
        const marker = isSelected ? ">" : " ";
        const stagedMarker = item.name in state.draftEnvValues ? " *" : "";

        return (
          <Text key={item.name} color={isSelected ? "cyan" : undefined}>
            {marker} {item.name} [{item.status}]
            {stagedMarker}
          </Text>
        );
      });
    case "editors":
      return inventory.editors.map((item, index) => {
        const isSelected = index === state.selectedIndexBySection.editors;
        const marker = isSelected ? ">" : " ";
        const installMarker = item.installed ? "" : " (not installed)";
        const stagedMarker = getStagedEditorScopes(state, item.id).length > 0 ? " *" : "";

        return (
          <Text key={item.id} color={isSelected ? "cyan" : undefined}>
            {marker} {item.name}
            {installMarker}
            {stagedMarker}
          </Text>
        );
      });
    case "diagnostics": {
      const results = state.diagnosticsResults;
      if (!results || results.length === 0) {
        return (
          <Text color={state.selectedIndexBySection.diagnostics === 0 ? "cyan" : undefined}>
            &gt; Press r to run validation
          </Text>
        );
      }
      return results.map((item, index) => {
        const isSelected = index === state.selectedIndexBySection.diagnostics;
        const marker = isSelected ? ">" : " ";
        const label = item.skipped ? "skip" : item.valid ? "ok" : "bad";
        return (
          <Text key={`${item.file}:${item.description}`} color={isSelected ? "cyan" : undefined}>
            {marker} {item.description} [{label}]
          </Text>
        );
      });
    }
    case "schemas":
      return listMcpSchemaDescriptors().map((item, index) => {
        const isSelected = index === state.selectedIndexBySection.schemas;
        const marker = isSelected ? ">" : " ";
        return (
          <Text key={item.absPath} color={isSelected ? "cyan" : undefined}>
            {marker} {item.fileName}
          </Text>
        );
      });
  }
}

/**
 * Right-hand summary panel with aggregate counts and a capped preview of staged changes.
 */
function SummaryPanelWithState({
  inventory,
  state,
}: {
  inventory: McpInkInventory;
  state: McpInkState;
}): React.ReactNode {
  const stagedEntries = Object.entries(state.draftServicePreferences);
  const stagedEnvEntries = Object.entries(state.draftEnvValues);
  const stagedEditorEntries = parseEditorSelections(state.draftEditorSelections);

  return (
    <InkPanel
      title="Summary"
      badgeLabel={hasStagedApplyChanges(state) ? "staged" : "ready"}
      badgeTone={hasStagedApplyChanges(state) ? "staged" : "ready"}
    >
      <Text>
        Services: {inventory.summary.enabledServices}/{inventory.summary.totalServices} enabled
      </Text>
      <Text>
        Env vars: {inventory.summary.setEnvVars}/{inventory.summary.totalEnvVars} set
      </Text>
      <Text>
        Editors: {inventory.summary.installedEditors}/{inventory.editors.length} installed
      </Text>
      <Text>Enabled scopes: {inventory.summary.enabledEditorScopes}</Text>
      <Text>Warnings: {inventory.summary.warnings}</Text>
      <Text>State file: {formatBool(inventory.filePresence.stateFile)}</Text>
      <Text>Env file: {formatBool(inventory.filePresence.envFile)}</Text>
      <Text>Instructions dir: {formatBool(inventory.filePresence.instructionsDir)}</Text>
      <Text>Loaded: {formatTimestamp(inventory.loadedAt)}</Text>
      <Text>Root: {inventory.projectRoot}</Text>
      <Text>Staged service changes: {stagedEntries.length}</Text>
      <Text>Staged env changes: {stagedEnvEntries.length}</Text>
      <Text>Queued editor writes: {stagedEditorEntries.length}</Text>
      {stagedEntries.length > 0 ? <Text bold>Staged</Text> : null}
      {stagedEntries.slice(0, 5).map(([serviceId, preference]) => (
        <Text key={serviceId} color="yellow">
          - {serviceId}: {formatPreferenceLabel(preference)}
        </Text>
      ))}
      {stagedEnvEntries.slice(0, 5).map(([envVarName, value]) => (
        <Text key={envVarName} color="yellow">
          - {envVarName}: {formatDraftEnvValue(value)}
        </Text>
      ))}
      {stagedEditorEntries.slice(0, 5).map((selection) => (
        <Text key={`${selection.editorId}:${selection.scope}`} color="yellow">
          - {selection.editorId}: {selection.scope}
        </Text>
      ))}
      {inventory.warnings.length > 0 ? <Text bold>Warnings</Text> : null}
      {inventory.warnings.slice(0, 4).map((warning) => (
        <Text key={warning} color="yellow">
          - {warning}
        </Text>
      ))}
    </InkPanel>
  );
}

/**
 * Shell header with section counts; inventory may be null during transitional loads.
 */
function Header({
  inventory,
  state,
}: {
  inventory: McpInkInventory | null;
  state: McpInkState;
}): React.ReactNode {
  return (
    <InkScreenHeader
      appName="MCP Ink"
      description="Interactive inventory shell for MCP services, env readiness, and editor scopes."
      notice={state.noticeMessage}
      badgeLabel={
        state.status === "ready"
          ? state.interactionMode === "env-edit"
            ? "editing"
            : hasStagedApplyChanges(state)
              ? "staged"
              : "browse"
          : null
      }
      badgeTone={state.status === "ready" ? getNoticeTone(state) : undefined}
      summary={
        <Box>
          {MCP_INK_SECTIONS.map((section) => {
            const isSelected = state.selectedSection === section;
            const count = getMcpInkSectionItemCount(state, section);
            const prefix = isSelected ? "[" : " ";
            const suffix = isSelected ? "]" : " ";

            return (
              <Box key={section} marginRight={2}>
                <Text color={isSelected ? "cyan" : "gray"}>
                  {prefix}
                  {getSectionLabel(section)}:{count}
                  {suffix}
                </Text>
              </Box>
            );
          })}
        </Box>
      }
    />
  );
}

/**
 * Bottom legend summarizing global keys and section-specific shortcuts for the browse shell.
 */
function Footer({ state }: { state: McpInkState }): React.ReactNode {
  const validateExample = findMcpCatalogEntry("mcp:validate")?.example ?? "mcp-sync validate";
  return (
    <InkLegend
      lines={[
        "Keys: up/down move | left/right switch section | r refresh (or run validation in Diagnostics) | q quit",
        "Keys: a opens apply preview | canonical npm scripts: see scripts/README.md and command-catalog.",
        "Services: space/enter cycles preference, c clears it, s saves staged service changes.",
        "Env: e edits the selected variable, enter stages it, c clears it, s saves staged env changes.",
        "Editors: p/g/i queue project/global/instructions writes, c clears them, s runs queued writes. Global is skipped when project is enabled.",
        `Diagnostics: r runs headless validation (same as ${validateExample}). Schemas: JSON preview read-only.`,
      ]}
    />
  );
}

/**
 * Stateless Ink layout for the main MCP shell: header, tri-pane inventory, and footer legend.
 */
export function McpInkShell({
  inventory,
  state,
}: {
  inventory: McpInkInventory;
  state: McpInkState;
}): React.ReactNode {
  const commandPreview =
    state.selectedSection === "diagnostics"
      ? (findMcpCatalogEntry("mcp:validate")?.example ?? "mcp-sync validate")
      : null;

  return (
    <Box flexDirection="column">
      <Header inventory={inventory} state={state} />
      {state.selectedSection === "diagnostics" && state.diagnosticsStaticLines.length > 0 ? (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="gray">
            Validation log (Static)
          </Text>
          <Static items={state.diagnosticsStaticLines}>
            {(line, index) => (
              <Text key={`d-${index}`} dimColor>
                {line}
              </Text>
            )}
          </Static>
        </Box>
      ) : null}
      {commandPreview ? (
        <Text dimColor marginBottom={1}>
          Command preview: {commandPreview}
        </Text>
      ) : null}
      <Box>
        <Box width={36} flexDirection="column" marginRight={1}>
          <InkPanel title={getSectionLabel(state.selectedSection)}>
            {renderInventoryItems(inventory, state)}
          </InkPanel>
        </Box>
        <InkColumnDivider />
        <Box width={44} flexDirection="column" marginX={1}>
          <InkPanel title="Detail">{renderDetail(inventory, state)}</InkPanel>
        </Box>
        <InkColumnDivider />
        <Box flexGrow={1} flexDirection="column" marginLeft={1}>
          <SummaryPanelWithState inventory={inventory} state={state} />
        </Box>
      </Box>
      <Footer state={state} />
    </Box>
  );
}

/**
 * Full-screen apply preview built from `buildApplyReviewModel` before executing apply.
 */
function ApplyReviewScreen({
  inventory,
  state,
}: {
  inventory: McpInkInventory;
  state: McpInkState;
}): React.ReactNode {
  const review = buildApplyReviewModel(inventory, state);

  return (
    <Box flexDirection="column">
      <InkScreenHeader
        appName="MCP Ink"
        title="Apply Preview"
        description="Non-destructive review of the current editor targets and apply policy state."
        badgeLabel={review.plan.status}
        badgeTone={review.plan.status === "ready" ? "ready" : "warning"}
      />
      <Text>
        Staged service changes: {review.stagedServiceChangeCount} | staged env changes:{" "}
        {review.stagedEnvChangeCount} | staged editor writes: {review.stagedEditorChangeCount}
      </Text>
      <Text>
        Preview enabled servers:{" "}
        {review.previewEnabledServerIds.length > 0
          ? review.previewEnabledServerIds.join(", ")
          : "none"}
      </Text>
      <Text>
        Apply status: {review.plan.status}
        {review.plan.noOpReason ? ` (${review.plan.noOpReason})` : ""}
      </Text>
      {state.noticeMessage ? (
        <Text color="yellow">Shell notice: {state.noticeMessage}</Text>
      ) : null}
      {review.notices.map((notice) => (
        <Text key={notice} color="yellow">
          Note: {notice}
        </Text>
      ))}
      <InkPanelSection title="Targets">
        {review.plan.targets.length > 0 ? (
          review.plan.targets.map((target) => (
            <Text key={`${target.editorId}:${target.scope}`}>
              - {target.editorName} [{target.scope}] {"->"} {target.configPath}
            </Text>
          ))
        ) : (
          <Text color="yellow">No apply targets are currently available.</Text>
        )}
      </InkPanelSection>
      <InkPanelSection title="Policy Skips">
        {review.plan.policySkippedTargets.length > 0 ? (
          review.plan.policySkippedTargets.map((item) => (
            <Text key={`${item.target.editorId}:${item.target.scope}`} color="yellow">
              - {item.target.editorName} [{item.target.scope}]: {item.reason}
            </Text>
          ))
        ) : (
          <Text color="gray">No policy-skipped targets in this preview.</Text>
        )}
      </InkPanelSection>
      <InkPanelSection title="Queued Editor Writes">
        {review.stagedEditorWrites.length > 0 ? (
          review.stagedEditorWrites.map((item) => (
            <Text key={`${item.editorId}:${item.scope}`}>
              - {item.editorName} [{item.scope}]: {item.description}
            </Text>
          ))
        ) : (
          <Text color="gray">No queued editor writes in this preview.</Text>
        )}
      </InkPanelSection>
      <InkLegend
        lines={[
          "Press b or escape to return to the shell.",
          "Save any staged service, env, or editor changes first, then press x here to run apply with the current saved state.",
          "Ink apply uses the shared controller path and keeps the direct apply command canonical.",
        ]}
      />
    </Box>
  );
}

/**
 * Full-screen report for the last `executeApplyPlan` outcome including backups and writes.
 */
function ApplyResultScreen({
  state,
}: {
  state: McpInkState;
}): React.ReactNode {
  const result = state.applyResult;

  if (!result) {
    return (
      <Box flexDirection="column">
        <Text bold color="red">
          Apply Result Unavailable
        </Text>
        <Text color="gray">Press b or escape to return to the shell.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <InkScreenHeader
        appName="MCP Ink"
        title="Apply Result"
        badgeLabel={result.status}
        badgeTone={getResultTone(result.successCount, result.errorCount)}
      />
      <Text>Status: {result.status}</Text>
      <Text>
        Success: {result.successCount} | Skipped: {result.skipCount} | Errors: {result.errorCount}
      </Text>
      {result.stateWriteError ? (
        <Text color="red">State write error: {result.stateWriteError}</Text>
      ) : null}
      <InkPanelSection title="Backups">
        {result.backupResults.length > 0 ? (
          result.backupResults.map((backup) => (
            <Text
              key={`${backup.editorId}:${backup.scope}:${backup.originalPath}`}
              color={backup.success ? undefined : "yellow"}
            >
              - {backup.editorName} [{backup.scope}]:{" "}
              {backup.success
                ? backup.projectBackupPath
                  ? "backup created"
                  : "no existing config to back up"
                : backup.error ?? "backup failed"}
            </Text>
          ))
        ) : (
          <Text color="gray">No backup operations were attempted.</Text>
        )}
      </InkPanelSection>
      <InkPanelSection title="Writes">
        {result.items.length > 0 ? (
          result.items.map((item) => (
            <Text
              key={`${item.target.editorId}:${item.target.scope}`}
              color={
                item.outcome === "error"
                  ? "red"
                  : item.outcome === "skip"
                    ? "gray"
                    : undefined
              }
            >
              - {item.target.editorName} [{item.target.scope}]: {item.message}
            </Text>
          ))
        ) : (
          <Text color="gray">No write operations were attempted.</Text>
        )}
      </InkPanelSection>
      <InkLegend lines={["Press b or escape to return to the shell."]} />
    </Box>
  );
}

/**
 * Full-screen report for the last queued editor write batch from `executeEditorSelections`.
 */
function EditorResultScreen({
  state,
}: {
  state: McpInkState;
}): React.ReactNode {
  const result = state.editorResult;

  if (!result) {
    return (
      <Box flexDirection="column">
        <Text bold color="red">
          Editor Result Unavailable
        </Text>
        <Text color="gray">Press b or escape to return to the shell.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <InkScreenHeader
        appName="MCP Ink"
        title="Editor Write Result"
        badgeLabel={
          result.errorCount > 0
            ? "errors"
            : result.warningCount > 0
              ? "warnings"
              : "success"
        }
        badgeTone={
          result.errorCount > 0
            ? "destructive"
            : result.warningCount > 0
              ? "warning"
              : "ready"
        }
      />
      <Text>
        Success: {result.successCount} | Warnings: {result.warningCount} | Errors:{" "}
        {result.errorCount}
      </Text>
      {result.stateWriteError ? (
        <Text color="red">State write error: {result.stateWriteError}</Text>
      ) : null}
      <InkPanelSection title="Operations">
        {result.items.length > 0 ? (
          result.items.map((item) => (
            <Text
              key={`${item.editorId}:${item.scope}`}
              color={
                item.outcome === "error"
                  ? "red"
                  : item.outcome === "warning"
                    ? "yellow"
                    : undefined
              }
            >
              - {item.editorName} [{item.scope}]: {item.message}
            </Text>
          ))
        ) : (
          <Text color="gray">No editor write operations were attempted.</Text>
        )}
      </InkPanelSection>
      <InkLegend lines={["Press b or escape to return to the shell."]} />
    </Box>
  );
}

/**
 * Root Ink app: loads inventory, wires keyboard handling, and switches between shell and overlays.
 *
 * @remarks
 * **I/O:** impure — dispatches async inventory loads, validation runs, and apply/editor saves from input handlers.
 */
export function McpInkApp({
  projectRoot,
  launchTarget,
}: {
  projectRoot: string;
  launchTarget: McpInkLaunchTarget | null;
}): React.ReactNode {
  const { exit } = useApp();
  const [state, dispatch] = useReducer(mcpInkReducer, createInitialMcpInkState());
  const [isSavingServices, setIsSavingServices] = useState(false);
  const [isSavingEnvValues, setIsSavingEnvValues] = useState(false);
  const [isSavingEditors, setIsSavingEditors] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    /**
     * Loads MCP inventory and merges launch targeting without blocking the Ink render loop.
     *
     * @remarks
     * **I/O:** awaits `loadMcpInkInventory`; dispatches inside `startTransition` and skips work when cancelled.
     */
    async function runLoad(): Promise<void> {
      dispatch({ type: "load-start" });

      try {
        const inventory = await loadMcpInkInventory({ projectRoot });
        if (isCancelled) {
          return;
        }
        const launchSelection = resolveMcpInkLaunchTarget(inventory, launchTarget);

        startTransition(() => {
          dispatch({
            type: "load-success",
            inventory,
            noticeMessage: launchSelection.noticeMessage,
            selectedSection: launchSelection.selectedSection,
            selectedIndexBySection: launchSelection.selectedIndexBySection,
          });
        });
      } catch (error) {
        if (isCancelled) {
          return;
        }

        const message = error instanceof Error ? error.message : String(error);
        startTransition(() => {
          dispatch({ type: "load-error", errorMessage: message });
        });
      }
    }

    void runLoad();

    return () => {
      isCancelled = true;
    };
  }, [launchTarget, projectRoot, state.refreshToken]);

  useEffect(() => {
    if (state.status !== "ready" || state.selectedSection !== "schemas") {
      return;
    }

    const descriptors = listMcpSchemaDescriptors();
    const idx = state.selectedIndexBySection.schemas;
    const meta = descriptors[idx];
    if (!meta) {
      return;
    }

    try {
      const raw = readFileSync(meta.absPath, "utf8");
      const clipped =
        raw.length > 12_000 ? `${raw.slice(0, 12_000)}\n… (truncated)` : raw;
      startTransition(() => {
        dispatch({ type: "schema-preview-ready", text: clipped });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      startTransition(() => {
        dispatch({
          type: "schema-preview-ready",
          text: `Failed to read schema: ${message}`,
        });
      });
    }
  }, [state.selectedSection, state.selectedIndexBySection.schemas, state.status]);

  useInput((input, key) => {
    const ctx: McpInkShellInputContext = {
      input,
      key,
      state,
      dispatch,
      exit,
      projectRoot,
      isSavingServices,
      isSavingEnvValues,
      isSavingEditors,
      setIsSavingServices,
      setIsSavingEnvValues,
      setIsSavingEditors,
    };

    if (mcpInkShellInputTryQuitEscape(ctx)) {
      return;
    }
    if (mcpInkShellInputTryEnvEditMode(ctx)) {
      return;
    }
    if (mcpInkShellInputTryApplyReviewScreen(ctx)) {
      return;
    }
    if (mcpInkShellInputTryApplyResultScreen(ctx)) {
      return;
    }
    if (mcpInkShellInputTryEditorResultScreen(ctx)) {
      return;
    }
    if (mcpInkShellInputTryRefreshKey(ctx)) {
      return;
    }
    if (ctx.state.status !== "ready" || !ctx.state.inventory) {
      return;
    }
    if (mcpInkShellInputTryApplyOpen(ctx)) {
      return;
    }
    if (mcpInkShellInputTryMovementKeys(ctx)) {
      return;
    }
    if (mcpInkShellInputTrySaveKey(ctx)) {
      return;
    }
    if (mcpInkShellInputTryEnvEditStart(ctx)) {
      return;
    }
    if (mcpInkShellInputTrySpaceOrReturn(ctx)) {
      return;
    }
    if (mcpInkShellInputTryClearKey(ctx)) {
      return;
    }
    if (mcpInkShellInputTryEditorSectionKeys(ctx)) {
      return;
    }
    mcpInkShellInputTryNextSection(ctx);
  });

  if (!state.inventory && state.status === "loading") {
    return (
      <Box flexDirection="column">
        <Text bold color="green">
          MCP Ink
        </Text>
        <Text>Loading MCP inventory...</Text>
      </Box>
    );
  }

  if (state.status === "error") {
    return (
      <Box flexDirection="column">
        <Text bold color="red">
          MCP Ink failed to load
        </Text>
        <Text>{state.errorMessage ?? "Unknown error"}</Text>
        <Text color="gray">Press r to retry or q to quit.</Text>
      </Box>
    );
  }

  if (!state.inventory) {
    return (
      <Box flexDirection="column">
        <Text bold color="red">
          MCP Ink has no inventory data
        </Text>
        <Text color="gray">Press r to retry or q to quit.</Text>
      </Box>
    );
  }

  if (state.screen === "apply-review") {
    return <ApplyReviewScreen inventory={state.inventory} state={state} />;
  }

  if (state.screen === "apply-result") {
    return <ApplyResultScreen state={state} />;
  }

  if (state.screen === "editor-result") {
    return <EditorResultScreen state={state} />;
  }

  return <McpInkShell inventory={state.inventory} state={state} />;
}
