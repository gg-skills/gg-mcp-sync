# MCP Sync Scripts

Reusable MCP configuration tooling for projects that need one command family to select MCP services, collect required environment variables, and write editor-specific MCP configuration files.

## Quick start

From the target project root:

```bash
mcp-sync setup
```

The setup wizard prepares `.mcp-sync/env`, `.mcp-sync/env.example`, and `.mcp-sync/state.json`, then lets you open the Ink shell or continue with focused commands.

## Commands

```bash
mcp-sync setup
mcp-sync manage-servers
mcp-sync manage-env
mcp-sync manage-editors
mcp-sync apply
mcp-sync backup
mcp-sync validate
mcp-sync interactive
mcp-sync ink
mcp-sync opentui
```

When running package-local npm scripts from this checkout, target another project explicitly:

```bash
MCP_SYNC_PROJECT_ROOT=/absolute/project mcp-sync setup
MCP_SYNC_PROJECT_ROOT=/absolute/project mcp-sync apply
```

## Runtime storage

MCP Sync writes local runtime data under the target project root:

- `.mcp-sync/env` — secrets for enabled servers.
- `.mcp-sync/env.example` — generated placeholder/template values.
- `.mcp-sync/state.json` — enabled services, transport preferences, and editor sync metadata.
- `.mcp-sync/instructions/*.md` — generated instructions for UI-only tools.
- `.mcp-sync/backups/` — backup copies for managed editor config writes.

Add `.mcp-sync/` to the target project’s ignore file before writing secrets.

## How it works

- Server templates live in `scripts/servers` and define required env vars plus per-editor config formats.
- Editor adapters live in `scripts/editors` and specify config file locations and formats.
- `manage-editors` merges new server entries with existing configs, preserving anything already present.
- `apply` backs up selected targets before writing.

## Add a generic server

1. Create a file in `scripts/servers`.
2. Export it from `scripts/servers/index.ts`.
3. If it needs env vars, update `scripts/lib/env.ts`.
4. Add or update unit tests.

Keep project-specific private services out of the generic registry.

## Add an editor

1. Create a file in `scripts/editors`.
2. Export it from `scripts/editors/index.ts`.
3. Add registry and config-writer tests.

## Multi-transport servers

Some services offer both stdio and HTTP transports. MCP Sync can enable both and then select compatible variants per editor.

| Service | stdio variant | HTTP variant |
|---------|---------------|--------------|
| Firecrawl | `firecrawl-stdio` | `firecrawl-http` |
| Apify | `apify-stdio` | `apify-http` |

Bridge services such as `asana-http-bridge-stdio` are configured as stdio for editors while the
local bridge process connects to an upstream HTTP MCP endpoint. The Asana bridge also normalizes
local JSON Schema `$ref` entries in `tools/list` responses so Kimi/Moonshot-flavored tool schema
validation accepts Asana's hosted tool definitions.

Single-transport HTTP services currently include `zai-web-reader-http`, `zai-web-search-http`, and `zai-zread-http`.

## Development

```bash
npm install
npm test
```
