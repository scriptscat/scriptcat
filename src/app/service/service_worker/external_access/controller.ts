import { uuidv4 } from "@App/pkg/utils/uuid";
import { getBrowserVersion } from "@App/pkg/utils/utils";
import { externalAccessProduct, type SystemConfig } from "@App/pkg/config/config";
import type { IMessageQueue } from "@Packages/message/message_queue";
import type { ExternalAccessConnectClient } from "../../offscreen/client";
import type { ExternalAccessBridge } from "./bridge";
import {
  type HelloPayload,
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

// Broadcast on every status transition so the Tools settings page updates live.
export const ExternalAccessStatusChanged = "mcpStatusChanged";

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
 *  - enabled + key K       → session-mode connect; "connected" once the daemon's hello arrives (or
 *    "connected" after the daemon hello. Reconnect/backoff is delegated to offscreen.
 */
export class ExternalAccessController {
  private status: ExternalAccessBridgeStatus = "disabled";
  // The daemon version from the last hello; only surfaced while a live connection exists (see statusInfo).
  private daemonVersion?: string;
  private active = false;

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
    this.group.on("paired", (payload: { key: string }) => this.onEnrolled(payload.key));
    this.group.on("disconnected", () => this.onDisconnected());

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
      await this.connect();
    }
  }

  // Session-mode connect using the stored long-term key. No-op if already driving a connection.
  // `active` is set synchronously before the first await so a re-fired external_access_enabled listener can't
  // race a second dial through the guard. Enabled-but-unenrolled parks in "pending_enrollment".
  private async connect(): Promise<void> {
    if (this.active) return;
    this.active = true;
    const pairing = await this.systemConfig.getExternalAccessPairing();
    if (!pairing.key) {
      // Enabled but never enrolled — nothing to authenticate with; release so a later enroll() dials.
      this.active = false;
      this.setStatus("pending_enrollment");
      return;
    }
    this.setStatus("connecting");
    const url = await this.systemConfig.getExternalAccessUrl();
    const { instanceId } = await this.systemConfig.getExternalAccessIdentity();
    void this.connectClient.connect({ url, instanceId, auth: { mode: "session", key: pairing.key } });
  }

  // Enrollment (接入): the user ran `sctl connect`, which printed a one-time code C shown only in the
  // terminal (never over the wire), and typed it into the enrollment dialog. We connect in
  // pairing mode with C; on success the daemon ships a fresh long-term key K, which offscreen
  // decrypts and relays back via `onEnrolled`.
  async enroll(code: string): Promise<void> {
    if (chrome.extension.inIncognitoContext) return;
    this.active = true;
    this.setStatus("connecting");
    const url = await this.systemConfig.getExternalAccessUrl();
    const { instanceId } = await this.systemConfig.getExternalAccessIdentity();
    void this.connectClient.connect({ url, instanceId, auth: { mode: "pairing", code } });
  }

  private async onEnvelope(envelope: WSEnvelope): Promise<void> {
    switch (envelope.method) {
      case "$session.hello": {
        const { daemonVersion } = envelope.params as HelloPayload;
        this.daemonVersion = daemonVersion;
        this.setStatus("connected");
        const { name } = await this.systemConfig.getExternalAccessIdentity();
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

  private onEnrolled(key: string): void {
    this.systemConfig.setExternalAccessPairing({ key });
  }

  private onDisconnected(): void {
    if (this.status === "disabled") return; // user-initiated stop(), not a failure to recover from
    void this.bridge.cancel();
    this.setStatus("host_unreachable");
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
    this.active = false;
    void this.bridge.cancel();
    void this.connectClient.send({ jsonrpc: "2.0", method: "$session.shutdown", params: {} });
    void this.connectClient.disconnect();
    this.setStatus("disabled");
  }

  getStatus(): ExternalAccessBridgeStatusInfo {
    return this.statusInfo();
  }

  // The daemon version is only meaningful while a connection is live; gating it on the connected
  // states keeps a stale version from leaking through the status bar after a disconnect/stop.
  private statusInfo(): ExternalAccessBridgeStatusInfo {
    const live = this.status === "connected";
    return { status: this.status, daemonVersion: live ? this.daemonVersion : undefined };
  }

  private setStatus(status: ExternalAccessBridgeStatus): void {
    this.status = status;
    this.mq.publish(ExternalAccessStatusChanged, this.statusInfo());
  }
}
