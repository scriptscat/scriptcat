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
import { ExternalAccessOperationDAO, type ExternalAccessOperation } from "@App/app/repo/external_access";
import type { TScriptInstallParam, TScriptInstallReturn } from "@App/app/service/service_worker/script";
import type { InstallSource } from "@App/app/service/service_worker/types";
import { openInCurrentTab } from "@App/pkg/utils/utils";
import { validateInstallUrl, fetchInstallSourceWithPolicy, UrlPolicyViolation } from "./url_policy";
import { ExternalAccessBridgeError } from "./errors";
import { readScriptSource, grepScriptSource, applyTextEdits, MAX_SOURCE_BYTES, type TextEdit } from "./source";
import { SessionAllowStore, sessionAllowKey } from "./session_allow";
import type {
  BridgeErrorCode,
  ExternalAccessBridgeResponse,
  OperationStatusResult,
  PendingOperationRef,
  PendingOperationSummary,
  ScriptSource,
  ScriptSourceGrepResult,
  SourceDisclosureForm,
} from "./types";

// 5 分钟批准有效期，足够用户切换到弹出的确认窗口完成决定，又不至于让过期请求悬挂太久。
export const APPROVAL_TTL_MS = 5 * 60_000;

// 决策/作废事件驱动的 JSON-RPC 响应回发通道。ExternalAccessApprovalService 不直接持有 WS 传输——由
// ExternalAccessController 注入此回调（内部走 offscreen 的 connectClient.send），从而 SW 休眠也不会丢响应
// （响应由持久化的 op.requestId 重建，而非悬挂在 SW 内存里的 Promise）。
export type SendBridgeResponse = (requestId: string, response: ExternalAccessBridgeResponse) => void;

// 窄接口：ExternalAccessApprovalService 只需要 ScriptService 的三个变更入口，不依赖整个 ScriptService
// （AGENTS.md「依赖窄接口」）。批准前，这三个方法均不会被调用——这是本文件最核心的不变量。
export interface ExternalAccessScriptMutator {
  installScript(param: TScriptInstallParam): Promise<TScriptInstallReturn>;
  enableScript(param: { uuid: string; enable: boolean }): Promise<unknown>;
  deleteScript(uuid: string, deleteBy?: InstallSource): Promise<unknown>;
}

function toRef(op: ExternalAccessOperation): PendingOperationRef {
  return {
    operationId: op.operationId,
    status: "awaiting_user",
    kind: op.kind,
    expiresAt: new Date(op.expiresAt).toISOString(),
  };
}

function toStatusResult(op: ExternalAccessOperation): OperationStatusResult {
  return {
    operationId: op.operationId,
    kind: op.kind,
    status: op.status,
    errorCode: op.errorCode as OperationStatusResult["errorCode"],
  };
}

// 「本会话允许」自动批准时用什么选项执行：安装默认启用（即装即用，设计 §6），其余无附加选项。
function autoApproveOptions(op: ExternalAccessOperation): { enable?: boolean } {
  return op.kind === "install" ? { enable: true } : {};
}

// grep 与整份读共用 kind === "source_disclosure"，去重必须再比一层「形态」（设计 §4.2「挂起态的区
// 分」），否则不同参数的两次 grep、或一次 grep 与一次整份读会被合并成同一个操作，批准时只能产出其中
// 一种结果。两侧形态不同，或形态相同但参数不同，都不算重复。
function sameDisclosureForm(a: SourceDisclosureForm, b: SourceDisclosureForm): boolean {
  if (a.form !== b.form) return false;
  if (a.form === "full" && b.form === "full") {
    return a.startLine === b.startLine && a.endLine === b.endLine && a.maxBytes === b.maxBytes;
  }
  if (a.form === "grep" && b.form === "grep") {
    return (
      a.query === b.query &&
      a.mode === b.mode &&
      a.ignoreCase === b.ignoreCase &&
      a.contextLines === b.contextLines &&
      a.maxMatches === b.maxMatches
    );
  }
  return false;
}

