---
title: Importing Existing MCP Configurations
---

# Importing Existing MCP Configurations

Use this workflow when a user already manages MCP servers manually in editor config files and wants MCP Sync to become the deterministic source of truth under `.mcp-sync/`.

## Import contract

- Import into `.mcp-sync/state.json` and `.mcp-sync/env`; do not treat existing editor files as the long-term source of truth after migration.
- Read existing configs first, but do not print secret values. Report server IDs, paths, and secret status only.
- Import only servers that match generic bundled server templates or that the user explicitly approves after reviewing a candidate match.
- Leave unmatched or private servers unmanaged. MCP Sync writers preserve existing unmanaged entries in editor config files when applying managed entries.
- Add `.mcp-sync/` to the target project ignore file before writing imported state or secrets.
- Preview with `mcp-sync apply --dry-run` before replacing or normalizing any editor config content.

## Source discovery

Ask the user which sources to import from, then inspect in this priority order:

1. User-provided source files or directories.
2. Project-scoped editor configs in the target repository.
3. Global editor configs only after the user explicitly approves reading user-level paths.
4. Existing env files or shell profiles only when the user points to them; do not search broadly for secrets.

From the skill checkout, an agent can inventory supported editor sources without printing secrets:

```bash
MCP_SYNC_PROJECT_ROOT=/absolute/project npx tsx -e '
import { editors } from "./scripts/editors/index.ts";
import { resolveMcpSyncProjectRoot } from "./scripts/lib/project-root.ts";
void (async () => {
  const projectRoot = resolveMcpSyncProjectRoot(process.cwd());
  process.chdir(projectRoot);
  for (const editor of editors) {
    for (const scope of ["project", "global"] as const) {
      const location = scope === "project" ? editor.projectConfig : editor.globalConfig;
      if (!location || editor.format === "ui-only") continue;
      const config = await editor.readConfig(scope);
      if (config?.exists && Object.keys(config.servers).length > 0) {
        console.log(JSON.stringify({
          editor: editor.id,
          scope,
          path: config.path,
          serverIds: Object.keys(config.servers).sort(),
        }));
      }
    }
  }
})();
'
```

If `mcp-sync` is installed as a binary in the target project, run the same script from the package checkout or use the editor adapters as a reference for known config paths.

## Classify discovered servers

For each discovered server entry, assign one classification:

| Classification | Rule | Action |
|---|---|---|
| Managed exact match | Server ID matches a bundled template ID or known legacy ID | Import directly into `enabledServers` and `servicePreferences` |
| Managed candidate | Command, package, URL, headers, or env variable names strongly match one bundled template | Ask the user to confirm before importing |
| Unmanaged private/local | No bundled generic template matches | Preserve in editor files; do not add to `.mcp-sync/state.json` |
| Conflict | Same server ID has materially different definitions across sources | Ask the user which source should win, or leave unmanaged until resolved |

Never silently convert a private or project-specific server into a generic template. If the user wants centralized management for unmatched servers, explain that they need a private fork/local extension or a new generic template when the server is broadly reusable.

## Build deterministic state

After the user approves the import plan:

1. Ensure `.mcp-sync/` is ignored.
2. Create or update `.mcp-sync/state.json`.
3. Set `enabledServers` to the approved matched server IDs.
4. Set `servicePreferences` by service family:
   - only `<service>-stdio` imported -> `stdio-only`
   - only `<service>-http` imported -> `http-only`
   - both imported and source order is unknown -> `prefer-stdio` unless the user chooses `prefer-http`
5. Enable editor scopes that correspond to the approved source configs and set their `configPath` values to absolute paths.
6. Preserve `lastSync` and `lastBackup` as `null` until `mcp-sync apply --force` writes.
7. Set `lastModified` to the current ISO timestamp and `lastModifiedBy` to `setup` unless a script provides a more specific value.

## Import secrets safely

When existing configs contain environment data:

- If a source contains literal secret values, ask approval to copy them into `.mcp-sync/env`; do not echo them.
- If a source references shell variables such as `$NAME`, `${NAME}`, or `$(...)`, report the variable names and ask whether the user wants to provide values for `.mcp-sync/env` or keep them managed outside MCP Sync.
- If multiple sources provide different values for the same env key, stop and ask which source wins.
- Keep `.mcp-sync/env.example` as placeholders only.
- In reports, use `KEY=set`, `KEY=empty`, or `KEY=missing`.

## Preview migration results

Run a dry run before writes:

```bash
mcp-sync apply --dry-run
# or, from the skill checkout:
MCP_SYNC_PROJECT_ROOT=/absolute/project npm run mcp:apply -- --dry-run
```

Summarize:

- Managed servers that will be written.
- Unmanaged servers that will be preserved.
- Editor paths that will be created or updated.
- Global paths that require explicit write approval.
- Any source configs that could not be parsed or classified.

Only run `mcp-sync apply --force` after the user approves the exact target paths and write scope.

## Closeout report

After apply and validation, report:

```text
Migration result for <target-project>
- Imported sources: <editor/scope/path list>
- Managed services: <service>: <preference> -> <server ids>
- Unmanaged preserved servers: <server ids by source path>
- Secrets: <ENV_KEY>=set|empty|missing (no values shown)
- Writes: <created|updated|skipped paths>
- Backups: <backup paths>
- Validation: pass/fail plus short reason
- Next step: remove or stop hand-editing source entries now managed by MCP Sync
```
