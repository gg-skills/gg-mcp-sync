#!/usr/bin/env -S npx tsx
/**
 * @fileoverview Manages MCP environment variables in the `.mcp-sync/env` file.
 *
 * Flow: project root + env template + controller context -> interactive env editor.
 *
 * @example
 * ```typescript
 * const command = "mcp-sync manage-env";
 * ```
 *
 * @testing Manual CLI: mcp-sync manage-env
 * @see scripts/ui/cli-ink/app.tsx - The Ink shell that can launch env management.
 * @see scripts/ui/cli-interactive/main.ts - The interactive console that can launch env management.
 * @documentation reviewed=2026-04-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { join } from "path";
import {
  ENV_EXAMPLE_FILE_NAME,
} from "./lib/env";
import {
  buildManagedEnvVarInfo,
  ensureMcpEnvTemplate,
  loadEnvControllerContext,
  saveManagedEnvVar,
} from "./controllers/env-controller";
import {
  displayHeader,
  displaySection,
  displaySuccess,
  displayError,
  displayInfo,
  promptSelect,
  promptInput,
} from "./lib/prompts";
import { resolveMcpSyncProjectRoot } from "./lib/project-root";

// =============================================================================
// Main
// =============================================================================

/**
 * CLI entrypoint for interactive MCP environment variable management in `.mcp-sync/env`.
 *
 * @remarks
 * I/O: Resolves the target project root, ensures the MCP env template via the
 * env-controller, then loads controller context (env file paths, parsed state, and variable list).
 * On fatal context load failure, prints an error and exits the process with code 1.
 * Otherwise drives an interactive prompt loop that may persist updates through `saveManagedEnvVar`.
 */
async function main(): Promise<void> {
  const projectRoot = resolveMcpSyncProjectRoot(process.cwd());
  const envExamplePath = join(projectRoot, ENV_EXAMPLE_FILE_NAME);

  displayHeader("MCP Environment Variables");

  const templateResult = await ensureMcpEnvTemplate(envExamplePath);
  if (!templateResult.success) {
    displayError(templateResult.error);
  } else if (templateResult.data) {
    displayInfo("Creating .mcp-sync/env.example template...");
    displaySuccess(`Created ${ENV_EXAMPLE_FILE_NAME}`);
  }

  const contextResult = await loadEnvControllerContext(projectRoot);
  if (!contextResult.success) {
    displayError(contextResult.error);
    process.exit(1);
  }
  let { envFilePath, stateFilePath, state, env } = contextResult.data;
  let variables = contextResult.data.variables;

  if (variables.length === 0) {
    displayInfo("No environment variables required by any server.");
    console.log(`\nFile: ${envFilePath}`);
    return;
  }

  console.log(`\nFile: ${envFilePath}`);
  displaySection("All MCP Server Environment Variables");

  for (const variable of variables) {
    const statusIcon = variable.status === "set" ? "✓" : "✗";
    const statusText =
      variable.status === "set" ? `Set (${variable.maskedValue})` : "Missing";
    const serversText = variable.usedBy.join(", ");

    console.log(`\n  ${statusIcon} ${variable.name}`);
    console.log(`    Status: ${statusText}`);
    console.log(`    Used by: ${serversText}`);
  }

  // Interactive loop
  let running = true;
  while (running) {
    console.log("");
    const action = await promptSelect<"edit" | "done">("Action:", [
      { name: "Edit a variable", value: "edit" },
      { name: "Done", value: "done" },
    ]);

    if (action === "done") {
      running = false;
      continue;
    }

    // Select variable to edit
    const varChoices = variables.map((variable) => {
      const statusIcon = variable.status === "set" ? "✓" : "✗";
      return {
        name: `${statusIcon} ${variable.name} (${variable.usedBy.join(", ")})`,
        value: variable.name,
      };
    });

    const selectedVar = await promptSelect("Select variable to edit:", varChoices);

    // Get new value
    const currentValue = env[selectedVar];
    const newValue = await promptInput(
      `Enter value for ${selectedVar}:`,
      currentValue ?? ""
    );

    if (newValue !== currentValue) {
      const saveResult = await saveManagedEnvVar(
        envFilePath,
        stateFilePath,
        state,
        env,
        selectedVar,
        newValue
      );
      if (saveResult.success) {
        state = saveResult.data.state;
        env = saveResult.data.env;
        variables = buildManagedEnvVarInfo(env);
        displaySuccess(`Updated ${selectedVar}`);
      } else {
        displayError(`Failed to update: ${saveResult.error}`);
      }
    }
  }

  // Final summary
  displaySection("Summary");
  const missingVars = variables.filter((variable) => variable.status !== "set");
  if (missingVars.length === 0) {
    displaySuccess("All required environment variables are set!");
  } else {
    displayError(`Missing ${missingVars.length} variable(s):`);
    for (const variable of missingVars) {
      console.log(`  - ${variable.name}`);
    }
  }

  console.log(`\nChanges saved to: ${envFilePath}`);
}

// Run
main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
