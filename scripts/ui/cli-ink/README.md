# MCP Ink shell (`mcp:cli:ink`)

Interactive inventory and staging UI for MCP services, environment variables, and editors. Uses the
same `scripts/controllers/*` and `scripts/lib/*` code paths as the canonical `mcp-sync`
scripts (no nested Inquirer from inside Ink).

## Launch

```bash
mcp-sync interactive
mcp-sync ink
mcp-sync ink -- --section diagnostics
mcp-sync ink -- --help
```

Pass-through args go after `--` and are parsed in `index.mts` (not inside React).

Root `mcp:cli:ink` runs **`bun run ./scripts/ui/cli-ink/index.mts`** so Ink 6 / `yoga-layout` stay native ESM (Node 24 + `npx tsx` can fail on that dependency graph).

`mcp:cli:interactive` is the compatibility launcher for the old numbered menu. It is now
TypeScript-backed and still only previews/spawns the canonical `mcp:*` commands.

## Render / TTY policy

- **Normal terminal screen** — `render()` uses Ink defaults (no `alternateScreen`). Scrollback after
  exit remains available, unlike OpenTUI script CLIs that use `useAlternateScreen: true` in
  `scripts/ui-cli-opentui/create-renderer.ts`.
- **Diagnostics history** — completed validation runs are appended to a `<Static>` region while the
  Diagnostics section is active so long output stays stable without full-screen redraw.

## Sections (families)

| Section       | Role |
| ------------- | ---- |
| Services      | Stage transport preferences; save with `s` via services controller |
| Env           | Stage env values; save with `s` via env controller |
| Editors       | Queue writes; run with `s` via editor controller |
| Diagnostics   | Run headless JSON validation (`r`); same engine as `mcp-sync validate` |
| Schemas       | Read-only preview of `scripts/schemas/*.json` |

## Keys (shell)

- **Navigation:** arrows or `h/j/k/l`; left/right switch section.
- **Quit:** `q` or `escape` (from shell).
- **Refresh inventory:** `r` (except in Diagnostics, where `r` runs validation).
- **Apply:** `a` opens apply preview; follow on-screen legend.
- **Services:** `space`/`enter` cycle preference, `c` clear staged preference.
- **Env:** `e` edit, `enter` submit buffer, `c` clear staged value.
- **Editors:** `p`/`g`/`i` queue scopes, `c` clear queue for selected editor.

## Shared model

Inventory types and loaders live under [`../shared/`](../shared/) (`McpShell*` types). This folder
keeps Ink-specific state (`McpInkState`), `review.ts`, and UI.

## Accessibility

List rows use standard Ink text; dense tables may be hard to navigate with a screen reader. Prefer
canonical CLI scripts for fully linear output when needed.

## Tests

- Jest: `scripts/ui/cli-ink/*`
- Run: `npm test`
