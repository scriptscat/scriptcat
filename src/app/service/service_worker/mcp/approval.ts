import { uuidv4 } from "@App/pkg/utils/uuid";
import { sha256OfText } from "@App/pkg/utils/crypto";
import { prepareScriptByCode } from "@App/pkg/utils/script";
import { createTempCodeEntry, getTempCode, type ScriptInfo } from "@App/pkg/utils/scriptInstall";
import { TempStorageDAO, TempStorageItemType } from "@App/app/repo/tempStorage";
import {
  type ScriptDAO,
  type ScriptCodeDAO,
  type Script,
  SCRIPT_STATUS_DISABLE,
  SCRIPT_STATUS_ENABLE,
} from "@App/app/repo/scripts";
import { McpClientDAO, McpOperationDAO, type McpOperation } from "@App/app/repo/mcp";
import type { TScriptInstallParam, TScriptInstallReturn } from "@App/app/service/service_worker/script";
import type { InstallSource } from "@App/app/service/service_worker/types";
import { openInCurrentTab } from "@App/pkg/utils/utils";
import { validateInstallUrl, fetchInstallSourceWithPolicy, UrlPolicyViolation } from "./url_policy";
import { McpBridgeError } from "./errors";
import type { OperationStatusResult, PendingOperationRef } from "./types";

// 5 分钟批准有效期（doc 04 §7）。
export const APPROVAL_TTL_MS = 5 * 60_000;
// 内联代码上限：主机→浏览器 native message 单帧硬上限 1 MiB，512 KiB 为信封开销预留余量（doc 03 §3）。
export const INLINE_CODE_MAX_BYTES = 512 * 1024;

// 窄接口：McpApprovalService 只需要 ScriptService 的三个变更入口，不依赖整个 ScriptService
// （AGENTS.md「依赖窄接口」）。批准前，这三个方法均不会被调用 —— doc 04 §4 的核心不变量。
export interface McpScriptMutator {
  installScript(param: TScriptInstallParam): Promise<TScriptInstallReturn>;
  enableScript(param: { uuid: string; enable: boolean }): Promise<unknown>;
  deleteScript(uuid: string, deleteBy?: InstallSource): Promise<unknown>;
}

function toRef(op: McpOperation): PendingOperationRef {
  return {
    operationId: op.operationId,
    status: "awaiting_user",
    kind: op.kind,
    expiresAt: new Date(op.expiresAt).toISOString(),
  };
}

function toStatusResult(op: McpOperation): OperationStatusResult {
  return {
    operationId: op.operationId,
    kind: op.kind,
    status: op.status,
    errorCode: op.errorCode as OperationStatusResult["errorCode"],
  };
}

/**
 * Owns the McpOperation lifecycle (doc 04 §4 TOCTOU invariants; doc 05 §4.4). Every write the
 * MCP bridge exposes becomes a pending operation here; the extension mutates scripts only
 * through `decide(...)`, which is driven by an explicit human action on install.html /
 * mcp_confirm.html — never by an inbound MCP request directly.
 */
export class McpApprovalService {
  constructor(
    private readonly mutator: McpScriptMutator,
    private readonly scriptDAO: Pick<ScriptDAO, "get">,
    private readonly scriptCodeDAO: Pick<ScriptCodeDAO, "get">,
    private readonly clientDAO: Pick<McpClientDAO, "get"> = new McpClientDAO(),
    private readonly operationDAO: McpOperationDAO = new McpOperationDAO(),
    private readonly tempStorageDAO: TempStorageDAO = new TempStorageDAO()
  ) {}

