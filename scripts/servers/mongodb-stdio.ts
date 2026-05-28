/**
 * @fileoverview Defines the MCP server template for mongodb.
 *
 * Flow: server definition -> registry entry -> editor-specific config generation.
 *
 * @example
 * ```typescript
 * const server = mongodbStdioServer;
 * ```
 *
 * @testing Jest unit: npm test
 * @see scripts/servers/index.ts - Re-exports the complete server registry.
 * @see scripts/lib/types.ts - Defines the shared server template type used here.
 * @documentation reviewed=2026-04-11 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import type {
  McpServerTemplate,
  StdioServerConfig,
  VscodeServerConfig,
  OpenCodeServerConfig,
  ZedServerConfig,
  GooseExtensionConfig,
  CodexServerConfig,
  ContinueServerConfig,
  EnvVars,
} from "../lib/types";

/**
 * MongoDB MCP Server Definition
 *
 * Maps environment variables:
 * - MCP_MONGODB_CONNECTION_STRING -> MONGODB_URI (in server config)
 */
export const mongodbStdioServer: McpServerTemplate = {
  id: "mongodb-stdio",
  name: "MongoDB MCP Server",
  transport: "stdio",
  package: "mongodb-mcp-server",
  envVars: ["MCP_MONGODB_CONNECTION_STRING"],
  configs: {
    /**
     * Standard configuration (Cursor, Windsurf, Claude CLI, etc.)
     * Format: { mcpServers: { "mongodb-stdio": { ... } } }
     */
    standard: (env: EnvVars): StdioServerConfig => {
      const connectionString = env.MCP_MONGODB_CONNECTION_STRING;

      return {
        command: "npx",
        args: ["mongodb-mcp-server"],
        env: {
          MONGODB_URI: connectionString,
        },
      };
    },

    /**
     * VSCode native MCP format
     * Format: { servers: { "mongodb-stdio": { ... } } }
     */
    vscode: (env: EnvVars): VscodeServerConfig => {
      const connectionString = env.MCP_MONGODB_CONNECTION_STRING;

      return {
        type: "stdio",
        command: "npx",
        args: ["mongodb-mcp-server"],
        env: {
          MONGODB_URI: connectionString,
        },
      };
    },

    /**
     * OpenCode format
     * Format: { mcp: { servers: { "mongodb-stdio": { ... } } } }
     */
    opencode: (env: EnvVars): OpenCodeServerConfig => {
      const connectionString = env.MCP_MONGODB_CONNECTION_STRING;

      return {
        type: "local",
        command: ["npx", "mongodb-mcp-server"],
        environment: {
          MONGODB_URI: connectionString,
        },
      };
    },

    /**
     * Zed context_servers format
     * Format: { context_servers: { "mongodb-stdio": { ... } } }
     */
    zed: (env: EnvVars): ZedServerConfig => {
      const connectionString = env.MCP_MONGODB_CONNECTION_STRING;

      return {
        command: "npx",
        args: ["mongodb-mcp-server"],
        env: {
          MONGODB_URI: connectionString,
        },
      };
    },

    /**
     * Goose extensions format (YAML)
     * Configures MongoDB as a Goose extension
     */
    goose: (env: EnvVars): GooseExtensionConfig => {
      const connectionString = env.MCP_MONGODB_CONNECTION_STRING;

      return {
        name: "mongodb-stdio",
        command: "npx",
        args: ["mongodb-mcp-server"],
        env: {
          MONGODB_URI: connectionString,
        },
        timeout: 30000,
      };
    },

    /**
     * Codex TOML format
     * Configures MongoDB for Codex editor
     */
    codex: (env: EnvVars): CodexServerConfig => {
      const connectionString = env.MCP_MONGODB_CONNECTION_STRING;

      return {
        command: "npx",
        args: ["mongodb-mcp-server"],
        env: {
          MONGODB_URI: connectionString,
        },
      };
    },

    /**
     * Continue YAML format
     * Configures MongoDB for Continue IDE extension
     */
    continue: (env: EnvVars): ContinueServerConfig => {
      const connectionString = env.MCP_MONGODB_CONNECTION_STRING;

      return {
        name: "mongodb-stdio",
        command: "npx",
        args: ["mongodb-mcp-server"],
        env: {
          MONGODB_URI: connectionString,
        },
      };
    },
  },
};

/**
 * Export as default for convenient imports
 */
export default mongodbStdioServer;