/**
 * Owns the ExternalAccessOperation lifecycle: every write the bridge exposes (install, enable/disable,
 * delete) and every source read under the "approval" policy becomes a pending operation here
 * rather than executing immediately. The extension mutates scripts / discloses source only through
 * `decide(...)`, driven by an explicit human action on install.html / external_access_confirm.html — never by
 * an inbound request directly. `decide` re-verifies the operation's binding (content hash, target
 * state) at approval time, not just request time, so a change between request and approval surfaces
 * as `CONFLICT` instead of silently applying to something other than what the human reviewed
 * (TOCTOU protection).
 *
 * Three-tier decision (design §3): 拒绝 / 允许(once) / 本会话允许. The third tier records a
 * (kind, script) key in the extension-session SessionAllowStore; a later matching request is then
 * auto-approved inside `present()` without opening a page. There are no per-client records — trust
 * is flat, `clientId` is an audit label only.
 *
 * Blocking semantics (design §5.1): a blocking op carries the originating request's requestId. The
 * JSON-RPC response is produced by the decide/void *event* and pushed back through the injected
 * responder — never by a Promise left hanging in the (suspendable) SW. A disconnect voids the op via
 * `cancelByRequestId`; decide and void arbitrate serially through the single `awaiting_user` guard
 * (first terminal wins, an already-dead request is never approved).
 */
export class ExternalAccessApprovalService {
  private transitionTail: Promise<void> = Promise.resolve();
  // Best-effort "one confirm page focused at a time" pointer (design §5.1 serial display). In
  // memory only — an MV3 SW may drop it on suspend, degrading to opening an extra confirm page,
  // which the reopen entry and blocking backpressure make tolerable.
  private presentedOperationId: string | undefined;
  private responder: SendBridgeResponse = () => {};

  constructor(
    private readonly mutator: ExternalAccessScriptMutator,
    private readonly scriptDAO: Pick<ScriptDAO, "get">,
    private readonly scriptCodeDAO: Pick<ScriptCodeDAO, "get">,
    private readonly operationDAO: ExternalAccessOperationDAO = new ExternalAccessOperationDAO(),
    private readonly tempStorageDAO: TempStorageDAO = new TempStorageDAO(),
    private readonly sessionAllow: SessionAllowStore = new SessionAllowStore()
  ) {}

  // Wired after construction (ExternalAccessController owns the WS transport but is built after approval).
  setResponder(responder: SendBridgeResponse): void {
    this.responder = responder;
  }

  // "停止外部接入" kill switch drops every 本会话允许 grant along with the key K.
  clearSessionAllow(): Promise<void> {
    return this.sessionAllow.clear();
  }

