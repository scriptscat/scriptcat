import { Repo } from "./repo";
import type {
  McpScope,
  OperationKind,
  OperationStatus,
  BridgeErrorCode,
} from "@App/app/service/service_worker/mcp/types";

// 客户端记录：主机侧（原生消息宿主）持有权威 token store，本记录是扩展侧的镜像，仅用于 UI 展示与 scope 判定。
export interface McpClient {
  clientId: string; // 配对时生成的随机 UUID
  displayName: string; // 用户可编辑，展示时需转义
  tokenHash: string; // SHA-256(token) 十六进制；token 本身从不落地扩展侧
  scopes: McpScope[];
  createdAt: number;
  lastUsedAt: number;
  revoked: boolean;
  // 用户在源码披露弹窗中选择「对该客户端始终允许」时记录的脚本 uuid 列表——
  // 一次性批准（「仅本次允许」）不会写入此处，只消费单次待批操作。
  sourceDisclosureAllowed?: string[];
}

export class McpClientDAO extends Repo<McpClient> {
  constructor() {
    super("mcpClient");
  }

  save(client: McpClient): Promise<McpClient> {
    return this._save(client.clientId, client);
  }
}

// 待批操作：绑定请求当时的内容哈希/目标脚本状态等字段全部保留，执行器
// （McpApprovalService.decide）在批准瞬间重新校验这些字段，防止请求与批准之间的 TOCTOU 篡改。
export interface McpOperation {
  operationId: string; // 加密安全随机 UUID
  clientId: string;
  kind: OperationKind;
  status: OperationStatus;
  createdAt: number;
  expiresAt: number; // createdAt + 5 分钟
  sourceUrl?: string;
  contentHash?: string; // 暂存代码的 SHA-256
  stagedUuid?: string; // TempStorageDAO 的 key
  targetUuid?: string; // 更新/启用/禁用/删除的目标脚本
  existingCodeHash?: string; // 请求时目标脚本当前代码的 SHA-256
  requestedEnabledState: false; // 安装操作恒为 false，仅为文档化约束保留字面量类型
  // 阻塞语义下发起该操作的 bridge.request.requestId：终态决策/断开作废时据此把 bridge.response
  // 经 offscreen 回发给 daemon（不在 SW 内存里悬挂 Promise）。「直接允许」立即执行的操作不寻址
  // 任何挂起请求，故不带 requestId。
  requestId?: string;
  decidedAt?: number;
  errorCode?: BridgeErrorCode;
}

export class McpOperationDAO extends Repo<McpOperation> {
  constructor() {
    super("mcpOperation");
  }

  save(operation: McpOperation): Promise<McpOperation> {
    return this._save(operation.operationId, operation);
  }

  byClient(clientId: string): Promise<McpOperation[]> {
    return this.find((_key, value) => value.clientId === clientId);
  }

  // 断开作废按 bridge.request.requestId 定位待批操作（daemon 只知道 requestId，不知 operationId）。
  byRequestId(requestId: string): Promise<McpOperation | undefined> {
    return this.findOne((_key, value) => value.requestId === requestId);
  }

  // 串行确认队列的数据源：所有仍在等待用户决策的操作，用于关闭当前确认页后弹出下一个。
  awaitingUser(): Promise<McpOperation[]> {
    return this.find((_key, value) => value.status === "awaiting_user");
  }
}

// 审计事件：环形缓冲，永不记录 token、脚本源码或 URL 中的凭据。
export interface McpAuditEvent {
  eventId: string;
  timestamp: number;
  clientId: string;
  clientName: string;
  action: string;
  targetUuid?: string;
  sourceHost?: string;
  contentHash?: string;
  decision: "allowed" | "denied" | "awaiting_user" | "approved" | "rejected" | "expired";
  result?: "success" | "failure";
  errorCode?: string;
  correlationId: string;
}

export const MCP_AUDIT_RING_BUFFER_SIZE = 500;

export class McpAuditDAO extends Repo<McpAuditEvent> {
  constructor() {
    super("mcpAudit");
  }

  // 追加一条事件，超出环形缓冲上限时裁剪最旧的记录（按 timestamp 排序）。
  async append(event: McpAuditEvent): Promise<void> {
    await this._save(event.eventId, event);
    const all = await this.all();
    if (all.length <= MCP_AUDIT_RING_BUFFER_SIZE) {
      return;
    }
    const sorted = [...all].sort((a, b) => a.timestamp - b.timestamp);
    const toPrune = sorted.slice(0, sorted.length - MCP_AUDIT_RING_BUFFER_SIZE);
    await this.deletes(toPrune.map((e) => e.eventId));
  }

  async clear(): Promise<void> {
    const all = await this.all();
    await this.deletes(all.map((e) => e.eventId));
  }
}
