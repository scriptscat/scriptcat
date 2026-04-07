import { describe, it, expect, vi, beforeEach } from "vitest";
import { MCPClient } from "./mcp_client";
import type { MCPServerConfig } from "./types";

// Mock fetch
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

function jsonResponse(result: unknown, headers?: Record<string, string>): Response {
  const h = new Headers({ "Content-Type": "application/json", ...headers });
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
    status: 200,
    headers: h,
  });
}

function jsonErrorResponse(code: number, message: string): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code, message } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function httpErrorResponse(status: number, body = ""): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/plain" } });
}

describe("MCPClient", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("initialize", () => {
    it("应正确发送 initialize 和 initialized 请求", async () => {
      const client = new MCPClient(createConfig());

      // initialize response
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          protocolVersion: "2025-03-26",
          capabilities: {},
          serverInfo: { name: "TestServer", version: "1.0" },
        })
      );
      // initialized notification response
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));

      await client.initialize();

      expect(mockFetch).toHaveBeenCalledTimes(2);

      // 第一个请求是 initialize
      const firstCall = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(firstCall.method).toBe("initialize");
      expect(firstCall.id).toBeDefined();
      expect(firstCall.params.protocolVersion).toBe("2025-03-26");

      // 第二个请求是 initialized 通知（无 id）
      const secondCall = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(secondCall.method).toBe("notifications/initialized");
      expect(secondCall.id).toBeUndefined();

      expect(client.isInitialized()).toBe(true);
    });

    it("initialize 响应缺少 protocolVersion 时应抛出错误", async () => {
      const client = new MCPClient(createConfig());
      mockFetch.mockResolvedValueOnce(jsonResponse({}));

      await expect(client.initialize()).rejects.toThrow("missing protocolVersion");
    });

    it("HTTP 错误时应抛出", async () => {
      const client = new MCPClient(createConfig());
      mockFetch.mockResolvedValueOnce(httpErrorResponse(500, "Internal Server Error"));

      await expect(client.initialize()).rejects.toThrow("500");
    });
  });

  describe("listTools", () => {
    it("应正确解析 tools/list 响应", async () => {
      const client = new MCPClient(createConfig());

      // initialize
      mockFetch.mockResolvedValueOnce(jsonResponse({ protocolVersion: "2025-03-26", capabilities: {} }));
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));
      await client.initialize();

      // listTools
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          tools: [
            {
              name: "search",
              description: "Search the web",
              inputSchema: { type: "object", properties: { query: { type: "string" } } },
            },
          ],
        })
      );

      const tools = await client.listTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe("search");
      expect(tools[0].serverId).toBe("test-server");
      expect(tools[0].description).toBe("Search the web");
    });

    it("未初始化时应抛出错误", async () => {
      const client = new MCPClient(createConfig());
      await expect(client.listTools()).rejects.toThrow("not initialized");
    });
  });

  describe("callTool", () => {
    async function initClient(): Promise<MCPClient> {
      const client = new MCPClient(createConfig());
      mockFetch.mockResolvedValueOnce(jsonResponse({ protocolVersion: "2025-03-26", capabilities: {} }));
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));
      await client.initialize();
      return client;
    }

    it("应正确发送 tools/call 并返回文本结果", async () => {
      const client = await initClient();

      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          content: [{ type: "text", text: "Result from tool" }],
        })
      );

      const result = await client.callTool("search", { query: "hello" });
      expect(result).toBe("Result from tool");

      const lastCall = JSON.parse(mockFetch.mock.lastCall![1].body);
      expect(lastCall.method).toBe("tools/call");
      expect(lastCall.params.name).toBe("search");
      expect(lastCall.params.arguments).toEqual({ query: "hello" });
    });

    it("isError 时应抛出错误", async () => {
      const client = await initClient();

      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          content: [{ type: "text", text: "Something went wrong" }],
          isError: true,
        })
      );

      await expect(client.callTool("search", { query: "fail" })).rejects.toThrow("Something went wrong");
    });

    it("多内容时应返回完整 content 数组", async () => {
      const client = await initClient();

      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          content: [
            { type: "text", text: "Part 1" },
            { type: "image", data: "base64data", mimeType: "image/png" },
          ],
        })
      );

      const result = await client.callTool("multi", {});
      expect(Array.isArray(result)).toBe(true);
      expect((result as any[]).length).toBe(2);
    });
  });

  describe("listResources / readResource", () => {
    async function initClient(): Promise<MCPClient> {
      const client = new MCPClient(createConfig());
      mockFetch.mockResolvedValueOnce(jsonResponse({ protocolVersion: "2025-03-26", capabilities: {} }));
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));
      await client.initialize();
      return client;
    }

    it("应正确解析 resources/list", async () => {
      const client = await initClient();

      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          resources: [{ uri: "file:///docs/readme.md", name: "README", mimeType: "text/markdown" }],
        })
      );

      const resources = await client.listResources();
      expect(resources).toHaveLength(1);
      expect(resources[0].uri).toBe("file:///docs/readme.md");
      expect(resources[0].serverId).toBe("test-server");
    });

    it("应正确读取资源", async () => {
      const client = await initClient();

      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          contents: [{ uri: "file:///docs/readme.md", text: "# Hello", mimeType: "text/markdown" }],
        })
      );

      const result = await client.readResource("file:///docs/readme.md");
      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].text).toBe("# Hello");
    });
  });

  describe("listPrompts / getPrompt", () => {
    async function initClient(): Promise<MCPClient> {
      const client = new MCPClient(createConfig());
      mockFetch.mockResolvedValueOnce(jsonResponse({ protocolVersion: "2025-03-26", capabilities: {} }));
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));
      await client.initialize();
      return client;
    }

    it("应正确解析 prompts/list", async () => {
      const client = await initClient();

      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          prompts: [
            {
              name: "summarize",
              description: "Summarize text",
              arguments: [{ name: "text", required: true }],
            },
          ],
        })
      );

      const prompts = await client.listPrompts();
      expect(prompts).toHaveLength(1);
      expect(prompts[0].name).toBe("summarize");
      expect(prompts[0].arguments).toHaveLength(1);
    });

    it("应正确获取 prompt 消息", async () => {
      const client = await initClient();

      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          messages: [{ role: "user", content: { type: "text", text: "Summarize: hello world" } }],
        })
      );

      const messages = await client.getPrompt("summarize", { text: "hello world" });
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe("user");
    });
  });

  describe("Session ID 管理", () => {
    it("应存储并回传 Mcp-Session-Id", async () => {
      const client = new MCPClient(createConfig());

      // initialize 返回 session id
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ protocolVersion: "2025-03-26", capabilities: {} }, { "Mcp-Session-Id": "session-123" })
      );
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));
      await client.initialize();

      // 后续请求应包含 session id
      mockFetch.mockResolvedValueOnce(jsonResponse({ tools: [] }));
      await client.listTools();

      const lastCallHeaders = mockFetch.mock.lastCall![1].headers;
      expect(lastCallHeaders["Mcp-Session-Id"]).toBe("session-123");
    });
  });

  describe("JSON-RPC 错误处理", () => {
    it("应正确处理 JSON-RPC 错误", async () => {
      const client = new MCPClient(createConfig());

      // initialize 返回 JSON-RPC 错误
      mockFetch.mockResolvedValueOnce(jsonErrorResponse(-32600, "Invalid Request"));

      await expect(client.initialize()).rejects.toThrow("MCP error -32600: Invalid Request");
    });
  });

  describe("认证头", () => {
    it("应设置 Bearer token", async () => {
      const client = new MCPClient(createConfig({ apiKey: "sk-test-key" }));

      mockFetch.mockResolvedValueOnce(jsonResponse({ protocolVersion: "2025-03-26", capabilities: {} }));
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));
      await client.initialize();

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers["Authorization"]).toBe("Bearer sk-test-key");
    });

    it("应设置自定义 headers", async () => {
      const client = new MCPClient(createConfig({ headers: { "X-Custom": "custom-value" } }));

      mockFetch.mockResolvedValueOnce(jsonResponse({ protocolVersion: "2025-03-26", capabilities: {} }));
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));
      await client.initialize();

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers["X-Custom"]).toBe("custom-value");
    });
  });

  describe("close", () => {
    it("close 后应标记为未初始化", async () => {
      const client = new MCPClient(createConfig());

      mockFetch.mockResolvedValueOnce(jsonResponse({ protocolVersion: "2025-03-26", capabilities: {} }));
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));
      await client.initialize();

      expect(client.isInitialized()).toBe(true);
      client.close();
      expect(client.isInitialized()).toBe(false);
    });

    it("close 后调用 listTools 应抛出 not initialized", async () => {
      const client = new MCPClient(createConfig());

      mockFetch.mockResolvedValueOnce(jsonResponse({ protocolVersion: "2025-03-26", capabilities: {} }));
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));
      await client.initialize();

      client.close();
      await expect(client.listTools()).rejects.toThrow("not initialized");
    });

    it("close 后调用 callTool 应抛出 not initialized", async () => {
      const client = new MCPClient(createConfig());

      mockFetch.mockResolvedValueOnce(jsonResponse({ protocolVersion: "2025-03-26", capabilities: {} }));
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));
      await client.initialize();

      client.close();
      await expect(client.callTool("search", { q: "test" })).rejects.toThrow("not initialized");
    });
  });

  describe("callTool 边界场景", () => {
    async function initClient(): Promise<MCPClient> {
      const client = new MCPClient(createConfig());
      mockFetch.mockResolvedValueOnce(jsonResponse({ protocolVersion: "2025-03-26", capabilities: {} }));
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));
      await client.initialize();
      return client;
    }

    it("callTool 无参数调用：不传 args → 发送 arguments: {}", async () => {
      const client = await initClient();

      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          content: [{ type: "text", text: "no args result" }],
        })
      );

      const result = await client.callTool("ping");
      expect(result).toBe("no args result");

      const lastCall = JSON.parse(mockFetch.mock.lastCall![1].body);
      expect(lastCall.method).toBe("tools/call");
      expect(lastCall.params.name).toBe("ping");
      expect(lastCall.params.arguments).toEqual({});
    });

    it("callTool JSON-RPC 错误：返回 JSON-RPC error → 抛出 MCP error", async () => {
      const client = await initClient();

      mockFetch.mockResolvedValueOnce(jsonErrorResponse(-32601, "Method not found"));

      await expect(client.callTool("unknown_tool", {})).rejects.toThrow("MCP error -32601: Method not found");
    });

    it("callTool 空 content：返回空 content 数组", async () => {
      const client = await initClient();

      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          content: [],
        })
      );

      const result = await client.callTool("empty", {});
      // 空 content，不是单个 text，返回整个 content 数组
      expect(Array.isArray(result)).toBe(true);
      expect((result as any[]).length).toBe(0);
    });
  });

  describe("请求超时", () => {
    it("sendRequest 应传递 AbortSignal.timeout(60s)", async () => {
      const client = new MCPClient(createConfig());

      mockFetch.mockResolvedValueOnce(jsonResponse({ protocolVersion: "2025-03-26", capabilities: {} }));
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));
      await client.initialize();

      // 检查 initialize 的 fetch 调用带了 signal
      expect(mockFetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
      // 检查 notification 的 fetch 调用也带了 signal
      expect(mockFetch.mock.calls[1][1].signal).toBeInstanceOf(AbortSignal);
    });
  });

  describe("sendNotification 失败", () => {
    it("initialize 过程中通知失败应抛出", async () => {
      const client = new MCPClient(createConfig());

      // initialize 请求成功
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          protocolVersion: "2025-03-26",
          capabilities: {},
          serverInfo: { name: "TestServer", version: "1.0" },
        })
      );
      // initialized 通知失败（HTTP error）
      mockFetch.mockResolvedValueOnce(httpErrorResponse(503, "Service Unavailable"));

      await expect(client.initialize()).rejects.toThrow("503");
    });
  });
});
