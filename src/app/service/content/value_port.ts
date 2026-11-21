import type { MessageConnect, MessageSend } from "@Packages/message/types";
import type { ValueSubscription, ValueSubscriptionAck, ValueUpdateDataEncoded } from "./types";

// 确认订阅后存活不到这么久就断开，视为 SW 异常，改为退避重试，避免反复崩溃时重连死循环。
const STABLE_PORT_MS = 1000;

// 扩展重载、更新或卸载后，旧页面里的 content script 失去扩展上下文，再也连不上新的 SW。
const isContextInvalidated = () => !chrome.runtime?.id;

// 由 scripting 持有；SW 重启后重连并重新上报 frame 的脚本订阅。
export default class ScriptingValuePort {
  private port: MessageConnect | undefined;
  private connecting = false;
  private connectionGeneration = 0;
  private portReady = false;
  private stopped = false;
  private getSubscriptions: (() => ValueSubscription[]) | undefined;
  // 订阅确认之前收到的推送；确认里的快照要先应用，之后才能按版本判断这些推送是否已包含在快照里
  private buffered: ValueUpdateDataEncoded[] | undefined;
  private subscribeDone: (() => void) | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private retryDelay = 250;
  private ackedAt: number | undefined;
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
    private readonly onValueUpdate: (data: ValueUpdateDataEncoded) => void,
    private readonly onSubscribed: (acks: ValueSubscriptionAck[]) => void
  ) {}

  start() {
    this.connect();
    window.addEventListener("pageshow", this.onPageShow);
  }

  // 每次（重新）订阅时现取：重连后要带上最新的已知版本
  subscribe(getSubscriptions: () => ValueSubscription[]): Promise<void> {
    if (getSubscriptions().length === 0) {
      this.stop();
      return Promise.resolve();
    }
    this.getSubscriptions = getSubscriptions;
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
        this.buffered = [];
        port.onMessage((message) => {
          if (this.port !== port) return;
          if (message.code === 0 && message.data?.ready === true) {
            this.portReady = true;
            this.sendSubscriptions();
          } else if (message.action === "runtime/valueSubscriptionsReady") {
            this.retryDelay = 250;
            this.ackedAt = Date.now();
            this.onSubscribed(Array.isArray(message.data) ? message.data : []);
            const buffered = this.buffered ?? [];
            this.buffered = undefined;
            for (const data of buffered) this.onValueUpdate(data);
            this.subscribeDone?.();
            this.subscribeDone = undefined;
          } else if (message.code === -1) {
            this.failPort(port, message.message);
          } else if (message.action === "runtime/valueUpdate") {
            const data = message.data as ValueUpdateDataEncoded;
            if (this.buffered) this.buffered.push(data);
            else this.onValueUpdate(data);
          }
        });
        port.onDisconnect(() => {
          if (this.port !== port) return;
          this.port = undefined;
          this.portReady = false;
          if (isContextInvalidated()) {
            this.stop();
            return;
          }
          const ackedAt = this.ackedAt;
          this.ackedAt = undefined;
          // SW 空闲回收或重启时 Port 被动断开；立刻重连能把漏收更新的窗口缩到一次握手
          if (ackedAt !== undefined && Date.now() - ackedAt >= STABLE_PORT_MS) {
            this.connect();
          } else {
            this.scheduleReconnect();
          }
        });
      })
      .catch((error: unknown) => {
        if (this.stopped || generation !== this.connectionGeneration) return;
        this.connecting = false;
        if (isContextInvalidated()) {
          this.stop();
          return;
        }
        console.error("value update Port connection failed", error);
        this.scheduleReconnect();
      });
  }

  private sendSubscriptions() {
    if (this.portReady && this.port && this.getSubscriptions) {
      try {
        this.port.sendMessage({ action: "runtime/subscribeValueUpdates", data: this.getSubscriptions() });
      } catch (error) {
        this.failPort(this.port, error);
      }
    }
  }

  private failPort(port: MessageConnect, error: unknown) {
    if (this.port !== port) return;
    this.port = undefined;
    this.portReady = false;
    port.disconnect(true);
    if (isContextInvalidated()) {
      this.stop();
      return;
    }
    console.error("value update Port failed", error);
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
