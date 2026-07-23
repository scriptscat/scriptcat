import { Repo } from "./repo";
import type {
  OperationKind,
  OperationStatus,
  BridgeErrorCode,
} from "@App/app/service/service_worker/external_access/types";

// 待批操作：绑定请求当时的内容哈希/目标脚本状态等字段全部保留，执行器（ExternalAccessApprovalService.decide）
// 在批准瞬间重新校验这些字段，防止请求与批准之间的 TOCTOU 篡改。扁平信任下不再有每客户端记录：
// clientId 只是 sctl 上报的连接标识，仅供审计归因，不参与鉴权。
export interface ExternalAccessOperation {
  operationId: string; // 加密安全随机 UUID
  clientId: string; // sctl 上报的连接标识（审计归因用，可伪造，不做鉴权）
  kind: OperationKind;
  status: OperationStatus;
  createdAt: number;
  expiresAt: number; // createdAt + 5 分钟
  // 「本会话允许」授权键 = sessionAllowKey(kind, 脚本身份)。批准时若选「本会话允许」即以此键写入
  // SessionAllowStore；present() 命中该键则免弹自动批准。见 session_allow.ts。
  sessionKey: string;
  sourceUrl?: string;
  contentHash?: string; // 暂存代码的 SHA-256
  stagedUuid?: string; // TempStorageDAO 的 key
  targetUuid?: string; // 更新/启用/禁用/删除/源码读取的目标脚本
  existingCodeHash?: string; // 请求时目标脚本当前代码的 SHA-256
  // 阻塞语义下发起该操作的 bridge.request.requestId：终态决策/断开作废时据此把 bridge.response
  // 经 offscreen 回发给 daemon（不在 SW 内存里悬挂 Promise）。「直接允许」立即执行的操作不寻址
  // 任何挂起请求，故不带 requestId。
  requestId?: string;
  decidedAt?: number;
  errorCode?: BridgeErrorCode;
}

export class ExternalAccessOperationDAO extends Repo<ExternalAccessOperation> {
  constructor() {
    super("mcpOperation");
  }

  save(operation: ExternalAccessOperation): Promise<ExternalAccessOperation> {
    return this._save(operation.operationId, operation);
  }

  // 断开作废按 bridge.request.requestId 定位待批操作（daemon 只知道 requestId，不知 operationId）。
  byRequestId(requestId: string): Promise<ExternalAccessOperation | undefined> {
    return this.findOne((_key, value) => value.requestId === requestId);
  }

  // 串行确认队列 + 幂等去重的数据源：所有仍在等待用户决策的操作。
  awaitingUser(): Promise<ExternalAccessOperation[]> {
    return this.find((_key, value) => value.status === "awaiting_user");
  }
}
