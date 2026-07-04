import type { MCPApiRequest, MCPServerConfig, MCPTool, ToolDefinition } from "@App/app/service/agent/core/types";
import { MCPClient } from "@App/app/service/agent/core/mcp_client";
import { MCPToolExecutor } from "@App/app/service/agent/core/mcp_tool_executor";
import { MCPServerRepo } from "@App/app/repo/mcp_server_repo";
import type { ToolRegistry } from "@App/app/service/agent/core/tool_registry";
import { uuidv4 } from "@App/pkg/utils/uuid";

// 将服务器名和工具名合成为全局唯一的工具名
function mcpToolName(serverName: string, toolName: string): string {
  // 使用小写字母和下划线，避免特殊字符
  const safeName = serverName.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
  return `mcp_${safeName}_${toolName}`;
}

// MCPClient 工厂函数类型
export type MCPClientFactory = (config: MCPServerConfig) => MCPClient;

// 默认工厂：直接创建 MCPClient
const defaultClientFactory: MCPClientFactory = (config) => new MCPClient(config);

// MCPService 管理 MCP 服务器连接池和工具注册
export class MCPService {
  private repo: MCPServerRepo;
  private clients = new Map<string, MCPClient>();
  // 记录每个服务器注册的工具名，便于注销
  private registeredTools = new Map<string, string[]>();
  private createClient: MCPClientFactory;

  constructor(
    private toolRegistry: ToolRegistry,
    options?: { clientFactory?: MCPClientFactory; repo?: MCPServerRepo }
  ) {
    this.createClient = options?.clientFactory || defaultClientFactory;
    this.repo = options?.repo || new MCPServerRepo();
  }

  // 加载所有已保存的服务器配置，自动连接已启用的服务器
  async init(): Promise<void> {
    try {
      const servers = await this.repo.listServers();
      for (const server of servers) {
        if (server.enabled) {
          try {
            await this.connectServer(server.id);
          } catch {
            // 连接失败不影响其他服务器
          }
        }
      }
    } catch {
      // 加载失败静默忽略
    }
  }

  // 连接服务器：创建 MCPClient，初始化，列出工具，注册到 ToolRegistry
  async connectServer(id: string): Promise<MCPTool[]> {
    const config = await this.repo.getServer(id);
    if (!config) {
      throw new Error(`MCP server "${id}" not found`);
    }

    // 如果已连接，先断开
    if (this.clients.has(id)) {
      await this.disconnectServer(id);
    }

    const client = this.createClient(config);
    await client.initialize();

    // 列出工具
    const tools = await client.listTools();
    this.clients.set(id, client);

    // 注册工具到 ToolRegistry
    const toolNames: string[] = [];
    for (const tool of tools) {
      const name = mcpToolName(config.name, tool.name);
      const definition: ToolDefinition = {
        name,
        description: `[MCP: ${config.name}] ${tool.description || tool.name}`,
        parameters: tool.inputSchema,
      };
      this.toolRegistry.register("mcp", definition, new MCPToolExecutor(client, tool.name));
      toolNames.push(name);
    }
    this.registeredTools.set(id, toolNames);

    return tools;
  }

  // 确保服务器已连接（懒连接）
  private async ensureConnected(serverId: string): Promise<MCPClient> {
    let client = this.clients.get(serverId);
    if (client && client.isInitialized()) {
      return client;
    }
    await this.connectServer(serverId);
    client = this.clients.get(serverId);
    if (!client) {
      throw new Error(`Failed to connect to MCP server "${serverId}"`);
    }
    return client;
  }

  // 断开服务器连接，注销所有工具
  async disconnectServer(id: string): Promise<void> {
    const toolNames = this.registeredTools.get(id);
    if (toolNames) {
      for (const name of toolNames) {
        this.toolRegistry.unregister(name);
      }
      this.registeredTools.delete(id);
    }

    const client = this.clients.get(id);
    if (client) {
      client.close();
      this.clients.delete(id);
    }
  }

  // 测试连接：初始化 + listTools
  async testConnection(id: string): Promise<{ tools: number; resources: number; prompts: number }> {
    const config = await this.repo.getServer(id);
    if (!config) {
      throw new Error(`MCP server "${id}" not found`);
    }

    const client = this.createClient(config);
    try {
      await client.initialize();
      const [tools, resources, prompts] = await Promise.all([
        client.listTools().catch(() => []),
        client.listResources().catch(() => []),
        client.listPrompts().catch(() => []),
      ]);
      return {
        tools: tools.length,
        resources: resources.length,
        prompts: prompts.length,
      };
    } finally {
      client.close();
    }
  }

  // 处理 MCP API 请求
  async handleMCPApi(request: MCPApiRequest): Promise<unknown> {
    switch (request.action) {
      case "listServers":
        return this.repo.listServers();

      case "getServer": {
        const server = await this.repo.getServer(request.id);
        if (!server) throw new Error(`MCP server "${request.id}" not found`);
        return server;
      }

      case "addServer": {
        const now = Date.now();
        const config: MCPServerConfig = {
          ...request.config,
          id: uuidv4(),
          createtime: now,
          updatetime: now,
        };
        await this.repo.saveServer(config);
        // 如果启用了，连接服务器
        if (config.enabled) {
          try {
            await this.connectServer(config.id);
          } catch {
            // 连接失败不影响保存
          }
        }
        return config;
      }

      case "updateServer": {
        const existing = await this.repo.getServer(request.id);
        if (!existing) throw new Error(`MCP server "${request.id}" not found`);
        const updated: MCPServerConfig = {
          ...existing,
          ...request.config,
          id: existing.id, // 不允许修改 ID
          createtime: existing.createtime, // 不允许修改创建时间
          updatetime: Date.now(),
        };
        await this.repo.saveServer(updated);

        // 处理 enabled 状态变更
        if (updated.enabled && !this.clients.has(request.id)) {
          try {
            await this.connectServer(request.id);
          } catch {
            // 连接失败不影响保存
          }
        } else if (!updated.enabled && this.clients.has(request.id)) {
          await this.disconnectServer(request.id);
        }

        return updated;
      }

      case "removeServer": {
        await this.disconnectServer(request.id);
        await this.repo.removeServer(request.id);
        return true;
      }

      case "listTools": {
        const client = await this.ensureConnected(request.serverId);
        return client.listTools();
      }

      case "listResources": {
        const client = await this.ensureConnected(request.serverId);
        return client.listResources();
      }

      case "readResource": {
        const client = await this.ensureConnected(request.serverId);
        return client.readResource(request.uri);
      }

      case "listPrompts": {
        const client = await this.ensureConnected(request.serverId);
        return client.listPrompts();
      }

      case "getPrompt": {
        const client = await this.ensureConnected(request.serverId);
        return client.getPrompt(request.name, request.args);
      }

      case "testConnection":
        return this.testConnection(request.id);

      default:
        throw new Error(`Unknown MCP action: ${(request as any).action}`);
    }
  }
}