  async prepareInstall(params: {
    clientId: string;
    requestingClientName: string;
    url?: string;
    code?: string;
  }): Promise<PendingOperationRef> {
    if (!!params.url === !!params.code) {
      throw new McpBridgeError("INVALID_REQUEST", "exactly one of url or code is required");
    }

    let code: string;
    let sourceUrl: string | undefined;
    if (params.url) {
      const initialCheck = validateInstallUrl(params.url);
      if (!initialCheck.ok) {
        throw new McpBridgeError("INVALID_REQUEST", `url rejected: ${initialCheck.reason}`);
      }
      try {
        code = await fetchInstallSourceWithPolicy(params.url);
      } catch (e) {
        if (e instanceof UrlPolicyViolation) {
          const reasonCode = e.reason === "PAYLOAD_TOO_LARGE" ? "PAYLOAD_TOO_LARGE" : "INVALID_REQUEST";
          throw new McpBridgeError(reasonCode, `url rejected: ${e.reason}`);
        }
        throw e;
      }
      sourceUrl = params.url;
    } else {
      code = params.code!;
      if (new TextEncoder().encode(code).length > INLINE_CODE_MAX_BYTES) {
        throw new McpBridgeError("PAYLOAD_TOO_LARGE", "inline code exceeds 512 KiB");
      }
    }

    const contentHash = sha256OfText(code);

    // Idempotency (doc 04 §4 invariant 8): identical (clientId, contentHash) while an install is
    // still awaiting_user returns the existing operation instead of stacking a second prompt.
    const existingOps = await this.operationDAO.byClient(params.clientId);
    const duplicate = existingOps.find(
      (op) => op.kind === "install" && op.status === "awaiting_user" && op.contentHash === contentHash
    );
    if (duplicate) {
      return toRef(duplicate);
    }

    // scripts.install.prepare carries no target uuid, so this always stages a brand-new script —
    // identical to how the browser's own webRequest-triggered install flow works (a fresh uuid
    // is generated, prepareScriptByCode never falls back to name/namespace matching because a
    // uuid is provided). There is deliberately no "update" path reachable from this action.
    const uuid = uuidv4();
    const { script } = await prepareScriptByCode(code, sourceUrl || "", uuid);
    script.status = SCRIPT_STATUS_DISABLE; // doc 04 §4 invariant 6: installs always start disabled

    const operationId = uuidv4();
    const now = Date.now();
    const operation: McpOperation = {
      operationId,
      clientId: params.clientId,
      kind: "install",
      status: "awaiting_user",
      createdAt: now,
      expiresAt: now + APPROVAL_TTL_MS,
      sourceUrl,
      contentHash,
      stagedUuid: uuid,
      requestedEnabledState: false,
    };
    await this.operationDAO.save(operation);

    const si = (await createTempCodeEntry(false, uuid, code, sourceUrl || "", "mcp", script.metadata, {})) as [
      boolean,
      ScriptInfo,
      Record<string, unknown>,
    ];
    si[1].mcp = { operationId, requestingClientName: params.requestingClientName, contentHash };
    await this.tempStorageDAO.save({ key: uuid, value: si, savedAt: now, type: TempStorageItemType.tempCode });

    await openInCurrentTab(`/src/install.html?uuid=${uuid}`);
    return toRef(operation);
  }

  async requestToggle(params: { clientId: string; uuid: string; enable: boolean }): Promise<PendingOperationRef> {
    return this.requestExistingScriptOperation(params.clientId, params.uuid, params.enable ? "enable" : "disable");
  }

  async requestDelete(params: { clientId: string; uuid: string }): Promise<PendingOperationRef> {
    return this.requestExistingScriptOperation(params.clientId, params.uuid, "delete");
  }

  private async requestExistingScriptOperation(
    clientId: string,
    uuid: string,
    kind: "enable" | "disable" | "delete"
  ): Promise<PendingOperationRef> {
    const target = await this.scriptDAO.get(uuid);
    if (!target) {
      throw new McpBridgeError("NOT_FOUND", "script not found");
    }
    const existingCode = await this.scriptCodeDAO.get(uuid);

    const operationId = uuidv4();
    const now = Date.now();
    const operation: McpOperation = {
      operationId,
      clientId,
      kind,
      status: "awaiting_user",
      createdAt: now,
      expiresAt: now + APPROVAL_TTL_MS,
      targetUuid: uuid,
      existingCodeHash: existingCode ? sha256OfText(existingCode.code) : undefined,
      requestedEnabledState: false,
    };
    await this.operationDAO.save(operation);
    await openInCurrentTab(`/src/mcp_confirm.html?op=${operationId}`);
    return toRef(operation);
  }

  /**
   * Approve or reject a pending operation. `options.enable` only applies to installs: whether
   * the user flipped the enable switch on install.html (doc 04 §4 invariant 6).
   */
  async decide(
    operationId: string,
    approved: boolean,
    options: { enable?: boolean } = {}
  ): Promise<OperationStatusResult> {
    const op = await this.sweepAndGet(operationId);
    if (!op) {
      throw new McpBridgeError("NOT_FOUND", "operation not found", operationId);
    }
    // Single-shot: a decided/expired operation can never re-enter awaiting_user (replay defense,
    // doc 04 §4 invariant 5).
    if (op.status !== "awaiting_user") {
      throw new McpBridgeError("OPERATION_EXPIRED", `operation already ${op.status}`, operationId);
    }

    const client = await this.clientDAO.get(op.clientId);
    if (!client || client.revoked) {
      await this.operationDAO.update(op.operationId, {
        status: "rejected",
        decidedAt: Date.now(),
        errorCode: "UNAUTHENTICATED",
      });
      throw new McpBridgeError("UNAUTHENTICATED", "client revoked", operationId);
    }

    if (!approved) {
      await this.operationDAO.update(op.operationId, { status: "rejected", decidedAt: Date.now() });
      return toStatusResult({ ...op, status: "rejected" });
    }

    try {
      const resultSummary = await this.executeApproved(op, options);
      await this.operationDAO.update(op.operationId, { status: "approved", decidedAt: Date.now() });
      return { operationId: op.operationId, kind: op.kind, status: "approved", resultSummary };
    } catch (e) {
      const errorCode = e instanceof McpBridgeError ? e.code : "INTERNAL_ERROR";
      await this.operationDAO.update(op.operationId, { status: "failed", decidedAt: Date.now(), errorCode });
      throw e;
    }
  }

