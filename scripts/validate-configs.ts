#!/usr/bin/env -S npx tsx
/**
 * @fileoverview Validates MCP configuration files and registry surfaces.
 *
 * Flow: workspace state + server registry + schema checks -> validation summary.
 *
 * @example
 * ```typescript
 * const command = "mcp-sync validate";
 * ```
 *
 * @testing Manual CLI: mcp-sync validate
 * @see scripts/lib/validate-mcp-config-files.ts - Implements the validation logic used here.
 * @see scripts/ui/cli-ink/app.tsx - Consumes the validation summary in Ink.
 * @documentation reviewed=2026-04-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import {
  assertMcpSchemaFilesPresent,
  validateMcpConfigFiles,
} from "./lib/validate-mcp-config-files";
import {
  displayHeader,
  displaySection,
  displaySuccess,
  displayError,
  displayInfo,
  colors,
} from "./lib/prompts";
import { resolveMcpSyncProjectRoot } from "./lib/project-root";

/**
 * CLI entrypoint that validates MCP configuration files under the process working directory.
 *
 * @remarks
 * I/O: Prints formatted validation progress and errors to stdout/stderr unless `--quiet` or `-q`
 * suppresses non-error output.
 * POST-CONDITION: Exits the process with code `1` when required schema files are missing, any
 * checked configuration is invalid, or an uncaught rejection occurs; otherwise exits `0`.
 * When `--ci` is set and validation fails, emits a GitHub Actions `::error::` annotation line.
 */
async function main(): Promise<void> {
  const projectRoot = resolveMcpSyncProjectRoot(process.cwd());

  const args = process.argv.slice(2);
  const quiet = args.includes("--quiet") || args.includes("-q");
  const ci = args.includes("--ci");

  if (!quiet) {
    displayHeader("MCP Configuration Validator");
  }

  const schemaError = assertMcpSchemaFilesPresent();
  if (schemaError) {
    displayError(schemaError);
    process.exit(1);
  }

  if (!quiet) {
    displaySection("Validating Configurations");
  }

  const summary = validateMcpConfigFiles(projectRoot);

  for (const result of summary.results) {
    if (result.skipped) {
      if (!quiet) {
        displayInfo(`${result.description}: ${colors.dim("not found, skipped")}`);
      }
    } else if (result.valid) {
      if (!quiet) {
        displaySuccess(`${result.description}: ${colors.green("valid")}`);
      }
    } else {
      if (!quiet) {
        displayError(`${result.description}: ${colors.red("invalid")}`);
      }
      for (const error of result.errors) {
        if (!quiet) {
          console.log(`    ${colors.red("→")} ${error}`);
        }
      }
    }
  }

  if (!quiet) {
    displaySection("Summary");
    console.log(`  ${colors.green("Valid")}: ${summary.validCount}`);
    console.log(`  ${colors.red("Invalid")}: ${summary.invalidCount}`);
    console.log(`  ${colors.dim("Skipped")}: ${summary.skippedCount}`);
  }

  if (summary.invalidCount > 0) {
    if (ci) {
      console.log("\n::error::MCP configuration validation failed");
    }
    process.exit(1);
  }

  if (!quiet) {
    displaySuccess("\nAll MCP configurations are valid!");
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
