---
title: Agent-Operated MCP Sync Workflow
---

# Agent-Operated MCP Sync Workflow

Use this workflow when an AI coding agent must inspect, plan, configure, preview, and apply MCP editor configuration without asking the user to open a terminal.

## Default invocation

If the user invokes MCP Sync without explaining whether they want setup, migration, edits, or validation, the agent's first response should be a read-only overview of the current MCP configuration. Do not ask what to change first. Discover target state, build the report, then offer the action menu with the harness ask-user-question tool when available.

The default overview should include:

- target project root;
- `.mcp-sync/` presence and ignore status;
- current managed services, transport preferences, editor scopes, and env key status;
- project-scoped existing MCP config sources and server IDs;
- global MCP config sources only if the user approved reading global paths;
- validation status and risk flags.

## Operator contract

- The agent runs commands and edits files with its own tools.
- The user supplies choices, approvals, and secret values in chat.
- The agent never prints secret values back; report only `set`, `empty`, or `missing`.
- Apply writes only after the user approves a concrete plan.
- Global editor config writes require explicit approval because they mutate files outside the target project.

## Phase 1 — Discover target state

From the target project root, inspect:

```bash
pwd
git status --short --untracked-files=all
[ -f .gitignore ] && grep -n '^\.mcp-sync/' .gitignore || true
[ -f .mcp-sync/state.json ] && node -e 'const s=require("./.mcp-sync/state.json"); console.log(JSON.stringify({enabledServers:s.enabledServers,servicePreferences:s.servicePreferences,editors:s.editors},null,2))' || true
[ -f .mcp-sync/env ] && node -e 'const fs=require("fs"); const txt=fs.readFileSync(".mcp-sync/env","utf8"); for (const line of txt.split(/\n/)) { const m=line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) console.log(`${m[1]}=${m[2].trim()?"SET":"EMPTY"}`); }' || true
```

For the default overview, also inventory project-scoped editor configs through the editor adapters. Do not inspect global paths unless the user has approved global-source discovery.

If `.mcp-sync/` is not ignored, propose adding `.mcp-sync/` to the target project ignore file before creating or editing runtime files.

## Phase 2 — Build a configuration report

Report these sections to the user:

1. **Storage readiness** — whether `.mcp-sync/` exists and is ignored.
2. **Enabled services** — current `enabledServers` and `servicePreferences` from `.mcp-sync/state.json`.
3. **Secret readiness** — env keys required by enabled services; status only (`set`, `empty`, `missing`).
4. **Editor targets** — each enabled editor scope (`project`, `global`) and config path.
5. **Existing source configs** — project-scoped source config paths and server IDs; include global paths only after approval.
6. **Validation status** — output of `mcp-sync validate` or `MCP_SYNC_PROJECT_ROOT=<target> npm run mcp:validate`.
7. **Risk flags** — global writes, missing secrets, unignored runtime files, dirty generated config files.

Never include raw secret values in the report.

## Phase 2A — Import existing manual configs when requested

When the user wants to migrate from hand-managed MCP configs, load `references/import-existing-configs.md` and treat existing editor files as import sources, not as the ongoing source of truth.

Agent rules for import:

1. Ask which sources are in scope: user-provided files, project editor configs, global editor configs, or env files.
2. Read global editor configs only after explicit approval.
3. Inventory source paths and server IDs without printing secrets.
4. Classify discovered servers as managed exact matches, managed candidates, unmanaged private/local entries, or conflicts.
5. Import only approved managed matches into `.mcp-sync/state.json` and `.mcp-sync/env`.
6. Preserve unmatched servers as unmanaged entries in editor config files; do not invent generic templates for private/local servers.
7. Dry-run after import so the user can see which managed entries will be normalized and which unmanaged entries will remain preserved.

## Phase 3 — Offer options

Prefer the harness ask-user-question tool when it is available so the user can choose directly from structured options. Include the full configuration report as context in the prompt, and make each option a concrete next action. If the harness does not expose an ask-user-question tool, offer a numbered menu in chat, for example:

1. Initialize/repair local `.mcp-sync/` storage only.
2. Import existing manual MCP configs.
3. Enable or disable services/transports.
4. Add or update missing secrets.
5. Choose editor targets (project/global/instructions).
6. Preview apply with no writes.
7. Apply approved project-scoped config writes.
8. Apply approved global config writes.
9. Validate current generated configs.
10. Stop with no changes.

Ask for the user's choice and any needed values. Use the ask-user-question tool again for follow-up choices, confirmations, and write approvals when available. For secrets, ask the user to provide values in chat or point to a local env file; do not echo them after receipt.

## Phase 4 — Mutate runtime state without TTY

Interactive commands (`setup`, `manage-*`, `ink`, `opentui`, `interactive`) are optional. An agent may edit `.mcp-sync/state.json` and `.mcp-sync/env` directly, then use `apply --dry-run` and `apply --force`.

Minimal state shape:

```json
{
  "version": "1.0.0",
  "enabledServers": ["firecrawl-stdio"],
  "servicePreferences": {
    "firecrawl": {
      "preference": "stdio-only",
      "lastModified": "2026-05-09T00:00:00.000Z"
    }
  },
  "envVars": {},
  "editors": {
    "cursor": {
      "project": {
        "enabled": true,
        "configPath": "/absolute/project/.cursor/mcp.json",
        "lastSync": null,
        "lastBackup": null
      },
      "global": {
        "enabled": false,
        "configPath": "",
        "lastSync": null,
        "lastBackup": null
      }
    }
  },
  "lastModified": "2026-05-09T00:00:00.000Z",
  "lastModifiedBy": "setup"
}
```

Transport preference to server ids:

| Preference | Enabled server ids |
|------------|--------------------|
| `disabled` | none |
| `stdio-only` | `<service>-stdio` |
| `http-only` | `<service>-http` |
| `prefer-stdio` | `<service>-stdio`, `<service>-http` |
| `prefer-http` | `<service>-http`, `<service>-stdio` |

When editing state, keep `enabledServers` consistent with `servicePreferences`.

## Phase 5 — Preview and apply

Preview first:

```bash
mcp-sync apply --dry-run
# or, from the skill checkout:
MCP_SYNC_PROJECT_ROOT=/absolute/project npm run mcp:apply -- --dry-run
```

Summarize every target path and whether it would be created, updated, skipped, or blocked. Ask for approval before writes, using the ask-user-question tool when available.

Apply only after approval:

```bash
mcp-sync apply --force
# or, from the skill checkout:
MCP_SYNC_PROJECT_ROOT=/absolute/project npm run mcp:apply -- --force
```

Then run validation and inspect git status:

```bash
mcp-sync validate
git status --short --untracked-files=all
```

Report generated config files, backup paths, preserved unmanaged servers, validation outcome, and any follow-up manual editor steps from `.mcp-sync/instructions/`.

## Rollback guidance

- Runtime choices can be reverted by restoring `.mcp-sync/state.json` and `.mcp-sync/env` from prior content or backups.
- Project editor config writes can be reverted from git if tracked, or from `.mcp-sync/backups/` if untracked.
- Global editor config writes should be restored from the in-place `.bak-*` file created beside the global config, when present.
