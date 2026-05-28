/**
 * @fileoverview Maps managed MCP services to catalog metadata and semantic code search capabilities.
 *
 * Flow: registry service ids + catalog metadata -> managed service descriptors and search routing.
 *
 * @example
 * ```typescript
 * const ids = listManagedServiceIds();
 * ```
 *
 * @testing Jest unit: npm test
 * @see scripts/servers/index.ts - Supplies the service registry checked against this catalog.
 * @see scripts/ui/cli-opentui/app.tsx - Displays the catalog in the OpenTUI shell.
 * @documentation reviewed=2026-04-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import type { TransportPreference } from "../lib/types";

/** Describes a semantic code search capability for a managed service. */
export type SemanticCodeSearchCapability = {
  guidanceLabel: string;
  toolName: string;
};

/** Descriptor for a managed MCP service: display name, id, and optional semantic code search capability. */
export type ManagedServiceDescriptor = {
  displayName: string;
  id: string;
  semanticCodeSearch?: SemanticCodeSearchCapability;
};

/** Result of resolving a semantic code search: either a provider with its tool or a fallback to `rg`. */
export type SemanticCodeSearchResolution =
  | {
      fallback: "rg";
      kind: "fallback";
    }
  | {
      fallback: "rg";
      guidanceLabel: string;
      kind: "provider";
      serviceId: string;
      toolName: string;
    };

/**
 * Canonical managed-service catalog keyed by stable service ids shared across UI and preference state.
 *
 * @remarks
 * Transport-specific MCP server ids still live under `scripts/servers/`; this map is the human-facing grouping layer.
 */
export const managedServiceCatalog = {
  "apify": {
    displayName: "Apify",
    id: "apify",
  },
  "asana": {
    displayName: "Asana",
    id: "asana",
  },
  "augment-context-engine": {
    displayName: "Augment Context Engine",
    id: "augment-context-engine",
    semanticCodeSearch: {
      guidanceLabel: "Augment codebase retrieval",
      toolName: "codebase-retrieval",
    },
  },
  "chrome-devtools": {
    displayName: "Chrome DevTools",
    id: "chrome-devtools",
  },
  "firecrawl": {
    displayName: "Firecrawl",
    id: "firecrawl",
  },
  "mongodb": {
    displayName: "MongoDB",
    id: "mongodb",
  },
  "playwright": {
    displayName: "Playwright",
    id: "playwright",
  },
  "puppeteer": {
    displayName: "Puppeteer",
    id: "puppeteer",
  },
  "serena": {
    displayName: "Serena",
    id: "serena",
    semanticCodeSearch: {
      guidanceLabel: "Serena semantic code navigation",
      toolName: "serena",
    },
  },
  "zai-vision": {
    displayName: "Z.AI Vision",
    id: "zai-vision",
  },
  "zai-web-reader": {
    displayName: "Z.AI Web Reader",
    id: "zai-web-reader",
  },
  "zai-web-search": {
    displayName: "Z.AI Web Search",
    id: "zai-web-search",
  },
  "zai-zread": {
    displayName: "Z.AI ZRead",
    id: "zai-zread",
  },
} as const satisfies Record<string, ManagedServiceDescriptor>;

const managedServiceEntries: ManagedServiceDescriptor[] =
  Object.values(managedServiceCatalog);

const managedServiceIdSet = new Set<string>(Object.keys(managedServiceCatalog));

const semanticCodeSearchServiceIdSet = new Set<string>(
  Object.entries(managedServiceCatalog)
    .filter(([, descriptor]) => descriptor.semanticCodeSearch !== undefined)
    .map(([serviceId]) => serviceId)
);

/** All known managed service IDs inferred from the catalog. */
export type ManagedServiceId = keyof typeof managedServiceCatalog;

/**
 * Materializes catalog rows as a mutable array for UI surfaces that need stable ordering.
 *
 * @remarks
 * Prefer `listManagedServiceIds()` when callers only need ids; this allocates a fresh array on each call.
 */
export function getManagedServiceDescriptors(): ManagedServiceDescriptor[] {
  return [...managedServiceEntries];
}

/** Returns all managed service IDs sorted alphabetically. */
export function listManagedServiceIds(): ManagedServiceId[] {
  return Object.keys(managedServiceCatalog).sort() as ManagedServiceId[];
}

/** Type predicate that narrows a string to `ManagedServiceId` if it is a known catalog ID. */
export function isManagedServiceId(value: string): value is ManagedServiceId {
  return managedServiceIdSet.has(value);
}

/** Returns the descriptor for a service ID, or `undefined` if not found in the catalog. */
export function getManagedServiceDescriptor(
  serviceId: string
): ManagedServiceDescriptor | undefined {
  if (!isManagedServiceId(serviceId)) {
    return undefined;
  }
  return managedServiceCatalog[serviceId];
}

/** Returns true if `serviceId` has a semantic code search capability in the catalog. */
export function isSemanticCodeSearchServiceId(serviceId: string): boolean {
  return semanticCodeSearchServiceIdSet.has(serviceId);
}

/** Returns all managed service IDs that have a semantic code search capability. */
export function listSemanticCodeSearchServiceIds(): ManagedServiceId[] {
  return Array.from(semanticCodeSearchServiceIdSet).sort() as ManagedServiceId[];
}

/**
 * Reads the stored transport preference for a service, or `"disabled"` if not present.
 * @param preferences - The servicePreferences map from MCP state.
 * @param serviceId - The service to look up.
 */
export function getServicePreference(
  preferences: Record<string, { preference: TransportPreference } | undefined> | undefined,
  serviceId: string
): TransportPreference {
  return preferences?.[serviceId]?.preference ?? "disabled";
}

/**
 * Resolves a semantic code search tool by scanning `providerOrder` and returning the first enabled
 * provider with a semantic code search capability, or the `rg` fallback if none are enabled.
 */
export function resolveSemanticCodeSearch(options: {
  fallback: "rg";
  providerOrder: readonly string[];
  services: Record<string, { preference: TransportPreference } | undefined> | undefined;
}): SemanticCodeSearchResolution {
  for (const serviceId of options.providerOrder) {
    if (!isSemanticCodeSearchServiceId(serviceId)) {
      continue;
    }

    const descriptor = getManagedServiceDescriptor(serviceId);
    if (!descriptor?.semanticCodeSearch) {
      continue;
    }

    if (getServicePreference(options.services, serviceId) === "disabled") {
      continue;
    }

    return {
      fallback: options.fallback,
      guidanceLabel: descriptor.semanticCodeSearch.guidanceLabel,
      kind: "provider",
      serviceId,
      toolName: descriptor.semanticCodeSearch.toolName,
    };
  }

  return {
    fallback: options.fallback,
    kind: "fallback",
  };
}
