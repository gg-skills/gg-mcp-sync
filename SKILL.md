---
name: mcp-sync
description: when configuring MCP Sync toolkit — manage MCP servers, editor config files across projects. Not for non-git sync.
---

# GG → Mcp Sync → MCP Sync

> **Snapshot age:** live operational guidance for the bundled scripts. Verify package paths in the current checkout before running commands.

## Overview

MCP Sync is a reusable, project-agnostic toolkit for choosing MCP services, collecting required environment variables, and writing editor-specific MCP configuration files. It was extracted to run in any repository without project-specific server templates or host-repo integration.

## When to Use This Skill

**TRIGGER when:**
- Installing or running MCP Sync in a project.
- Managing `.mcp-sync/` runtime state, MCP service preferences, or editor MCP config writes.
- Importing existing manual MCP editor configs into deterministic `.mcp-sync/` state.
- Adding generic MCP server templates or editor adapters to the toolkit.
- Debugging `mcp-sync setup`, `mcp-sync apply`, `mcp-sync validate`, Ink, or OpenTUI flows.

**SKIP when:**
- The task is about one project’s private MCP server or secret policy.
- The host repository wants package.json scripts that reference this skill directly.
- The user only needs editor-specific manual MCP setup outside this toolkit.

## Common Misconceptions

| # | Misconception | Correction | Key concept |
|---|---------------|------------|-------------|
| 1 | MCP Sync stores secrets in the skill repo | Runtime secrets live in the target project under `.mcp-sync/env` | Target-project storage |
| 2 | The host project must reference this skill | Host repos should not reference `mcp-sync`; run it as a local/private tool | Invisible integration |
| 3 | `.mcp-sync/env.example` is safe to commit automatically | Treat the whole `.mcp-sync/` directory as untracked local state unless a project explicitly chooses otherwise | Secret safety |
| 4 | Global editor writes are always safe | Review backups and target paths before applying global configs | Write scope |
| 5 | Existing manual configs can be copied blindly into state | Import only matched generic templates; preserve unmatched private/local servers as unmanaged editor entries | Migration safety |
| 6 | Project-specific servers belong in this skill | Keep the bundled registry generic; add private servers in a fork or local extension | Reusability |
| 7 | Apply can run without validation | Always validate before and after applying writes | Safety gate |

## Quick Commands

```bash
# From a target project when the skill is available locally or installed as a bin
mcp-sync setup
mcp-sync manage-servers
mcp-sync manage-env
mcp-sync manage-editors
mcp-sync apply
mcp-sync validate

# From the skill checkout while targeting another project
MCP_SYNC_PROJECT_ROOT=/absolute/project npm run mcp:setup
MCP_SYNC_PROJECT_ROOT=/absolute/project npm run mcp:apply

# Test the skill itself
npm test
```

## Runtime Storage Policy

MCP Sync writes target-project runtime state under `.mcp-sync/`:

- `.mcp-sync/env` — secret dotenv values used by selected servers.
- `.mcp-sync/env.example` — generated placeholder/template values.
- `.mcp-sync/state.json` — enabled services, transport preferences, and editor scope state.
- `.mcp-sync/instructions/*.md` — generated instructions for UI-only tools.
- `.mcp-sync/backups/` — project-local copies of editor config backups.

Before first use in any target project, ensure `.mcp-sync/` is ignored by that project’s VCS. The toolkit intentionally does not rely on the host repository’s ignore rules.

## Default Invocation Behavior

When the user invokes this skill without a specific intent, do not start by asking what they want to change. First provide a read-only overview of the current MCP configuration for the target project:

1. Resolve the target project root.
2. Inspect `.mcp-sync/` storage readiness and ignore status.
3. Summarize current `.mcp-sync/state.json` service preferences, enabled servers, editor scopes, and env key status without printing values.
4. Inventory existing project-scoped editor MCP config files; read global editor config files only after explicit approval.
5. Run validation when available and summarize pass/fail.
6. Report risks and then offer the numbered action menu from the report template, using the harness ask-user-question tool when available.

## Agent-Operated Workflow (No Manual Terminal)

