import type { MessageConnect, MessageSend } from "@Packages/message/types";
import type { ValueSnapshot, ValueUpdateDataEncoded, ValueVersion } from "./types";

type ConnectionState = "active" | "reconnecting" | "terminal" | "stopped";

/** One frame owns one Port. Only subscription names survive a recoverable SW restart. */
export default class ScriptingValuePort {
  private port: MessageConnect | undefined;
  private connecting = false;
  private generation = 0;
  private portReady = false;
  private state: ConnectionState = "reconnecting";
  private storageNames: string[] | undefined;
  private subscription: { resolve: () => void; reject: (error: Error) => void } | undefined;
  private subscriptionTimer: ReturnType<typeof setTimeout> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private retryDelay = 250;
  private refreshInFlight = false;
  private refreshDirty = false;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private requestId = 0;
  private requestedVersions: Record<string, ValueVersion> | undefined;
  private readonly onPageShow = (event: PageTransitionEvent) => {
    if (!event.persisted || this.isStopped()) return;
    if (this.invalidContext()) return this.terminate();
    const port = this.port;
    this.port = undefined;
    this.portReady = false;
    this.generation++;
    this.connecting = false;
    this.disconnectPort(port);
    this.clearRefresh();
    if (this.retryTimer !== undefined) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.connect();
  };

  constructor(
    private readonly sender: MessageSend,
    private readonly onValueUpdate: (data: ValueUpdateDataEncoded) => void,
    private readonly onSnapshot?: (snapshot: ValueSnapshot) => void,
    private readonly getVersions?: () => Record<string, ValueVersion>,
    private readonly needsRefresh?: () => boolean
  ) {}

  start() {
    if (this.isStopped()) return;
    this.connect();
    window.addEventListener("pageshow", this.onPageShow);
  }

  subscribe(names: string[]): Promise<void> {
    if (!names.length) {
      this.stop();
      return Promise.resolve();
    }
    if (this.isStopped()) return Promise.reject(new Error("Value update connection is unavailable"));
    this.storageNames = [...new Set(names)];
    this.subscription?.reject(new Error("Value subscriptions replaced"));
    if (this.subscriptionTimer !== undefined) clearTimeout(this.subscriptionTimer);
    return new Promise<void>((resolve, reject) => {
      this.subscription = { resolve, reject };
      this.sendSubscriptions();
    });
  }

  stop() {
    if (this.state === "stopped") return;
    this.state = "stopped";
    this.clearRefresh();
    this.generation++;
    this.connecting = false;
    window.removeEventListener("pageshow", this.onPageShow);
    if (this.retryTimer !== undefined) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    if (this.subscriptionTimer !== undefined) clearTimeout(this.subscriptionTimer);
    this.subscriptionTimer = undefined;
    this.subscription?.reject(new Error("Value update connection stopped"));
    this.subscription = undefined;
    const port = this.port;
    this.port = undefined;
    this.portReady = false;
    this.storageNames = undefined;
    this.disconnectPort(port);
  }

  private isStopped() {
    return this.state === "terminal" || this.state === "stopped";
  }

  private invalidContext(error?: unknown): boolean {
    if (/Extension context (?:was )?invalidated|context invalidated|Extension has been disconnected/i.test(
      String((error as Error | undefined)?.message ?? error ?? "")
    )) return true;
    // An absent runtime id is a reliable terminal signal in extension content scripts,
    // but not necessarily in test/mocked message environments.
    try {
      return typeof chrome !== "undefined" && !!chrome.runtime && !chrome.runtime.id;
    } catch {
      return true;
    }
  }

  private terminate(error = new Error("Extension context invalidated")) {
    if (this.isStopped()) return;
    this.state = "terminal";
    this.subscription?.reject(error);
    this.subscription = undefined;
    this.stopResources();
  }

  private stopResources() {
    this.clearRefresh();
    this.generation++;
    this.connecting = false;
    window.removeEventListener("pageshow", this.onPageShow);
    if (this.retryTimer !== undefined) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    if (this.subscriptionTimer !== undefined) clearTimeout(this.subscriptionTimer);
    this.subscriptionTimer = undefined;
    const port = this.port;
    this.port = undefined;
    this.portReady = false;
    this.storageNames = undefined;
    this.disconnectPort(port);
  }

  private disconnectPort(port?: MessageConnect) {
    try {
      port?.disconnect(true);
    } catch {
      // Already invalidated ports cannot always be disconnected through the browser API.
    }
  }