  async prepareInstall(params: {
    clientId: string;
    url?: string;
    code?: string;
    requestId?: string;
  }): Promise<PendingOperationRef> {
    if (!!params.url === !!params.code) {
      throw new ExternalAccessBridgeError("INVALID_REQUEST", "exactly one of url or code is required");
    }

    let code: string;
    let sourceUrl: string | undefined;
    if (params.url) {
      const initialCheck = validateInstallUrl(params.url);
      if (!initialCheck.ok) {
        throw new ExternalAccessBridgeError("INVALID_REQUEST", `url rejected: ${initialCheck.reason}`);
      }
      try {
        code = await fetchInstallSourceWithPolicy(params.url);
      } catch (e) {
        if (e instanceof UrlPolicyViolation) {
          const reasonCode = e.reason === "PAYLOAD_TOO_LARGE" ? "PAYLOAD_TOO_LARGE" : "INVALID_REQUEST";
          throw new ExternalAccessBridgeError(reasonCode, `url rejected: ${e.reason}`);
        }
        throw e;
      }
      sourceUrl = params.url;
    } else {
      code = params.code!;
      if (new TextEncoder().encode(code).length > MAX_SOURCE_BYTES) {
        throw new ExternalAccessBridgeError("PAYLOAD_TOO_LARGE", "inline code exceeds maxSourceBytes");
      }
    }

    const contentHash = sha256OfText(code);

    // Only a retry carrying the same JSON-RPC id may reuse an operation. Different ids each need
    // their own terminal response, even when their payloads are identical.
    const awaiting = await this.operationDAO.awaitingUser();
    const duplicate = awaiting.find(
      (op) =>
        params.requestId !== undefined &&
        op.requestId === params.requestId &&
        op.kind === "install" &&
        op.contentHash === contentHash
    );
    if (duplicate) {
      return toRef(duplicate);
    }

    // scripts.install.request carries no target uuid, so this always stages a brand-new script —
    // identical to the browser's own webRequest-triggered install flow (a fresh uuid is generated).
    const uuid = uuidv4();
    const { script } = await prepareScriptByCode(code, sourceUrl || "", uuid);

    const operationId = uuidv4();
    const now = Date.now();
    const operation: ExternalAccessOperation = {
      operationId,
      clientId: params.clientId,
      kind: "install",
      status: "awaiting_user",
      createdAt: now,
      expiresAt: now + APPROVAL_TTL_MS,
      sessionKey: sessionAllowKey("install", `${script.namespace}:${script.name}`),
      sourceUrl,
      contentHash,
      stagedUuid: uuid,
      requestId: params.requestId,
    };
    await this.operationDAO.save(operation);

    // Stage the code so install.html (opened at ?uuid=<stagedUuid>) can render identity/permissions/
    // code exactly like a normal install. si[1].externalAccess signals the bridge-triggered context (banner +
    // three-tier action bar); it deliberately carries no client name (design §3.0.1).
    const si = (await createTempCodeEntry(
      false,
      uuid,
      code,
      sourceUrl || "",
      "external_access",
      script.metadata,
      {}
    )) as [boolean, ScriptInfo, Record<string, unknown>];
    si[1].externalAccess = { operationId, contentHash };
    await this.tempStorageDAO.save({ key: uuid, value: si, savedAt: now, type: TempStorageItemType.tempCode });

    return toRef(operation);
  }

