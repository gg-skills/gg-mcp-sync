/**
 * @fileoverview Loads MCP service preferences and builds the managed service inventory for UI and CLI flows.
 *
 * Flow: enabled-server state and env vars -> service info inventory -> preference changes and persisted state.
 *
 * @testing Jest unit: npm test -- scripts/controllers/services-controller.unit.test.ts
 * @see scripts/manage-servers.ts - CLI entrypoint that invokes this services controller.
 * @see scripts/ui/cli-ink/app.tsx - Ink surface that renders managed service state and preference changes.
 * @documentation reviewed=2026-04-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */
import { join } from "path";
import { ENV_FILE_NAME, getEnvVarStatus, readEnvFile } from "../lib/env";
import { markModified, readState, STATE_FILE_NAME, writeState } from "../lib/state";
import type { EnvVars, McpState, Result, TransportPreference } from "../lib/types";
import {
  getEnabledServersFromPreferences,
  getServersByService,
  inferPreferenceFromEnabled,
  servers,
} from "../servers";

/** Rich service info for the managed service inventory: transports, preference, env vars, and missing env var list. */
export interface McpManagedServiceInfo {
  name: string;
  hasStdio: boolean;
  hasHttp: boolean;
  stdioPackage: string | null;
  httpUrl: string | null;
  currentPreference: TransportPreference;
  envVars: string[];
  missingEnvVars: string[];
}

/** Controller context assembled once at startup: project paths, env/state, and the resolved service list. */
export interface McpServiceControllerContext {
  projectRoot: string;
  envFilePath: string;
  stateFilePath: string;
  env: EnvVars;
  state: McpState;
  services: McpManagedServiceInfo[];
}

/** A single service preference transition captured for the change summary. */
export interface McpServicePreferenceChangeSummary {
  serviceName: string;
  previousPreference: TransportPreference;
  nextPreference: TransportPreference;
}

/** Resolves per-service McpManagedServiceInfo from the current state and environment. */
export function buildManagedServiceInfo(
  state: McpState,
  env: EnvVars
): McpManagedServiceInfo[] {
  const serviceMap = getServersByService();
  const serviceInfo: McpManagedServiceInfo[] = [];

  for (const [serviceName, variants] of serviceMap.entries()) {
    const stdioServer = variants.find((variant) => variant.transport === "stdio");
    const httpServer = variants.find((variant) => variant.transport === "http");
    const envVars = Array.from(
      new Set(variants.flatMap((variant) => variant.envVars))
    ).sort((left, right) => left.localeCompare(right));
    const missingEnvVars = envVars.filter((varName) => {
      return getEnvVarStatus(env, varName) !== "set";
    });

    const currentPreference = state.servicePreferences?.[serviceName]?.preference
      ?? inferPreferenceFromEnabled(state.enabledServers, serviceName);

    serviceInfo.push({
      name: serviceName,
      hasStdio: Boolean(stdioServer),
      hasHttp: Boolean(httpServer),
      stdioPackage: stdioServer?.package ?? null,
      httpUrl: httpServer?.url ?? null,
      currentPreference,
      envVars,
      missingEnvVars,
    });
  }

  return serviceInfo.sort((left, right) => left.name.localeCompare(right.name));
}

/** Initializes `servicePreferences` on state from `enabledServers` if not already present. */
export function initializeServicePreferences(state: McpState): McpState {
  if (state.servicePreferences) {
    return state;
  }

  const servicePreferences: NonNullable<McpState["servicePreferences"]> = {};
  const serviceNames = Array.from(getServersByService().keys());

  for (const serviceName of serviceNames) {
    const inferredPreference = inferPreferenceFromEnabled(state.enabledServers, serviceName);
    if (inferredPreference !== "disabled") {
      servicePreferences[serviceName] = {
        preference: inferredPreference,
        lastModified: new Date().toISOString(),
      };
    }
  }

  return {
    ...state,
    servicePreferences,
  };
}

/** Maps a preference change map to per-service summary records with previous/next preference values. */
export function summarizeServicePreferenceChanges(
  services: McpManagedServiceInfo[],
  changes: Record<string, TransportPreference>
): McpServicePreferenceChangeSummary[] {
  return Object.entries(changes).map(([serviceName, nextPreference]) => {
    const matchingService = services.find((service) => service.name === serviceName);
    return {
      serviceName,
      previousPreference: matchingService?.currentPreference ?? "disabled",
      nextPreference,
    };
  });
}

/**
 * Applies a preference change map to state: updates servicePreferences and recomputes enabledServers.
 * Initializes preferences if not yet set before applying changes.
 */
export function applyServicePreferenceChangesToState(
  state: McpState,
  changes: Record<string, TransportPreference>
): McpState {
  const nextState = initializeServicePreferences(state);
  const nextServicePreferences = {
    ...(nextState.servicePreferences ?? {}),
  };

  for (const [serviceName, nextPreference] of Object.entries(changes)) {
    if (nextPreference === "disabled") {
      delete nextServicePreferences[serviceName];
      continue;
    }

    nextServicePreferences[serviceName] = {
      preference: nextPreference,
      lastModified: new Date().toISOString(),
    };
  }

  return {
    ...nextState,
    servicePreferences: nextServicePreferences,
    enabledServers: getEnabledServersFromPreferences(nextServicePreferences),
  };
}

/**
 * Loads env, state, and resolves the managed service list into a controller context.
 * Initializes service preferences if absent from state before assembling the context.
 */
export async function loadServiceControllerContext(
  projectRoot: string
): Promise<Result<McpServiceControllerContext, string>> {
  const envFilePath = join(projectRoot, ENV_FILE_NAME);
  const stateFilePath = join(projectRoot, STATE_FILE_NAME);

  const stateResult = await readState(stateFilePath);
  if (!stateResult.success) {
    return {
      success: false,
      error: `Failed to read state: ${stateResult.error}`,
    };
  }

  const envResult = await readEnvFile(envFilePath);
  if (!envResult.success) {
    return {
      success: false,
      error: `Failed to read env file: ${envResult.error}`,
    };
  }

  const state = initializeServicePreferences(stateResult.data);
  const services = buildManagedServiceInfo(state, envResult.data);

  return {
    success: true,
    data: {
      projectRoot,
      envFilePath,
      stateFilePath,
      env: envResult.data,
      state,
      services,
    },
  };
}

/**
 * Applies preference changes to state, marks the state as modified by "manage-servers", and writes it to `stateFilePath`.
 * Returns the updated state on success or an error result on failure.
 */
export async function saveServicePreferenceChanges(
  stateFilePath: string,
  state: McpState,
  changes: Record<string, TransportPreference>
): Promise<Result<McpState, string>> {
  const nextState = markModified(
    applyServicePreferenceChangesToState(state, changes),
    "manage-servers"
  );
  const saveResult = await writeState(stateFilePath, nextState);
  if (!saveResult.success) {
    return {
      success: false,
      error: `Failed to save state: ${saveResult.error}`,
    };
  }

  return {
    success: true,
    data: nextState,
  };
}

/** Returns all managed service names (deduplicated, sorted) from the server registry. */
export function getAllManagedServiceNames(): string[] {
  return Array.from(
    new Set(servers.map((server) => server.id.replace(/-(stdio|http)$/, "")))
  ).sort((left, right) => left.localeCompare(right));
}
