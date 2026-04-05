import type { AgentModelSafeConfig, ModelApiRequest } from "@App/app/service/agent/core/types";
import GMContext from "./gm_context";

// 运行时 this 是 GM_Base 实例
interface GMBaseContext {
  sendMessage: (
    api: string,
    params: ModelApiRequest[]
  ) => Promise<AgentModelSafeConfig[] | AgentModelSafeConfig | null | string>;
  scriptRes?: { uuid: string };
}

// CAT.agent.model API，注入到脚本上下文
// 使用 @GMContext.API 装饰器注册到 "CAT.agent.model" grant
export default class CATAgentModelApi {
  @GMContext.protected()
  protected sendMessage!: (
    api: string,
    params: ModelApiRequest[]
  ) => Promise<AgentModelSafeConfig[] | AgentModelSafeConfig | null | string>;

  @GMContext.protected()
  protected scriptRes?: { uuid: string };

  @GMContext.API({ follow: "CAT.agent.model" })
  public "CAT.agent.model.list"(): Promise<AgentModelSafeConfig[]> {
    const ctx = this as unknown as GMBaseContext;
    return ctx.sendMessage("CAT_agentModel", [
      { action: "list", scriptUuid: ctx.scriptRes?.uuid || "" } as ModelApiRequest,
    ]) as Promise<AgentModelSafeConfig[]>;
  }

  @GMContext.API({ follow: "CAT.agent.model" })
  public "CAT.agent.model.get"(id: string): Promise<AgentModelSafeConfig | null> {
    const ctx = this as unknown as GMBaseContext;
    return ctx.sendMessage("CAT_agentModel", [
      { action: "get", id, scriptUuid: ctx.scriptRes?.uuid || "" } as ModelApiRequest,
    ]) as Promise<AgentModelSafeConfig | null>;
  }

  @GMContext.API({ follow: "CAT.agent.model" })
  public "CAT.agent.model.getDefault"(): Promise<string> {
    const ctx = this as unknown as GMBaseContext;
    return ctx.sendMessage("CAT_agentModel", [
      { action: "getDefault", scriptUuid: ctx.scriptRes?.uuid || "" } as ModelApiRequest,
    ]) as Promise<string>;
  }

  @GMContext.API({ follow: "CAT.agent.model" })
  public "CAT.agent.model.getSummary"(): Promise<string> {
    const ctx = this as unknown as GMBaseContext;
    return ctx.sendMessage("CAT_agentModel", [
      { action: "getSummary", scriptUuid: ctx.scriptRes?.uuid || "" } as ModelApiRequest,
    ]) as Promise<string>;
  }
}
