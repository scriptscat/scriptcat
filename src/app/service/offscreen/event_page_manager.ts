import { Server } from "@Packages/message/server";
import type {
  IOffscreenSend,
  Message,
  MessageConnect,
  MessageSend,
  RuntimeMessageSender,
  TMessage,
} from "@Packages/message/types";
import { WindowMessage } from "@Packages/message/window_message";
import EventEmitter from "eventemitter3";
import { type IMessageQueue } from "@Packages/message/message_queue";
import { ServiceWorkerClient } from "../service_worker/client";
import { BackgroundEnvManagerBase } from "./base";

class InProcessMessageConnect implements MessageConnect {
  private messages = new EventEmitter<string, any>();

  private disconnects = new EventEmitter<string, any>();

  private disconnected = false;

  peer?: InProcessMessageConnect;

  onMessage(callback: (data: TMessage) => void): void {
    this.messages.on("message", callback);
  }

  sendMessage(data: TMessage): void {
    if (!this.disconnected) {
      this.peer?.messages.emit("message", data);
    }
  }

  disconnect(): void {
    if (this.disconnected) {
      return;
    }
    this.disconnected = true;
    this.disconnects.emit("disconnect", true);
    if (this.peer && !this.peer.disconnected) {
      this.peer.disconnected = true;
      this.peer.disconnects.emit("disconnect", false);
    }
  }

  onDisconnect(callback: (isSelfDisconnected: boolean) => void): void {
    this.disconnects.on("disconnect", callback);
  }
}

// Firefox MV3 的 event page 同时承担 service worker 与 offscreen 两个角色，二者处在同一
// JavaScript 上下文。runtime messaging 不会把消息回送给发送者所在的 frame，因此这里用
// EventEmitter 实现进程内的 Message / MessageSend。service_worker.ts 用它承载 offscreen → SW；
// EventPageOffscreenManager 内部的实例承载 SW → offscreen。
export class InProcessMessage implements Message, MessageSend {
  private events = new EventEmitter<string, any>();

  connect(data: TMessage): Promise<MessageConnect> {
    const client = new InProcessMessageConnect();
    const server = new InProcessMessageConnect();
    client.peer = server;
    server.peer = client;
    queueMicrotask(() => {
      this.events.emit("connect", data, server);
    });
    return Promise.resolve(client);
  }

  sendMessage<T = any>(data: TMessage): Promise<T> {
    return new Promise((resolve) => {
      this.events.emit("message", data, resolve, {} as RuntimeMessageSender);
    });
  }

  onConnect(callback: (data: TMessage, con: MessageConnect) => void): void {
    this.events.on("connect", callback);
  }

  onMessage(
    callback: (data: TMessage, sendResponse: (data: any) => void, sender: RuntimeMessageSender) => boolean | void
  ): void {
    this.events.on("message", callback);
  }
}

export class EventPageOffscreenManager extends BackgroundEnvManagerBase implements IOffscreenSend {
  private readonly message: InProcessMessage;
  private initialized = false;

  constructor(
    extMsgSender: MessageSend,
    // Firefox 的 SW 与 offscreen 共处同一 frame，runtime.sendMessage 广播不会回送给发送者；
    // 因此必须注入 SW 已有的队列，让 publish() 的本地 EventEmitter 完成分发。
    // Chrome 的独立 offscreen 文档仍由 BackgroundEnvManagerBase 使用默认队列。
    messageQueue: IMessageQueue
  ) {
    if (typeof document !== "object" || !document?.documentElement) {
      throw new Error("EventPageOffscreenManager requires a DOM-capable Firefox MV3 Event Page.");
    }

    const sandbox = document.createElement("iframe");
    sandbox.src = chrome.runtime.getURL("/src/sandbox.html");
    sandbox.style.display = "none";
    document.documentElement.appendChild(sandbox);

    startFirefoxEventPageKeepAliveLoop();

    const message = new InProcessMessage();

    // iframe 创建后会从 about:blank 导航到跨源 sandbox 页面。惰性读取 contentWindow，避免
    // 在导航前固定目标引用，并在 iframe 被移除时给出明确错误。
    const windowMessage = new WindowMessage(window, () => {
      const win = sandbox.contentWindow;
      if (!win) {
        throw new Error("EventPageOffscreenManager: sandbox iframe has no contentWindow (removed from DOM?).");
      }
      return win;
    });
    const offscreenServer = new Server("offscreen", [message, windowMessage]);
    const serviceWorker = new ServiceWorkerClient(extMsgSender);

    super(extMsgSender, windowMessage, offscreenServer, serviceWorker, messageQueue);
    this.message = message;
  }

  init() {
    if (this.initialized) {
      return;
    }
    this.initialized = true;
    return super.initManager();
  }

  connect(data: TMessage): Promise<MessageConnect> {
    return this.message.connect(data);
  }

  sendMessage<T = any>(data: TMessage): Promise<T> {
    return this.message.sendMessage<T>(data);
  }
}

// 保活实验依赖 Scheduler API：带 delay 的 user-visible task 相比 setTimeout 更不容易在后台降频。
// API 不可用时直接关闭实验，避免引入另一套行为不一致的计时路径。
const nativeScheduler =
  //@ts-ignore
  typeof scheduler !== "undefined" && typeof scheduler?.postTask === "function" && scheduler;

