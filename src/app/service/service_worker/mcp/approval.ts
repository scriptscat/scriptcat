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
import { readScriptSource } from "./source";
import { SCTL_CLI_CLIENT_ID } from "./types";
import type {
  BridgeErrorCode,
  McpBridgeResponse,
  OperationStatusResult,
  PendingOperationRef,
  PendingOperationSummary,
  ScriptSource,
} from "./types";

// 5 分钟批准有效期，足够用户切换到弹出的确认窗口完成决定，又不至于让过期请求悬挂太久。
export const APPROVAL_TTL_MS = 5 * 60_000;
// 内联代码上限：主机→浏览器 native message 单帧硬上限 1 MiB，512 KiB 为信封开销预留余量。
export const INLINE_CODE_MAX_BYTES = 512 * 1024;

// 决策/作废事件驱动的 bridge.response 回发通道。McpApprovalService 不直接持有 WS 传输——由
// McpController 注入此回调（内部走 offscreen 的 connectClient.send），从而 SW 休眠也不会丢响应
// （响应由持久化的 op.requestId 重建，而非悬挂在 SW 内存里的 Promise）。
export type SendBridgeResponse = (requestId: string, response: McpBridgeResponse) => void;

// 窄接口：McpApprovalService 只需要 ScriptService 的三个变更入口，不依赖整个 ScriptService
// （AGENTS.md「依赖窄接口」）。批准前，这三个方法均不会被调用——这是本文件最核心的不变量。
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
 * Owns the McpOperation lifecycle: every write the MCP bridge exposes (install, enable/disable,
 * delete, source disclosure) becomes a pending operation here rather than executing immediately.
 * The extension mutates scripts only through `decide(...)`, which is driven by an explicit human
 * action on install.html / mcp_confirm.html — never by an inbound MCP request directly. `decide`
 * re-verifies the operation's binding (content hash, target state) at the moment of approval, not
 * just at request time, so a change between request and approval surfaces as `CONFLICT` instead
 * of silently applying to something other than what the human reviewed (TOCTOU protection).
 *
 * Blocking semantics (design §5.1): a blocking op carries the originating `bridge.request`'s
 * requestId. The wire `bridge.response` is produced by the decide/void *event* and pushed back
 * through the injected responder — never by a Promise left hanging in the (suspendable) SW. A
 * disconnect voids the op via `cancelByRequestId`; decide and void arbitrate serially through the
 * single `awaiting_user` guard (first terminal wins, an already-dead request is never approved).
 */
export class McpApprovalService {
  // Best-effort "one confirm page focused at a time" pointer (design §5.1 serial display). In
  // memory only — an MV3 SW may drop it on suspend, degrading to opening an extra confirm page,
  // which the reopen entry and blocking backpressure make tolerable.
  private presentedOperationId: string | undefined;
  private responder: SendBridgeResponse = () => {};

  constructor(
    private readonly mutator: McpScriptMutator,
    private readonly scriptDAO: Pick<ScriptDAO, "get">,
    private readonly scriptCodeDAO: Pick<ScriptCodeDAO, "get">,
    private readonly clientDAO: Pick<McpClientDAO, "get" | "save"> = new McpClientDAO(),
    private readonly operationDAO: McpOperationDAO = new McpOperationDAO(),
    private readonly tempStorageDAO: TempStorageDAO = new TempStorageDAO()
  ) {}

  // Wired after construction (McpController owns the WS transport but is built after approval),
  // mirroring the write-session checker seam between McpBridge and McpController.
  setResponder(responder: SendBridgeResponse): void {
    this.responder = responder;
  }

