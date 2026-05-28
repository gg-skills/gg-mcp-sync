/**
 * @fileoverview Re-exports the MCP server registry used by the config and UI tooling.
 *
 * Flow: server definition modules -> registry barrel -> downstream consumers.
 *
 * @example
 * ```typescript
 * import { servers, getServerById, getServersByIds } from "./servers/index";
 *
 * const firecrawl = getServerById("firecrawl-stdio");
 * const enabled = getServersByIds(["firecrawl-stdio", "firecrawl-http"]);
 * ```
 *
 * @testing Jest unit: npm test
 * @see scripts/ui/shared/load-inventory.ts - Reads the registry to build inventory screens.
 * @documentation reviewed=2026-04-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import type { McpServerTemplate } from "../lib/types";

// stdio servers
import { augmentContextEngineStdio } from "./augment-context-engine-stdio";
import { apifyStdio } from "./apify-stdio";
import { asanaHttpBridgeStdio } from "./asana-http-bridge-stdio";
import { chromeDevtoolsStdio } from "./chrome-devtools-stdio";
import { firecrawlStdio } from "./firecrawl-stdio";
import { mongodbStdioServer } from "./mongodb-stdio";
import { playwrightStdio } from "./playwright-stdio";
import { puppeteerStdio } from "./puppeteer-stdio";
import { serenaStdio } from "./serena-stdio";
import { zaiVisionStdio } from "./zai-vision-stdio";

import { apifyHttp } from "./apify-http";
import { firecrawlHttp } from "./firecrawl-http";
import { zaiWebReaderHttp } from "./zai-web-reader-http";
import { zaiWebSearchHttp } from "./zai-web-search-http";
import { zaiZreadHttp } from "./zai-zread-http";

/**
 * All MCP server definitions.
 */
export const servers: McpServerTemplate[] = [
  // stdio servers
  augmentContextEngineStdio,
  apifyStdio,
  asanaHttpBridgeStdio,
  chromeDevtoolsStdio,
  firecrawlStdio,
  mongodbStdioServer,
  playwrightStdio,
  puppeteerStdio,
  serenaStdio,
  zaiVisionStdio,
  // http servers
  apifyHttp,
  firecrawlHttp,
  zaiWebReaderHttp,
  zaiWebSearchHttp,
  zaiZreadHttp,
];

/**
 * Get all server IDs (for clearing managed servers before applying new config).
 */
export function getAllServerIds(): string[] {
  return Array.from(
    new Set(
      servers.flatMap((server) => [server.id, ...(server.legacyIds ?? [])])
    )
  );
}

/**
 * Get a server by ID.
 */
export function getServerById(id: string): McpServerTemplate | undefined {
  return servers.find((s) => s.id === id);
}

/**
 * Get all stdio servers.
 */
export function getStdioServers(): McpServerTemplate[] {
  return servers.filter((s) => s.transport === "stdio");
}

/**
 * Get all http servers.
 */
export function getHttpServers(): McpServerTemplate[] {
  return servers.filter((s) => s.transport === "http");
}

/**
 * Return the server definitions whose IDs match the provided list.
 */
export function getServersByIds(ids: string[]): McpServerTemplate[] {
  return servers.filter((s) => ids.includes(s.id));
}

/**
 * Get all unique environment variables required by servers.
 */
export function getAllEnvVars(): string[] {
  const vars = new Set<string>();
  for (const server of servers) {
    for (const v of server.envVars) {
      vars.add(v);
    }
  }
  return Array.from(vars).sort();
}

/**
 * Get environment variables required by specific servers.
 */
export function getEnvVarsForServers(serverIds: string[]): Map<string, string[]> {
  const result = new Map<string, string[]>();

  for (const id of serverIds) {
    const server = getServerById(id);
    if (server) {
      for (const varName of server.envVars) {
        const existing = result.get(varName) ?? [];
        existing.push(id);
        result.set(varName, existing);
      }
    }
  }

  return result;
}