  private async executeApproved(
    op: McpOperation,
    options: { enable?: boolean }
  ): Promise<{ uuid?: string; name?: string; enabled?: boolean }> {
    switch (op.kind) {
      case "install":
        return this.executeInstall(op, options);
      case "enable":
      case "disable":
        return this.executeToggle(op, op.kind === "enable");
      case "delete":
        return this.executeDelete(op);
      default:
        throw new McpBridgeError("INTERNAL_ERROR", `unsupported operation kind ${op.kind}`, op.operationId);
    }
  }

  private async executeInstall(op: McpOperation, options: { enable?: boolean }) {
    const stagedUuid = op.stagedUuid!;
    const entry = await this.tempStorageDAO.get(stagedUuid);
    if (!entry) {
      throw new McpBridgeError("CONFLICT", "staged install missing or expired", op.operationId);
    }
    const stagedCode = await getTempCode(stagedUuid);
    // Re-verify the staged code hash immediately before mutation (doc 04 §4 invariant 2) — this
    // is the TOCTOU check: staging and approval are separated by human reaction time, during
    // which the staged entry could in principle have been overwritten by a second request.
    if (!stagedCode || sha256OfText(stagedCode) !== op.contentHash) {
      throw new McpBridgeError("CONFLICT", "staged code changed since request", op.operationId);
    }

    const { script } = await prepareScriptByCode(stagedCode, op.sourceUrl || "", stagedUuid, true);
    script.status = options.enable ? SCRIPT_STATUS_ENABLE : SCRIPT_STATUS_DISABLE;
    await this.mutator.installScript({ script, code: stagedCode, upsertBy: "mcp" });
    return { uuid: script.uuid, name: script.name, enabled: script.status === SCRIPT_STATUS_ENABLE };
  }

  private async assertTargetUnchanged(op: McpOperation): Promise<Script> {
    const target = await this.scriptDAO.get(op.targetUuid!);
    if (!target) {
      throw new McpBridgeError("CONFLICT", "target script no longer exists", op.operationId);
    }
    const code = await this.scriptCodeDAO.get(op.targetUuid!);
    const currentHash = code ? sha256OfText(code.code) : undefined;
    // Re-verify the target's current code hash immediately before mutation (doc 04 §4
    // invariant 3) — catches the target having changed between request and decide.
    if (currentHash !== op.existingCodeHash) {
      throw new McpBridgeError("CONFLICT", "target script changed since request", op.operationId);
    }
    return target;
  }

  private async executeToggle(op: McpOperation, enable: boolean) {
    const target = await this.assertTargetUnchanged(op);
    await this.mutator.enableScript({ uuid: op.targetUuid!, enable });
    return { uuid: op.targetUuid, name: target.name, enabled: enable };
  }

  private async executeDelete(op: McpOperation) {
    const target = await this.assertTargetUnchanged(op);
    await this.mutator.deleteScript(op.targetUuid!, "mcp");
    return { uuid: op.targetUuid, name: target.name };
  }

  async getOperation(clientId: string, operationId: string): Promise<OperationStatusResult> {
    const op = await this.sweepAndGet(operationId);
    // NOT_FOUND (not INSUFFICIENT_SCOPE) for another client's operation — don't leak existence.
    if (!op || op.clientId !== clientId) {
      throw new McpBridgeError("NOT_FOUND", "operation not found", operationId);
    }
    return toStatusResult(op);
  }

  async listOperations(clientId: string): Promise<OperationStatusResult[]> {
    const ops = await this.operationDAO.byClient(clientId);
    const swept: McpOperation[] = [];
    for (const op of ops) {
      const current = await this.sweepAndGet(op.operationId);
      if (current) swept.push(current);
    }
    // doc 03 §3: operations.list returns the caller's non-expired operations.
    return swept.filter((op) => op.status !== "expired").map(toStatusResult);
  }

  async cancelOperation(clientId: string, operationId: string): Promise<{ operationId: string; status: "cancelled" }> {
    const op = await this.sweepAndGet(operationId);
    if (!op || op.clientId !== clientId) {
      throw new McpBridgeError("NOT_FOUND", "operation not found", operationId);
    }
    if (op.status !== "awaiting_user") {
      throw new McpBridgeError("CONFLICT", `cannot cancel operation in status ${op.status}`, operationId);
    }
    await this.operationDAO.update(operationId, { status: "cancelled", decidedAt: Date.now() });
    return { operationId, status: "cancelled" };
  }

  // Lazy expiry sweep (doc 04 §4 invariant 1): expiry is enforced on every read, not by a timer.
  private async sweepAndGet(operationId: string): Promise<McpOperation | undefined> {
    const op = await this.operationDAO.get(operationId);
    if (!op) return undefined;
    if (op.status === "awaiting_user" && Date.now() >= op.expiresAt) {
      const expired: McpOperation = { ...op, status: "expired" };
      await this.operationDAO.save(expired);
      return expired;
    }
    return op;
  }
}
