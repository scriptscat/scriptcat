import type { MCPServerConfig } from "@App/app/service/agent/core/types";
import { Repo } from "./repo";

// 使用 chrome.storage.local 存储 MCP 服务器配置
export class MCPServerRepo extends Repo<MCPServerConfig> {
  constructor() {
    super("mcp_server:");
    this.enableCache();
  }

  async listServers(): Promise<MCPServerConfig[]> {
    return this.find();
  }

  async getServer(id: string): Promise<MCPServerConfig | undefined> {
    return this.get(id);
  }

  async saveServer(config: MCPServerConfig): Promise<void> {
    await this._save(config.id, config);
  }

  async removeServer(id: string): Promise<void> {
    await this.delete(id);
  }
}