  /**
   * Content-anchored edit gate for `scripts.edit.request` (design §5). Everything here runs before
   * any confirm page opens and mutates nothing: the client's anchors are resolved against the
   * script's current source, the assembled full text is size-checked, and only then does an
   * operation exist. A request that can never be served therefore never costs the user a page.
   *
   * The client sends no hash (design 决策 5); the request→approval TOCTOU window is guarded by
   * `existingCodeHash`, computed here from the very text the edits were anchored against and
   * re-verified by `assertTargetUnchanged` at approval time.
   */
  async requestEdit(params: {
    clientId: string;
    uuid: string;
    edits: TextEdit[];
    requestId?: string;
  }): Promise<PendingOperationRef> {
    const target = await this.scriptDAO.get(params.uuid);
    if (!target) {
      throw new ExternalAccessBridgeError("NOT_FOUND", "script not found");
    }
    const existingCode = await this.scriptCodeDAO.get(params.uuid);
    if (!existingCode) {
      throw new ExternalAccessBridgeError("NOT_FOUND", "script source not found");
    }

    const editedCode = applyTextEdits(existingCode.code, params.edits);
    // Keep edited source within the same public source boundary used by install and source.get.
    if (new TextEncoder().encode(editedCode).length > MAX_SOURCE_BYTES) {
      throw new ExternalAccessBridgeError("PAYLOAD_TOO_LARGE", "edited source exceeds 2 MiB");
    }
    const contentHash = sha256OfText(editedCode);

    // Same-id retries reuse their operation; distinct JSON-RPC ids remain independently answerable.
    const awaiting = await this.operationDAO.awaitingUser();
    const duplicate = awaiting.find(
      (op) =>
        params.requestId !== undefined &&
        op.requestId === params.requestId &&
        op.kind === "update" &&
        op.targetUuid === params.uuid &&
        op.contentHash === contentHash
    );
    if (duplicate) {
      return toRef(duplicate);
    }

    // parseScriptFromCode derives downloadUrl/checkUpdateUrl from origin (src/pkg/utils/script.ts),
    // and approval re-runs it with op.sourceUrl — passing the target's own origin is what keeps an
    // edit from wiping the script's update address.
    const origin = target.origin || "";
    const { script } = await prepareScriptByCode(editedCode, origin, params.uuid, true);

    const operationId = uuidv4();
    const now = Date.now();
    const operation: ExternalAccessOperation = {
      operationId,
      clientId: params.clientId,
      kind: "update",
      status: "awaiting_user",
      createdAt: now,
      expiresAt: now + APPROVAL_TTL_MS,
      sessionKey: sessionAllowKey("update", params.uuid),
      sourceUrl: origin,
      contentHash,
      // Edits target an existing script, so the staged code is keyed by that script's own uuid —
      // the same key the browser's own update flow stages under (ScriptService.openUpdateOrInstallPage).
      stagedUuid: params.uuid,
      targetUuid: params.uuid,
      existingCodeHash: sha256OfText(existingCode.code),
      requestId: params.requestId,
    };
    await this.operationDAO.save(operation);

    // `true` = update entry: install.html then takes its isKnownUpdate branch and renders the inline
    // diff, version comparison and permission card against the script's current version.
    const si = (await createTempCodeEntry(
      true,
      params.uuid,
      editedCode,
      origin,
      "external_access",
      script.metadata,
      {}
    )) as [boolean, ScriptInfo, Record<string, unknown>];
    si[1].externalAccess = { operationId, contentHash };
    await this.tempStorageDAO.save({
      key: params.uuid,
      value: si,
      savedAt: now,
      type: TempStorageItemType.tempCode,
    });

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
      throw new ExternalAccessBridgeError("NOT_FOUND", "script not found");
    }
    const existingCode = await this.scriptCodeDAO.get(uuid);

