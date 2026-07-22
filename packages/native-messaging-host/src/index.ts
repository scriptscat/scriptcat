#!/usr/bin/env node
/**
 * ScriptCat Native Messaging Host + MCP Server (unified process)
 *
 * Architecture:
 *   AI ←HTTP/SSE→ [MCP Server :3333] ←EventEmitter→ [NativeHost → stdio → 浏览器]
 *
 * The NativeHost portion handles the browser's stdio protocol.
 * The MCP portion serves HTTP-based MCP protocol with SSE transport.
 * Both share the same process, communicating via an internal message bus.
 */

import * as http from "node:http";
import { EventEmitter } from "node:events";

// ═══════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════

type NativeMessageType =
  | "list_scripts"
  | "get_script"
  | "install_script"
  | "uninstall_script"
  | "enable_script"
  | "disable_script";

interface NativeRequest {
  id: string;
  type: NativeMessageType;
  data: Record<string, unknown>;
}

interface NativeResponse {
  id: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}

interface ScriptSummary {
  uuid: string;
  name: string;
  namespace: string;
  version?: string;
  author?: string;
  type: string;
  enabled: boolean;
  description?: string;
}

// ═══════════════════════════════════════════════════════════
// Internal Message Bus
// ═══════════════════════════════════════════════════════════

const bus = new EventEmitter();
bus.setMaxListeners(50);

function sendToBrowser(request: NativeRequest): Promise<NativeResponse> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      bus.off(responseId, handler);
      reject(new Error("Timeout waiting for browser response"));
    }, 30000);

    const responseId = `resp_${request.id}`;
    const handler = (response: NativeResponse) => {
      clearTimeout(timer);
      resolve(response);
    };

    bus.once(responseId, handler);
    bus.emit("to_browser", request);
  });
}

// ═══════════════════════════════════════════════════════════
// Native Messaging Host (stdio ←→ browser extension)
// ═══════════════════════════════════════════════════════════

function startNativeHost(): void {
  // Async stdin reading: accumulate raw bytes, parse 4-byte LE length-prefixed JSON messages.
  // Using async (EventEmitter) mode so the event loop stays free for HTTP server.
  let buf = Buffer.alloc(0);

  process.stdin.on("data", (chunk: Buffer) => {
    buf = Buffer.concat([buf, chunk]);

    while (buf.length >= 4) {
      const msgLen = buf.readUInt32LE(0);
      if (msgLen > 1024 * 1024) {
        console.error("[NativeHost] message too large:", msgLen);
        buf = Buffer.alloc(0);
        return;
      }
      const totalLen = 4 + msgLen;
      if (buf.length < totalLen) break; // incomplete message, wait for more data

      try {
        const msg: NativeResponse = JSON.parse(buf.subarray(4, totalLen).toString("utf-8"));
        bus.emit(`resp_${msg.id}`, msg);
      } catch (e) {
        console.error("[NativeHost] invalid JSON from browser:", e);
      }

      buf = buf.subarray(totalLen);
    }
  });

  process.stdin.on("end", () => {
    console.error("[NativeHost] stdin closed");
    process.exit(0);
  });

  // Send messages to browser on stdout
  bus.on("to_browser", (request: NativeRequest) => {
    const json = JSON.stringify(request);
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32LE(Buffer.byteLength(json, "utf-8"), 0);
    process.stdout.write(lenBuf);
    process.stdout.write(json);
  });

  console.error("[NativeHost] Listening on stdio for browser connection...");
}

// ═══════════════════════════════════════════════════════════
// MCP Protocol Handlers
// ═══════════════════════════════════════════════════════════

async function handleListScripts(): Promise<ScriptSummary[]> {
  const resp = await sendToBrowser({
    id: genId(),
    type: "list_scripts",
    data: {},
  });
  if (!resp.ok) throw new Error(resp.error);
  return (resp.data as ScriptSummary[]) || [];
}

async function handleGetScript(uuid: string): Promise<unknown> {
  const resp = await sendToBrowser({
    id: genId(),
    type: "get_script",
    data: { uuid },
  });
  if (!resp.ok) throw new Error(resp.error);
  return resp.data;
}

async function handleInstallScript(args: { url?: string; code?: string }): Promise<unknown> {
  const resp = await sendToBrowser({
    id: genId(),
    type: "install_script",
    data: args as Record<string, unknown>,
  });
  if (!resp.ok) throw new Error(resp.error);
  return resp.data;
}

async function handleUninstallScript(uuid: string): Promise<unknown> {
  const resp = await sendToBrowser({
    id: genId(),
    type: "uninstall_script",
    data: { uuid },
  });
  if (!resp.ok) throw new Error(resp.error);
  return resp.data;
}

async function handleToggleScript(uuid: string, enable: boolean): Promise<unknown> {
  const resp = await sendToBrowser({
    id: genId(),
    type: enable ? "enable_script" : "disable_script",
    data: { uuid },
  });
  if (!resp.ok) throw new Error(resp.error);
  return resp.data;
}

// ═══════════════════════════════════════════════════════════
// MCP over HTTP + SSE (Streamable HTTP Transport)
// ═══════════════════════════════════════════════════════════

const connectedClients = new Set<http.ServerResponse>();
let sessionCounter = 0;

