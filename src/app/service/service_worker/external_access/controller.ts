import { uuidv4 } from "@App/pkg/utils/uuid";
import { getBrowserVersion } from "@App/pkg/utils/utils";
import { externalAccessProduct, type SystemConfig } from "@App/pkg/config/config";
import type { IMessageQueue } from "@Packages/message/message_queue";
import type { ExternalAccessConnectClient } from "../../offscreen/client";
import type { ExternalAccessBridge } from "./bridge";
import {
  type HelloPayload,
  type AuthMode,
  type ExternalAccessEnrollResult,
  type ExternalAccessRenameResult,
  type ExternalAccessRejectionReason,
  type ExternalAccessBridgeRequest,
  type ExternalAccessBridgeResponse,
  type ExternalAccessBridgeStatus,
  type ExternalAccessBridgeStatusInfo,
  type WSEnvelope,
} from "./types";
import type { Group } from "@Packages/message/server";
import { RPC_METHODS, SCHEMA_VERSION } from "./generated/protocol.generated";

function truncatePeerText(text: string): string {
  const { read } = new TextEncoder().encodeInto(text, new Uint8Array(64));
  return text.slice(0, read);
}

function validName(name: string): boolean {
  return typeof name === "string" && /^[a-z0-9-]{1,32}$/.test(name);
}

// Broadcast on every status transition so the Tools settings page updates live.
export const ExternalAccessStatusChanged = "mcpStatusChanged";
const REJECTION_KEY = "externalAccessRejection";

// The subset of the offscreen WS driver ExternalAccessController needs: open/close the socket and push
// outbound envelopes onto the wire. The socket itself, plus the auth handshake and reconnect
// backoff, live in offscreen (src/app/service/offscreen/external-access-connect.ts).
type ConnectDriver = Pick<ExternalAccessConnectClient, "connect" | "disconnect" | "send">;

/**
 * SW-side coordinator for 外部接入 (External Access). Owns the status machine and drives the
 * offscreen WS client for transport. Trust is flat (design §2.3): a single enrollment establishes
 * the long-term key K, and CLI + every MCP client inherit that trust — there is no per-client
 * pairing, token or revoke here anymore.
 *
 * Status:
 *  - enabled + no key K   → "pending_enrollment" (待接入): the user must run `sctl connect` and type
 *    the one-time code into the enrollment dialog. `enroll()` drives that (pairing-mode handshake).
 *  - enabled + key K → session-mode connect; connected only after capabilities acceptance.
 */
export class ExternalAccessController {
  private status: ExternalAccessBridgeStatus = "disabled";
  // daemon 版本只在能力声明通过后的活跃连接中展示。
  private daemonVersion?: string;
  private active = false;
  private connecting?: Promise<void>;
  private generation = 0;
  private reason?: ExternalAccessRejectionReason;
  private pending?: { resolve: (result: ExternalAccessEnrollResult) => void; renameTo?: string; rollback?: boolean };

  constructor(
    private readonly systemConfig: SystemConfig,
    private readonly bridge: Pick<ExternalAccessBridge, "handle" | "cancel">,
    private readonly mq: IMessageQueue,
    private readonly group: Group,
    private readonly connectClient: ConnectDriver
  ) {}

  async initialize(): Promise<void> {
    // Offscreen relays every decoded business envelope (plus the newly enrolled key and socket
    // disconnects) back here; register before anything can arrive.
    this.group.on("envelope", (envelope: WSEnvelope) => this.onEnvelope(envelope));
    this.group.on("established", ({ key }: { key?: string }) => this.onEstablished(key));
    this.group.on("disconnected", ({ reason, mode }: { reason?: ExternalAccessRejectionReason; mode: AuthMode }) =>
      this.onDisconnected(reason, mode)
    );

    // split 模式下隐身进程与普通进程共用 chrome.storage.local 里的密钥和脚本，由普通进程代表这份安装连接 sctl；
    // 隐身进程再连只会与普通进程互相顶替（sctl#14）。
    if (chrome.extension.inIncognitoContext) return;

    this.systemConfig.addListener("external_access_enabled", (enabled) => {
      if (enabled) {
        void this.connect();
      } else {
        this.stop();
      }
    });
    if (await this.systemConfig.getExternalAccessEnabled()) {
      // WS 关闭后 SW 可能休眠；拒绝结论需跨 SW 唤醒保留，但不跨浏览器会话。
      const saved = await chrome.storage.session.get(REJECTION_KEY);
      const reason = saved[REJECTION_KEY];
      if (reason === "pending_enrollment") {
        this.setStatus("pending_enrollment");
        return;
      }
      if (reason === "refused" || reason === "name-taken") {
        this.setStatus("rejected", reason);
        return;
      }
      await this.connect();
    }
  }

