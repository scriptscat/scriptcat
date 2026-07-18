import semver from "semver";
import { uuidv4 } from "@App/pkg/utils/uuid";
import { openInCurrentTab } from "@App/pkg/utils/utils";
import type { SystemConfig } from "@App/pkg/config/config";
import type { Group } from "@Packages/message/server";
import type { IMessageQueue } from "@Packages/message/message_queue";
import { McpClientDAO } from "@App/app/repo/mcp";
import type { McpConnectClient } from "../../offscreen/client";
import type { McpBridge } from "./bridge";
import {
  MIN_DAEMON_VERSION,
  SCTL_CLI_CLIENT_ID,
  type BridgeCancelPayload,
  type ClientSyncPayload,
  type HelloPayload,
  type McpBridgeRequest,
  type McpBridgeResponse,
  type McpBridgeStatus,
  type McpScope,
  type PairRequestPayload,
  type WSEnvelope,
} from "./types";

const WRITE_SESSION_STORAGE_KEY = "mcp_write_session";
// Mirrors the daemon's own 2-minute pairing TTL so an expired pairing is never shown as pending
// even if the daemon never got around to telling us.
const PAIRING_TTL_MS = 2 * 60_000;

// Broadcast on every status transition so the Tools settings page updates live.
export const McpStatusChanged = "mcpStatusChanged";
// Broadcast when a `pair.request` arrives, so an already-open options page/mcp_confirm popup
// can render the dialog without polling.
export const McpPairingRequested = "mcpPairingRequested";

export interface PendingPairing {
  pairingId: string;
  clientName: string;
  requestedScopes: McpScope[];
  code: string;
  expiresAt: number;
}

// The subset of the offscreen WS driver McpController needs: open/close the socket and push
// outbound envelopes onto the wire. The socket itself, plus the auth handshake and reconnect
// backoff, live in offscreen (src/app/service/offscreen/mcp-connect.ts).
type ConnectDriver = Pick<McpConnectClient, "connect" | "disconnect" | "send">;

/**
 * SW-side coordinator for the MCP bridge. Owns the status machine, MCP-client pairing/mirroring
 * and write-session flag; drives the offscreen WS client for transport. Only ever connects when
 * `mcp_enabled` is true AND a long-term pairing key exists — an enabled-but-unpaired bridge stays
 * "connecting" until the user completes `sctl pair` (the pairing UI is Task #7). Reconnect/backoff
 * is delegated to offscreen, which retries autonomously with capped exponential backoff.
 */
export class McpController {
  private status: McpBridgeStatus = "disabled";
  private active = false;
  private writeSessionActive = false;
  private pendingPairing: PendingPairing | undefined;

  constructor(
    private readonly systemConfig: SystemConfig,
    private readonly bridge: Pick<McpBridge, "handle" | "cancel">,
    private readonly mq: IMessageQueue,
    private readonly group: Group,
    private readonly connectClient: ConnectDriver,
    private readonly clientDAO: Pick<McpClientDAO, "save"> = new McpClientDAO()
  ) {}

  async initialize(): Promise<void> {
    // Offscreen relays every decoded business envelope (plus the newly paired key and socket
    // disconnects) back here; register before anything can arrive.
    this.group.on("envelope", (envelope: WSEnvelope) => this.onEnvelope(envelope));
    this.group.on("paired", (payload: { key: string }) => this.onPaired(payload.key));
    this.group.on("disconnected", () => this.onDisconnected());

    this.systemConfig.addListener("mcp_enabled", (enabled) => {
      if (enabled) {
        void this.connect();
      } else {
        this.stop();
      }
    });
    await this.readWriteSessionActive();
    if (await this.systemConfig.getMcpEnabled()) {
      await this.connect();
    }
  }

  // Session-mode connect using the stored long-term key. No-op if already driving a connection or
  // not yet paired. `active` is set synchronously before the first await so a re-fired mcp_enabled
  // listener can't race a second dial through the guard.
  private async connect(): Promise<void> {
    if (this.active) return;
    this.active = true;
    this.setStatus("connecting");
    const pairing = await this.systemConfig.getMcpPairing();
    if (!pairing.key) {
      // Enabled but never paired — nothing to authenticate with; release so a later pair() dials.
      this.active = false;
      return;
    }
    const url = await this.systemConfig.getMcpUrl();
    void this.connectClient.connect({ url, auth: { mode: "session", key: pairing.key } });
  }

