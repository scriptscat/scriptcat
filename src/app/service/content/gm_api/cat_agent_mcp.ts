import GMContext from "./gm_context";
import type { MCPApiRequest } from "@App/app/service/agent/types";

// 运行时 this 是 GM_Base 实例
interface GMBaseContext {
  sendMessage: (api: string, params: unknown[]) => Promise<unknown>;
  scriptRes?: { uuid: string };
}

// CAT.agent.mcp API，注入到脚本上下文
// 使用 @GMContext.API 装饰器注册到 "CAT.agent.mcp" grant
export default class CATAgentMcpApi {
  @GMContext.protected()
  protected sendMessage!: (api: string, params: any[]) => Promise<any>;

  @GMContext.protected()
  protected scriptRes?: any;

  @GMContext.API({ follow: "CAT.agent.mcp" })
  public "CAT.agent.mcp.listServers"(): Promise<unknown> {
    const ctx = this as unknown as GMBaseContext;
    return ctx.sendMessage("CAT_agentMcp", [
      { action: "listServers", scriptUuid: ctx.scriptRes?.uuid || "" } as MCPApiRequest,
    ]);
  }

  @GMContext.API({ follow: "CAT.agent.mcp" })
  public "CAT.agent.mcp.getServer"(id: string): Promise<unknown> {
    const ctx = this as unknown as GMBaseContext;
    return ctx.sendMessage("CAT_agentMcp", [
      { action: "getServer", id, scriptUuid: ctx.scriptRes?.uuid || "" } as MCPApiRequest,
    ]);
  }

  @GMContext.API({ follow: "CAT.agent.mcp" })
  public "CAT.agent.mcp.addServer"(
    config: { name: string; url: string; apiKey?: string; headers?: Record<string, string>; enabled: boolean }
  ): Promise<unknown> {
    const ctx = this as unknown as GMBaseContext;
    return ctx.sendMessage("CAT_agentMcp", [
      { action: "addServer", config, scriptUuid: ctx.scriptRes?.uuid || "" } as MCPApiRequest,
    ]);
  }

  @GMContext.API({ follow: "CAT.agent.mcp" })
  public "CAT.agent.mcp.updateServer"(id: string, config: Record<string, unknown>): Promise<unknown> {
    const ctx = this as unknown as GMBaseContext;
    return ctx.sendMessage("CAT_agentMcp", [
      { action: "updateServer", id, config, scriptUuid: ctx.scriptRes?.uuid || "" } as MCPApiRequest,
    ]);
  }

  @GMContext.API({ follow: "CAT.agent.mcp" })
  public "CAT.agent.mcp.removeServer"(id: string): Promise<unknown> {
    const ctx = this as unknown as GMBaseContext;
    return ctx.sendMessage("CAT_agentMcp", [
      { action: "removeServer", id, scriptUuid: ctx.scriptRes?.uuid || "" } as MCPApiRequest,
    ]);
  }

  @GMContext.API({ follow: "CAT.agent.mcp" })
  public "CAT.agent.mcp.listTools"(serverId: string): Promise<unknown> {
    const ctx = this as unknown as GMBaseContext;
    return ctx.sendMessage("CAT_agentMcp", [
      { action: "listTools", serverId, scriptUuid: ctx.scriptRes?.uuid || "" } as MCPApiRequest,
    ]);
  }

  @GMContext.API({ follow: "CAT.agent.mcp" })
  public "CAT.agent.mcp.testConnection"(id: string): Promise<unknown> {
    const ctx = this as unknown as GMBaseContext;
    return ctx.sendMessage("CAT_agentMcp", [
      { action: "testConnection", id, scriptUuid: ctx.scriptRes?.uuid || "" } as MCPApiRequest,
    ]);
  }
}
