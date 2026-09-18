import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { MCPServerConfig, MCPTool, MCPResource, MCPPrompt, MCPPromptMessage } from "./types";

type MCPContent = { type: string; text?: string; [key: string]: unknown };

export type MCPToolCallResult = {
  content: MCPContent[];
  structuredContent?: unknown;
};

export class MCPClient {
  private readonly client: Client;
  private readonly transport: StreamableHTTPClientTransport;
  private initialized = false;

  constructor(private readonly config: MCPServerConfig) {
    const headers = new Headers(config.headers);
    if (config.apiKey) {
      headers.set("Authorization", `Bearer ${config.apiKey}`);
    }

    this.client = new Client({ name: "ScriptCat", version: chrome.runtime.getManifest().version });
    this.transport = new StreamableHTTPClientTransport(new URL(config.url), {
      requestInit: { headers },
    });
  }

  async initialize(): Promise<void> {
    await this.client.connect(this.transport);
    this.initialized = true;
  }

  async listTools(): Promise<MCPTool[]> {
    this.ensureInitialized();
    const { tools } = await this.client.listTools();
    return tools.map((tool) => ({
      serverId: this.config.id,
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  async callTool(name: string, args?: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    this.ensureInitialized();
    const result = (await this.client.callTool(
      { name, arguments: args ?? {} },
      undefined,
      signal ? { signal } : undefined
    )) as MCPToolCallResult & { isError?: boolean };
    const content = result.content;

    if (result.isError) {
      const diagnostics = content
        .map((item) => {
          if (item.type === "text") return item.text || "";
          try {
            return JSON.stringify(item) || item.type;
          } catch {
            return item.type;
          }
        })
        .filter(Boolean);
      if (result.structuredContent !== undefined) {
        try {
          diagnostics.push(JSON.stringify(result.structuredContent) || String(result.structuredContent));
        } catch {
          diagnostics.push(String(result.structuredContent));
        }
      }
      throw new Error(diagnostics.join("\n") || "Tool call failed");
    }

    if (content.length === 1 && content[0].type === "text" && result.structuredContent === undefined) {
      return content[0].text;
    }
    return {
      content,
      ...(result.structuredContent !== undefined ? { structuredContent: result.structuredContent } : {}),
    };
  }

  async listResources(): Promise<MCPResource[]> {
    this.ensureInitialized();
    const { resources } = await this.client.listResources();
    return resources.map((resource) => ({
      serverId: this.config.id,
      uri: resource.uri,
      name: resource.name,
      description: resource.description,
      mimeType: resource.mimeType,
    }));
  }

  async readResource(
    uri: string
  ): Promise<{ contents: Array<{ uri: string; text?: string; blob?: string; mimeType?: string }> }> {
    this.ensureInitialized();
    return this.client.readResource({ uri });
  }

  async listPrompts(): Promise<MCPPrompt[]> {
    this.ensureInitialized();
    const { prompts } = await this.client.listPrompts();
    return prompts.map((prompt) => ({
      serverId: this.config.id,
      name: prompt.name,
      description: prompt.description,
      arguments: prompt.arguments,
    }));
  }

  async getPrompt(name: string, args?: Record<string, string>): Promise<MCPPromptMessage[]> {
    this.ensureInitialized();
    const { messages } = await this.client.getPrompt({ name, arguments: args ?? {} });
    return messages as MCPPromptMessage[];
  }

  async close(): Promise<void> {
    this.initialized = false;
    await this.client.close();
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error("MCPClient not initialized. Call initialize() first.");
    }
  }
}
