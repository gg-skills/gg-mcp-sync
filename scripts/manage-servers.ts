#!/usr/bin/env -S npx tsx
/**
 * @fileoverview Manages which MCP servers are enabled in the project state.
 *
 * Flow: project root + server registry + saved state -> interactive server selection flow.
 *
 * @example
 * ```typescript
 * const command = "mcp-sync manage-servers";
 * ```
 *
 * @testing Manual CLI: mcp-sync manage-servers
 * @see scripts/ui/cli-ink/app.tsx - The Ink shell that can launch server management.
 * @see scripts/ui/cli-interactive/main.ts - The interactive console that can launch server management.
 * @documentation reviewed=2026-04-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import type { TransportPreference } from "./lib/types";
import {
  loadServiceControllerContext,
  saveServicePreferenceChanges,
  summarizeServicePreferenceChanges,
} from "./controllers/services-controller";
import {
  displayHeader,
  displaySection,
  displaySuccess,
  displayInfo,
  displayError,
  promptConfirm,
  colors,
} from "./lib/prompts";
import { select } from "@inquirer/prompts";
import { resolveMcpSyncProjectRoot } from "./lib/project-root";

/**
 * Format preference for display.
 */
function formatPreference(pref: TransportPreference): string {
  switch (pref) {
    case "disabled":
      return colors.dim("disabled");
    case "stdio-only":
      return colors.stdio("stdio only");
    case "http-only":
      return colors.http("http only");
    case "prefer-stdio":
      return `${colors.stdio("stdio")} + ${colors.http("http")} (prefer stdio)`;
    case "prefer-http":
      return `${colors.http("http")} + ${colors.stdio("stdio")} (prefer http)`;
    default:
      return pref;
  }
}

/**
 * Get available transport options for a service.
 */
function getTransportOptions(
  service: {
    hasStdio: boolean;
    hasHttp: boolean;
    stdioPackage: string | null;
    httpUrl: string | null;
  }
): Array<{ name: string; value: TransportPreference; description?: string }> {
  const options: Array<{ name: string; value: TransportPreference; description?: string }> = [];

  // Always have disabled option
  options.push({
    name: "Disabled",
    value: "disabled",
    description: "Do not use this service",
  });

  // Single transport services
  if (service.hasStdio && !service.hasHttp) {
    options.push({
      name: "Enabled (stdio)",
      value: "stdio-only",
      description: `Local process via ${service.stdioPackage || "npx"}`,
    });
    return options;
  }

  if (service.hasHttp && !service.hasStdio) {
    options.push({
      name: "Enabled (http)",
      value: "http-only",
      description: `Cloud API at ${service.httpUrl || "remote endpoint"}`,
    });
    return options;
  }

  // Multi-transport services
  if (service.hasStdio && service.hasHttp) {
    options.push({
      name: "stdio only",
      value: "stdio-only",
      description: `Local process only (${service.stdioPackage || "npx"})`,
    });
    options.push({
      name: "http only",
      value: "http-only",
      description: `Cloud API only (${service.httpUrl || "remote"})`,
    });
    options.push({
      name: "Prefer stdio",
      value: "prefer-stdio",
      description: "Both enabled; stdio used when editor supports only one",
    });
    options.push({
      name: "Prefer http",
      value: "prefer-http",
      description: "Both enabled; http used when editor supports only one",
    });
  }

  return options;
}

// =============================================================================
// Main
// =============================================================================

/**
 * Interactive CLI entry: load service preferences, edit transports, persist state.
 *
 * @remarks
 * Resolves the target project root. Calls controller load/save and may call
 * `process.exit(1)` when context load or save fails instead of throwing to the outer
 * `.catch` handler.
 */
