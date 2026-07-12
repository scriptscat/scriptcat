import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpScope } from "../shared/protocol.js";
import {
  TOOL_INPUT_SCHEMAS,
  TOOL_TO_ACTION,
  TOOL_DESCRIPTIONS,
  visibleTools,
  toToolResult,
  type ToolName,
} from "./tools.js";
import { buildSourceResourceUri, parseSourceResourceUri } from "./resources.js";
import type { SocketClient, SocketClientEvent } from "./socket-client.js";

export interface ShimServerDeps {
  socketClient: Pick<SocketClient, "call">;
  serverVersion: string;
  getScopes: () => McpScope[];
}

let requestCounter = 0;
function nextRequestId(): string {
  requestCounter += 1;
  return `${Date.now()}-${requestCounter}`;
}

async function callBridge(
  deps: ShimServerDeps,
  action: NonNullable<(typeof TOOL_TO_ACTION)[ToolName]>,
  input: unknown
) {
  const event = (await deps.socketClient.call(nextRequestId(), action, input)) as Extract<
    SocketClientEvent,
    { type: "result" }
  >;
  if (event.ok) {
    return { ok: true as const, result: event.result };
  }
  return { ok: false as const, error: event.error ?? { code: "INTERNAL_ERROR", message: "unknown error" } };
}

/**
 * Builds the MCP server (using the official `@modelcontextprotocol/sdk`): registers only the
 * tools the connected client's granted scopes make visible, with static compile-time
 * descriptions and structured, no-Markdown results (tools.ts's toToolResult). Server info is
 * static; scopes/tool visibility come from the broker's `ready` handshake response, not from
 * anything script-controlled — a malicious userscript's content can never influence which tools
 * an agent sees or how they're described.
 */
export function buildMcpServer(deps: ShimServerDeps): McpServer {
  const server = new McpServer({ name: "scriptcat", version: deps.serverVersion });

  for (const tool of visibleTools(deps.getScopes())) {
    registerTool(server, deps, tool);
  }

  registerSourceResource(server, deps);

  return server;
}

function registerTool(server: McpServer, deps: ShimServerDeps, tool: ToolName): void {
  const action = TOOL_TO_ACTION[tool];
  server.registerTool(
    tool,
    { description: TOOL_DESCRIPTIONS[tool], inputSchema: schemaShape(TOOL_INPUT_SCHEMAS[tool]) },
    async (args: unknown) => {
      if (tool === "server_info") {
        return toToolResult({
          ok: true,
          result: { name: "scriptcat", version: deps.serverVersion, scopes: deps.getScopes() },
        });
      }
      // action is always defined for every non-server_info tool (see tools.ts TOOL_TO_ACTION).
      const outcome = await callBridge(deps, action!, args);
      return toToolResult(outcome);
    }
  );
}

// registerTool's inputSchema parameter accepts either a full zod schema or a raw shape object;
// our TOOL_INPUT_SCHEMAS are already ZodObject instances, which satisfy the SDK's AnySchema
// union directly.
function schemaShape<T>(schema: T): T {
  return schema;
}

function registerSourceResource(server: McpServer, deps: ShimServerDeps): void {
  if (!deps.getScopes().includes("scripts:source:read")) return;

  server.registerResource(
    "script-source",
    new ResourceTemplate(buildSourceResourceUri("{uuid}"), { list: undefined }),
    { description: "A userscript's full source code, identified by uuid.", mimeType: "text/javascript" },
    async (uri) => {
      const uuid = parseSourceResourceUri(uri.href);
      if (!uuid) {
        throw new Error("invalid scriptcat:// source resource URI");
      }
      const outcome = await callBridge(deps, "scripts.source.get", { uuid });
      if (!outcome.ok) {
        throw new Error(outcome.error.message);
      }
      const result = outcome.result as { code: string };
      return { contents: [{ uri: uri.href, text: result.code, mimeType: "text/javascript" }] };
    }
  );
}
