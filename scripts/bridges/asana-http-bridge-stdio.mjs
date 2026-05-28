#!/usr/bin/env node
/**
 * @fileoverview stdio bridge wrapper for Asana's hosted HTTP MCP endpoint.
 *
 * The wrapper launches `mcp-remote` for the actual HTTP↔stdio transport and rewrites local JSON
 * Schema `$ref` entries in `tools/list` responses. Some model providers only accept tool schemas
 * whose references point into `#/$defs/`; Asana's hosted schemas currently include local property
 * references such as `#/properties/assignee`. Inlining those local references keeps the editor-side
 * transport as stdio while preserving the upstream Asana tool set.
 */

import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { createInterface } from "node:readline";

const ASANA_MCP_URL = "https://mcp.asana.com/v2/mcp";
const ASANA_MCP_RESOURCE_URL = "https://mcp.asana.com/v2";
const ASANA_MCP_REMOTE_CALLBACK_PORT = "3334";
const MAX_REF_INLINE_DEPTH = 16;
const BRIDGE_LOG_PREFIX = "[asana-http-bridge-stdio]";

export function formatBridgeLogLine(source, line) {
  return `${BRIDGE_LOG_PREFIX} [${source}] ${line}`;
}

function writeBridgeLog(source, message) {
  for (const line of String(message).split(/\r?\n/)) {
    if (line.length === 0) {
      continue;
    }
    process.stderr.write(`${formatBridgeLogLine(source, line)}\n`);
  }
}

function writeBridgeFatal(message) {
  writeBridgeLog("bridge", message);
}

function looksLikeFatalError(line) {
  const text = line.toLowerCase();
  return (
    text.includes("fatal") ||
    text.includes("uncaught") ||
    text.includes("unhandled") ||
    text.includes("crash") ||
    text.includes("assertion failed") ||
    /^[\s]*at[\s]+/.test(line) ||
    /^[\s]*\w+error[\s:]/i.test(line)
  );
}

function deepClone(value) {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => deepClone(item));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [key, deepClone(nestedValue)])
  );
}

function decodeJsonPointerSegment(segment) {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

function resolveLocalJsonPointer(root, pointer) {
  if (pointer === "#") {
    return root;
  }

  if (!pointer.startsWith("#/")) {
    return undefined;
  }

  const parts = pointer
    .slice(2)
    .split("/")
    .map((segment) => decodeJsonPointerSegment(segment));

  let current = root;
  for (const part of parts) {
    if (current === null || typeof current !== "object") {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

function inlineLocalRefs(value, root, depth = 0, seenRefs = new Set()) {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => inlineLocalRefs(item, root, depth, seenRefs));
  }

  const objectValue = value;
  if (
    typeof objectValue.$ref === "string" &&
    objectValue.$ref.startsWith("#/") &&
    depth < MAX_REF_INLINE_DEPTH &&
    !seenRefs.has(objectValue.$ref)
  ) {
    const target = resolveLocalJsonPointer(root, objectValue.$ref);
    if (target !== undefined) {
      const nextSeenRefs = new Set(seenRefs);
      nextSeenRefs.add(objectValue.$ref);
      const siblingEntries = Object.entries(objectValue).filter(([key]) => key !== "$ref");
      return {
        ...inlineLocalRefs(deepClone(target), root, depth + 1, nextSeenRefs),
        ...Object.fromEntries(
          siblingEntries.map(([key, nestedValue]) => [
            key,
            inlineLocalRefs(nestedValue, root, depth, seenRefs),
          ])
        ),
      };
    }
  }

  return Object.fromEntries(
    Object.entries(objectValue).map(([key, nestedValue]) => [
      key,
      inlineLocalRefs(nestedValue, root, depth, seenRefs),
    ])
  );
}

export function normalizeLocalJsonSchemaRefs(schema) {
  const clonedSchema = deepClone(schema);
  return inlineLocalRefs(clonedSchema, clonedSchema);
}

export function normalizeToolListMessage(message) {
  const tools = message?.result?.tools;
  if (!Array.isArray(tools)) {
    return message;
  }

  return {
    ...message,
    result: {
      ...message.result,
      tools: tools.map((tool) => ({
        ...tool,
        inputSchema: tool.inputSchema
          ? normalizeLocalJsonSchemaRefs(tool.inputSchema)
          : tool.inputSchema,
        outputSchema: tool.outputSchema
          ? normalizeLocalJsonSchemaRefs(tool.outputSchema)
          : tool.outputSchema,
      })),
    },
  };
}

function transformJsonRpcLine(line) {
  if (!line.trim()) {
    return line;
  }

  try {
    return JSON.stringify(normalizeToolListMessage(JSON.parse(line)));
  } catch {
    return line;
  }
}

function buildMcpRemoteArgs() {
  const clientId = process.env.MCP_ASANA_CLIENT_ID;
  const clientSecret = process.env.MCP_ASANA_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    writeBridgeLog(
      "bridge",
      "Missing MCP_ASANA_CLIENT_ID or MCP_ASANA_CLIENT_SECRET for Asana HTTP stdio bridge."
    );
    process.exit(1);
  }

  return [
    "-y",
    "mcp-remote@latest",
    ASANA_MCP_URL,
    ASANA_MCP_REMOTE_CALLBACK_PORT,
    "--static-oauth-client-info",
    JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
    "--resource",
    ASANA_MCP_RESOURCE_URL,
    "--silent",
  ];
}

function runBridge() {
  const child = spawn("npx", buildMcpRemoteArgs(), {
    env: {
      ...process.env,
      npm_config_loglevel: "silent",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  process.stdin.pipe(child.stdin);

  const stdoutLines = createInterface({
    input: child.stdout,
    crlfDelay: Infinity,
  });

  const stderrLines = createInterface({
    input: child.stderr,
    crlfDelay: Infinity,
  });

  stdoutLines.on("line", (line) => {
    process.stdout.write(`${transformJsonRpcLine(line)}\n`);
  });

  stderrLines.on("line", (line) => {
    if (looksLikeFatalError(line)) {
      writeBridgeLog("mcp-remote", line);
    }
  });

  child.on("error", (error) => {
    writeBridgeFatal(`failed to start mcp-remote: ${error.message}`);
    process.exit(1);
  });

  child.on("close", (code, signal) => {
    if (signal) {
      writeBridgeFatal(`mcp-remote exited after signal ${signal}`);
      process.kill(process.pid, signal);
      return;
    }
    if (code !== 0 && code !== null) {
      writeBridgeFatal(`mcp-remote exited with code ${code}`);
    }
    process.exit(code ?? 0);
  });

  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => {
      child.kill(signal);
    });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runBridge();
}