  private connect() {
    if (this.isStopped() || this.connecting || this.port) return;
    if (this.invalidContext()) return this.terminate();
    this.connecting = true;
    this.state = "reconnecting";
    const generation = this.generation;
    let pending: Promise<MessageConnect>;
    try {
      pending = this.sender.connect({ action: "serviceWorker/runtime/valueUpdates" });
    } catch (error) {
      this.connectionFailed(generation, error);
      return;
    }
    pending.then((port) => {
      if (this.isStopped() || generation !== this.generation) {
        this.disconnectPort(port);
        return;
      }
      this.connecting = false;
      this.port = port;
      this.portReady = false;
      // A connected Port may never send its initial ready message. Treat that as a
      // failed attempt, not an indefinitely pending pageLoad or a terminal context.
      this.armSubscriptionTimeout(port);
      try {
        port.onMessage((message) => {
          if (this.port !== port) return;
          if (message.code === 0 && message.data?.ready === true) {
            this.portReady = true;
            this.sendSubscriptions();
          } else if (message.action === "runtime/valueSubscriptionsReady") {
            // A previous snapshot read can finish after a newer request on the same Port.
            if (this.getVersions && message.data?.requestId !== this.requestId) return;
            const snapshots = message.data?.snapshots as ValueSnapshot[] | undefined;
            try {
              if (Array.isArray(snapshots)) {
                const current = this.getVersions?.();
                for (const snapshot of snapshots) {
                  const sent = this.requestedVersions?.[snapshot.storageName];
                  const now = current?.[snapshot.storageName];
                  if (
                    now && now.epoch !== snapshot.epoch &&
                    (!sent || now.epoch !== sent.epoch || now.revision !== sent.revision)
                  ) continue;
                  this.onSnapshot?.(snapshot);
                }
              }
            } catch (error) {
              this.failPort(port, error);
              return;
            }
            this.refreshInFlight = false;
            const refreshDirty = this.refreshDirty;
            this.refreshDirty = false;
            if (refreshDirty) this.scheduleRefresh();
            this.retryDelay = 250;
            this.state = "active";
            const subscription = this.subscription;
            this.subscription = undefined;
            if (this.subscriptionTimer !== undefined) clearTimeout(this.subscriptionTimer);
            this.subscriptionTimer = undefined;
            subscription?.resolve();
          } else if (message.code === -1) {
            this.failPort(port, message.message);
          } else if (message.action === "runtime/valueUpdate") {
            this.onValueUpdate(message.data as ValueUpdateDataEncoded);
          }
        });
        port.onDisconnect(() => {
          if (this.port !== port) return;
          this.port = undefined;
          this.portReady = false;
          this.clearRefresh();
          if (this.subscriptionTimer !== undefined) clearTimeout(this.subscriptionTimer);
          this.subscriptionTimer = undefined;
          if (this.invalidContext()) this.terminate();
          else this.connect(); // First recovery attempt is immediate; back off only after failure.
        });
      } catch (error) {
        this.failPort(port, error);
      }
    }).catch((error: unknown) => this.connectionFailed(generation, error));
  }

  private connectionFailed(generation: number, error: unknown) {
    if (this.isStopped() || generation !== this.generation) return;
    this.connecting = false;
    if (this.invalidContext(error)) return this.terminate(new Error("Extension context invalidated"));
    this.scheduleReconnect();
  }

  private sendSubscriptions() {
    if (!this.portReady || !this.port || !this.storageNames) return;
    this.refreshInFlight = true;
    this.refreshDirty = false;
    try {
      const versions = this.getVersions?.();
      const requestId = ++this.requestId;
      this.requestedVersions = versions;
      this.port.sendMessage({
        action: "runtime/subscribeValueUpdates",
        data: versions ? { names: this.storageNames, versions, requestId } : this.storageNames,
      });
      this.armSubscriptionTimeout(this.port);
    } catch (error) {
      this.failPort(this.port, error);
    }
  }

  // A stalled handshake is a recoverable failed attempt, not a terminal context.
  // Keep the initial subscription promise alive across successive connections.
  private armSubscriptionTimeout(port: MessageConnect) {
    if (this.subscriptionTimer !== undefined) clearTimeout(this.subscriptionTimer);
    this.subscriptionTimer = setTimeout(() => {
      this.subscriptionTimer = undefined;
      if (this.port === port) this.failPort(port, new Error("Value subscription handshake timed out"));
    }, 30000);
  }

  /** Coalesce gaps without forgetting one observed while a snapshot is in flight. */
  refresh() {
    if (!this.portReady || !this.port || this.refreshInFlight) {
      this.refreshDirty = true;
      return;
    }
    if (this.refreshTimer !== undefined) return;
    this.sendSubscriptions();
  }

  private scheduleRefresh() {
    if (this.refreshTimer !== undefined) return;
    // A follow-up read must not busy-loop if the database is still catching up.
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      if (!this.isStopped() && this.portReady && this.port && (this.needsRefresh?.() ?? true)) {
        this.sendSubscriptions();
      }
    }, 100);
  }

  private clearRefresh() {
    this.refreshInFlight = false;
    this.refreshDirty = false;
    if (this.refreshTimer !== undefined) clearTimeout(this.refreshTimer);
    this.refreshTimer = undefined;
  }

  private failPort(port: MessageConnect, error: unknown) {
    if (this.port !== port) return;
    this.port = undefined;
    this.portReady = false;
    this.clearRefresh();
    if (this.subscriptionTimer !== undefined) clearTimeout(this.subscriptionTimer);
    this.subscriptionTimer = undefined;
    this.disconnectPort(port);
    if (this.invalidContext(error)) this.terminate(new Error("Extension context invalidated"));
    else this.scheduleReconnect();
  }

  private scheduleReconnect() {
    if (this.isStopped() || this.retryTimer !== undefined) return;
    const delay = this.retryDelay + Math.random() * this.retryDelay;
    this.retryDelay = Math.min(this.retryDelay * 2, 10000);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      this.connect();
    }, delay);
  }
}
