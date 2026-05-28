/**
 * @fileoverview Reads, writes, and validates the `.mcp-sync/env` files used by MCP workflows.
 *
 * Flow: env file content + required vars -> validation and update helpers.
 *
 * @example
 * ```typescript
 * const result = validateEnvVars({ MCP_FIRECRAWL_API_KEY: "token" }, ["MCP_FIRECRAWL_API_KEY"]);
 * ```
 *
 * @testing Jest unit: npm test
 * @see scripts/lib/state.ts - Uses these env helpers when updating shared state.
 * @see scripts/lib/config-writer.ts - Consumes env content generation when writing configs.
 * @documentation reviewed=2026-04-13 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { mkdir, readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { dirname } from "path";
import { parse as parseDotenv } from "dotenv";
import { MCP_SYNC_ENV_EXAMPLE_FILE_NAME, MCP_SYNC_ENV_FILE_NAME } from "./storage-paths";
import type { EnvVars, Result } from "./types";

// =============================================================================
// Constants
// =============================================================================

/** Default MCP Sync dotenv file path, relative to the target project root. */
export const ENV_FILE_NAME = MCP_SYNC_ENV_FILE_NAME;
/** Default MCP Sync dotenv template path, relative to the target project root. */
export const ENV_EXAMPLE_FILE_NAME = MCP_SYNC_ENV_EXAMPLE_FILE_NAME;

// =============================================================================
// Types
// =============================================================================

/** Validation summary for required MCP environment variables. */
export interface EnvValidationResult {
  isValid: boolean;
  missingVars: string[];
  setVars: string[];
  emptyVars: string[];
}

// =============================================================================
// Read Functions
// =============================================================================

/**
 * Read and parse .mcp-sync/env file.
 */
export async function readEnvFile(filePath: string): Promise<Result<EnvVars, string>> {
  try {
    if (!existsSync(filePath)) {
      return { success: true, data: {} };
    }

    const content = await readFile(filePath, "utf-8");
    const parsed = parseDotenv(content);

    return { success: true, data: parsed };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Failed to read env file: ${message}` };
  }
}

/**
 * Get a single environment variable value.
 */
export function getEnvVar(env: EnvVars, varName: string): string | undefined {
  return env[varName];
}

/**
 * Check if an environment variable is set and non-empty.
 */
export function isEnvVarSet(env: EnvVars, varName: string): boolean {
  const value = env[varName];
  return value !== undefined && value.trim() !== "";
}

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Validate that all required environment variables are set.
 */
export function validateEnvVars(env: EnvVars, requiredVars: string[]): EnvValidationResult {
  const missingVars: string[] = [];
  const setVars: string[] = [];
  const emptyVars: string[] = [];

  for (const varName of requiredVars) {
    const value = env[varName];
    if (value === undefined) {
      missingVars.push(varName);
    } else if (value.trim() === "") {
      emptyVars.push(varName);
    } else {
      setVars.push(varName);
    }
  }

  return {
    isValid: missingVars.length === 0 && emptyVars.length === 0,
    missingVars,
    setVars,
    emptyVars,
  };
}

/**
 * Get all missing variables for a set of servers.
 */
export function getMissingVarsForServers(
  env: EnvVars,
  serverEnvVars: Map<string, string[]>
): Map<string, string[]> {
  const result = new Map<string, string[]>();

  for (const [serverId, vars] of serverEnvVars) {
    const missing = vars.filter((v) => !isEnvVarSet(env, v));
    if (missing.length > 0) {
      result.set(serverId, missing);
    }
  }

  return result;
}

// =============================================================================
// Write Functions
// =============================================================================

/**
 * Generate .env file content from variables.
 */
export function generateEnvContent(
  vars: EnvVars,
  comments?: Record<string, string>
): string {
  const lines: string[] = [];

  for (const [key, value] of Object.entries(vars)) {
    // Add comment if provided
    if (comments?.[key]) {
      lines.push(`# ${comments[key]}`);
    }
    // Quote value if it contains spaces or special characters
    const needsQuotes = /[\s#"'$]/.test(value);
    const formattedValue = needsQuotes ? `"${value.replace(/"/g, '\\"')}"` : value;
    lines.push(`${key}=${formattedValue}`);
    lines.push(""); // Blank line between entries
  }

  return lines.join("\n");
}