// =============================================================================
// Multi-Transport Server Utilities
// =============================================================================

/**
 * Extract the base service name from a server ID.
 *
 * Server IDs follow the pattern: `{service}-{transport}`
 * Examples:
 * - "firecrawl-stdio" → "firecrawl"
 * - "firecrawl-http" → "firecrawl"
 *
 * @param serverId - The full server ID
 * @returns The base service name without transport suffix
 */
export function getServiceName(serverId: string): string {
  if (serverId === "asana-http-bridge-stdio") {
    return "asana";
  }

  // Remove known transport suffixes
  if (serverId.endsWith("-stdio")) {
    return serverId.slice(0, -6);
  }
  if (serverId.endsWith("-http")) {
    return serverId.slice(0, -5);
  }
  return serverId;
}

/**
 * Group servers by their base service name.
 *
 * This is useful for UI display where both transports of the same
 * service should be shown together.
 *
 * @returns Map from service name to array of server templates
 */
export function getServersByService(): Map<string, McpServerTemplate[]> {
  const grouped = new Map<string, McpServerTemplate[]>();

  for (const server of servers) {
    const serviceName = getServiceName(server.id);
    const existing = grouped.get(serviceName) ?? [];
    existing.push(server);
    grouped.set(serviceName, existing);
  }

  return grouped;
}

/**
 * Check if a service has multiple transport options.
 *
 * @param serviceName - The base service name (e.g., "firecrawl")
 * @returns True if both stdio and http variants exist
 */
export function hasMultipleTransports(serviceName: string): boolean {
  const variants = servers.filter((s) => getServiceName(s.id) === serviceName);
  const transports = new Set(variants.map((s) => s.transport));
  return transports.size > 1;
}

/**
 * Get all transport variants for a service.
 *
 * @param serviceName - The base service name (e.g., "firecrawl")
 * @returns Array of server templates for this service
 */
export function getServiceVariants(serviceName: string): McpServerTemplate[] {
  return servers.filter((s) => getServiceName(s.id) === serviceName);
}

/**
 * Filter servers to only those compatible with stdio-only editors.
 *
 * Use this when writing configs for editors that don't support HTTP transport
 * (e.g., Codex CLI, Amp CLI, Goose CLI).
 *
 * @param serverList - Array of servers to filter
 * @returns Only stdio servers from the input list
 */
export function filterStdioOnly(serverList: McpServerTemplate[]): McpServerTemplate[] {
  return serverList.filter((s) => s.transport === "stdio");
}

/**
 * Filter servers to only HTTP transport.
 *
 * @param serverList - Array of servers to filter
 * @returns Only HTTP servers from the input list
 */
export function filterHttpOnly(serverList: McpServerTemplate[]): McpServerTemplate[] {
  return serverList.filter((s) => s.transport === "http");
}

/**
 * Get enabled server IDs based on service preferences.
 *
 * Converts service preferences (e.g., "firecrawl" -> "prefer-stdio") into
 * a list of enabled server IDs (e.g., ["firecrawl-stdio", "firecrawl-http"]).
 *
 * @param preferences - Map of service name to transport preference
 * @returns Array of enabled server IDs
 */
export function getEnabledServersFromPreferences(
  preferences: Record<string, { preference: string }>
): string[] {
  const enabled: string[] = [];

  for (const [serviceName, { preference }] of Object.entries(preferences)) {
    if (preference === "disabled") continue;

    const variants = getServiceVariants(serviceName);
    const stdioVariant = variants.find((s) => s.transport === "stdio");
    const httpVariant = variants.find((s) => s.transport === "http");

    switch (preference) {
      case "stdio-only":
        if (stdioVariant) enabled.push(stdioVariant.id);
        break;
      case "http-only":
        if (httpVariant) enabled.push(httpVariant.id);
        break;
      case "prefer-stdio":
        // Both enabled, stdio first
        if (stdioVariant) enabled.push(stdioVariant.id);
        if (httpVariant) enabled.push(httpVariant.id);
        break;
      case "prefer-http":
        // Both enabled, http first
        if (httpVariant) enabled.push(httpVariant.id);
        if (stdioVariant) enabled.push(stdioVariant.id);
        break;
    }
  }

  return enabled;
}

