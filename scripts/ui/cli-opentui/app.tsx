/**
 * @fileoverview Renders the MCP OpenTUI shell for inventory browsing and command previews.
 *
 * Flow: repo root + inventory loaders + catalog previews -> OpenTUI shell screens.
 *
 * @example
 * ```typescript
 * const app = <McpOpenTuiApp />;
 * ```
 *
 * @testing Manual interactive: mcp-sync opentui in a TTY
 * @see scripts/ui/shared/command-catalog.ts - Provides the command catalog previewed here.
 * @see scripts/ui/shared/load-inventory.ts - Loads the inventory rendered here.
 * @see scripts/ui/cli-opentui/main.tsx - Bootstraps this OpenTUI app.
 * @documentation reviewed=2026-05-07 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { readFileSync } from "node:fs";
import { useEffect, useState, type ReactNode } from "react";

import {
  formatMcpValidationSummaryLines,
  listMcpSchemaDescriptors,
  validateMcpConfigFiles,
} from "../../lib/validate-mcp-config-files.js";
import {
  findMcpCatalogEntry,
  formatMcpCommandPreview,
  MCP_COMMAND_CATALOG,
  type McpCommandCatalogEntry,
} from "../shared/command-catalog.js";
import { loadMcpShellInventory } from "../shared/load-inventory.js";
import type { McpShellInventory } from "../shared/shell-types.js";
import { resolveMcpSyncProjectRoot } from "../../lib/project-root.js";

/**
 * Identifies which OpenTUI surface is active for menu routing and inventory-backed panels.
 *
 * @remarks
 * **USAGE:** Values align with `tab-select` option payloads and `useState` screen switching.
 */
type McpOpenTuiScreen =
  | "menu"
  | "services"
  | "env"
  | "editors"
  | "diagnostics"
  | "schemas"
  | "commands";

/**
 * Option row consumed by OpenTUI `tab-select` controls in this shell.
 */
type SelectOption = { description: string; name: string; value: string };

/**
 * Builds the root menu entries, including the synthetic Quit action that exits via SIGINT.
 *
 * @remarks
 * **PURITY:** Returns a fresh array each call; safe for React props without external caching.
 */
function menuOptions(): SelectOption[] {
  return [
    { description: "Transport and enabled server IDs", name: "Services", value: "services" },
    { description: "Required MCP env vars", name: "Env", value: "env" },
    { description: "Editor scopes and paths", name: "Editors", value: "editors" },
    { description: "Ajv validation (headless lib)", name: "Diagnostics", value: "diagnostics" },
    { description: "JSON Schema files (read-only)", name: "Schemas", value: "schemas" },
    { description: "mcp-sync command catalog + previews", name: "Commands", value: "commands" },
    { description: "Exit OpenTUI", name: "Quit", value: "quit" },
  ];
}

/**
 * Renders MCP service inventory (transports, enabled servers, missing env) as plain text blocks.
 *
 * @remarks
 * **PURITY:** Read-only string formatting; no I/O.
 */
function formatInventoryServicesText(inv: McpShellInventory): string {
  return inv.services
    .map((s) => {
      const line = [
        `${s.serviceName} [${s.preference}]`,
        `  transports: ${s.transports.join(", ")}`,
        `  enabled: ${s.enabledServerIds.join(", ") || "none"}`,
        `  missing env: ${s.missingEnvVars.join(", ") || "none"}`,
      ].join("\n");
      return line;
    })
    .join("\n\n");
}

/**
 * Renders required MCP environment variables with masked values and requirement provenance.
 *
 * @remarks
 * **PURITY:** Read-only string formatting; no I/O.
 */
function formatInventoryEnvText(inv: McpShellInventory): string {
  return inv.envVars
    .map((v) => `${v.name} [${v.status}] ${v.maskedValue}  (required by: ${v.requiredBy.join(", ")})`)
    .join("\n");
}

/**
 * Renders detected editors with scope support flags, config paths, and collected notes.
 *
 * @remarks
 * **PURITY:** Read-only string formatting; no I/O.
 */
function formatInventoryEditorsText(inv: McpShellInventory): string {
  return inv.editors
    .map((e) => {
      const scopes = Object.entries(e.scopes)
        .map(([k, s]) => `    ${k}: supported=${s.supported} enabled=${s.enabled} path=${s.configPath ?? "n/a"}`)
        .join("\n");
      return `${e.name} (${e.id}) installed=${e.installed}\n${scopes}\n  notes: ${e.notes.join("; ") || "none"}`;
    })
    .join("\n\n");
}

/**
 * Formats the static MCP npm-script catalog into scrollbox-friendly preview text.
 *
 * @remarks
 * **PURITY:** Uses in-memory `MCP_COMMAND_CATALOG` only; no filesystem access.
 */
function formatCommandCatalogText(): string {
  return MCP_COMMAND_CATALOG.map(
    (e) =>
      `${e.example}\n  ${e.description}\n  script: ${e.scriptPath}  interactive=${e.interactive ? "yes" : "no"}`,
  ).join("\n\n");
}

