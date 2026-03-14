import GMContext from "./gm_context";
import type { CATToolApiRequest, CATToolRecord, JsonValue } from "@App/app/service/agent/types";
import type { CATToolSummary } from "@App/app/repo/cattool_repo";

// 运行时 this 是 GM_Base 实例
interface GMBaseContext {
  sendMessage: (api: string, params: unknown[]) => Promise<unknown>;
  scriptRes?: { uuid: string };
}

// CAT.agent.tools API，注入到脚本上下文
// 使用 @GMContext.API 装饰器注册到 "CAT.agent.tools" grant
export default class CATAgentToolsApi {
  @GMContext.protected()
  protected sendMessage!: (api: string, params: unknown[]) => Promise<unknown>;

  @GMContext.protected()
  protected scriptRes?: { uuid: string };

  @GMContext.API({ follow: "CAT.agent.tools" })
  public "CAT.agent.tools.install"(code: string): Promise<CATToolRecord> {
    const ctx = this as unknown as GMBaseContext;
    return ctx.sendMessage("CAT_agentTools", [
      { action: "install", code, scriptUuid: ctx.scriptRes?.uuid || "" } as CATToolApiRequest,
    ]) as Promise<CATToolRecord>;
  }

  @GMContext.API({ follow: "CAT.agent.tools" })
  public "CAT.agent.tools.remove"(name: string): Promise<boolean> {
    const ctx = this as unknown as GMBaseContext;
    return ctx.sendMessage("CAT_agentTools", [
      { action: "remove", name, scriptUuid: ctx.scriptRes?.uuid || "" } as CATToolApiRequest,
    ]) as Promise<boolean>;
  }

  @GMContext.API({ follow: "CAT.agent.tools" })
  public "CAT.agent.tools.list"(): Promise<CATToolSummary[]> {
    const ctx = this as unknown as GMBaseContext;
    return ctx.sendMessage("CAT_agentTools", [
      { action: "list", scriptUuid: ctx.scriptRes?.uuid || "" } as CATToolApiRequest,
    ]) as Promise<CATToolSummary[]>;
  }

  @GMContext.API({ follow: "CAT.agent.tools" })
  public "CAT.agent.tools.call"(name: string, params: Record<string, unknown> = {}): Promise<JsonValue> {
    const ctx = this as unknown as GMBaseContext;
    return ctx.sendMessage("CAT_agentTools", [
      { action: "call", name, params, scriptUuid: ctx.scriptRes?.uuid || "" } as CATToolApiRequest,
    ]) as Promise<JsonValue>;
  }
}