/**
 * Firefox MV3 event page 保活实验（默认关闭）。
 *
 * 背景：Firefox 没有 Chrome 的 offscreen document；event page 被挂起时，sandbox iframe 及其
 * 内存态定时任务会一并销毁，当前代码不会在恢复后重建这些 `@crontab` 调度。
 *
 * 机制：使用 `webRequestBlocking` 暂停一个扩展自身发起的探测请求，并用
 * `scheduler.postTask()` 延迟返回 blocking 响应；`<img>` 在请求结束后继续下一轮。
 * 未完成网络请求可能阻止 event page 被判定为空闲。
 *
 * 启用条件：
 * - 构建时设置 `SC_KEEP_EVENT_PAGE_ACTIVE=true`；
 * - Firefox manifest 在同一构建开关下把 `webRequestBlocking` 注入 `optional_permissions`；
 * - 用户通过安装提示或设置页授予 `webRequestBlocking`；
 * - 浏览器提供 `scheduler.postTask`。
 *
 * 这不是 Firefox 保证的生命周期机制。任一条件不满足时函数为空操作；探测未被实际延迟时，
 * `onKeepAliveProbeSettled` 会停止循环，避免快速重试。
 */
const startFirefoxEventPageKeepAliveLoop =
  process.env.SC_KEEP_EVENT_PAGE_ACTIVE === "true" && nativeScheduler
    ? () => {
        let running = false;

        // 期望每个 blocking request 保持未完成的时间。
        const DEFAULT_PROBE_DELAY_MS = 10_000;
        const MAX_PROBE_DELAY_MS = 120_000;
        // 实际往返过短说明 listener 未阻塞请求（通常是权限缺失或请求提前失败）；
        // 此时停止后续探测，避免失败请求形成紧密循环。
        const MIN_ROUND_TRIP_TO_CONTINUE_MS = 5_000;

        // 使用扩展 ID 派生的探测域名，避免访问真实站点；请求是否最终成功并不重要。
        const keepAliveProbeUrl = `https://--extensions-${chrome.runtime.getURL("/dummy_image.png").split("//")[1]}`;
        const keepAliveProbeOrigin = new URL(keepAliveProbeUrl).origin;

        let probeStartedAt: number;

        // 只有请求确实被阻塞了足够久才继续下一轮；过快结束时停止，避免权限缺失导致忙循环。
        const onKeepAliveProbeSettled = function (this: HTMLImageElement) {
          this.remove();
          if (Date.now() - probeStartedAt < MIN_ROUND_TRIP_TO_CONTINUE_MS) return;
          sendKeepAliveProbe();
        } as any;

        // 发起一次探测请求，作为心跳循环的一拍
        const sendKeepAliveProbe = () => {
          const image = new Image(1, 1);
          probeStartedAt = Date.now();

          image.onload = onKeepAliveProbeSettled;

          image.onerror = onKeepAliveProbeSettled;

          image.src = `${keepAliveProbeUrl}?__network_delay=${DEFAULT_PROBE_DELAY_MS}&t=${probeStartedAt}`;
          document.documentElement.appendChild(image);
        };

        const startLoop = () => {
          if (running) return;
          running = true;

          // blocking listener 只处理带延迟标记的探测请求，并在 delayMs 后放行。
          chrome.webRequest.onBeforeRequest.addListener(
            (details) => {
              const lastError = chrome.runtime.lastError;

              if (lastError) {
                console.error("chrome.runtime.lastError in chrome.webRequest.onBeforeRequest:", lastError);
              }

              if (!details.url.includes(keepAliveProbeUrl)) {
                return {};
              }
              const url = new URL(details.url);

              // 只延迟明确带有延迟标记的请求，避免误伤同源下的其它请求
              if (!url.searchParams.has("__network_delay")) {
                return {};
              }

              const requestedDelay = Number(url.searchParams.get("__network_delay"));

              const delayMs = Number.isFinite(requestedDelay)
                ? Math.max(0, Math.min(requestedDelay, MAX_PROBE_DELAY_MS))
                : DEFAULT_PROBE_DELAY_MS;

              return new Promise((resolve) => {
                // user-visible 优先级用于尽量减少后台页面降频；它不保证 event page 永久存活。
                nativeScheduler.postTask(
                  () => {
                    // 延迟完成后放行 blocking request。
                    resolve({});
                  },
                  { priority: "user-visible", delay: delayMs }
                );
              });
            },
            {
              urls: [`${keepAliveProbeOrigin}/*`],
              types: ["xmlhttprequest", "image"],
            },
            ["blocking"]
          );

          sendKeepAliveProbe();
        };

        // 必须在事件页首个同步回合注册；撤销权限时依赖现有往返过短自停逻辑退出探测循环。
        chrome.permissions.onAdded.addListener((permissions) => {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            console.error("chrome.runtime.lastError in chrome.permissions.onAdded:", lastError);
            return;
          }
          if (permissions.permissions?.includes("webRequestBlocking")) startLoop();
        });

        void chrome.permissions.contains({ permissions: ["webRequestBlocking"] }).then((granted) => {
          if (granted) startLoop();
        });
      }
    : () => {};