  async prepareInstall(params: {
    clientId: string;
    requestingClientName: string;
    url?: string;
    code?: string;
    requestId?: string;
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

    // Idempotency: identical (clientId, contentHash) while an install is still awaiting_user
    // returns the existing operation instead of stacking a second prompt.
    const existingOps = await this.operationDAO.byClient(params.clientId);
    const duplicate = existingOps.find(
      (op) => op.kind === "install" && op.status === "awaiting_user" && op.contentHash === contentHash
    );
    if (duplicate) {
      return toRef(duplicate);
    }

    // scripts.install.request carries no target uuid, so this always stages a brand-new script —
    // identical to how the browser's own webRequest-triggered install flow works (a fresh uuid
    // is generated, prepareScriptByCode never falls back to name/namespace matching because a
    // uuid is provided). There is deliberately no "update" path reachable from this action.
    const uuid = uuidv4();
    const { script } = await prepareScriptByCode(code, sourceUrl || "", uuid);
    // Staged with the record disabled — nothing has been approved yet. executeInstall() below is
    // what actually flips it to enabled, and only if the human explicitly opted in on the review
    // page; this staged value is never read as the final enabled state.
    script.status = SCRIPT_STATUS_DISABLE;

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
      requestId: params.requestId,
    };
    await this.operationDAO.save(operation);

    const si = (await createTempCodeEntry(false, uuid, code, sourceUrl || "", "mcp", script.metadata, {})) as [
      boolean,
      ScriptInfo,
      Record<string, unknown>,
    ];
    si[1].mcp = { operationId, requestingClientName: params.requestingClientName, contentHash };
    await this.tempStorageDAO.save({ key: uuid, value: si, savedAt: now, type: TempStorageItemType.tempCode });

    return toRef(operation);
  }

  async requestToggle(params: {
    clientId: string;
    uuid: string;
    enable: boolean;
    requestId?: string;
  }): Promise<PendingOperationRef> {
    return this.requestExistingScriptOperation(
      params.clientId,
      params.uuid,
      params.enable ? "enable" : "disable",
      params.requestId
    );
  }

  async requestDelete(params: { clientId: string; uuid: string; requestId?: string }): Promise<PendingOperationRef> {
    return this.requestExistingScriptOperation(params.clientId, params.uuid, "delete", params.requestId);
  }

