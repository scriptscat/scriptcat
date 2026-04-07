// Agent Task API 方法，通过 PermissionVerify.API 装饰器注册到全局 API Map
// 运行时 this 绑定为 GMApi 实例

import type { IGetSender } from "@Packages/message/server";
import type { ConfirmParam } from "../permission_verify";
import PermissionVerify, { type ApiParamConfirmFn } from "../permission_verify";
import type { GMApiRequest } from "../types";
import type { AgentTaskApiRequest } from "@App/app/service/agent/core/types";
import i18next, { i18nName } from "@App/locales/locales";
import type GMApi from "./gm_api";

// 复用 Agent API 的权限确认逻辑
const agentTaskConfirm: ApiParamConfirmFn = async (request: GMApiRequest, _sender: IGetSender, gmApi: GMApi) => {
  const ret = await gmApi.permissionVerify.queryPermission(request, {
    permission: "agent.task",
  });
  if (ret && ret.allow) return true;
  const metadata: { [key: string]: string } = {};
  metadata[i18next.t("script_name")] = i18nName(request.script);
  return {
    permission: "agent.task",
    title: i18next.t("agent_permission_title"),
    metadata,
    describe: i18next.t("agent_permission_describe"),
    permissionContent: i18next.t("agent_permission_content"),
  } as ConfirmParam;
};

class GMAgentTaskApi {
  @PermissionVerify.API({
    link: ["CAT.agent.task"],
    confirm: agentTaskConfirm,
    dotAlias: false,
  })
  CAT_agentTask(this: GMApi, request: GMApiRequest<[AgentTaskApiRequest]>, _sender: IGetSender) {
    if (!this.agentService) {
      throw new Error("AgentService is not available");
    }
    return this.agentService.handleAgentTaskApi(request.params[0]);
  }
}

export default GMAgentTaskApi;