/**
 * Get servers for a specific editor based on service preferences and editor capability.
 *
 * This function selects ONE transport per service based on:
 * - The service preference (prefer-http, prefer-stdio, http-only, stdio-only)
 * - Whether the editor supports HTTP transport
 *
 * Behavior:
 * - "stdio-only": All editors get stdio
 * - "http-only": HTTP-capable editors get HTTP, stdio-only editors skip this service
 * - "prefer-stdio": All editors get stdio (preferred transport)
 * - "prefer-http": HTTP-capable editors get HTTP, stdio-only editors get stdio (fallback)
 *
 * @param preferences - Map of service name to transport preference
 * @param editorSupportsHttp - Whether the target editor supports HTTP transport
 * @returns Array of server templates for this editor
 */
export function getServersForEditor(
  preferences: Record<string, { preference: string }>,
  editorSupportsHttp: boolean
): McpServerTemplate[] {
  const result: McpServerTemplate[] = [];

  for (const [serviceName, { preference }] of Object.entries(preferences)) {
    if (preference === "disabled") continue;

    const variants = getServiceVariants(serviceName);
    const stdioVariant = variants.find((s) => s.transport === "stdio");
    const httpVariant = variants.find((s) => s.transport === "http");

    switch (preference) {
      case "stdio-only":
        // All editors get stdio
        if (stdioVariant) result.push(stdioVariant);
        break;

      case "http-only":
        // HTTP-capable editors get HTTP, stdio-only editors skip.
        if (editorSupportsHttp && httpVariant) {
          result.push(httpVariant);
        }
        break;

      case "prefer-stdio":
        // All editors get stdio (it's the preferred transport)
        if (stdioVariant) result.push(stdioVariant);
        break;

      case "prefer-http":
        // HTTP-capable editors get HTTP, stdio-only editors get stdio as fallback.
        if (editorSupportsHttp && httpVariant) {
          result.push(httpVariant);
        } else if (stdioVariant) {
          result.push(stdioVariant);
        }
        break;
    }
  }

  return result;
}

/**
 * Infer service preference from enabled server IDs.
 *
 * Used to migrate from legacy enabledServers format to servicePreferences.
 *
 * @param enabledServerIds - Array of enabled server IDs
 * @param serviceName - Base service name
 * @returns Inferred transport preference
 */
export function inferPreferenceFromEnabled(
  enabledServerIds: string[],
  serviceName: string
): "disabled" | "stdio-only" | "http-only" | "prefer-stdio" | "prefer-http" {
  const stdioId = `${serviceName}-stdio`;
  const httpId = `${serviceName}-http`;

  const hasStdio = enabledServerIds.includes(stdioId);
  const hasHttp = enabledServerIds.includes(httpId);

  if (hasStdio && hasHttp) {
    // Both enabled - check order to determine preference
    const stdioIndex = enabledServerIds.indexOf(stdioId);
    const httpIndex = enabledServerIds.indexOf(httpId);
    return stdioIndex < httpIndex ? "prefer-stdio" : "prefer-http";
  }
  if (hasStdio) return "stdio-only";
  if (hasHttp) return "http-only";
  return "disabled";
}

// Re-export individual servers for direct imports
export {
  augmentContextEngineStdio,
  apifyStdio,
  apifyHttp,
  asanaHttpBridgeStdio,
  firecrawlStdio,
  firecrawlHttp,
  mongodbStdioServer,
  playwrightStdio,
  puppeteerStdio,
  serenaStdio,
  zaiVisionStdio,
  zaiWebReaderHttp,
  zaiWebSearchHttp,
  zaiZreadHttp,
};
