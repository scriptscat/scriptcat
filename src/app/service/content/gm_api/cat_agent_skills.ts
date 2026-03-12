import GMContext from "./gm_context";
import type { SkillApiRequest } from "@App/app/service/agent/types";

// 运行时 this 是 GM_Base 实例
interface GMBaseContext {
  sendMessage: (api: string, params: unknown[]) => Promise<unknown>;
  scriptRes?: { uuid: string };
}

// CAT.agent.skills API，注入到脚本上下文
// 使用 @GMContext.API 装饰器注册到 "CAT.agent.skills" grant
export default class CATAgentSkillsApi {
  @GMContext.protected()
  protected sendMessage!: (api: string, params: any[]) => Promise<any>;

  @GMContext.protected()
  protected scriptRes?: any;

  @GMContext.API({ follow: "CAT.agent.skills" })
  public "CAT.agent.skills.list"(): Promise<unknown> {
    const ctx = this as unknown as GMBaseContext;
    return ctx.sendMessage("CAT_agentSkills", [
      { action: "list", scriptUuid: ctx.scriptRes?.uuid || "" } as SkillApiRequest,
    ]);
  }

  @GMContext.API({ follow: "CAT.agent.skills" })
  public "CAT.agent.skills.get"(name: string): Promise<unknown> {
    const ctx = this as unknown as GMBaseContext;
    return ctx.sendMessage("CAT_agentSkills", [
      { action: "get", name, scriptUuid: ctx.scriptRes?.uuid || "" } as SkillApiRequest,
    ]);
  }

  @GMContext.API({ follow: "CAT.agent.skills" })
  public "CAT.agent.skills.install"(
    skillMd: string,
    scripts?: Array<{ name: string; code: string }>,
    references?: Array<{ name: string; content: string }>
  ): Promise<unknown> {
    const ctx = this as unknown as GMBaseContext;
    return ctx.sendMessage("CAT_agentSkills", [
      {
        action: "install",
        skillMd,
        scripts,
        references,
        scriptUuid: ctx.scriptRes?.uuid || "",
      } as SkillApiRequest,
    ]);
  }

  @GMContext.API({ follow: "CAT.agent.skills" })
  public "CAT.agent.skills.remove"(name: string): Promise<unknown> {
    const ctx = this as unknown as GMBaseContext;
    return ctx.sendMessage("CAT_agentSkills", [
      { action: "remove", name, scriptUuid: ctx.scriptRes?.uuid || "" } as SkillApiRequest,
    ]);
  }
}
