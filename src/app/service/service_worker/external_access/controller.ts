import { uuidv4 } from "@App/pkg/utils/uuid";
import type { SystemConfig } from "@App/pkg/config/config";
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
    void this.connectClient.connect({ url, auth: { mode: "session", key: pairing.key } });
  }

  // Enrollment (接入): the user ran `sctl connect`, which printed a one-time code C shown only in the
  // terminal (never over the wire), and typed it into the enrollment dialog. We connect in
  // pairing mode with C; on success the daemon ships a fresh long-term key K, which offscreen
  // decrypts and relays back via `onEnrolled`.
  async enroll(code: string): Promise<void> {
    this.active = true;
    this.setStatus("connecting");
    const url = await this.systemConfig.getExternalAccessUrl();
    void this.connectClient.connect({ url, auth: { mode: "pairing", code } });
  }

  private onEnvelope(envelope: WSEnvelope): void {
    switch (envelope.method) {
      case "$session.hello": {
        const { daemonVersion } = envelope.params as HelloPayload;
        this.daemonVersion = daemonVersion;
        this.setStatus("connected");
        void this.connectClient.send({
          jsonrpc: "2.0",
          id: uuidv4(),
          method: "$session.capabilities",
          params: { schemaVersion: SCHEMA_VERSION, methods: Object.keys(RPC_METHODS) },
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

  // Enrollment succeeded: persist the daemon-minted long-term key alongside a stable local client
  // identity so future reconnects use session-mode auth.
  private async onEnrolled(key: string): Promise<void> {
    const existing = await this.systemConfig.getExternalAccessPairing();
    this.systemConfig.setExternalAccessPairing({ key, clientId: existing.clientId || uuidv4() });
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
