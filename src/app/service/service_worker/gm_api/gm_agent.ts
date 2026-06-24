// Agent API 方法，通过 PermissionVerify.API 装饰器注册到全局 API Map
// 运行时 this 绑定为 GMApi 实例（由 handlerRequest 中的 api.api.call(this, ...) 实现）

import type { IGetSender } from "@Packages/message/server";
import type { ConfirmParam } from "../permission_verify";
import PermissionVerify, { type ApiParamConfirmFn } from "../permission_verify";
import type { GMApiRequest } from "../types";
import type { ConversationApiRequest } from "@App/app/service/agent/core/types";
import i18next, { i18nName } from "@App/locales/locales";
import type GMApi from "./gm_api";

// Agent API 共用的权限确认逻辑
const agentConfirm: ApiParamConfirmFn = async (request: GMApiRequest, _sender: IGetSender, gmApi: GMApi) => {
  const ret = await gmApi.permissionVerify.queryPermission(request, {
    permission: "agent.conversation",
  });
  if (ret && ret.allow) return true;
  const metadata: { [key: string]: string } = {};
  metadata[i18next.t("script_name")] = i18nName(request.script);
  return {
    permission: "agent.conversation",
    title: i18next.t("agent_permission_title"),
    metadata,
    describe: i18next.t("agent_permission_describe"),
    permissionContent: i18next.t("agent_permission_content"),
  } as ConfirmParam;
};

// 独立类，仅用于承载装饰器注册
// 方法在运行时通过 call(gmApiInstance, ...) 执行，this 指向 GMApi
class GMAgentApi {
  @PermissionVerify.API({
    link: ["CAT.agent.conversation"],
    confirm: agentConfirm,
    dotAlias: false,
  })
  CAT_agentConversation(this: GMApi, request: GMApiRequest<[ConversationApiRequest]>, _sender: IGetSender) {
    if (!this.agentService) {
      throw new Error("AgentService is not available");
    }
    return this.agentService.handleConversationApi(request.params[0]);
  }

  @PermissionVerify.API({
    link: ["CAT.agent.conversation"],
    confirm: agentConfirm,
    dotAlias: false,
  })
  async CAT_agentConversationChat(this: GMApi, request: GMApiRequest<[any]>, sender: IGetSender) {
    if (!this.agentService) {
      throw new Error("AgentService is not available");
    }
    return this.agentService.handleConversationChatFromGmApi(request.params[0], sender);
  }

  @PermissionVerify.API({
    link: ["CAT.agent.conversation"],
    confirm: agentConfirm,
    dotAlias: false,
  })
  async CAT_agentAttachToConversation(this: GMApi, request: GMApiRequest<[any]>, sender: IGetSender) {
    if (!this.agentService) {
      throw new Error("AgentService is not available");
    }
    return this.agentService.handleAttachToConversationFromGmApi(request.params[0], sender);
  }
}

export default GMAgentApi;
