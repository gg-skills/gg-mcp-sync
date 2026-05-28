---
title: MCP Sync Quick Reference
---

# MCP Sync Quick Reference

## Target a project

```bash
# Preferred: run from the target project root
mcp-sync setup

# Alternative: run package-local npm scripts from the skill checkout
MCP_SYNC_PROJECT_ROOT=/absolute/project npm run mcp:setup
```

## Main interactive flow

```bash
mcp-sync setup
mcp-sync manage-servers
mcp-sync manage-env
mcp-sync manage-editors
mcp-sync apply
mcp-sync validate
```

## Agent-operated flow

If the user invokes MCP Sync without a specific request, start with a read-only overview: target root, `.mcp-sync/` storage status, managed services, secret status, enabled editor scopes, existing project-scoped source config server IDs, validation, and risks. Ask before reading global config paths. When presenting next-step choices or approvals, prefer the harness ask-user-question tool when available; otherwise use a numbered chat menu.

```bash
# Inspect/report first; do not print secret values
mcp-sync validate

# Preview writes before applying
mcp-sync apply --dry-run

# Apply only after user approval
mcp-sync apply --force
```

## Import existing manual configs

Use `references/import-existing-configs.md` when migrating from hand-managed editor MCP files. Inventory source paths and server IDs without printing secrets, import only approved generic template matches into `.mcp-sync/state.json` and `.mcp-sync/env`, and preserve unmatched private/local servers as unmanaged editor entries.

From the skill checkout, an agent can list supported source configs without exposing values:

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
        console.log(JSON.stringify({ editor: editor.id, scope, path: config.path, serverIds: Object.keys(config.servers).sort() }));
      }
    }
  }
})();
'
```

## Interactive shells

```bash
mcp-sync interactive
mcp-sync ink
mcp-sync opentui
```

## Skill development

```bash
npm install
npm test
```

## Storage reminder

Add this to the target project ignore file before storing secrets:

```gitignore
.mcp-sync/
```
