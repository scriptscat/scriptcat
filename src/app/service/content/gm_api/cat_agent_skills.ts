import type { SkillApiRequest, SkillRecord, SkillSummary } from "@App/app/service/agent/core/types";
import GMContext from "./gm_context";

// 运行时 this 是 GM_Base 实例
interface GMBaseContext {
  sendMessage: (
    api: string,
    params: SkillApiRequest[]
  ) => Promise<SkillSummary[] | SkillRecord | null | boolean | unknown>;
  scriptRes?: { uuid: string };
}

// CAT.agent.skills API，注入到脚本上下文
// 使用 @GMContext.API 装饰器注册到 "CAT.agent.skills" grant
export default class CATAgentSkillsApi {
  @GMContext.protected()
  protected sendMessage!: (
    api: string,
    params: SkillApiRequest[]
  ) => Promise<SkillSummary[] | SkillRecord | null | boolean | unknown>;

  @GMContext.protected()
  protected scriptRes?: { uuid: string };

  @GMContext.API({ follow: "CAT.agent.skills" })
  public "CAT.agent.skills.list"(): Promise<SkillSummary[]> {
    const ctx = this as unknown as GMBaseContext;
    return ctx.sendMessage("CAT_agentSkills", [
      { action: "list", scriptUuid: ctx.scriptRes?.uuid || "" } as SkillApiRequest,
    ]) as Promise<SkillSummary[]>;
  }

  @GMContext.API({ follow: "CAT.agent.skills" })
  public "CAT.agent.skills.get"(name: string): Promise<SkillRecord | null> {
    const ctx = this as unknown as GMBaseContext;
    return ctx.sendMessage("CAT_agentSkills", [
      { action: "get", name, scriptUuid: ctx.scriptRes?.uuid || "" } as SkillApiRequest,
    ]) as Promise<SkillRecord | null>;
  }

  @GMContext.API({ follow: "CAT.agent.skills" })
  public "CAT.agent.skills.install"(
    skillMd: string,
    scripts?: Array<{ name: string; code: string }>,
    references?: Array<{ name: string; content: string }>
  ): Promise<SkillRecord> {
    const ctx = this as unknown as GMBaseContext;
    return ctx.sendMessage("CAT_agentSkills", [
      {
        action: "install",
        skillMd,
        scripts,
        references,
        scriptUuid: ctx.scriptRes?.uuid || "",
      } as SkillApiRequest,
    ]) as Promise<SkillRecord>;
  }

  @GMContext.API({ follow: "CAT.agent.skills" })
  public "CAT.agent.skills.remove"(name: string): Promise<boolean> {
    const ctx = this as unknown as GMBaseContext;
    return ctx.sendMessage("CAT_agentSkills", [
      { action: "remove", name, scriptUuid: ctx.scriptRes?.uuid || "" } as SkillApiRequest,
    ]) as Promise<boolean>;
  }

  @GMContext.API({ follow: "CAT.agent.skills" })
  public "CAT.agent.skills.call"(
    skillName: string,
    scriptName: string,
    params?: Record<string, unknown>
  ): Promise<unknown> {
    const ctx = this as unknown as GMBaseContext;
    return ctx.sendMessage("CAT_agentSkills", [
      {
        action: "call",
        skillName,
        scriptName,
        params,
        scriptUuid: ctx.scriptRes?.uuid || "",
      } as SkillApiRequest,
    ]);
  }
}