/**
 * Applies root menu `tab-select` navigation: Quit sends SIGINT; known values advance `screen`.
 *
 * @remarks
 * **I/O:** `process.kill` on Quit only. **USAGE:** Keep ordering — Quit handling stays before screen updates.
 */
function applyMcpOpenTuiMenuSelection(options: {
  option: SelectOption | undefined;
  setScreen: (next: McpOpenTuiScreen) => void;
}): void {
  const v = options.option?.value;
  if (v === "quit") {
    process.kill(process.pid, "SIGINT");
    return;
  }
  if (
    v === "services"
    || v === "env"
    || v === "editors"
    || v === "diagnostics"
    || v === "schemas"
    || v === "commands"
  ) {
    options.setScreen(v);
  }
}

/**
 * Prop bundle for {@link renderMcpOpenTuiActiveScreen} (screen routing + shared catalog lookups).
 */
interface McpOpenTuiActiveScreenRenderOptions {
  diagnosticsBody: string;
  inventory: McpShellInventory | null;
  inventoryError: string | null;
  manageEditors: McpCommandCatalogEntry | undefined;
  manageEnv: McpCommandCatalogEntry | undefined;
  manageServers: McpCommandCatalogEntry | undefined;
  mcpValidate: McpCommandCatalogEntry | undefined;
  schemasBody: string;
  screen: McpOpenTuiScreen;
  setScreen: (next: McpOpenTuiScreen) => void;
}

/**
 * Shared layout for Services / Env / Editors routes: catalog preview, inventory load states, back control.
 *
 * @remarks
 * **PURITY:** Presentation-only; inventory fetch is owned by `McpOpenTuiApp` effects.
 */
function renderMcpOpenTuiInventoryListSurface(options: {
  catalogEntry: McpCommandCatalogEntry | undefined;
  fallbackCommandPreview: string;
  formatInventoryText: (inv: McpShellInventory) => string;
  inventory: McpShellInventory | null;
  inventoryError: string | null;
  setScreen: (next: McpOpenTuiScreen) => void;
  title: string;
}): ReactNode {
  const {
    catalogEntry,
    fallbackCommandPreview,
    formatInventoryText,
    inventory,
    inventoryError,
    setScreen,
    title,
  } = options;

  return (
    <box style={{ flexDirection: "column", gap: 1, flexGrow: 1 }}>
      <text>{title}</text>
      <text>
        Command preview:{" "}
        {catalogEntry ? formatMcpCommandPreview(catalogEntry.example) : fallbackCommandPreview}
      </text>
      {inventoryError ? <text>{inventoryError}</text> : null}
      {!inventory && !inventoryError ? <text>Loading inventory…</text> : null}
      {inventory ? (
        <scrollbox style={{ flexGrow: 1, maxHeight: 18 }}>
          <text>{formatInventoryText(inventory)}</text>
        </scrollbox>
      ) : null}
      <tab-select
        options={[{ description: "Back", name: "Menu", value: "menu" }]}
        onSelect={() => {
          setScreen("menu");
        }}
        showDescription={true}
      />
    </box>
  );
}

/**
 * Renders routed OpenTUI panels driven by `screen` (menu, inventory routes, diagnostics, schemas, catalog).
 *
 * @remarks
 * **PURITY:** Presentation-only; async inventory, validation, and schema bodies are owned by `McpOpenTuiApp` hooks.
 */
