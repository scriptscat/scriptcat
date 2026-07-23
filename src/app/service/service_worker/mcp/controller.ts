import semver from "semver";
import { uuidv4 } from "@App/pkg/utils/uuid";
import type { SystemConfig } from "@App/pkg/config/config";
import type { IMessageQueue } from "@Packages/message/message_queue";
import type { McpConnectClient } from "../../offscreen/client";
import type { McpBridge } from "./bridge";
import {
  MIN_DAEMON_VERSION,
  type HelloPayload,
  type McpBridgeRequest,
  type McpBridgeResponse,
  type McpBridgeStatus,
  type WSEnvelope,
} from "./types";
import type { Group } from "@Packages/message/server";

// Broadcast on every status transition so the Tools settings page updates live.
export const McpStatusChanged = "mcpStatusChanged";

// The subset of the offscreen WS driver McpController needs: open/close the socket and push
// outbound envelopes onto the wire. The socket itself, plus the auth handshake and reconnect
// backoff, live in offscreen (src/app/service/offscreen/mcp-connect.ts).
type ConnectDriver = Pick<McpConnectClient, "connect" | "disconnect" | "send">;

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
 *    "host_outdated" if it's below MIN_DAEMON_VERSION). Reconnect/backoff is delegated to offscreen.
 */
export class McpController {
  private status: McpBridgeStatus = "disabled";
  private active = false;

  constructor(
    private readonly systemConfig: SystemConfig,
    private readonly bridge: Pick<McpBridge, "handle" | "cancel">,
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

    this.systemConfig.addListener("mcp_enabled", (enabled) => {
      if (enabled) {
        void this.connect();
      } else {
        this.stop();
      }
    });
    if (await this.systemConfig.getMcpEnabled()) {
      await this.connect();
    }
  }

  // Session-mode connect using the stored long-term key. No-op if already driving a connection.
  // `active` is set synchronously before the first await so a re-fired mcp_enabled listener can't
  // race a second dial through the guard. Enabled-but-unenrolled parks in "pending_enrollment".
  private async connect(): Promise<void> {
    if (this.active) return;
    this.active = true;
    const pairing = await this.systemConfig.getMcpPairing();
    if (!pairing.key) {
      // Enabled but never enrolled — nothing to authenticate with; release so a later enroll() dials.
      this.active = false;
      this.setStatus("pending_enrollment");
      return;
    }
    this.setStatus("connecting");
    const url = await this.systemConfig.getMcpUrl();
    void this.connectClient.connect({ url, auth: { mode: "session", key: pairing.key } });
  }

  // Enrollment (接入): the user ran `sctl connect`, which printed a one-time code C shown only in the
  // terminal (never over the wire), and typed it into the enrollment dialog. We connect in
  // pairing mode with C; on success the daemon ships a fresh long-term key K, which offscreen
  // decrypts and relays back via `onEnrolled`.
  async enroll(code: string): Promise<void> {
    this.active = true;
    this.setStatus("connecting");
    const url = await this.systemConfig.getMcpUrl();
    void this.connectClient.connect({ url, auth: { mode: "pairing", code } });
  }

  private onEnvelope(envelope: WSEnvelope): void {
    switch (envelope.type) {
      case "hello": {
        const { daemonVersion } = envelope.payload as HelloPayload;
        this.setStatus(semver.lt(daemonVersion, MIN_DAEMON_VERSION) ? "host_outdated" : "connected");
        break;
      }
      case "bridge.request":
        // A daemon below MIN_DAEMON_VERSION is never dispatched to — status alone communicates why.
        if (this.status !== "host_outdated") {
          // requestId 只存在于 envelope 层（PROTOCOL §4）；payload 不带它，应答必须用 envelope
          // 的值回填，否则 daemon 匹配不到挂起的调用，调用方一直等到 TTL 超时。
          void this.dispatchBridgeRequest({
            ...(envelope.payload as McpBridgeRequest),
            requestId: envelope.requestId,
          });
        }
        break;
      case "bridge.cancel":
        // Requester died (timeout / Ctrl-C / WS session gone) — void the matching pending op and
        // invalidate its confirm page. Fire-and-forget: no bridge.response goes back for a cancel.
        // 同 bridge.request：requestId 在 envelope 层，payload 是空对象（PROTOCOL §5）。
        void this.bridge.cancel(envelope.requestId);
        break;
      default:
        // Flat trust dropped per-client pairing/sync/revoke — any such legacy wire message is
        // ignored. bridge.shutdown reconnect is driven by the socket close in offscreen.
        break;
    }
  }

  // Enrollment succeeded: persist the daemon-minted long-term key alongside a stable local client
  // identity so future reconnects use session-mode auth.
  private async onEnrolled(key: string): Promise<void> {
    const existing = await this.systemConfig.getMcpPairing();
    this.systemConfig.setMcpPairing({ key, clientId: existing.clientId || uuidv4() });
  }

  private onDisconnected(): void {
    if (this.status === "disabled") return; // user-initiated stop(), not a failure to recover from
    this.setStatus("host_unreachable");
  }

  private async dispatchBridgeRequest(request: McpBridgeRequest): Promise<void> {
    const response = await this.bridge.handle(request);
    // null = the request suspended pending a human decision (write approval / source disclosure).
    // No response now; the decide/void event drives it later via sendBridgeResponse (design §5.1).
    if (response) {
      this.sendBridgeResponse(request.requestId, response);
    }
  }

  // Deferred bridge.response for a blocking op — invoked by the approval responder (wired in
  // index.ts) when a decide/void event resolves an op that suspended a write/disclosure request.
  // Kept off any SW-memory Promise: the op state lives in storage, offscreen keeps the socket
  // alive, and this call is reached by the message that woke the SW.
  sendBridgeResponse(requestId: string, response: McpBridgeResponse): void {
    void this.connectClient.send({ v: 1, type: "bridge.response", requestId, payload: response });
  }

  // User disable, or "停止外部接入" kill switch (the caller additionally discards K + clears the
  // session-allow store, forcing a re-enrollment).
  stop(): void {
    this.active = false;
    void this.connectClient.send({ v: 1, type: "bridge.shutdown", requestId: uuidv4(), payload: {} });
    void this.connectClient.disconnect();
    this.setStatus("disabled");
  }

  getStatus(): McpBridgeStatus {
    return this.status;
  }

  private setStatus(status: McpBridgeStatus): void {
    this.status = status;
    this.mq.publish(McpStatusChanged, { status });
  }
}
