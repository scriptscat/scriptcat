import type { OPFSApiRequest } from "@App/app/service/agent/types";
import GMContext from "./gm_context";

// 运行时 this 是 GM_Base 实例
interface GMBaseContext {
  sendMessage: (
    api: string,
    params: OPFSApiRequest[]
  ) => Promise<
    | { path: string; size: number }
    | { path: string; content: string; size: number }
    | Array<{ name: string; type: string; size?: number }>
    | { success: true }
  >;
  scriptRes?: { uuid: string };
}

// CAT.agent.opfs API，注入到脚本上下文
// 使用 @GMContext.API 装饰器注册到 "CAT.agent.opfs" grant
export default class CATAgentOPFSApi {
  @GMContext.protected()
  protected sendMessage!: GMBaseContext["sendMessage"];

  @GMContext.protected()
  protected scriptRes?: { uuid: string };

  @GMContext.API({ follow: "CAT.agent.opfs" })
  public "CAT.agent.opfs.write"(path: string, content: string): Promise<{ path: string; size: number }> {
    const ctx = this as unknown as GMBaseContext;
    return ctx.sendMessage("CAT_agentOPFS", [
      { action: "write", path, content, scriptUuid: ctx.scriptRes?.uuid || "" } as OPFSApiRequest,
    ]) as Promise<{ path: string; size: number }>;
  }

  @GMContext.API({ follow: "CAT.agent.opfs" })
  public "CAT.agent.opfs.read"(path: string): Promise<{ path: string; content: string; size: number }> {
    const ctx = this as unknown as GMBaseContext;
    return ctx.sendMessage("CAT_agentOPFS", [
      { action: "read", path, scriptUuid: ctx.scriptRes?.uuid || "" } as OPFSApiRequest,
    ]) as Promise<{ path: string; content: string; size: number }>;
  }

  @GMContext.API({ follow: "CAT.agent.opfs" })
  public "CAT.agent.opfs.list"(path?: string): Promise<Array<{ name: string; type: string; size?: number }>> {
    const ctx = this as unknown as GMBaseContext;
    return ctx.sendMessage("CAT_agentOPFS", [
      { action: "list", path, scriptUuid: ctx.scriptRes?.uuid || "" } as OPFSApiRequest,
    ]) as Promise<Array<{ name: string; type: string; size?: number }>>;
  }

  @GMContext.API({ follow: "CAT.agent.opfs" })
  public "CAT.agent.opfs.delete"(path: string): Promise<{ success: true }> {
    const ctx = this as unknown as GMBaseContext;
    return ctx.sendMessage("CAT_agentOPFS", [
      { action: "delete", path, scriptUuid: ctx.scriptRes?.uuid || "" } as OPFSApiRequest,
    ]) as Promise<{ success: true }>;
  }
}
