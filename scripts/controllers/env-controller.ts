/**
 * @fileoverview Loads MCP env state, ensures the template exists, and records managed variable status.
 *
 * Flow: env file and state file -> managed variable inventory -> template creation and persisted env updates.
 *
 * @testing Jest unit: npm test -- scripts/controllers/env-controller.unit.test.ts
 * @see scripts/manage-env.ts - CLI entrypoint that invokes the env controller.
 * @see scripts/ui/cli-ink/app.tsx - Ink surface that renders the managed env-variable inventory.
 * @documentation reviewed=2026-04-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */
import { join } from "path";
import {
  createEnvTemplate,
  ENV_EXAMPLE_FILE_NAME,
  ENV_FILE_NAME,
  getEnvVarStatus,
  maskSecret,
  readEnvFile,
  updateEnvFileVar,
} from "../lib/env";
import { fileExists } from "../lib/file-utils";
import {
  markModified,
  readState,
  STATE_FILE_NAME,
  updateEnvVarsState,
  writeState,
} from "../lib/state";
import type { EnvVars, McpState, Result } from "../lib/types";
import { getEnvVarsForServers, servers } from "../servers";

/**
 * Describes a single managed environment variable's status and usage.
 */
export interface McpManagedEnvVarInfo {
  name: string;
  /** Server IDs that require this variable */
  usedBy: string[];
  status: "set" | "empty" | "missing";
  /** Masked display value: shows first/last 4 chars for set values, "(empty)" or "(unset)" otherwise */
  maskedValue: string;
}

/**
 * Fully loaded inputs for env management UIs and persistence helpers.
 *
 * @remarks
 * `variables` merges server env requirements with current `.mcp-sync/env` values for masked display and prompts.
 */
export interface McpEnvControllerContext {
  projectRoot: string;
  envFilePath: string;
  envExamplePath: string;
  stateFilePath: string;
  env: EnvVars;
  state: McpState;
  variables: McpManagedEnvVarInfo[];
}

/**
 * Ensure the .mcp-sync/env.example template exists, creating it if absent.
 *
 * @param envExamplePath - Absolute path to the .mcp-sync/env.example file
 * @returns Result with data=true if the file already existed, data=false if created
 *
 * @remarks
 * Idempotent: returns success with data=false if the file already exists.
 * Calls createEnvTemplate() to generate the file content. Used during first-run
 * setup to ensure users have a template to copy and fill in.
 */
export async function ensureMcpEnvTemplate(
  envExamplePath: string
): Promise<Result<boolean, string>> {
  if (fileExists(envExamplePath)) {
    return { success: true, data: false };
  }

  const templateResult = await createEnvTemplate(envExamplePath);
  if (!templateResult.success) {
    return {
      success: false,
      error: `Failed to create template: ${templateResult.error}`,
    };
  }

  return { success: true, data: true };
}

/**
 * Build the managed env-var inventory from current env content and server requirements.
 *
 * @param env - Parsed .mcp-sync/env content
 * @returns Array of managed variable descriptors sorted alphabetically by name
 *
 * @remarks
 * Cross-references all server templates to determine which variables are managed,
 * then checks the current env content to determine status (set/empty/missing).
 * The maskedValue field is safe for display: secrets are partially redacted,
 * and unset/empty states show descriptive labels.
 */
export function buildManagedEnvVarInfo(env: EnvVars): McpManagedEnvVarInfo[] {
  const allServerIds = servers.map((server) => server.id);
  const envVarMap = getEnvVarsForServers(allServerIds);

  return Array.from(envVarMap.entries())
    .map(([name, usedBy]) => {
      const status = getEnvVarStatus(env, name);
      const currentValue = env[name];
      return {
        name,
        usedBy,
        status,
        maskedValue:
          status === "set" && currentValue
            ? maskSecret(currentValue)
            : status === "empty"
              ? "(empty)"
              : "(unset)",
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * Load the shared context needed for env management operations.
 *
 * @param projectRoot - Absolute path to the project root
 * @returns Result containing the env controller context or an error string
 *
 * @remarks
 * Reads state and env files, then builds the managed variable inventory.
 * The inventory is built from all server templates' envVar requirements.
 * Also ensures the .mcp-sync/env.example template exists (creating it if absent).
 */
export async function loadEnvControllerContext(
  projectRoot: string
): Promise<Result<McpEnvControllerContext, string>> {
  const envFilePath = join(projectRoot, ENV_FILE_NAME);
  const envExamplePath = join(projectRoot, ENV_EXAMPLE_FILE_NAME);
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

  return {
    success: true,
    data: {
      projectRoot,
      envFilePath,
      envExamplePath,
      stateFilePath,
      env: envResult.data,
      state: stateResult.data,
      variables: buildManagedEnvVarInfo(envResult.data),
    },
  };
}

/**
 * Update a single managed environment variable in both the .env file and state file.
 *
 * @param envFilePath - Absolute path to .mcp-sync/env
 * @param stateFilePath - Absolute path to .mcp-sync/state.json
 * @param state - Current MCP state
 * @param env - Current parsed env variables
 * @param variableName - Name of the variable to update
 * @param value - New value (empty string clears the variable)
 * @returns Result containing the updated state and env on success
 *
 * @remarks
 * Writes the new value to .mcp-sync/env using updateEnvFileVar(), then updates
 * the state to record that the variable is set (or unset if value is empty).
 * The state file is updated with lastModifiedBy="manage-env". Returns
 * success=false with an error string if either write fails.
 */
export async function saveManagedEnvVar(
  envFilePath: string,
  stateFilePath: string,
  state: McpState,
  env: EnvVars,
  variableName: string,
  value: string
): Promise<Result<{ state: McpState; env: EnvVars }, string>> {
  const updateResult = await updateEnvFileVar(envFilePath, variableName, value);
  if (!updateResult.success) {
    return {
      success: false,
      error: `Failed to update env file: ${updateResult.error}`,
    };
  }

  const nextEnv = {
    ...env,
    [variableName]: value,
  };
  const nextState = markModified(
    updateEnvVarsState(state, { [variableName]: value.length > 0 }),
    "manage-env"
  );
  const saveResult = await writeState(stateFilePath, nextState);
  if (!saveResult.success) {
    return {
      success: false,
      error: `Failed to write state: ${saveResult.error}`,
    };
  }

  return {
    success: true,
    data: {
      state: nextState,
      env: nextEnv,
    },
  };
}
