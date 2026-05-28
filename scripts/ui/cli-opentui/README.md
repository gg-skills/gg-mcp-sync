# MCP OpenTUI shell (`mcp:cli:opentui`)

Bun-hosted terminal UI for browsing MCP inventory, running diagnostics, viewing schemas, and
inspecting the `mcp-sync` command catalog. Uses `scripts/ui/shared/*` and
`scripts/lib/validate-mcp-config-files.ts`; it does **not** spawn interactive `manage-*` or
`apply-config` scripts (avoid nested full-screen TTY + Inquirer conflicts).

## Prerequisites

- **Bun** for the OpenTUI host process (see root `package.json` script).
- **Node/npm** remain available for other MCP scripts you run from a normal shell.
- Repository **root** as working directory (`process.cwd()`).
- **Interactive stdin** (asserted by `scripts/ui-cli-opentui/tty-guard.ts`).

## Launch

```bash
mcp-sync interactive
mcp-sync opentui
# or
bun run ./scripts/ui/cli-opentui/main.tsx
```

Use `mcp:cli:interactive` when you want the compatibility numbered launcher instead of the
full-screen Bun/OpenTUI shell.

Forwarded CLI flags are not implemented yet; add argv parsing in `main.tsx` when needed (keep
parsing outside JSX, same rule as Ink).

## Renderer options

This entrypoint uses [`scripts/ui-cli-opentui/create-renderer.ts`](../../../ui-cli-opentui/create-renderer.ts):

| Option              | Value   | Notes |
| ------------------- | ------- | ----- |
| `useAlternateScreen`| `true`  | Matches other platform OpenTUI CLIs; scrollback is not preserved after exit the same way as Ink’s normal screen. |
| `exitOnCtrlC`       | `true`  | User can always exit. |
| `useMouse`          | `false` | Keyboard-first. |
| `autoFocus`         | `true`  | Focus management for `tab-select`. |

For OpenTUI debugging (FFI, console capture, alternate screen), see upstream env-var documentation
(OpenTUI snapshot dated **2026-03-18** in the expert skill corpus, or refresh via research tools if
APIs drift).

## Flow map (screen → engine)

| Menu target  | Data source |
| ------------ | ----------- |
| Services     | `loadMcpShellInventory` → formatted text + command preview `mcp:manage-servers` |
| Env          | same loader → `mcp:manage-env` preview |
| Editors      | same loader → `mcp:manage-editors` preview |
| Diagnostics  | `validateMcpConfigFiles` + `formatMcpValidationSummaryLines` (same as `mcp:validate` CLI) |
| Schemas      | `listMcpSchemaDescriptors` + `readFileSync` snippets |
| Commands     | `MCP_COMMAND_CATALOG` |

## Contrast with `mcp:cli:ink`

| | Ink (`mcp:cli:ink`) | OpenTUI (`mcp:cli:opentui`) |
| --- | --- | --- |
| Runtime | Node + tsx | **Bun** |
| Alternate screen | No (normal scrollback) | Yes (shared OpenTUI renderer) |
| Staging / apply | Full reducer + controllers | Read-mostly; use Ink or canonical scripts to mutate |

## Smoke check

From a real TTY at repo root: open the app, visit **Diagnostics** and **Schemas**, then return to
the menu and quit with **Quit** (SIGINT). Verify teardown returns to the shell prompt.

## Tests

Shared logic is covered by `npm test` (catalog, validation lib, Ink reducer). OpenTUI UI is
primarily validated via the smoke path above.