    const operationId = uuidv4();
    const now = Date.now();
    const operation: ExternalAccessOperation = {
      operationId,
      clientId,
      kind,
      status: "awaiting_user",
      createdAt: now,
      expiresAt: now + APPROVAL_TTL_MS,
      sessionKey: sessionAllowKey(kind, uuid),
      targetUuid: uuid,
      existingCodeHash: existingCode ? sha256OfText(existingCode.code) : undefined,
      requestId,
    };
    await this.operationDAO.save(operation);
    return toRef(operation);
  }

  /**
   * Source-read gate under the "approval" policy. Source may embed secrets, so it keeps its own
   * pending-op prompt (unlike list/metadata). Always returns a ref for the caller to present(); the
   * "本会话允许" fast path lives in present() like every other kind. Idempotent: won't stack a second
   * prompt for the same script while one with the exact same disclosure form (full read, or grep +
   * its params) is already awaiting_user (design §4.2) — `scripts.source.get` and
   * `scripts.source.grep` both funnel through here and share this dedup.
   */
  async requestSourceDisclosure(params: {
    clientId: string;
    uuid: string;
    requestId?: string;
    form?: SourceDisclosureForm;
  }): Promise<PendingOperationRef> {
    const form: SourceDisclosureForm = params.form ?? { form: "full" };

    const awaiting = await this.operationDAO.awaitingUser();
    const pending = awaiting.find(
      (op) =>
        params.requestId !== undefined &&
        op.requestId === params.requestId &&
        op.kind === "source_disclosure" &&
        op.targetUuid === params.uuid &&
        op.disclosure !== undefined &&
        sameDisclosureForm(op.disclosure, form)
    );
    if (pending) {
      return toRef(pending);
    }

    const target = await this.scriptDAO.get(params.uuid);
    if (!target) {
      throw new ExternalAccessBridgeError("NOT_FOUND", "script not found");
    }

    const operationId = uuidv4();
    const now = Date.now();
    const operation: ExternalAccessOperation = {
      operationId,
      clientId: params.clientId,
      kind: "source_disclosure",
      status: "awaiting_user",
      createdAt: now,
      expiresAt: now + APPROVAL_TTL_MS,
      sessionKey: sessionAllowKey("source_disclosure", params.uuid),
      targetUuid: params.uuid,
      disclosure: form,
      requestId: params.requestId,
    };
    await this.operationDAO.save(operation);
    return toRef(operation);
  }

  // ---------------------------------------------------------------------------------------------
  // Confirm-page presentation. Kept separate from op creation so the policy branch in ExternalAccessBridge
  // decides whether to present (approval policy) or execute inline (allow policy), and so
  // concurrent blocking ops present serially (§5.1).
  // ---------------------------------------------------------------------------------------------

  private confirmUrl(op: ExternalAccessOperation): string {
    // Installs and edits are reviewed on the full install page (staged code is keyed by stagedUuid)
    // — an edit can touch @grant/@match/@connect, which is a permission change and has to land on
    // the page that carries the permission card and the inline diff. Every other kind uses the
    // compact external_access_confirm page addressed by operationId.
    return op.kind === "install" || op.kind === "update"
      ? `/src/install.html?uuid=${op.stagedUuid}`
      : `/src/external_access_confirm.html?op=${op.operationId}`;
  }

  private async openConfirmPage(op: ExternalAccessOperation): Promise<void> {
    const tab = await openInCurrentTab(this.confirmUrl(op));
    if (tab && Number.isFinite(tab.windowId) && tab.windowId >= 0) {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
  }

  // Opens the confirm surface for a pending op. First honours the third decision tier: a
  // session-allowed (kind, script) auto-approves without a page (design §3). Otherwise displays
  // serially — if another confirm is still awaiting a decision, this op queues and presentNext()
  // surfaces it once the current one resolves.
  async present(operationId: string): Promise<void> {
    const op = await this.sweepAndGet(operationId);
    if (!op || op.status !== "awaiting_user") return;
    if (await this.sessionAllow.has(op.sessionKey)) {
      await this.decide(op.operationId, true, autoApproveOptions(op));
      return;
    }
    if (this.presentedOperationId && this.presentedOperationId !== operationId) {
      const current = await this.operationDAO.get(this.presentedOperationId);
      if (current?.status === "awaiting_user") return;
    }
    this.presentedOperationId = operationId;
    await this.openConfirmPage(op);
  }

  // 误关 ≠ 拒绝 (§5.1): closing the confirm page leaves the op pending. This is the addressable
  // reopen entry; it force-focuses regardless of the serial pointer, since the human explicitly
  // asked to see this specific op again. Unlike present(), it never auto-approves.
  async reopen(operationId: string): Promise<void> {
    const op = await this.sweepAndGet(operationId);
    if (!op || op.status !== "awaiting_user") {
      throw new ExternalAccessBridgeError("OPERATION_EXPIRED", "operation is no longer pending", operationId);
    }
    this.presentedOperationId = operationId;
    await this.openConfirmPage(op);
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
  // Disconnect voiding. daemon → $/cancelRequest {id} → here. Only an
  // awaiting_user op is voided (first-terminal-wins vs decide): if decide already resolved it,
  // this is a no-op and never rolls a decided state back, and never emits a stale response
  // (the requester is gone). If void wins, a later decide hits the awaiting_user guard and throws
  // OPERATION_EXPIRED — so an already-dead request is never approved.
  // ---------------------------------------------------------------------------------------------
  async cancelByRequestId(requestId: string): Promise<void> {
    await this.withTransitionLock(async () => {
      const op = await this.operationDAO.byRequestId(requestId);
      if (!op || op.status !== "awaiting_user") return;
      await this.operationDAO.update(op.operationId, { status: "cancelled", decidedAt: Date.now() });
      await this.presentNext(op.operationId);
    });
  }

  async cancelAllPending(): Promise<void> {
    await this.withTransitionLock(async () => {
      const pending = await this.operationDAO.awaitingUser();
      await Promise.all(
        pending.map((op) => this.operationDAO.update(op.operationId, { status: "cancelled", decidedAt: Date.now() }))
      );
      this.presentedOperationId = undefined;
    });
  }

  private async withTransitionLock<T>(task: () => Promise<T>): Promise<T> {
    const previous = this.transitionTail;
    let release!: () => void;
    this.transitionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await task();
    } finally {
      release();
    }
  }

  /**
   * Approve or reject a pending operation. `options.enable` only applies to installs: whether the
   * user left the enable switch on install.html on. `options.rememberSession` records the third
   * decision tier — 「本会话允许」— persisting a (kind, script) key so this session skips the prompt
   * next time (applies to every kind). For a blocking op (has requestId) the terminal outcome is
   * also pushed back as the deferred JSON-RPC response.
   */
  async decide(
    operationId: string,
    approved: boolean,
    options: { enable?: boolean; rememberSession?: boolean } = {}
  ): Promise<OperationStatusResult> {
    const { status } = await this.decideInternal(operationId, approved, options);
    return status;
  }

  async decideForBridge(operationId: string, options: { enable?: boolean } = {}): Promise<unknown> {
    const { wire } = await this.decideInternal(operationId, true, options);
    return wire;
  }

  private async decideInternal(
    operationId: string,
    approved: boolean,
    options: { enable?: boolean; rememberSession?: boolean }
  ): Promise<{ status: OperationStatusResult; wire?: unknown }> {
    return this.withTransitionLock(() => this.decideInternalUnlocked(operationId, approved, options));
  }

  private async decideInternalUnlocked(
    operationId: string,
    approved: boolean,
    options: { enable?: boolean; rememberSession?: boolean }
  ): Promise<{ status: OperationStatusResult; wire?: unknown }> {
    const op = await this.sweepAndGet(operationId);
    if (!op) {
      throw new ExternalAccessBridgeError("NOT_FOUND", "operation not found", operationId);
    }
    // Single-shot: a decided/expired/cancelled operation can never re-enter awaiting_user. This is
    // both the replay defense (a stale approved/rejected record can't authorize a second, unreviewed
    // mutation) and the void-vs-decide arbitration (a cancelled op refuses a late approval).
    if (op.status !== "awaiting_user") {
      throw new ExternalAccessBridgeError("OPERATION_EXPIRED", `operation already ${op.status}`, operationId);
    }

    if (!approved) {
      await this.operationDAO.update(op.operationId, { status: "rejected", decidedAt: Date.now() });
      this.emitError(op, "USER_REJECTED", "user rejected the request");
      await this.advanceQueue(op);
      return { status: toStatusResult({ ...op, status: "rejected" }) };
    }

    try {
      const { summary, wire } = await this.executeApproved(op, options);
      // Only remember after a successful execution — a failed op must not silently auto-approve
      // the next identical request.
      if (options.rememberSession && op.kind !== "install") {
        await this.sessionAllow.add(op.sessionKey);
      }
      await this.operationDAO.update(op.operationId, { status: "approved", decidedAt: Date.now() });
      this.emitApproved(op, wire);
      await this.advanceQueue(op);
      return {
        status: { operationId: op.operationId, kind: op.kind, status: "approved", resultSummary: summary },
        wire,
      };
    } catch (e) {
      const errorCode = e instanceof ExternalAccessBridgeError ? e.code : "INTERNAL_ERROR";
      const message = e instanceof Error ? e.message : "internal error";
      await this.operationDAO.update(op.operationId, { status: "failed", decidedAt: Date.now(), errorCode });
      this.emitError(op, errorCode, message);
      await this.advanceQueue(op);
      throw e;
    }
  }

  // Only blocking ops (those with a requestId, i.e. an open confirm page) participate in the serial
  // queue; allow-policy immediate executions never present a page and must not drain the queue.
  private async advanceQueue(op: ExternalAccessOperation): Promise<void> {
    if (op.requestId) await this.presentNext(op.operationId);
  }

  // Emit the deferred JSON-RPC response for a blocking op. A no-op for allow-policy ops (no
  // requestId): those return their result synchronously through ExternalAccessBridge instead.
  private emitApproved(op: ExternalAccessOperation, result: unknown): void {
    if (op.requestId) {
      this.responder(op.requestId, { requestId: op.requestId, ok: true, result });
    }
  }

  private emitError(op: ExternalAccessOperation, code: BridgeErrorCode, message: string): void {
    if (op.requestId) {
      this.responder(op.requestId, {
        requestId: op.requestId,
        ok: false,
        error: { code, message, operationId: op.operationId },
      });
    }
  }

  // Returns { summary } for the confirm page (OperationStatusResult.resultSummary) and { wire }
  // for the deferred JSON-RPC response. They coincide for writes; source disclosure hands the full
  // ScriptSource back over the wire while the page only needs the uuid/name summary.
  private async executeApproved(
    op: ExternalAccessOperation,
    options: { enable?: boolean }
  ): Promise<{ summary: { uuid?: string; name?: string; enabled?: boolean }; wire: unknown }> {
    switch (op.kind) {
      case "install": {
        const summary = await this.executeInstall(op, options);
        return { summary, wire: summary };
      }
      case "update": {
        // An edit is anchored to the target's code as it stood at request time, so the target's own
        // hash is re-verified on top of the staged-code check executeInstall already does —
        // otherwise the edit would silently overwrite whatever changed in between.
        await this.assertTargetUnchanged(op);
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
        return { summary, wire: { uuid: summary.uuid, deleted: true } };
      }
      case "source_disclosure": {
        const source = await this.executeSourceDisclosure(op);
        return { summary: { uuid: source.uuid, name: source.name }, wire: source };
      }
      default:
        throw new ExternalAccessBridgeError("INTERNAL_ERROR", `unsupported operation kind ${op.kind}`, op.operationId);
    }
  }

  private async executeSourceDisclosure(op: ExternalAccessOperation): Promise<ScriptSource | ScriptSourceGrepResult> {
    // Blocking: the suspended scripts.source.get / scripts.source.grep is answered here and now,
    // branching on the form recorded at request time (design §4.2) — a grep op must never answer
    // with the full source, nor vice versa.
    const form = op.disclosure ?? { form: "full" as const };
    if (form.form === "grep") {
      return grepScriptSource(this.scriptDAO, this.scriptCodeDAO, op.targetUuid!, form.query, form);
    }
    return readScriptSource(
      this.scriptDAO,
      this.scriptCodeDAO,
      op.targetUuid!,
      form.startLine,
      form.endLine,
      form.maxBytes
    );
  }

  private async executeInstall(op: ExternalAccessOperation, options: { enable?: boolean }) {
    const stagedUuid = op.stagedUuid!;
    const entry = await this.tempStorageDAO.get(stagedUuid);
    if (!entry) {
      throw new ExternalAccessBridgeError("CONFLICT", "staged install missing or expired", op.operationId);
    }
    const stagedCode = await getTempCode(stagedUuid);
    // Re-verify the staged code hash immediately before mutation — this is the TOCTOU check:
    // staging and approval are separated by human reaction time, during which the staged entry
    // could in principle have been overwritten by a second request.
    if (!stagedCode || sha256OfText(stagedCode) !== op.contentHash) {
      throw new ExternalAccessBridgeError("CONFLICT", "staged code changed since request", op.operationId);
    }

    const { script } = await prepareScriptByCode(stagedCode, op.sourceUrl || "", stagedUuid, true);
    // Enabled state follows the decision (install page switch, or enable:true under direct allow) —
    // there is no forced-disabled安全带 anymore (设计 §6：直接允许即装即用). Only when a decision was
    // actually made, though: an edit approved without a page (直接允许 / 本会话允许) carries no switch
    // value, and overwriting unconditionally would silently disable the script it just edited —
    // prepareScriptByCode has already copied the existing script's status in that case.
    if (options.enable !== undefined) {
      script.status = options.enable ? SCRIPT_STATUS_ENABLE : SCRIPT_STATUS_DISABLE;
    }
    await this.mutator.installScript({ script, code: stagedCode, upsertBy: "external_access" });
    return { uuid: script.uuid, name: script.name, enabled: script.status === SCRIPT_STATUS_ENABLE };
  }

  private async assertTargetUnchanged(op: ExternalAccessOperation): Promise<Script> {
    const target = await this.scriptDAO.get(op.targetUuid!);
    if (!target) {
      throw new ExternalAccessBridgeError("CONFLICT", "target script no longer exists", op.operationId);
    }
    const code = await this.scriptCodeDAO.get(op.targetUuid!);
    const currentHash = code ? sha256OfText(code.code) : undefined;
    // Re-verify the target's current code hash immediately before mutation — catches the target
    // having changed between request and decide.
    if (currentHash !== op.existingCodeHash) {
      throw new ExternalAccessBridgeError("CONFLICT", "target script changed since request", op.operationId);
    }
    return target;
  }

  private async executeToggle(op: ExternalAccessOperation, enable: boolean) {
    const target = await this.assertTargetUnchanged(op);
    await this.mutator.enableScript({ uuid: op.targetUuid!, enable });
    return { uuid: op.targetUuid, name: target.name, enabled: enable };
  }

  private async executeDelete(op: ExternalAccessOperation) {
    const target = await this.assertTargetUnchanged(op);
    await this.mutator.deleteScript(op.targetUuid!, "external_access");
    return { uuid: op.targetUuid, name: target.name };
  }

  // Feeds the "待确认" reopen surface: every still-pending op, oldest first. No clientId gate — the
  // human viewing the extension UI is the authority (same rationale as getOperationForUI). TTL-
  // expired ops are swept out lazily on read. No client name is attached (design §3.0.1).
  async listPending(): Promise<PendingOperationSummary[]> {
    const pending = await this.operationDAO.awaitingUser();
    const rows = await Promise.all(
      pending.map(async (op): Promise<PendingOperationSummary | undefined> => {
        const fresh = await this.sweepAndGet(op.operationId);
        if (!fresh || fresh.status !== "awaiting_user") return undefined;
        return { operationId: fresh.operationId, kind: fresh.kind, createdAt: fresh.createdAt };
      })
    );
    return rows
      .filter((row): row is PendingOperationSummary => row !== undefined)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  // Used by the human-facing approval pages (install.html / external_access_confirm.html), which are reached
  // only via an operationId the extension itself generated and opened a tab with — the human
  // viewing that tab is the authority, so there is no clientId gate.
  async getOperationForUI(operationId: string): Promise<ExternalAccessOperation | undefined> {
    return this.sweepAndGet(operationId);
  }

  // Lazy expiry sweep: expiry is enforced on every read, not by a background timer — an
  // operation transitions to "expired" the moment something notices its TTL has passed.
  private async sweepAndGet(operationId: string): Promise<ExternalAccessOperation | undefined> {
    const op = await this.operationDAO.get(operationId);
    if (!op) return undefined;
    if (op.status === "awaiting_user" && Date.now() >= op.expiresAt) {
      const expired: ExternalAccessOperation = { ...op, status: "expired" };
      await this.operationDAO.save(expired);
      return expired;
    }
    return op;
  }
}
