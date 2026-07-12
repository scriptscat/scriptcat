import semver from "semver";
import { uuidv4 } from "@App/pkg/utils/uuid";
import type { SystemConfig } from "@App/pkg/config/config";
import type { IMessageQueue } from "@Packages/message/message_queue";
import type { McpBridge } from "./bridge";
import {
  MIN_HOST_VERSION,
  type HelloPayload,
  type McpBridgeRequest,
  type McpBridgeStatus,
  type NativeEnvelope,
} from "./types";

export const NATIVE_HOST_NAME = "com.scriptcat.native_host";

const BACKOFF_BASE_MS = 1000;
const BACKOFF_CAP_MS = 60_000;
const MAX_RECONNECT_ATTEMPTS = 5;
const WRITE_SESSION_STORAGE_KEY = "mcp_write_session";

// Broadcast on every status transition so the Tools settings page updates live.
export const McpStatusChanged = "mcpStatusChanged";

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

  constructor(
    private readonly systemConfig: SystemConfig,
    private readonly bridge: Pick<McpBridge, "handle">,
    private readonly mq: IMessageQueue
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
      default:
        // pair.request / client.sync / operations.changed routing lands with the pairing UI
        // and audit views in a later commit; unhandled here is intentional, not a gap.
        break;
    }
  };

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