/**
 * Update a single variable in .env content.
 */
export function updateEnvVar(content: string, varName: string, value: string): string {
  const lines = content.split("\n");
  const regex = new RegExp(`^${varName}=.*$`);
  let found = false;

  const updatedLines = lines.map((line) => {
    if (regex.test(line)) {
      found = true;
      const needsQuotes = /[\s#"'$]/.test(value);
      const formattedValue = needsQuotes ? `"${value.replace(/"/g, '\\"')}"` : value;
      return `${varName}=${formattedValue}`;
    }
    return line;
  });

  // If variable wasn't found, add it at the end
  if (!found) {
    const needsQuotes = /[\s#"'$]/.test(value);
    const formattedValue = needsQuotes ? `"${value.replace(/"/g, '\\"')}"` : value;
    updatedLines.push(`${varName}=${formattedValue}`);
  }

  return updatedLines.join("\n");
}

/**
 * Write environment variables to file.
 */
export async function writeEnvFile(
  filePath: string,
  vars: EnvVars,
  comments?: Record<string, string>
): Promise<Result<void, string>> {
  try {
    const content = generateEnvContent(vars, comments);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf-8");
    return { success: true, data: undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Failed to write env file: ${message}` };
  }
}

/**
 * Update a single variable in an existing .env file.
 */
export async function updateEnvFileVar(
  filePath: string,
  varName: string,
  value: string
): Promise<Result<void, string>> {
  try {
    let content = "";
    if (existsSync(filePath)) {
      content = await readFile(filePath, "utf-8");
    }

    const updatedContent = updateEnvVar(content, varName, value);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, updatedContent, "utf-8");

    return { success: true, data: undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Failed to update env file: ${message}` };
  }
}

// =============================================================================
// Template Functions
// =============================================================================

/** Comments for the .mcp-sync/env.example template */
export const ENV_TEMPLATE_COMMENTS: Record<string, string> = {
  MCP_APIFY_API_TOKEN: "apify-stdio, apify-http",
  MCP_ASANA_CLIENT_ID: "asana-http-bridge-stdio OAuth client id",
  MCP_ASANA_CLIENT_SECRET: "asana-http-bridge-stdio OAuth client secret",
  MCP_CHROME_DEVTOOLS_ENABLE_USAGE_STATISTICS:
    "chrome-devtools-stdio repo policy: 0 disables upstream usage statistics in generated configs; 1 leaves upstream default enabled",
  MCP_CHROME_DEVTOOLS_ENABLE_UPDATE_CHECKS:
    "chrome-devtools-stdio repo policy: 0 disables upstream update checks in generated configs; 1 leaves upstream default enabled",
  MCP_FIRECRAWL_API_KEY: "firecrawl-stdio, firecrawl-http",
  MCP_MONGODB_CONNECTION_STRING: "mongodb-stdio",
  MCP_ZAI_API_KEY: "zai-vision-stdio, zai-web-reader-http, zai-web-search-http, zai-zread-http",
  MCP_ZAI_MODE: "zai-vision-stdio mode hint (set 'ZAI'; verify runtime mode in ~/.zai logs)",
};

/** Default template values for .mcp-sync/env.example */
export const ENV_TEMPLATE_VALUES: EnvVars = {
  MCP_APIFY_API_TOKEN: "your-apify-api-token",
  MCP_ASANA_CLIENT_ID: "your-asana-client-id",
  MCP_ASANA_CLIENT_SECRET: "your-asana-client-secret",
  MCP_CHROME_DEVTOOLS_ENABLE_USAGE_STATISTICS: "0",
  MCP_CHROME_DEVTOOLS_ENABLE_UPDATE_CHECKS: "0",
  MCP_FIRECRAWL_API_KEY: "your-firecrawl-api-key",
  MCP_MONGODB_CONNECTION_STRING: "mongodb://localhost:27020/your_database",
  MCP_ZAI_API_KEY: "your-zai-api-key",
  MCP_ZAI_MODE: "ZAI",
};

/**
 * Generate the .mcp-sync/env.example template content.
 */
export function generateEnvTemplate(): string {
  const header = `# =============================================================================
# MCP Server Environment Variables
# Copy values into .mcp-sync/env and fill in actual secrets
#
# Naming convention: MCP_<SERVER_ID>_<VARIABLE_NAME>
# =============================================================================

`;

  const sections: string[] = [];

  // Group by server
  sections.push("# --- apify-stdio, apify-http ---");
  sections.push("MCP_APIFY_API_TOKEN=your-apify-api-token");
  sections.push("");

  sections.push("# --- asana-http-bridge-stdio ---");
  sections.push("MCP_ASANA_CLIENT_ID=your-asana-client-id");
  sections.push("MCP_ASANA_CLIENT_SECRET=your-asana-client-secret");
  sections.push("");

  sections.push("# --- chrome-devtools-stdio (repo policy vars for Chrome DevTools MCP) ---");
  sections.push("# Set to 0 to disable upstream usage statistics in generated configs.");
  sections.push("# Set to 1 to leave upstream usage statistics enabled.");
  sections.push("MCP_CHROME_DEVTOOLS_ENABLE_USAGE_STATISTICS=0");
  sections.push("# Set to 0 to disable upstream update checks in generated configs.");
  sections.push("# Set to 1 to leave upstream update checks enabled.");
  sections.push("MCP_CHROME_DEVTOOLS_ENABLE_UPDATE_CHECKS=0");
  sections.push("");

  sections.push("# --- firecrawl-stdio, firecrawl-http ---");
  sections.push("MCP_FIRECRAWL_API_KEY=your-firecrawl-api-key");
  sections.push("");

  sections.push("# --- mongodb-stdio ---");
  sections.push("MCP_MONGODB_CONNECTION_STRING=mongodb://localhost:27020/your_database");
  sections.push("");

  sections.push("# --- puppeteer-stdio, playwright-stdio, serena-stdio ---");
  sections.push("# (no env vars required)");
  sections.push("");

  sections.push("# --- Z.AI Services (zai-vision-stdio, zai-web-reader-http, zai-web-search-http, zai-zread-http) ---");
  sections.push("MCP_ZAI_API_KEY=your-zai-api-key");
  sections.push("# NOTE: @z_ai/mcp-server@0.1.2 selects provider via PLATFORM_MODE (ZAI|ZHIPU)");
  sections.push("#       and defaults to ZHIPU when PLATFORM_MODE is unset.");
  sections.push("MCP_ZAI_MODE=ZAI");
  sections.push("");

  return header + sections.join("\n");
}

/**
 * Create .mcp-sync/env.example file with template.
 */
export async function createEnvTemplate(filePath: string): Promise<Result<void, string>> {
  try {
    const content = generateEnvTemplate();
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf-8");
    return { success: true, data: undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Failed to create env template: ${message}` };
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Mask a secret value for display (show first 4 and last 4 chars).
 */
export function maskSecret(value: string): string {
  if (value.length <= 8) {
    return "****";
  }
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

/**
 * Get display status for an environment variable.
 */
export function getEnvVarStatus(env: EnvVars, varName: string): "set" | "empty" | "missing" {
  const value = env[varName];
  if (value === undefined) {
    return "missing";
  }
  if (value.trim() === "") {
    return "empty";
  }
  return "set";
}