  // Session-mode connect using the stored long-term key. No-op if already driving a connection.
  // `active` is set synchronously before the first await so a re-fired external_access_enabled listener can't
  // race a second dial through the guard. Enabled-but-unenrolled parks in "pending_enrollment".
  private connect(): Promise<void> {
    if (this.active) return this.connecting ?? Promise.resolve();
    this.active = true;
    const connecting = this.dialSession();
    this.connecting = connecting;
    return connecting;
  }

  private async dialSession(): Promise<void> {
    const generation = ++this.generation;
    await chrome.storage.session.remove(REJECTION_KEY);
    const pairing = await this.systemConfig.getExternalAccessPairing();
    if (generation !== this.generation) return;
    if (!pairing.key) {
      // Enabled but never enrolled — nothing to authenticate with; release so a later enroll() dials.
      this.active = false;
      this.setStatus("pending_enrollment");
      return;
    }
    this.setStatus("connecting");
    const url = await this.systemConfig.getExternalAccessUrl();
    const { instanceId } = await this.systemConfig.getExternalAccessIdentity();
    if (generation === this.generation)
      await this.connectClient.connect({ url, instanceId, auth: { mode: "session", key: pairing.key } });
  }

  // Enrollment (接入): the user ran `sctl connect`, which printed a one-time code C shown only in the
  // terminal (never over the wire), and typed it into the enrollment dialog. We connect in
  // pairing mode with C; on success the daemon ships a fresh long-term key K, which offscreen
  // decrypts and relays back after capabilities acceptance.
  async enroll(code: string, name: string): Promise<ExternalAccessEnrollResult> {
    if (!validName(name)) return "invalid-name";
    if (chrome.extension.inIncognitoContext || this.pending) return "not-connected";
    this.active = true;
    const generation = ++this.generation;
    const result = this.beginOperation();
    try {
      await chrome.storage.session.remove(REJECTION_KEY);
      const { instanceId } = await this.systemConfig.setExternalAccessName(name);
      const url = await this.systemConfig.getExternalAccessUrl();
      if (generation === this.generation) {
        this.setStatus("connecting");
        await this.connectClient.connect({ url, instanceId, auth: { mode: "pairing", code } });
      }
    } catch (error) {
      if (generation === this.generation) await this.onDisconnected(undefined, "pairing");
      throw error;
    }
    return result;
  }

  async rename(name: string): Promise<ExternalAccessRenameResult> {
    if (!validName(name)) return "invalid-name";
    if (chrome.extension.inIncognitoContext || this.pending) return "not-connected";
    if (this.status !== "connected") {
      await this.systemConfig.setExternalAccessName(name);
      if (this.status === "rejected") await this.connect();
      else this.setStatus(this.status);
      return "applies-next-connection";
    }
    const result = this.beginOperation(name);
    this.active = false;
    void this.bridge.cancel();
    try {
      await this.connect();
    } catch (error) {
      await this.onDisconnected(undefined, "session");
      throw error;
    }
    return result;
  }

  private beginOperation(renameTo?: string): Promise<ExternalAccessEnrollResult> {
    return new Promise((resolve) => {
      this.pending = { resolve, renameTo };
    });
  }

  private finishOperation(result: ExternalAccessEnrollResult): void {
    this.pending?.resolve(result);
    this.pending = undefined;
  }

  private async onEnvelope(envelope: WSEnvelope): Promise<void> {
    switch (envelope.method) {
      case "$session.hello": {
        const { daemonVersion } = envelope.params as HelloPayload;
        this.daemonVersion = daemonVersion;
        const name = this.pending?.renameTo ?? (await this.systemConfig.getExternalAccessIdentity()).name;
        const product = externalAccessProduct();
        const version = getBrowserVersion();
        void this.connectClient.send({
          jsonrpc: "2.0",
          id: uuidv4(),
          method: "$session.capabilities",
          params: {
            schemaVersion: SCHEMA_VERSION,
            methods: Object.keys(RPC_METHODS),
            peer: {
              name: truncatePeerText(name),
              ...(product ? { product } : {}),
              ...(Number.isFinite(version) && version > 0 ? { productVersion: String(version) } : {}),
              extensionVersion: truncatePeerText(chrome.runtime.getManifest().version),
            },
          },
        });
        break;
      }
      case "$/cancelRequest": {
        const params = envelope.params as { id: string };
        void this.bridge.cancel(params.id);
        break;
      }
      default:
        if (envelope.method?.startsWith("scripts.") && envelope.id) {
          const params = envelope.params as {
            input: unknown;
            clientId?: string;
          };
          void this.dispatchBridgeRequest({
            requestId: envelope.id,
            clientId: params.clientId ?? "sctl",
            action: envelope.method as ExternalAccessBridgeRequest["action"],
            input: params.input,
          });
        }
        break;
    }
  }