  private async requestExistingScriptOperation(
    clientId: string,
    uuid: string,
    kind: "enable" | "disable" | "delete",
    requestId?: string
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
      requestId,
    };
    await this.operationDAO.save(operation);
    return toRef(operation);
  }

  /**
   * First-use-per-client source disclosure gate. Returns `"allowed"` when the client already
   * holds a permanent "allow for this client" grant — the caller (McpBridge) may proceed to read
   * and return the source synchronously. Returns a `PendingOperationRef` when a new approval
   * prompt is needed (or an identical one is already awaiting_user) — the caller presents it and
   * defers the wire response, exactly like a write. Under blocking semantics the approval itself
   * reads and returns the source (see executeSourceDisclosure), so there is no second "consume the
   * approved op" read: a one-shot ("Allow once") grant leaves no reusable approved record behind.
   */
  async checkSourceDisclosure(params: {
    clientId: string;
    uuid: string;
    requestingClientName: string;
    requestId?: string;
  }): Promise<"allowed" | PendingOperationRef> {
    // sctl CLI is source-disclosure exempt (design §3.1/§5/§6): the user typed `sctl scripts source`
    // themselves, and any process that can run sctl can already read the daemon key file — a prompt
    // adds no security. Writes are NOT exempt; they still route through the confirm page.
    if (params.clientId === SCTL_CLI_CLIENT_ID) {
      return "allowed";
    }

    const client = await this.clientDAO.get(params.clientId);
    if (client?.sourceDisclosureAllowed?.includes(params.uuid)) {
      return "allowed";
    }

    // Idempotency, mirroring prepareInstall above: don't stack a second prompt for the same
    // (clientId, uuid) while one is already awaiting_user.
    const existingOps = await this.operationDAO.byClient(params.clientId);
    const pending = existingOps.find(
      (op) => op.kind === "source_disclosure" && op.targetUuid === params.uuid && op.status === "awaiting_user"
    );
    if (pending) {
      return toRef(pending);
    }

    const target = await this.scriptDAO.get(params.uuid);
    if (!target) {
      throw new McpBridgeError("NOT_FOUND", "script not found");
    }

    const operationId = uuidv4();
    const now = Date.now();
    const operation: McpOperation = {
      operationId,
      clientId: params.clientId,
      kind: "source_disclosure",
      status: "awaiting_user",
      createdAt: now,
      expiresAt: now + APPROVAL_TTL_MS,
      targetUuid: params.uuid,
      requestedEnabledState: false,
      requestId: params.requestId,
    };
    await this.operationDAO.save(operation);
    return toRef(operation);
  }

  // ---------------------------------------------------------------------------------------------
  // Confirm-page presentation. Kept separate from op creation so the write-policy branch in
  // McpBridge decides whether to present (approval policy) or execute inline (allow policy), and
  // so concurrent blocking ops present serially (§5.1).
  // ---------------------------------------------------------------------------------------------

  private confirmUrl(op: McpOperation): string {
    // Installs are reviewed on the full install page (staged code is keyed by stagedUuid); every
    // other kind uses the compact mcp_confirm page addressed by operationId.
    return op.kind === "install"
      ? `/src/install.html?uuid=${op.stagedUuid}`
      : `/src/mcp_confirm.html?op=${op.operationId}`;
  }

  // Opens the confirm surface for a pending op, serially: if another confirm is still awaiting a
  // decision, this op queues and is surfaced by presentNext() once the current one resolves.
  async present(operationId: string): Promise<void> {
    if (this.presentedOperationId && this.presentedOperationId !== operationId) {
      const current = await this.operationDAO.get(this.presentedOperationId);
      if (current?.status === "awaiting_user") return;
    }
    const op = await this.sweepAndGet(operationId);
    if (!op || op.status !== "awaiting_user") return;
    this.presentedOperationId = operationId;
    await openInCurrentTab(this.confirmUrl(op));
  }

  // 误关 ≠ 拒绝 (§5.1): closing the confirm page leaves the op pending. This is the addressable
  // reopen entry the popup/settings "待确认" row calls; it force-focuses regardless of the serial
  // pointer, since the human explicitly asked to see this specific op again.
  async reopen(operationId: string): Promise<void> {
    const op = await this.sweepAndGet(operationId);
    if (!op || op.status !== "awaiting_user") {
      throw new McpBridgeError("OPERATION_EXPIRED", "operation is no longer pending", operationId);
    }
    this.presentedOperationId = operationId;
    await openInCurrentTab(this.confirmUrl(op));
  }

  // After a blocking op resolves, surface the next queued one so concurrent writes display one at
  // a time. Only blocking ops (those with a requestId) participate — allow-policy immediate
  // executions never present and must not trigger a queue drain.
  private async presentNext(resolvedOperationId: string): Promise<void> {
    if (this.presentedOperationId === resolvedOperationId) {
      this.presentedOperationId = undefined;
    }
    if (this.presentedOperationId) return;
    const pending = await this.operationDAO.awaitingUser();
    const next = pending.filter((op) => op.requestId).sort((a, b) => a.createdAt - b.createdAt)[0];
    if (next) await this.present(next.operationId);
  }

  // ---------------------------------------------------------------------------------------------
  // Disconnect voiding (decision #14). daemon → bridge.cancel {requestId} → here. Only an
  // awaiting_user op is voided (first-terminal-wins vs decide): if decide already resolved it,
  // this is a no-op and never rolls a decided state back, and never emits a stale bridge.response
  // (the requester is gone). If void wins, a later decide hits the awaiting_user guard and throws
  // OPERATION_EXPIRED — so an already-dead request is never approved.
  // ---------------------------------------------------------------------------------------------
  async cancelByRequestId(requestId: string): Promise<void> {
    const op = await this.operationDAO.byRequestId(requestId);
    if (!op || op.status !== "awaiting_user") return;
    await this.operationDAO.update(op.operationId, { status: "cancelled", decidedAt: Date.now() });
    await this.presentNext(op.operationId);
  }

  /**
   * Approve or reject a pending operation. `options.enable` only applies to installs: whether
   * the user flipped the enable switch on install.html. `options.rememberChoice` only applies to
   * source_disclosure: "client" persists a permanent per-client allow-list entry, "once"/undefined
   * approves only the single pending read. For a blocking op (has requestId) the terminal outcome
   * is also pushed back as the deferred `bridge.response`.
   */
  async decide(
    operationId: string,
    approved: boolean,
    options: { enable?: boolean; rememberChoice?: "once" | "client" } = {}
  ): Promise<OperationStatusResult> {
    const op = await this.sweepAndGet(operationId);
    if (!op) {
      throw new McpBridgeError("NOT_FOUND", "operation not found", operationId);
    }
    // Single-shot: a decided/expired/cancelled operation can never re-enter awaiting_user. This is
    // both the replay defense (a stale approved/rejected record can't authorize a second, unreviewed
    // mutation) and the void-vs-decide arbitration (a cancelled op refuses a late approval).
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
      this.emitError(op, "UNAUTHENTICATED", "client revoked");
      await this.advanceQueue(op);
      throw new McpBridgeError("UNAUTHENTICATED", "client revoked", operationId);
    }

    if (!approved) {
      await this.operationDAO.update(op.operationId, { status: "rejected", decidedAt: Date.now() });
      this.emitError(op, "USER_REJECTED", "user rejected the request");
      await this.advanceQueue(op);
      return toStatusResult({ ...op, status: "rejected" });
    }

    try {
      const { summary, wire } = await this.executeApproved(op, options);
      await this.operationDAO.update(op.operationId, { status: "approved", decidedAt: Date.now() });
      this.emitApproved(op, wire);
      await this.advanceQueue(op);
      return { operationId: op.operationId, kind: op.kind, status: "approved", resultSummary: summary };
    } catch (e) {
      const errorCode = e instanceof McpBridgeError ? e.code : "INTERNAL_ERROR";
      const message = e instanceof Error ? e.message : "internal error";
      await this.operationDAO.update(op.operationId, { status: "failed", decidedAt: Date.now(), errorCode });
      this.emitError(op, errorCode, message);
      await this.advanceQueue(op);
      throw e;
    }
  }

  // Only blocking ops (those with a requestId, i.e. an open confirm page) participate in the serial
  // queue; allow-policy immediate executions never present a page and must not drain the queue.
  private async advanceQueue(op: McpOperation): Promise<void> {
    if (op.requestId) await this.presentNext(op.operationId);
  }

  // Emit the deferred bridge.response for a blocking op. A no-op for allow-policy ops (no
  // requestId): those return their result synchronously through McpBridge instead.
  private emitApproved(op: McpOperation, result: unknown): void {
    if (op.requestId) {
      this.responder(op.requestId, { requestId: op.requestId, ok: true, result });
    }
  }

  private emitError(op: McpOperation, code: BridgeErrorCode, message: string): void {
    if (op.requestId) {
      this.responder(op.requestId, {
        requestId: op.requestId,
        ok: false,
        error: { code, message, operationId: op.operationId },
      });
    }
  }

  // Returns { summary } for the confirm page (OperationStatusResult.resultSummary) and { wire }
  // for the deferred bridge.response. They coincide for writes; source disclosure hands the full
  // ScriptSource back over the wire while the page only needs the uuid/name summary.
  private async executeApproved(
    op: McpOperation,
    options: { enable?: boolean; rememberChoice?: "once" | "client" }
  ): Promise<{ summary: { uuid?: string; name?: string; enabled?: boolean }; wire: unknown }> {
    switch (op.kind) {
      case "install": {
        const summary = await this.executeInstall(op, options);
        return { summary, wire: summary };
      }
      case "enable":
      case "disable": {
        const summary = await this.executeToggle(op, op.kind === "enable");
        return { summary, wire: summary };
      }
      case "delete": {
        const summary = await this.executeDelete(op);
        return { summary, wire: summary };
      }
      case "source_disclosure": {
        const source = await this.executeSourceDisclosure(op, options);
        return { summary: { uuid: source.uuid, name: source.name }, wire: source };
      }
      default:
        throw new McpBridgeError("INTERNAL_ERROR", `unsupported operation kind ${op.kind}`, op.operationId);
    }
  }

  private async executeSourceDisclosure(
    op: McpOperation,
    options: { rememberChoice?: "once" | "client" }
  ): Promise<ScriptSource> {
    if (options.rememberChoice === "client") {
      const client = await this.clientDAO.get(op.clientId);
      if (client) {
        const allowed = new Set(client.sourceDisclosureAllowed ?? []);
        allowed.add(op.targetUuid!);
        await this.clientDAO.save({ ...client, sourceDisclosureAllowed: [...allowed] });
      }
    }
    // Blocking: the suspended scripts.source.get is answered here and now with the source itself —
    // no separate "consume the approved op" read. A "once" grant therefore leaves no reusable
    // approved record; the next read starts a fresh prompt.
    return readScriptSource(this.scriptDAO, this.scriptCodeDAO, op.targetUuid!);
  }

  private async executeInstall(op: McpOperation, options: { enable?: boolean }) {
    const stagedUuid = op.stagedUuid!;
    const entry = await this.tempStorageDAO.get(stagedUuid);
    if (!entry) {
      throw new McpBridgeError("CONFLICT", "staged install missing or expired", op.operationId);
    }
    const stagedCode = await getTempCode(stagedUuid);
    // Re-verify the staged code hash immediately before mutation — this is the TOCTOU check:
    // staging and approval are separated by human reaction time, during which the staged entry
    // could in principle have been overwritten by a second request.
    if (!stagedCode || sha256OfText(stagedCode) !== op.contentHash) {
      throw new McpBridgeError("CONFLICT", "staged code changed since request", op.operationId);
    }

    const { script } = await prepareScriptByCode(stagedCode, op.sourceUrl || "", stagedUuid, true);
    // Even under "direct allow", a newly-installed script stays disabled unless the user opted in
    // (decision #12); allow policy calls decide with enable:false, so this stays SCRIPT_STATUS_DISABLE.
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
    // Re-verify the target's current code hash immediately before mutation — catches the target
    // having changed between request and decide.
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

  // Feeds the popup/settings "待确认" list: every still-pending op, enriched with the requesting
  // client's display name, oldest first. No clientId gate — the human viewing settings is the
  // authority (same rationale as getOperationForUI). TTL-expired ops are swept out lazily on read.
  async listPending(): Promise<PendingOperationSummary[]> {
    const pending = await this.operationDAO.awaitingUser();
    const rows = await Promise.all(
      pending.map(async (op): Promise<PendingOperationSummary | undefined> => {
        const fresh = await this.sweepAndGet(op.operationId);
        if (!fresh || fresh.status !== "awaiting_user") return undefined;
        const client = await this.clientDAO.get(fresh.clientId);
        return {
          operationId: fresh.operationId,
          kind: fresh.kind,
          requestingClientName: client?.displayName,
          createdAt: fresh.createdAt,
        };
      })
    );
    return rows
      .filter((row): row is PendingOperationSummary => row !== undefined)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  // Used by the human-facing approval pages (install.html / mcp_confirm.html), which are
  // reached only via an operationId the extension itself generated and opened a tab with — the
  // human viewing that tab is the authority, so unlike getOperation() there is no clientId gate.
  async getOperationForUI(
    operationId: string
  ): Promise<(McpOperation & { requestingClientName?: string }) | undefined> {
    const op = await this.sweepAndGet(operationId);
    if (!op) return undefined;
    const client = await this.clientDAO.get(op.clientId);
    return { ...op, requestingClientName: client?.displayName };
  }

  // Lazy expiry sweep: expiry is enforced on every read, not by a background timer — an
  // operation transitions to "expired" the moment something notices its TTL has passed.
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