Use this path when an AI coding agent is expected to do the work through tool calls instead of asking the user to open a terminal. For the complete checklist and report template, load `references/agent-operated-workflow.md`. When migrating from existing manually maintained editor configs, also load `references/import-existing-configs.md`.

1. **Resolve the target project root.** Work from the target project root when possible; otherwise set `MCP_SYNC_PROJECT_ROOT=/absolute/project` for package-local commands.
2. **Inspect before changing anything.** Check git status, `.gitignore`, `.mcp-sync/state.json`, `.mcp-sync/env`, existing editor config paths, and `mcp-sync validate` output. Do not print secret values; report only `set`, `empty`, or `missing`.
3. **Report current configuration to the user.** Include storage readiness, enabled services/transports, missing env keys, enabled editor scopes, validation status, and risk flags such as global writes or unignored runtime files.
4. **Import existing configs when requested.** Inventory approved source configs, classify discovered servers as managed exact matches, managed candidates, unmanaged private/local entries, or conflicts, then ask for approval before writing imported state.
5. **Offer clear choices.** Present the action choices with the harness ask-user-question tool when available; otherwise use a numbered chat menu. Options should include initialize storage, import existing configs, enable services, set secrets, choose editors, preview apply, apply project writes, apply global writes, validate, or stop.
6. **Make runtime changes directly when needed.** Interactive commands are optional. Agents may edit `.mcp-sync/state.json` and `.mcp-sync/env` directly after user approval, keeping `enabledServers` consistent with `servicePreferences`.
7. **Preview before writes.** Run `mcp-sync apply --dry-run` (or `MCP_SYNC_PROJECT_ROOT=/absolute/project npm run mcp:apply -- --dry-run`) and summarize target paths and operations.
8. **Apply only approved writes.** Run `mcp-sync apply --force` only after approval. Require explicit approval for global editor config writes.
9. **Close out with evidence.** Run `mcp-sync validate`, inspect git status, and report generated config files, backup locations, validation result, and any generated instructions under `.mcp-sync/instructions/`.

## Sync Quality Checklist

Use this checklist before finalizing any MCP sync operation.

| # | Checklist Item | Why It Matters | Gate |
|---|---------------|---------------|------|
| 1 | **Target project root resolved** — Working from correct project root | Prevents wrong config location | Pre-sync |
| 2 | **Storage initialized** — `.mcp-sync/` created and gitignored | Enables runtime state | Draft |
| 3 | **Current config inspected** — state.json, env, editor configs reviewed | Enables informed changes | Draft |
| 4 | **Secrets managed** — Env vars in `.mcp-sync/env`, not in skill repo | Secret safety | Draft |
| 5 | **Backups created** — Editor config backups before writes | Enables rollback | Draft |
| 6 | **Preview run** — `--dry-run` shows target paths and operations | Prevents surprises | Draft |
| 7 | **Global writes approved** — Explicit approval for global editor writes | Scope safety | Draft |
| 8 | **Validation run** — `mcp-sync validate` passes | Ensures correctness | Closeout |
| 9 | **Evidence reported** — Git status, generated files, validation result | Closeout documentation | Closeout |

### Quality Tiers

| Tier | Criteria | Use When |
|------|----------|----------|
| **Minimal** | Items 1-3, 8 | Read-only inspection |
| **Standard** | Items 1-6, 8 | Project-local writes |
| **Full** | All 9 items | Global editor writes |

### Pre-Finalization Verification

```
□ Target project root verified
□ Storage initialized and gitignored
□ Current config inspected (no secret values printed)
□ Secrets in .mcp-sync/env, not skill repo
□ Backups created before writes
□ Preview run shows expected operations
□ Explicit approval for global writes
□ Validation passes
□ Git status clean (or expected changes only)
```

## Sync Consistency Validator

Before finalizing, verify:

### Consistency Check Matrix

| Check | What to Verify | How to Fix |
|-------|---------------|------------|
| **Secrets vs Storage** | Secrets in .mcp-sync/env, not skill repo | Move secrets |
| **Backups vs Writes** | Backups exist before any editor config writes | Create backups |
| **Preview vs Apply** | Preview matches expected write operations | Re-preview |
| **Validation vs State** | Validation passes with current state | Fix state |