  private async onEstablished(key?: string): Promise<void> {
    if (!this.active) return;
    const pending = this.pending;
    if (key) this.systemConfig.setExternalAccessPairing({ key });
    if (pending?.renameTo) {
      try {
        await this.systemConfig.setExternalAccessName(pending.renameTo);
      } catch (error) {
        this.finishOperation("not-connected");
        throw error;
      }
      if (this.pending !== pending) return;
    }
    this.setStatus("connected");
    this.finishOperation(pending?.rollback ? "name-taken" : "ok");
  }

  private async onDisconnected(reason: ExternalAccessRejectionReason | undefined, mode: AuthMode): Promise<void> {
    if (!this.active) return;
    void this.bridge.cancel();
    if (!reason) {
      this.setStatus("host_unreachable");
      this.finishOperation("not-connected");
      return;
    }
    this.active = false;
    if (reason === "name-taken" && this.pending?.renameTo) {
      // 新名称尚未落盘；再次声明持久化的原名，恢复成功后再答复调用者。
      this.pending.renameTo = undefined;
      this.pending.rollback = true;
      await this.connect();
      return;
    }
    const pairingConflict = mode === "pairing" && reason === "name-taken";
    const generation = this.generation;
    await chrome.storage.session.set({ [REJECTION_KEY]: pairingConflict ? "pending_enrollment" : reason });
    if (generation !== this.generation) return;
    this.setStatus(pairingConflict ? "pending_enrollment" : "rejected", pairingConflict ? undefined : reason);
    this.finishOperation(reason === "name-taken" ? reason : "not-connected");
  }

  private async dispatchBridgeRequest(request: ExternalAccessBridgeRequest): Promise<void> {
    const response = await this.bridge.handle(request);
    // null = the request suspended pending a human decision (write approval / source disclosure).
    // No response now; the decide/void event drives it later via sendBridgeResponse (design §5.1).
    if (response) {
      this.sendBridgeResponse(request.requestId, response);
    }
  }

  // Deferred JSON-RPC response for a blocking op — invoked by the approval responder (wired in
  // index.ts) when a decide/void event resolves an op that suspended a write/disclosure request.
  // Kept off any SW-memory Promise: the op state lives in storage, offscreen keeps the socket
  // alive, and this call is reached by the message that woke the SW.
  sendBridgeResponse(requestId: string, response: ExternalAccessBridgeResponse): void {
    if (response.ok) {
      void this.connectClient.send({ jsonrpc: "2.0", id: requestId, result: response.result });
      return;
    }
    void this.connectClient.send({
      jsonrpc: "2.0",
      id: requestId,
      error: {
        code: -32000,
        message: response.error.message,
        data: { code: response.error.code, operationId: response.error.operationId },
      },
    });
  }

  // User disable, or "停止外部接入" kill switch (the caller additionally discards K + clears the
  // session-allow store, forcing a re-enrollment).
  stop(): void {
    this.generation++;
    void chrome.storage.session.remove(REJECTION_KEY);
    this.finishOperation("not-connected");
    this.active = false;
    void this.bridge.cancel();
    void this.connectClient.send({ jsonrpc: "2.0", method: "$session.shutdown", params: {} });
    void this.connectClient.disconnect();
    this.setStatus("disabled");
  }

  async getStatus(): Promise<ExternalAccessBridgeStatusInfo> {
    const status = this.status;
    const reason = this.reason;
    const daemonVersion = status === "connected" ? this.daemonVersion : undefined;
    const { name } = await this.systemConfig.getExternalAccessIdentity();
    return { status, reason, daemonVersion, name };
  }

  private setStatus(status: ExternalAccessBridgeStatus, reason?: ExternalAccessRejectionReason): void {
    this.status = status;
    this.reason = reason;
    void this.getStatus().then((info) => this.mq.publish(ExternalAccessStatusChanged, info));
  }
}
