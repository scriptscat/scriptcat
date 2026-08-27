// SDK 的 SSE 管线需要原生 Web Streams；happy-dom 下会超过 fast 项目的 340ms 预算。
// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { MCPClient } from "./mcp_client";
import type { MCPServerConfig } from "./types";

type JsonRpcRequest = {
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
};

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function createConfig(overrides?: Partial<MCPServerConfig>): MCPServerConfig {
  return {
    id: "test-server",
    name: "Test Server",
    url: "https://mcp.example.com/rpc",
    enabled: true,
    createtime: Date.now(),
    updatetime: Date.now(),
    ...overrides,
  };
}

function jsonResponse(id: JsonRpcRequest["id"], result: unknown, headers?: HeadersInit): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...Object.fromEntries(new Headers(headers)) },
  });
}

function sseResponse(id: JsonRpcRequest["id"], result: unknown): Response {
  return new Response(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id, result })}\n\n`, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function installServer(overrides: Partial<Record<string, (request: JsonRpcRequest) => Response>> = {}): void {
  mockFetch.mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "GET") {
      return new Response(null, { status: 405 });
    }

    const request = JSON.parse(String(init?.body)) as JsonRpcRequest;
    if (request.method === "notifications/initialized") {
      return new Response(null, { status: 202 });
    }

    const override = overrides[request.method];
    if (override) {
      return override(request);
    }

    switch (request.method) {
      case "initialize":
        return jsonResponse(
          request.id,
          {
            protocolVersion: "2025-03-26",
            capabilities: {},
            serverInfo: { name: "TestServer", version: "1.0.0" },
          },
          { "Mcp-Session-Id": "session-123" }
        );
      case "tools/list":
        return jsonResponse(request.id, {
          tools: [
            {
              name: "search",
              description: "Search the web",
              inputSchema: { type: "object", properties: { query: { type: "string" } } },
            },
          ],
        });
      case "tools/call":
        return jsonResponse(request.id, { content: [{ type: "text", text: "Result from tool" }] });
      case "resources/list":
        return jsonResponse(request.id, {
          resources: [{ uri: "file:///readme.md", name: "README", mimeType: "text/markdown" }],
        });
      case "resources/read":
        return jsonResponse(request.id, {
          contents: [{ uri: "file:///readme.md", text: "# Hello", mimeType: "text/markdown" }],
        });
      case "prompts/list":
        return jsonResponse(request.id, {
          prompts: [{ name: "summarize", description: "Summarize text", arguments: [{ name: "text" }] }],
        });
      case "prompts/get":
        return jsonResponse(request.id, {
          messages: [{ role: "user", content: { type: "text", text: "Summarize: hello" } }],
        });
      default:
        throw new Error(`Unexpected MCP method: ${request.method}`);
    }
  });
}

function requests(): JsonRpcRequest[] {
  return mockFetch.mock.calls
    .filter(([, init]) => init?.body)
    .map(([, init]) => JSON.parse(String(init.body)) as JsonRpcRequest);
}

describe("MCPClient", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    installServer();
  });

  it("初始化后可发现工具并保留 ScriptCat 服务器标识", async () => {
    const client = new MCPClient(createConfig());
    await client.initialize();

    await expect(client.listTools()).resolves.toEqual([
      {
        serverId: "test-server",
        name: "search",
        description: "Search the web",
        inputSchema: { type: "object", properties: { query: { type: "string" } } },
      },
    ]);
    expect(client.isInitialized()).toBe(true);
  });

  it("调用工具时透传参数并将单个文本内容归一化为字符串", async () => {
    const client = new MCPClient(createConfig());
    await client.initialize();

    await expect(client.callTool("search", { query: "hello" })).resolves.toBe("Result from tool");
    expect(requests().find((request) => request.method === "tools/call")?.params).toEqual({
      name: "search",
      arguments: { query: "hello" },
    });
  });

  it("服务器以 SSE 返回工具结果时仍应完成调用", async () => {
    installServer({
      "tools/call": (request) => sseResponse(request.id, { content: [{ type: "text", text: "Result from SSE" }] }),
    });
    const client = new MCPClient(createConfig());
    await client.initialize();

    await expect(client.callTool("search", { query: "hello" })).resolves.toBe("Result from SSE");
  });

  it("工具返回 isError 时向调用方抛出文本错误", async () => {
    installServer({
      "tools/call": (request) =>
        jsonResponse(request.id, { content: [{ type: "text", text: "Tool failed" }], isError: true }),
    });
    const client = new MCPClient(createConfig());
    await client.initialize();

    await expect(client.callTool("search")).rejects.toThrow("Tool failed");
  });

  it("工具返回 structuredContent 时不应丢失结构化结果", async () => {
    installServer({
      "tools/call": (request) =>
        jsonResponse(request.id, {
          content: [{ type: "text", text: "Readable result" }],
          structuredContent: { value: 42 },
        }),
    });
    const client = new MCPClient(createConfig());
    await client.initialize();

    await expect(client.callTool("search")).resolves.toEqual({
      content: [{ type: "text", text: "Readable result" }],
      structuredContent: { value: 42 },
    });
  });

  it("工具返回非文本错误内容时应保留诊断信息", async () => {
    installServer({
      "tools/call": (request) =>
        jsonResponse(request.id, {
          content: [{ type: "image", data: "base64", mimeType: "image/png" }],
          isError: true,
        }),
    });
    const client = new MCPClient(createConfig());
    await client.initialize();

    await expect(client.callTool("search")).rejects.toThrow('"mimeType":"image/png"');
  });

  it("仅由 structuredContent 携带错误详情时也应保留诊断信息", async () => {
    installServer({
      "tools/call": (request) =>
        jsonResponse(request.id, {
          content: [],
          structuredContent: { error: "quota exceeded" },
          isError: true,
        }),
    });
    const client = new MCPClient(createConfig());
    await client.initialize();

    await expect(client.callTool("search")).rejects.toThrow('"quota exceeded"');
  });

  it("可列出和读取资源", async () => {
    const client = new MCPClient(createConfig());
    await client.initialize();

    await expect(client.listResources()).resolves.toEqual([
      {
        serverId: "test-server",
        uri: "file:///readme.md",
        name: "README",
        description: undefined,
        mimeType: "text/markdown",
      },
    ]);
    await expect(client.readResource("file:///readme.md")).resolves.toEqual({
      contents: [{ uri: "file:///readme.md", text: "# Hello", mimeType: "text/markdown" }],
    });
  });

  it("可列出提示词并获取提示词消息", async () => {
    const client = new MCPClient(createConfig());
    await client.initialize();

    await expect(client.listPrompts()).resolves.toEqual([
      {
        serverId: "test-server",
        name: "summarize",
        description: "Summarize text",
        arguments: [{ name: "text" }],
      },
    ]);
    await expect(client.getPrompt("summarize", { text: "hello" })).resolves.toEqual([
      { role: "user", content: { type: "text", text: "Summarize: hello" } },
    ]);
  });

  it("所有请求都携带认证、自定义 header 和服务器 session", async () => {
    const client = new MCPClient(createConfig({ apiKey: "secret", headers: { "X-Custom": "custom-value" } }));
    await client.initialize();
    await client.listTools();

    const calls = mockFetch.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(calls).not.toHaveLength(0);
    for (const [, init] of calls) {
      const headers = new Headers(init.headers);
      expect(headers.get("Authorization")).toBe("Bearer secret");
      expect(headers.get("X-Custom")).toBe("custom-value");
    }
    expect(new Headers(calls.at(-1)?.[1].headers).get("Mcp-Session-Id")).toBe("session-123");
  });

  it("关闭后拒绝后续调用", async () => {
    const client = new MCPClient(createConfig());
    await client.initialize();
    await client.close();

    expect(client.isInitialized()).toBe(false);
    await expect(client.listTools()).rejects.toThrow("not initialized");
  });

  it("初始化失败时保持未初始化", async () => {
    installServer({ initialize: () => new Response("unavailable", { status: 503 }) });
    const client = new MCPClient(createConfig());

    await expect(client.initialize()).rejects.toThrow("Error POSTing to endpoint");
    expect(client.isInitialized()).toBe(false);
  });
});
