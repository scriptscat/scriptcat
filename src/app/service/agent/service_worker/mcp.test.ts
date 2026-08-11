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

    it("断开服务器应等待客户端关闭完成", async () => {
      let releaseClose!: () => void;
      const close = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            releaseClose = resolve;
          })
      );
      const baseFactory = createMockClientFactory();
      const clientFactory: MCPClientFactory = (config) => {
        const client = baseFactory(config);
        client.close = close;
        return client;
      };
      const repo = createMockRepo();
      service = new MCPService(toolRegistry, { clientFactory, repo });
      const server = (await service.handleMCPApi({
        action: "addServer",
        config: { name: "AsyncClose", url: "https://mcp.test.com", enabled: false },
        scriptUuid: "test",
      })) as any;
      await service.connectServer(server.id);

      let settled = false;
      const disconnect = service.disconnectServer(server.id).then(() => {
        settled = true;
      });
      await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
      expect(settled).toBe(false);

      releaseClose();
      await disconnect;
      expect(settled).toBe(true);
    });

    it("列出工具失败时应关闭已初始化的客户端", async () => {
      const close = vi.fn().mockResolvedValue(undefined);
      const baseFactory = createMockClientFactory();
      const clientFactory: MCPClientFactory = (config) => {
        const client = baseFactory(config);
        client.listTools = vi.fn().mockRejectedValue(new Error("list failed"));
        client.close = close;
        return client;
      };
      const repo = createMockRepo();
      service = new MCPService(toolRegistry, { clientFactory, repo });
      const server = (await service.handleMCPApi({
        action: "addServer",
        config: { name: "BrokenTools", url: "https://mcp.test.com", enabled: false },
        scriptUuid: "test",
      })) as any;

      await expect(service.connectServer(server.id)).rejects.toThrow("list failed");
      expect(close).toHaveBeenCalledOnce();
      expect(toolRegistry.getDefinitions()).toHaveLength(0);
    });

    it("服务器名称变更后应重连并更新工具注册", async () => {
      const close = vi.fn().mockResolvedValue(undefined);
      const baseFactory = createMockClientFactory();
      const clientFactory: MCPClientFactory = (config) => {
        const client = baseFactory(config);
        client.close = close;
        return client;
      };
      const repo = createMockRepo();
      service = new MCPService(toolRegistry, { clientFactory, repo });
      const server = (await service.handleMCPApi({
        action: "addServer",
        config: { name: "Before", url: "https://before.example.com", enabled: true },
        scriptUuid: "test",
      })) as any;
      expect(toolRegistry.getDefinitions()[0].name).toContain("before");

      await service.handleMCPApi({
        action: "updateServer",
        id: server.id,
        config: { name: "After", url: "https://after.example.com" },
        scriptUuid: "test",
      });

      expect(close).toHaveBeenCalledOnce();
      expect(toolRegistry.getDefinitions()).toHaveLength(1);
      expect(toolRegistry.getDefinitions()[0].name).toContain("after");
    });

    it("名称清洗后相同的服务器仍应拥有独立工具名", async () => {
      const first = (await service.handleMCPApi({
        action: "addServer",
        config: { name: "a-b", url: "https://first.example.com", enabled: false },
        scriptUuid: "test",
      })) as any;
      const second = (await service.handleMCPApi({
        action: "addServer",
        config: { name: "a_b", url: "https://second.example.com", enabled: false },
        scriptUuid: "test",
      })) as any;

      await service.connectServer(first.id);
      await service.connectServer(second.id);

      const names = toolRegistry.getDefinitions().map((definition) => definition.name);
      expect(names).toHaveLength(2);
      expect(new Set(names).size).toBe(2);

      await service.disconnectServer(first.id);
      expect(toolRegistry.getDefinitions()).toHaveLength(1);
    });

    it("并发连接同一服务器时应复用同一个连接操作", async () => {
      const baseFactory = createMockClientFactory();
      const clientFactory = vi.fn((config) => baseFactory(config));
      const repo = createMockRepo();
      service = new MCPService(toolRegistry, { clientFactory, repo });
      const server = (await service.handleMCPApi({
        action: "addServer",
        config: { name: "Concurrent", url: "https://mcp.test.com", enabled: false },
        scriptUuid: "test",
      })) as any;

      await Promise.all([service.connectServer(server.id), service.connectServer(server.id)]);

      expect(clientFactory).toHaveBeenCalledOnce();
      expect(toolRegistry.getDefinitions()).toHaveLength(1);
    });

    it("原始服务器 ID 不同时即使清洗结果相同也应保持工具名唯一", async () => {
      const servers = new Map([
        ["a-b", { id: "a-b", name: "same", url: "https://first.example.com", enabled: false }],
        ["a_b", { id: "a_b", name: "same", url: "https://second.example.com", enabled: false }],
      ]);
      const repo = {
        listServers: vi.fn(async () => [...servers.values()]),
        getServer: vi.fn(async (id: string) => servers.get(id)),
        saveServer: vi.fn(async (config: any) => servers.set(config.id, config)),
        removeServer: vi.fn(async (id: string) => servers.delete(id)),
      } as unknown as MCPServerRepo;
      service = new MCPService(toolRegistry, { clientFactory: createMockClientFactory(), repo });

      await service.connectServer("a-b");
      await service.connectServer("a_b");

      const names = toolRegistry.getDefinitions().map((definition) => definition.name);
      expect(names).toHaveLength(2);
      expect(new Set(names).size).toBe(2);
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