async function main(): Promise<void> {
  const projectRoot = resolveMcpSyncProjectRoot(process.cwd());

  displayHeader("MCP Services");

  const contextResult = await loadServiceControllerContext(projectRoot);
  if (!contextResult.success) {
    console.error(contextResult.error);
    process.exit(1);
  }
  let { state, services, stateFilePath } = contextResult.data;

  // Display current status
  displaySection("Current Configuration");
  console.log("");
  for (const service of services) {
    const prefLabel = formatPreference(service.currentPreference);
    const transports: string[] = [];
    if (service.hasStdio) transports.push(colors.stdio("stdio"));
    if (service.hasHttp) transports.push(colors.http("http"));

    const envStatus = service.missingEnvVars.length > 0
      ? colors.red(`✗ Missing: ${service.missingEnvVars.join(", ")}`)
      : service.envVars.length > 0
        ? colors.green("✓ Env ready")
        : colors.dim("(no env needed)");

    console.log(`  ${colors.bold(service.name)} [${transports.join("/")}]`);
    console.log(`    Status: ${prefLabel}`);
    console.log(`    ${envStatus}`);
    console.log("");
  }

  // Interactive configuration
  displaySection("Configure Services");
  console.log("Select a service to configure, or 'Done' to save changes.\n");

  const changes: Record<string, TransportPreference> = {};
  let done = false;

  while (!done) {
    // Build selection choices
    const choices = services.map((s) => {
      const currentPref = changes[s.name] ?? s.currentPreference;
      const prefLabel = formatPreference(currentPref);
      const changed = changes[s.name] !== undefined ? colors.yellow(" (changed)") : "";
      return {
        name: `${s.name}: ${prefLabel}${changed}`,
        value: s.name,
      };
    });

    choices.push({ name: colors.green("─── Done (save changes) ───"), value: "__done__" });
    choices.push({ name: colors.dim("─── Cancel ───"), value: "__cancel__" });

    const selected = await select({
      message: "Select service to configure:",
      choices,
      pageSize: 15,
    });

    if (selected === "__done__") {
      done = true;
      continue;
    }

    if (selected === "__cancel__") {
      displayInfo("Cancelled. No changes saved.");
      return;
    }

    // Configure selected service
    const service = services.find((s) => s.name === selected)!;
    const options = getTransportOptions(service);
    const currentPref = changes[service.name] ?? service.currentPreference;

    // Check for missing env vars
    if (service.missingEnvVars.length > 0) {
      console.log("");
      displayError(`Missing environment variables: ${service.missingEnvVars.join(", ")}`);
      console.log("  Run 'mcp-sync manage-env' first to configure them.");
      console.log("");

      const proceed = await promptConfirm("Configure anyway (will fail on apply)?", false);
      if (!proceed) continue;
    }

    const newPref = await select({
      message: `Transport for ${service.name}:`,
      choices: options.map((o) => ({
        name: o.name + (o.description ? colors.dim(` — ${o.description}`) : ""),
        value: o.value,
      })),
      default: currentPref,
    });

    if (newPref !== service.currentPreference) {
      changes[service.name] = newPref;
    } else {
      // Remove from changes if reverted to original
      delete changes[service.name];
    }
  }

  if (Object.keys(changes).length === 0) {
    displayInfo("No changes to save.");
    return;
  }

  displaySection("Changes to Apply");
  const changeSummaries = summarizeServicePreferenceChanges(services, changes);
  for (const change of changeSummaries) {
    const oldLabel = formatPreference(change.previousPreference);
    const newLabel = formatPreference(change.nextPreference);
    console.log(`  ${change.serviceName}: ${oldLabel} → ${newLabel}`);
  }
  console.log("");

  const confirmed = await promptConfirm("Save these changes?", true);
  if (!confirmed) {
    displayInfo("Cancelled.");
    return;
  }

  const saveResult = await saveServicePreferenceChanges(stateFilePath, state, changes);
  if (!saveResult.success) {
    console.error(saveResult.error);
    process.exit(1);
  }
  state = saveResult.data;

  displaySuccess(`Saved! ${state.enabledServers.length} server(s) now enabled.`);
  console.log("\nEnabled servers:");
  for (const id of state.enabledServers) {
    console.log(`  • ${id}`);
  }
  console.log("\nNext: Run 'mcp-sync apply' to update editor configurations.");
}

// Run
main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
