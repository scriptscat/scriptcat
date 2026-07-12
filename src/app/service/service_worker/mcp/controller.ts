import semver from "semver";
import { uuidv4 } from "@App/pkg/utils/uuid";
import { openInCurrentTab } from "@App/pkg/utils/utils";
import type { SystemConfig } from "@App/pkg/config/config";
import type { IMessageQueue } from "@Packages/message/message_queue";
import { McpClientDAO } from "@App/app/repo/mcp";
import type { McpBridge } from "./bridge";
import {
  MIN_HOST_VERSION,
  type ClientSyncPayload,
  type HelloPayload,
  type McpBridgeRequest,
  type McpBridgeStatus,
  type McpScope,
  type NativeEnvelope,
  type PairRequestPayload,
} from "./types";

export const NATIVE_HOST_NAME = "com.scriptcat.native_host";

const BACKOFF_BASE_MS = 1000;
const BACKOFF_CAP_MS = 60_000;
const MAX_RECONNECT_ATTEMPTS = 5;
const WRITE_SESSION_STORAGE_KEY = "mcp_write_session";
// Mirrors the host's own 2-minute pairing TTL (doc 03 §4) so an expired pairing is never shown
// as pending even if the host never got around to telling us.
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

/**
 * Owns the native-messaging port lifecycle to `com.scriptcat.native_host` (doc 05 §4.2, doc 02
 * §5). Only ever connects when `mcp_enabled` is true — the caller is responsible for gating
 * construction/initialize() on the build-time `EnableMCP` flag. Never auto-reconnects past the
 * capped backoff without a fresh user action.
 */
export class McpController {
  private port: chrome.runtime.Port | undefined;
  private status: McpBridgeStatus = "disabled";
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private writeSessionActive = false;
  private pendingPairing: PendingPairing | undefined;

  constructor(
    private readonly systemConfig: SystemConfig,
    private readonly bridge: Pick<McpBridge, "handle">,
    private readonly mq: IMessageQueue,
    private readonly clientDAO: Pick<McpClientDAO, "save"> = new McpClientDAO()
  ) {}

  async initialize(): Promise<void> {
    this.systemConfig.addListener("mcp_enabled", (enabled) => {
      if (enabled) {
        this.connect();
      } else {
        this.stop();
      }
    });
    await this.readWriteSessionActive();
    if (await this.systemConfig.getMcpEnabled()) {
      this.connect();
    }
  }

  private connect(): void {
    if (this.port) return; // already connected/connecting
    clearTimeout(this.reconnectTimer);
    this.setStatus("connecting");
    let port: chrome.runtime.Port;
    try {
      port = chrome.runtime.connectNative(NATIVE_HOST_NAME);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.port = port;
    port.onMessage.addListener(this.onNativeMessage);
    port.onDisconnect.addListener(this.onDisconnect);
  }

  private onNativeMessage = (envelope: NativeEnvelope): void => {
    switch (envelope.type) {
      case "hello": {
        const { hostVersion } = envelope.payload as HelloPayload;
        this.reconnectAttempts = 0;
        this.setStatus(semver.lt(hostVersion, MIN_HOST_VERSION) ? "host_outdated" : "connected");
        break;
      }
      case "ping":
        this.port?.postMessage({ v: 1, type: "pong", requestId: envelope.requestId, payload: {} });
        break;
      case "bridge.request":
        // A host below MIN_HOST_VERSION is never dispatched to — status alone communicates why.
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
      default:
        // operations.changed relays to the owning shim's poller host-side; the extension has
        // nothing to do with it (McpApprovalService is already the source of truth for status).
        break;
    }
  };

  private onPairRequest(payload: PairRequestPayload): void {
    this.pendingPairing = { ...payload, expiresAt: Date.now() + PAIRING_TTL_MS };
    // The mcpPairingRequested broadcast reaches every open extension page, including an
    // already-open options tab — McpSection subscribes and renders an in-page Dialog itself
    // (doc 05 §5.4 "if the options page is open, show dialog in place"). This publish is what
    // drives that; the popup below is only opened as a fallback when no options tab is open.
    this.mq.publish(McpPairingRequested, { pairingId: payload.pairingId });
    void this.openPairingPopupUnlessOptionsPageOpen(payload.pairingId);
  }

  private async openPairingPopupUnlessOptionsPageOpen(pairingId: string): Promise<void> {
    const optionsTabs = await chrome.tabs.query({ url: chrome.runtime.getURL("src/options.html") + "*" });
    if (optionsTabs.length > 0) return;
    await openInCurrentTab(`src/mcp_confirm.html?pairing=${pairingId}`);
  }

  private async onClientSync(clients: ClientSyncPayload): Promise<void> {
    // Host is the authority (owns tokenHash); the extension mirror is overwritten verbatim.
    await Promise.all(clients.map((client) => this.clientDAO.save(client)));
  }

  getPendingPairing(): PendingPairing | undefined {
    if (this.pendingPairing && this.pendingPairing.expiresAt <= Date.now()) {
      this.pendingPairing = undefined;
    }
    return this.pendingPairing;
  }

  // Sends the human's decision to the host (doc 03 §4 `pair.decision`); the host mints the
  // token/clientId on approval and reports the authoritative record back via `client.sync`.
  decidePairing(pairingId: string, approved: boolean, grantedScopes: McpScope[]): void {
    if (this.pendingPairing?.pairingId === pairingId) {
      this.pendingPairing = undefined;
    }
    this.port?.postMessage({
      v: 1,
      type: "pair.decision",
      requestId: uuidv4(),
      payload: { pairingId, approved, grantedScopes },
    });
  }

  private async dispatchBridgeRequest(request: McpBridgeRequest): Promise<void> {
    const response = await this.bridge.handle(request);
    this.port?.postMessage({ v: 1, type: "bridge.response", requestId: request.requestId, payload: response });
  }

  private onDisconnect = (): void => {
    const lastError = chrome.runtime.lastError;
    if (lastError) {
      console.error("chrome.runtime.lastError in McpController native port:", lastError);
    }
    this.port = undefined;
    if (this.status === "disabled") return; // user-initiated stop(), not a failure to recover from
    this.scheduleReconnect();
  };

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.setStatus("host_unreachable");
      return;
    }
    const delay = Math.min(BACKOFF_BASE_MS * 2 ** this.reconnectAttempts, BACKOFF_CAP_MS);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  // User disable, or emergency "revoke all & stop bridge".
  stop(): void {
    clearTimeout(this.reconnectTimer);
    this.reconnectAttempts = 0;
    if (this.port) {
      this.port.postMessage({ v: 1, type: "bridge.shutdown", requestId: uuidv4(), payload: {} });
      this.port.disconnect();
      this.port = undefined;
    }
    this.setStatus("disabled");
  }

  // Tells the host to drop the token/session for a revoked client immediately (doc 03 §2
  // `client.revoke`). A no-op when the bridge isn't connected — the extension-side revocation
  // (McpClientDAO) already took effect, so the next authenticated call fails regardless.
  notifyClientRevoked(clientId: string): void {
    this.port?.postMessage({ v: 1, type: "client.revoke", requestId: uuidv4(), payload: { clientId } });
  }

  getStatus(): McpBridgeStatus {
    return this.status;
  }

  // "Allow write requests this session" — deliberately chrome.storage.session, not SystemConfig,
  // so it never survives a browser restart (doc 05 §2.2, doc 02 §5 "Write session").
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