const TOOLS = [
  {
    name: "list_scripts",
    description: "List all installed ScriptCat user scripts",
    inputSchema: { type: "object", properties: {} as Record<string, unknown> },
  },
  {
    name: "get_script",
    description: "Get a script's details and source code by UUID",
    inputSchema: {
      type: "object",
      properties: { uuid: { type: "string", description: "Script UUID" } },
      required: ["uuid"],
    },
  },
  {
    name: "install_script",
    description: "Install a user script from URL or JavaScript code",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL of the user script" },
        code: { type: "string", description: "JavaScript code of the script" },
      },
    },
  },
  {
    name: "uninstall_script",
    description: "Uninstall a user script by UUID",
    inputSchema: {
      type: "object",
      properties: { uuid: { type: "string", description: "Script UUID" } },
      required: ["uuid"],
    },
  },
  {
    name: "enable_script",
    description: "Enable a user script by UUID",
    inputSchema: {
      type: "object",
      properties: { uuid: { type: "string", description: "Script UUID" } },
      required: ["uuid"],
    },
  },
  {
    name: "disable_script",
    description: "Disable a user script by UUID",
    inputSchema: {
      type: "object",
      properties: { uuid: { type: "string", description: "Script UUID" } },
      required: ["uuid"],
    },
  },
];

async function executeToolCall(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "list_scripts": {
      const scripts = await handleListScripts();
      if (!scripts.length) return "No scripts installed.";
      return `## Installed Scripts (${scripts.length})\n\n` +
        scripts.map(s =>
          `- **${s.name}** (${s.namespace || "no ns"})\n  UUID: \`${s.uuid}\` | v${s.version || "?"} | ${s.enabled ? "enabled" : "disabled"} | ${s.type}\n  ${s.description || ""}`
        ).join("\n\n");
    }
    case "get_script": {
      const script = await handleGetScript(args.uuid as string) as any;
      if (!script) return `Script not found: ${args.uuid}`;
      return `## ${script.name}\n**UUID:** \`${script.uuid}\`\n**Code (first 2000 chars):**\n\`\`\`javascript\n${(script.code || "").slice(0, 2000)}\n\`\`\``;
    }
    case "install_script": {
      const result = await handleInstallScript(args) as any;
      return `Installed: **${result.name}** (\`${result.uuid}\`)`;
    }
    case "uninstall_script": {
      await handleUninstallScript(args.uuid as string);
      return `Uninstalled: \`${args.uuid}\``;
    }
    case "enable_script":
    case "disable_script": {
      const enable = name === "enable_script";
      await handleToggleScript(args.uuid as string, enable);
      return `Script \`${args.uuid}\` ${enable ? "enabled" : "disabled"}`;
    }
    default:
      return `Unknown tool: ${name}`;
  }
}

// ═══════════════════════════════════════════════════════════
// HTTP Server
// ═══════════════════════════════════════════════════════════

const PORT = parseInt(process.env.SCRIPTCAT_MCP_PORT || "3333", 10);

function sendSSE(res: http.ServerResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Mcp-Session-Id");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://localhost:${PORT}`);

  // ── SSE endpoint ──
  if (req.method === "GET" && url.pathname === "/sse") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    const sessionId = `session_${++sessionCounter}`;
    connectedClients.add(res);

    sendSSE(res, "endpoint", { uri: `/message?sessionId=${sessionId}` });

    req.on("close", () => connectedClients.delete(res));
    return;
  }

  // ── Message endpoint (JSON-RPC) ──
  if (req.method === "POST" && url.pathname === "/message") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", async () => {
      try {
        const rpc = JSON.parse(body);

        // Handle initialize
        if (rpc.method === "initialize") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            jsonrpc: "2.0",
            id: rpc.id,
            result: {
              protocolVersion: "2024-11-05",
              capabilities: { tools: {} },
              serverInfo: { name: "scriptcat", version: "1.0.0" },
            },
          }));
          return;
        }

        // Handle notifications (no response)
        if (rpc.method === "notifications/initialized") {
          res.writeHead(202);
          res.end();
          return;
        }

        // Handle tools/list
        if (rpc.method === "tools/list") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            jsonrpc: "2.0",
            id: rpc.id,
            result: { tools: TOOLS },
          }));
          return;
        }

        // Handle tools/call
        if (rpc.method === "tools/call") {
          const { name, arguments: args } = rpc.params;
          const text = await executeToolCall(name, args || {});
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            jsonrpc: "2.0",
            id: rpc.id,
            result: { content: [{ type: "text", text }] },
          }));
          return;
        }

        // Unknown method
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          jsonrpc: "2.0",
          id: rpc.id,
          result: {},
        }));
      } catch (e: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32603, message: e.message },
        }));
      }
    });
    return;
  }

  // ── Health check ──
  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", name: "scriptcat-mcp", version: "1.0.0" }));
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

// ═══════════════════════════════════════════════════════════
// Startup
// ═══════════════════════════════════════════════════════════

let idCounter = 0;
function genId(): string {
  return `m_${Date.now()}_${++idCounter}`;
}

// Start both
startNativeHost();

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`[MCP Server] Port ${PORT} already in use — another instance is running. MCP endpoint skipped.`);
  } else {
    console.error("[MCP Server] HTTP server error:", err);
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.error(`[MCP Server] HTTP+SSE listening on http://127.0.0.1:${PORT}`);
  console.error("[MCP Server] SSE endpoint: GET /sse");
  console.error("[MCP Server] Message endpoint: POST /message");
});