function renderMcpOpenTuiActiveScreen(options: McpOpenTuiActiveScreenRenderOptions): ReactNode {
  const {
    diagnosticsBody,
    inventory,
    inventoryError,
    manageEditors,
    manageEnv,
    manageServers,
    mcpValidate,
    schemasBody,
    screen,
    setScreen,
  } = options;

  return (
    <>
      {screen === "menu" ? (
        <>
          <text>Select a family (Tab / arrows, Enter). See README for renderer options and env vars.</text>
          <tab-select
            onSelect={(_i, option) => {
              applyMcpOpenTuiMenuSelection({ option, setScreen });
            }}
            options={menuOptions()}
            showDescription={true}
          />
        </>
      ) : null}

      {screen === "services"
        ? renderMcpOpenTuiInventoryListSurface({
          catalogEntry: manageServers,
          fallbackCommandPreview: "mcp-sync manage-servers",
          formatInventoryText: formatInventoryServicesText,
          inventory,
          inventoryError,
          setScreen,
          title: "Services",
        })
        : null}

      {screen === "env"
        ? renderMcpOpenTuiInventoryListSurface({
          catalogEntry: manageEnv,
          fallbackCommandPreview: "mcp-sync manage-env",
          formatInventoryText: formatInventoryEnvText,
          inventory,
          inventoryError,
          setScreen,
          title: "Environment variables",
        })
        : null}

      {screen === "editors"
        ? renderMcpOpenTuiInventoryListSurface({
          catalogEntry: manageEditors,
          fallbackCommandPreview: "mcp-sync manage-editors",
          formatInventoryText: formatInventoryEditorsText,
          inventory,
          inventoryError,
          setScreen,
          title: "Editors",
        })
        : null}

      {screen === "diagnostics" ? (
        <box style={{ flexDirection: "column", gap: 1, flexGrow: 1 }}>
          <text>Diagnostics</text>
          <text>
            Captured output (same engine as {mcpValidate?.example ?? "mcp-sync validate"}):
          </text>
          <scrollbox style={{ flexGrow: 1, maxHeight: 18 }}>
            <text>{diagnosticsBody || "Running validation…"}</text>
          </scrollbox>
          <tab-select
            options={[{ description: "Back", name: "Menu", value: "menu" }]}
            onSelect={() => {
              setScreen("menu");
            }}
            showDescription={true}
          />
        </box>
      ) : null}

      {screen === "schemas" ? (
        <box style={{ flexDirection: "column", gap: 1, flexGrow: 1 }}>
          <text>Schemas</text>
          <text>Read-only JSON Schema sources under scripts/schemas.</text>
          <scrollbox style={{ flexGrow: 1, maxHeight: 18 }}>
            <text>{schemasBody || "Loading…"}</text>
          </scrollbox>
          <tab-select
            options={[{ description: "Back", name: "Menu", value: "menu" }]}
            onSelect={() => {
              setScreen("menu");
            }}
            showDescription={true}
          />
        </box>
      ) : null}

      {screen === "commands" ? (
        <box style={{ flexDirection: "column", gap: 1, flexGrow: 1 }}>
          <text>Command catalog</text>
          <scrollbox style={{ flexGrow: 1, maxHeight: 20 }}>
            <text>{formatCommandCatalogText()}</text>
          </scrollbox>
          <tab-select
            options={[{ description: "Back", name: "Menu", value: "menu" }]}
            onSelect={() => {
              setScreen("menu");
            }}
            showDescription={true}
          />
        </box>
      ) : null}
    </>
  );
}

/**
 * OpenTUI root: menu-driven navigation across MCP inventory, diagnostics, schemas, and catalog text.
 *
 * @remarks
 * **I/O:** loads `loadMcpShellInventory` when screens need live data; runs headless validation helpers for diagnostics.
 */
export function McpOpenTuiApp() {
  const repoRoot = resolveMcpSyncProjectRoot(process.cwd());
  const [screen, setScreen] = useState<McpOpenTuiScreen>("menu");
  const [inventory, setInventory] = useState<McpShellInventory | null>(null);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [diagnosticsBody, setDiagnosticsBody] = useState<string>("");
  const [schemasBody, setSchemasBody] = useState<string>("");

  const needsInventory =
    screen === "services" || screen === "env" || screen === "editors";

  useEffect(() => {
    if (!needsInventory) {
      return;
    }

    let cancelled = false;
    setInventoryError(null);
    loadMcpShellInventory({ projectRoot: repoRoot })
      .then((inv) => {
        if (!cancelled) {
          setInventory(inv);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : String(error);
          setInventoryError(message);
          setInventory(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [needsInventory, repoRoot, screen]);

  useEffect(() => {
    if (screen !== "diagnostics") {
      return;
    }
    const summary = validateMcpConfigFiles(repoRoot);
    setDiagnosticsBody(formatMcpValidationSummaryLines(summary).join("\n"));
  }, [screen, repoRoot]);

  useEffect(() => {
    if (screen !== "schemas") {
      return;
    }
    const blocks = listMcpSchemaDescriptors().map((d) => {
      try {
        const raw = readFileSync(d.absPath, "utf8");
        const clipped = raw.length > 6_000 ? `${raw.slice(0, 6_000)}\n… (truncated)` : raw;
        return `=== ${d.fileName} (${d.schemaKey}) ===\n${clipped}`;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `=== ${d.fileName} ===\n(read error: ${message})`;
      }
    });
    setSchemasBody(blocks.join("\n\n"));
  }, [screen, repoRoot]);

  const manageServers = findMcpCatalogEntry("mcp:manage-servers");
  const manageEnv = findMcpCatalogEntry("mcp:manage-env");
  const manageEditors = findMcpCatalogEntry("mcp:manage-editors");
  const mcpValidate = findMcpCatalogEntry("mcp:validate");

  return (
    <box style={{ flexDirection: "column", flexGrow: 1, gap: 1, padding: 1 }}>
      <text>MCP (OpenTUI) — Bun host; uses shared `scripts` libs (not nested Inquirer).</text>
      <text>Repo root: {repoRoot}</text>

      {renderMcpOpenTuiActiveScreen({
        diagnosticsBody,
        inventory,
        inventoryError,
        manageEditors,
        manageEnv,
        manageServers,
        mcpValidate,
        schemasBody,
        screen,
        setScreen,
      })}
    </box>
  );
}
