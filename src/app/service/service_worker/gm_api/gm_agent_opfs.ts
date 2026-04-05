// OPFS API 方法，通过 PermissionVerify.API 装饰器注册到全局 API Map
// 运行时 this 绑定为 GMApi 实例

import type { IGetSender } from "@Packages/message/server";
import type { ConfirmParam } from "../permission_verify";
import PermissionVerify, { type ApiParamConfirmFn } from "../permission_verify";
import type { GMApiRequest } from "../types";
import type { OPFSApiRequest } from "@App/app/service/agent/core/types";
import i18next, { i18nName } from "@App/locales/locales";
import type GMApi from "./gm_api";

// 写操作（write/delete）需确认；读操作（read/list）缓存+DB
const agentConfirm: ApiParamConfirmFn = async (request: GMApiRequest, _sender: IGetSender, gmApi: GMApi) => {
  const opfsReq = request.params[0] as OPFSApiRequest;
  const isWrite = opfsReq.action === "write" || opfsReq.action === "delete";

  if (isWrite) {
    // 写操作：仅查询 DB 中的持久化授权，跳过缓存
    const ret = await gmApi.permissionVerify.queryPersistentPermission(request, {
      permission: "agent.opfs",
    });
    if (ret && ret.allow) return true;
  } else {
    // 读操作：缓存 + DB
    const ret = await gmApi.permissionVerify.queryPermission(request, {
      permission: "agent.opfs",
    });
    if (ret && ret.allow) return true;
  }

  const metadata: { [key: string]: string } = {};
  metadata[i18next.t("script_name")] = i18nName(request.script);
  return {
    permission: "agent.opfs",
    title: i18next.t("agent_permission_title"),
    metadata,
    describe: i18next.t("agent_permission_describe"),
    permissionContent: i18next.t("agent_permission_content"),
    persistentOnly: isWrite,
  } as ConfirmParam;
};

class GMAgentOPFSApi {
  @PermissionVerify.API({
    link: ["CAT.agent.opfs"],
    confirm: agentConfirm,
    dotAlias: false,
  })
  CAT_agentOPFS(this: GMApi, request: GMApiRequest<[OPFSApiRequest]>, sender: IGetSender) {
    if (!this.agentService) {
      throw new Error("AgentService is not available");
    }
    return this.agentService.handleOPFSApi(request.params[0], sender);
  }
}

export default GMAgentOPFSApi;
