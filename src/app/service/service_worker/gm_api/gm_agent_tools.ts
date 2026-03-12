// CATTool API 方法，通过 PermissionVerify.API 装饰器注册到全局 API Map
// 运行时 this 绑定为 GMApi 实例

import type { IGetSender } from "@Packages/message/server";
import type { ConfirmParam } from "../permission_verify";
import PermissionVerify, { type ApiParamConfirmFn } from "../permission_verify";
import type { GMApiRequest } from "../types";
import type { CATToolApiRequest } from "@App/app/service/agent/types";
import i18next, { i18nName } from "@App/locales/locales";
import type GMApi from "./gm_api";

// 复用 Agent API 的权限确认逻辑，写操作（install/remove）每次都需弹窗确认
const agentConfirm: ApiParamConfirmFn = async (request: GMApiRequest, _sender: IGetSender, gmApi: GMApi) => {
  const toolsReq = request.params[0] as CATToolApiRequest;
  const isWrite = toolsReq.action === "install" || toolsReq.action === "remove";

  if (isWrite) {
    // 写操作：仅查询 DB 中的持久化授权，跳过缓存
    const ret = await gmApi.permissionVerify.queryPersistentPermission(request, {
      permission: "agent.tools",
    });
    if (ret && ret.allow) return true;
  } else {
    // 读操作：缓存 + DB
    const ret = await gmApi.permissionVerify.queryPermission(request, {
      permission: "agent.tools",
    });
    if (ret && ret.allow) return true;
  }

  const metadata: { [key: string]: string } = {};
  metadata[i18next.t("script_name")] = i18nName(request.script);
  return {
    permission: "agent.tools",
    title: i18next.t("agent_permission_title"),
    metadata,
    describe: i18next.t("agent_permission_describe"),
    permissionContent: i18next.t("agent_permission_content"),
    persistentOnly: isWrite,
  } as ConfirmParam;
};

class GMAgentToolsApi {
  @PermissionVerify.API({
    link: ["CAT.agent.tools"],
    confirm: agentConfirm,
    dotAlias: false,
  })
  CAT_agentTools(this: GMApi, request: GMApiRequest<[CATToolApiRequest]>, _sender: IGetSender) {
    if (!this.agentService) {
      throw new Error("AgentService is not available");
    }
    return this.agentService.handleToolsApi(request.params[0], request.script);
  }
}

export default GMAgentToolsApi;
