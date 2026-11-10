import type { MessageConnect, MessageSend } from "@Packages/message/types";
import type { ValueUpdateDataEncoded } from "./types";

// 由 scripting 持有；SW 重启后重连并重新上报 frame 的脚本订阅。
export default class ScriptingValuePort {
  private port: MessageConnect | undefined;
  private connecting = false;
  private connectionGeneration = 0;
  private portReady = false;
  private stopped = false;
  private storageNames: string[] | undefined;
  private subscribeDone: (() => void) | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private retryDelay = 250;
  private readonly onPageShow = (event: PageTransitionEvent) => {
    if (!event.persisted || this.stopped) return;
    // bfcache 可冻结整个 JS 上下文；恢复后重新向新的 SW 建立索引。
    const port = this.port;
    this.port = undefined;
    this.portReady = false;
    // 冻结前发出的 connect Promise 可能在恢复后才完成，不能接受其旧 Port。
    this.connectionGeneration++;
    this.connecting = false;
    port?.disconnect(true);
    if (this.retryTimer !== undefined) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.connect();
  };

  constructor(
    private readonly sender: MessageSend,
    private readonly onValueUpdate: (data: ValueUpdateDataEncoded) => void
  ) {}

  start() {
    this.connect();
    window.addEventListener("pageshow", this.onPageShow);
  }

  subscribe(names: string[]): Promise<void> {
    if (names.length === 0) {
      this.stop();
      return Promise.resolve();
    }
    this.storageNames = [...new Set(names)];
    return new Promise((resolve) => {
      this.subscribeDone = resolve;
      this.sendSubscriptions();
    });
  }

  stop() {
    this.stopped = true;
    this.connectionGeneration++;
    this.connecting = false;
    window.removeEventListener("pageshow", this.onPageShow);
    if (this.retryTimer !== undefined) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    const port = this.port;
    this.port = undefined;
    port?.disconnect(true);
  }

  private connect() {
    if (this.stopped || this.connecting || this.port) return;
    this.connecting = true;
    const generation = this.connectionGeneration;
    this.sender
      .connect({ action: "serviceWorker/runtime/valueUpdates" })
      .then((port) => {
        if (this.stopped || generation !== this.connectionGeneration) {
          port.disconnect(true);
          return;
        }
        this.connecting = false;
        this.port = port;
        this.portReady = false;
        port.onMessage((message) => {
          if (this.port !== port) return;
          if (message.code === 0 && message.data?.ready === true) {
            this.portReady = true;
            this.sendSubscriptions();
          } else if (message.action === "runtime/valueSubscriptionsReady") {
            this.retryDelay = 250;
            this.subscribeDone?.();
            this.subscribeDone = undefined;
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
          this.scheduleReconnect();
        });
      })
      .catch((error: unknown) => {
        if (this.stopped || generation !== this.connectionGeneration) return;
        this.connecting = false;
        console.error("value update Port connection failed", error);
        this.scheduleReconnect();
      });
  }

  private sendSubscriptions() {
    if (this.portReady && this.port && this.storageNames) {
      try {
        this.port.sendMessage({ action: "runtime/subscribeValueUpdates", data: this.storageNames });
      } catch (error) {
        this.failPort(this.port, error);
      }
    }
  }

  private failPort(port: MessageConnect, error: unknown) {
    console.error("value update Port failed", error);
    if (this.port !== port) return;
    this.port = undefined;
    this.portReady = false;
    port.disconnect(true);
    this.scheduleReconnect();
  }

  private scheduleReconnect() {
    if (this.stopped || this.retryTimer !== undefined) return;
    // 错峰退避，避免 SW 重启后所有 frame 同时建立 Port。
    const delay = this.retryDelay + Math.random() * this.retryDelay;
    this.retryDelay = Math.min(this.retryDelay * 2, 10000);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      this.connect();
    }, delay);
  }
}
