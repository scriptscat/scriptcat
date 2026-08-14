/**
 * 外部接入审计 —— 复用扩展现有 logger，不另起一套（设计 §4）。
 *
 * 每次操作打一条 component=external-access 的日志；卡片「查看审计日志」深链到日志页并以该 component
 * 预过滤（/#/logs?query=[{"key":"component","value":"external-access"}]），级别 / 时间 / 正文正则等筛选
 * 全部复用现有日志页。因此本模块不维护任何环形缓冲，也不持久化独立审计实体。
 */
import LoggerCore from "@App/app/logger/core";

export const EXTERNAL_ACCESS_COMPONENT = "external-access";

export interface ExternalAccessAuditEvent {
  // sctl 随请求上报的连接标识（会话 id / 自报客户端名）——仅供审计归因，不参与鉴权（扁平信任下
  // 我们不验证客户端身份，故此字段可伪造，只作取证线索，绝不上审批界面，设计 §3.0.1）。
  client: string;
  action: string;
  decision: "allowed" | "denied" | "awaiting_user" | "approved" | "rejected" | "cancelled" | "failed";
  result?: "success" | "failure";
  errorCode?: string;
  uuid?: string;
  requestId?: string;
}

export type ExternalAccessAudit = (event: ExternalAccessAuditEvent) => void;

export const logExternalAccess: ExternalAccessAudit = (event) => {
  LoggerCore.logger({
    component: EXTERNAL_ACCESS_COMPONENT,
    client: event.client,
    action: event.action,
    decision: event.decision,
    ...(event.result ? { result: event.result } : {}),
    ...(event.errorCode ? { errorCode: event.errorCode } : {}),
    ...(event.uuid ? { uuid: event.uuid } : {}),
    ...(event.requestId ? { requestId: event.requestId } : {}),
  }).info(`${event.action} ${event.decision}`);
};
