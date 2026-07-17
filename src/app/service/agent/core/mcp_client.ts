import type { MCPServerConfig, MCPTool, MCPResource, MCPPrompt, MCPPromptMessage } from "./types";

// JSON-RPC 2.0 请求
type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: number;
  method: string;
  params?: Record<string, unknown>;
};

// JSON-RPC 2.0 响应
type JsonRpcResponse = {
  jsonrpc: "2.0";
  id?: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

// MCP 协议版本
const MCP_PROTOCOL_VERSION = "2025-03-26";

// MCP Client — JSON-RPC 2.0 over Streamable HTTP (POST only)
export class MCPClient {
  private nextId = 1;
  private sessionId?: string;
  private initialized = false;

  constructor(private config: MCPServerConfig) {}

  // 初始化：交换协议版本和能力
  async initialize(): Promise<void> {
    const result = (await this.sendRequest("initialize", {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "ScriptCat", version: "1.0.0" },
    })) as {
      protocolVersion: string;
      capabilities: Record<string, unknown>;
      serverInfo?: { name: string; version?: string };
    };

    if (!result || !result.protocolVersion) {
      throw new Error("Invalid initialize response: missing protocolVersion");
    }

    // 发送 initialized 通知（无 id = 通知）
    await this.sendNotification("notifications/initialized", {});
    this.initialized = true;
  }

  // ---- Tools ----

  async listTools(): Promise<MCPTool[]> {
    this.ensureInitialized();
    const result = (await this.sendRequest("tools/list", {})) as {
      tools: Array<{ name: string; description?: string; inputSchema: Record<string, unknown> }>;
    };
    return (result.tools || []).map((t) => ({
      serverId: this.config.id,
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  }

  async callTool(name: string, args?: Record<string, unknown>): Promise<unknown> {
    this.ensureInitialized();
    const result = (await this.sendRequest("tools/call", {
      name,
      arguments: args || {},
    })) as {
      content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
      isError?: boolean;
    };

    if (result.isError) {
      const errorText = result.content?.map((c) => c.text || "").join("\n") || "Tool call failed";
      throw new Error(errorText);
    }

    // 返回文本内容或完整 content
    if (result.content?.length === 1 && result.content[0].type === "text") {
      return result.content[0].text;
    }
    return result.content;
  }

  // ---- Resources ----

  async listResources(): Promise<MCPResource[]> {
    this.ensureInitialized();
    const result = (await this.sendRequest("resources/list", {})) as {
      resources: Array<{ uri: string; name: string; description?: string; mimeType?: string }>;
    };
    return (result.resources || []).map((r) => ({
      serverId: this.config.id,
      uri: r.uri,
      name: r.name,
      description: r.description,
      mimeType: r.mimeType,
    }));
  }

  async readResource(
    uri: string
  ): Promise<{ contents: Array<{ uri: string; text?: string; blob?: string; mimeType?: string }> }> {
    this.ensureInitialized();
    return (await this.sendRequest("resources/read", { uri })) as {
      contents: Array<{ uri: string; text?: string; blob?: string; mimeType?: string }>;
    };
  }

  // ---- Prompts ----

  async listPrompts(): Promise<MCPPrompt[]> {
    this.ensureInitialized();
    const result = (await this.sendRequest("prompts/list", {})) as {
      prompts: Array<{
        name: string;
        description?: string;
        arguments?: Array<{ name: string; description?: string; required?: boolean }>;
      }>;
    };
    return (result.prompts || []).map((p) => ({
      serverId: this.config.id,
      name: p.name,
      description: p.description,
      arguments: p.arguments,
    }));
  }

  async getPrompt(name: string, args?: Record<string, string>): Promise<MCPPromptMessage[]> {
    this.ensureInitialized();
    const result = (await this.sendRequest("prompts/get", {
      name,
      arguments: args || {},
    })) as {
      messages: MCPPromptMessage[];
    };
    return result.messages || [];
  }

  // ---- Lifecycle ----

  close(): void {
    this.initialized = false;
    this.sessionId = undefined;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  // ---- Internal ----

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error("MCPClient not initialized. Call initialize() first.");
    }
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    // 认证
    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    }

    // 自定义 headers
    if (this.config.headers) {
      Object.assign(headers, this.config.headers);
    }

    // Session ID
    if (this.sessionId) {
      headers["Mcp-Session-Id"] = this.sessionId;
    }

    return headers;
  }

  async sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId++;
    const body: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    const response = await fetch(this.config.url, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });

    // 存储 session ID
    const sessionId = response.headers.get("Mcp-Session-Id");
    if (sessionId) {
      this.sessionId = sessionId;
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`MCP request failed: ${response.status} ${errorText}`);
    }

    const json = (await response.json()) as JsonRpcResponse;

    if (json.error) {
      throw new Error(`MCP error ${json.error.code}: ${json.error.message}`);
    }

    return json.result;
  }

  private async sendNotification(method: string, params?: Record<string, unknown>): Promise<void> {
    const body: JsonRpcRequest = {
      jsonrpc: "2.0",
      method,
      params,
    };

    const response = await fetch(this.config.url, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });

    // 存储 session ID
    const sessionId = response.headers.get("Mcp-Session-Id");
    if (sessionId) {
      this.sessionId = sessionId;
    }

    // 通知不需要响应体，但检查状态码
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`MCP notification failed: ${response.status} ${errorText}`);
    }
  }
}