### Red Flags (Never Present)

- [ ] Secrets in skill repository
- [ ] Global writes without explicit approval
- [ ] Validation failing
- [ ] Unignored .mcp-sync/ directory
- [ ] Missing backups before writes

## Workflow

1. Confirm the target project root.
   - Prefer running commands from the target project root.
   - Use `MCP_SYNC_PROJECT_ROOT=/absolute/project` when running package-local scripts from the skill checkout.
2. For interactive operation, run `mcp-sync setup` to create `.mcp-sync/` runtime files and choose an interactive surface.
3. Enable generic services with `mcp-sync manage-servers`, or edit `.mcp-sync/state.json` via the agent-operated workflow.
4. To migrate manual configs, follow `references/import-existing-configs.md`: inventory approved source configs, import matched generic services, preserve unmatched servers, and copy secrets only with approval.
5. Fill required secrets with `mcp-sync manage-env`, or edit `.mcp-sync/env` without echoing secret values.
6. Select editor scopes with `mcp-sync manage-editors`, or set editor scope state directly after user approval.
7. Preview and write configs with `mcp-sync apply --dry-run` then `mcp-sync apply --force`; use `mcp-sync validate` for schema diagnostics.
8. When editing the toolkit, keep server templates generic and run `npm test` before publishing.

## Report Template

When operating for a user, always report in this shape first if the user has not provided a more specific instruction. After the report, prefer the harness ask-user-question tool for the choice prompt when available; fall back to a numbered chat menu only when no such tool exists:

```text
MCP Sync status for <target-project>
- Storage: .mcp-sync present/absent; ignored yes/no
- Services: <service>: <preference> -> <enabled server ids>
- Secrets: <ENV_KEY>=set|empty|missing (no values shown)
- Editors: <editor> project/global/instructions -> <path>
- Existing source configs: <editor/scope/path -> server ids>; global sources only if approved
- Validation: pass/fail/not-run plus short reason
- Risks: global writes, missing secrets, dirty generated files, unignored runtime files

Choose an option:
1. Initialize/repair storage
2. Import existing manual configs
3. Change services/transports
4. Add/update secrets
5. Change editor targets
6. Preview apply
7. Apply approved project writes
8. Apply approved global writes
9. Validate only
10. Stop
```

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Commands write files into the skill folder | Command ran from the wrong cwd | Re-run from the target project root or set `MCP_SYNC_PROJECT_ROOT` |
| Secrets appear in git status | Target project does not ignore `.mcp-sync/` | Add `.mcp-sync/` to the target project’s ignore file and untrack any accidental files |
| `mcp-sync apply` says no servers are enabled | State is new or empty | Run `mcp-sync manage-servers` first |
| Missing env vars during apply | Required server secrets are empty | Run `mcp-sync manage-env` and fill `.mcp-sync/env` |
| Ink/OpenTUI exits immediately | Not running in an interactive TTY or missing runtime deps | Use a real terminal and install package dependencies |

## Common Pitfalls

1. Do not add project-specific service IDs, environment variables, domains, or task systems to the generic registry.
2. Do not commit `.mcp-sync/` runtime files unless a target project intentionally owns a sanitized template.
3. Do not wire host package.json scripts to `skills/mcp-sync`; keep the host repo unaware of the skill.
4. Do not skip backups before global editor writes.
5. Do not assume `npm --prefix` preserves the target project cwd; use `MCP_SYNC_PROJECT_ROOT` for package-local runs.

## Local Corpus Layout

- `scripts/` — reusable MCP Sync CLI, controllers, registries, schemas, tests, and TUI surfaces.
- `references/quick-reference.md` — concise command guide.
- `references/storage.md` — untracked runtime storage details.
- `references/agent-operated-workflow.md` — no-manual-terminal workflow for inspecting, reporting, offering options, previewing, applying, and rolling back.
- `references/import-existing-configs.md` — migration workflow for importing approved existing MCP editor configs into deterministic runtime state.
- `agents/openai.yaml` — generated skill metadata for IDE surfaces.
- `assets/` — skill icons.
