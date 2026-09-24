import type { SkillApiRequest, SkillRecord, SkillSummary } from "@App/app/service/agent/core/types";
import GMContext from "./gm_context";

// API 显式接收 GM_Base 上下文。
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
  public "CAT.agent.skills.list"(ctx: GMBaseContext): Promise<SkillSummary[]> {
    return ctx.sendMessage("CAT_agentSkills", [
      { action: "list", scriptUuid: ctx.scriptRes?.uuid || "" } as SkillApiRequest,
    ]) as Promise<SkillSummary[]>;
  }

  @GMContext.API({ follow: "CAT.agent.skills" })
  public "CAT.agent.skills.get"(ctx: GMBaseContext, name: string): Promise<SkillRecord | null> {
    return ctx.sendMessage("CAT_agentSkills", [
      { action: "get", name, scriptUuid: ctx.scriptRes?.uuid || "" } as SkillApiRequest,
    ]) as Promise<SkillRecord | null>;
  }

  @GMContext.API({ follow: "CAT.agent.skills" })
  public "CAT.agent.skills.install"(
    ctx: GMBaseContext,
    skillMd: string,
    scripts?: Array<{ name: string; code: string }>,
    references?: Array<{ name: string; content: string }>
  ): Promise<SkillRecord> {
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
  public "CAT.agent.skills.remove"(ctx: GMBaseContext, name: string): Promise<boolean> {
    return ctx.sendMessage("CAT_agentSkills", [
      { action: "remove", name, scriptUuid: ctx.scriptRes?.uuid || "" } as SkillApiRequest,
    ]) as Promise<boolean>;
  }

  @GMContext.API({ follow: "CAT.agent.skills" })
  public "CAT.agent.skills.call"(
    ctx: GMBaseContext,
    skillName: string,
    scriptName: string,
    params?: Record<string, unknown>
  ): Promise<unknown> {
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