  // Pairing-mode connect driven by a one-time `sctl pair` code the user entered. On success the
  // daemon ships a fresh long-term key, which offscreen decrypts and relays back via `paired`.
  async pair(code: string): Promise<void> {
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
          void this.dispatchBridgeRequest(envelope.payload as McpBridgeRequest);
        }
        break;
      case "pair.request":
        this.onPairRequest(envelope.payload as PairRequestPayload);
        break;
      case "client.sync":
        void this.onClientSync(envelope.payload as ClientSyncPayload);
        break;
      case "bridge.cancel":
        // Requester died (timeout / Ctrl-C / WS session gone) — void the matching pending op and
        // invalidate its confirm page. Fire-and-forget: no bridge.response goes back for a cancel.
        void this.bridge.cancel((envelope.payload as BridgeCancelPayload).requestId);
        break;
      default:
        // The bridge.shutdown reconnect path is handled elsewhere (the socket close drives
        // reconnect in offscreen).
        break;
    }
  }

  // Pairing succeeded: persist the daemon-minted long-term key alongside a stable local client
  // identity so future reconnects use session-mode auth.
  private async onPaired(key: string): Promise<void> {
    const existing = await this.systemConfig.getMcpPairing();
    this.systemConfig.setMcpPairing({ key, clientId: existing.clientId || uuidv4() });
  }

  private onDisconnected(): void {
    if (this.status === "disabled") return; // user-initiated stop(), not a failure to recover from
    this.setStatus("host_unreachable");
  }

  private onPairRequest(payload: PairRequestPayload): void {
    this.pendingPairing = { ...payload, expiresAt: Date.now() + PAIRING_TTL_MS };
    // The mcpPairingRequested broadcast reaches every open extension page, including an
    // already-open options tab — McpSection subscribes and renders an in-page Dialog itself so
    // the human doesn't have to context-switch to a popup if they're already looking at settings.
    // This publish is what drives that; the popup below is only opened as a fallback when no
    // options tab is open.
    this.mq.publish(McpPairingRequested, { pairingId: payload.pairingId });
    void this.openPairingPopupUnlessOptionsPageOpen(payload.pairingId);
  }

  private async openPairingPopupUnlessOptionsPageOpen(pairingId: string): Promise<void> {
    const optionsTabs = await chrome.tabs.query({ url: chrome.runtime.getURL("src/options.html") + "*" });
    if (optionsTabs.length > 0) return;
    await openInCurrentTab(`src/mcp_confirm.html?pairing=${pairingId}`);
  }

  private async onClientSync(clients: ClientSyncPayload): Promise<void> {
    // Daemon is the authority (owns tokenHash); the extension mirror is overwritten verbatim.
    // Defensively drop the built-in sctl-cli identity: it is synthesized in the bridge, never a
    // paired client — a buggy/hostile daemon must not be able to inject it into the revocable list.
    await Promise.all(
      clients.filter((client) => client.clientId !== SCTL_CLI_CLIENT_ID).map((client) => this.clientDAO.save(client))
    );
  }

  getPendingPairing(): PendingPairing | undefined {
    if (this.pendingPairing && this.pendingPairing.expiresAt <= Date.now()) {
      this.pendingPairing = undefined;
    }
    return this.pendingPairing;
  }

  // Sends the human's decision to the daemon as a `pair.decision` message; the daemon mints the
  // token/clientId on approval and reports the authoritative record back via `client.sync`.
  decidePairing(pairingId: string, approved: boolean, grantedScopes: McpScope[]): void {
    if (this.pendingPairing?.pairingId === pairingId) {
      this.pendingPairing = undefined;
    }
    void this.connectClient.send({
      v: 1,
      type: "pair.decision",
      requestId: uuidv4(),
      payload: { pairingId, approved, grantedScopes },
    });
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

  // User disable, or emergency "revoke all & stop bridge".
  stop(): void {
    this.active = false;
    void this.connectClient.send({ v: 1, type: "bridge.shutdown", requestId: uuidv4(), payload: {} });
    void this.connectClient.disconnect();
    this.setStatus("disabled");
  }

  // Tells the daemon to drop the token/session for a revoked client immediately, via a
  // `client.revoke` message. A no-op when the bridge isn't connected — the extension-side
  // revocation (McpClientDAO) already took effect, so the next authenticated call fails
  // regardless.
  notifyClientRevoked(clientId: string): void {
    void this.connectClient.send({ v: 1, type: "client.revoke", requestId: uuidv4(), payload: { clientId } });
  }

  getStatus(): McpBridgeStatus {
    return this.status;
  }

  // "Allow write requests this session" — deliberately chrome.storage.session, not SystemConfig,
  // so it never survives a browser restart. Holding a write scope is not enough on its own to
  // mutate anything; this session-only switch must also be on, so "paired and scoped" never
  // silently becomes "can write" across a restart without a fresh human decision.
  setWriteSessionActive(active: boolean): void {
    this.writeSessionActive = active;
    chrome.storage.session.set({ [WRITE_SESSION_STORAGE_KEY]: active });
  }

  isWriteSessionActive(): boolean {
    return this.writeSessionActive;
  }

  async readWriteSessionActive(): Promise<boolean> {
    const data = await chrome.storage.session.get(WRITE_SESSION_STORAGE_KEY);
    this.writeSessionActive = !!data[WRITE_SESSION_STORAGE_KEY];
    return this.writeSessionActive;
  }

  private setStatus(status: McpBridgeStatus): void {
    this.status = status;
    this.mq.publish(McpStatusChanged, { status });
  }
}
