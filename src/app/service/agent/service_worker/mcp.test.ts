import { describe, it, expect, vi, beforeEach } from "vitest";
import { MCPService } from "./mcp";
import { ToolRegistry } from "@App/app/service/agent/core/tool_registry";
import type { MCPClientFactory } from "./mcp";
import type { MCPServerRepo } from "@App/app/repo/mcp_server_repo";

// 创建 mock MCPServerRepo
function createMockRepo() {
  const servers = new Map<string, any>();
  return {
    listServers: vi.fn(async () => Array.from(servers.values())),
    getServer: vi.fn(async (id: string) => servers.get(id)),
    saveServer: vi.fn(async (config: any) => {
      servers.set(config.id, config);
    }),
    removeServer: vi.fn(async (id: string) => {
      servers.delete(id);
    }),
  } as unknown as MCPServerRepo;
}

// Mock MCPClient 工厂
function createMockClientFactory(): MCPClientFactory {
  return () =>
    ({
      async initialize() {},
      async listTools() {
        return [
          {
            serverId: "test-server",
            name: "search",
            description: "Search the web",
            inputSchema: { type: "object", properties: { query: { type: "string" } } },
          },
        ];
      },
      async listResources() {
        return [{ serverId: "test-server", uri: "file:///test.md", name: "test", mimeType: "text/markdown" }];
      },
      async listPrompts() {
        return [{ serverId: "test-server", name: "summarize", description: "Summarize text" }];
      },
      async callTool() {
        return "tool result";
      },
      async readResource() {
        return { contents: [{ uri: "file:///test.md", text: "# Test" }] };
      },
      async getPrompt() {
        return [{ role: "user", content: { type: "text", text: "Hello" } }];
      },
      close() {},
      isInitialized() {
        return true;
      },
    }) as any;
}

describe("MCPService", () => {
  let toolRegistry: ToolRegistry;
  let service: MCPService;

  beforeEach(() => {
    toolRegistry = new ToolRegistry();
    service = new MCPService(toolRegistry, {
      clientFactory: createMockClientFactory(),
      repo: createMockRepo(),
    });
  });

  describe("handleMCPApi - addServer", () => {
    it("应添加服务器", async () => {
      const result = (await service.handleMCPApi({
        action: "addServer",
        config: { name: "Test", url: "https://mcp.test.com", enabled: false },
        scriptUuid: "test",
      })) as any;

      expect(typeof result.id).toBe("string");
      expect(result.id.length).toBeGreaterThan(0);
      expect(result.name).toBe("Test");
      expect(result.url).toBe("https://mcp.test.com");
    });
  });

  describe("handleMCPApi - listServers", () => {
    it("应列出所有服务器", async () => {
      await service.handleMCPApi({
        action: "addServer",
        config: { name: "Test", url: "https://mcp.test.com", enabled: false },
        scriptUuid: "test",
      });

      const result = (await service.handleMCPApi({
        action: "listServers",
        scriptUuid: "test",
      })) as any[];

      expect(result.length).toBe(1);
    });
  });

  describe("handleMCPApi - removeServer", () => {
    it("应删除服务器", async () => {
      const server = (await service.handleMCPApi({
        action: "addServer",
        config: { name: "Test", url: "https://mcp.test.com", enabled: false },
        scriptUuid: "test",
      })) as any;

      const result = await service.handleMCPApi({
        action: "removeServer",
        id: server.id,
        scriptUuid: "test",
      });

      expect(result).toBe(true);
    });
  });

  describe("connectServer / disconnectServer", () => {
    it("连接后应将工具注册到 ToolRegistry", async () => {
      const server = (await service.handleMCPApi({
        action: "addServer",
        config: { name: "TestSrv", url: "https://mcp.test.com", enabled: false },
        scriptUuid: "test",
      })) as any;

      await service.connectServer(server.id);

      const defs = toolRegistry.getDefinitions();
      expect(defs.length).toBe(1);
      expect(defs[0].name).toContain("search");
    });

    it("断开后应注销工具", async () => {
      const server = (await service.handleMCPApi({
        action: "addServer",
        config: { name: "TestSrv", url: "https://mcp.test.com", enabled: false },
        scriptUuid: "test",
      })) as any;

      await service.connectServer(server.id);
      expect(toolRegistry.getDefinitions().length).toBe(1);

      await service.disconnectServer(server.id);
      expect(toolRegistry.getDefinitions().length).toBe(0);
    });
  });

  describe("handleMCPApi - listTools", () => {
    it("应通过懒连接获取工具列表", async () => {
      const server = (await service.handleMCPApi({
        action: "addServer",
        config: { name: "Test", url: "https://mcp.test.com", enabled: false },
        scriptUuid: "test",
      })) as any;

      const tools = (await service.handleMCPApi({
        action: "listTools",
        serverId: server.id,
        scriptUuid: "test",
      })) as any[];

      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe("search");
    });
  });

  describe("handleMCPApi - testConnection", () => {
    it("应返回工具、资源、提示词数量", async () => {
      const server = (await service.handleMCPApi({
        action: "addServer",
        config: { name: "Test", url: "https://mcp.test.com", enabled: false },
        scriptUuid: "test",
      })) as any;

      const result = (await service.handleMCPApi({
        action: "testConnection",
        id: server.id,
        scriptUuid: "test",
      })) as any;

      expect(result.tools).toBe(1);
      expect(result.resources).toBe(1);
      expect(result.prompts).toBe(1);
    });
  });

  describe("handleMCPApi - unknown action", () => {
    it("应抛出错误", async () => {
      await expect(service.handleMCPApi({ action: "unknown" as any, scriptUuid: "test" })).rejects.toThrow(
        "Unknown MCP action"
      );
    });
  });
});
