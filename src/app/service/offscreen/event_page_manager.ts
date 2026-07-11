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

// 同一脚本内的进程内消息桥接：Firefox MV3 下事件页本身兼任 offscreen 角色，与 SW 是同一个
// 脚本/进程，彼此之间不能通过 chrome.runtime.sendMessage/connect 通讯——自己发给自己会报
// "Could not establish connection. Receiving end does not exist."。导出给 service_worker.ts
// 用来搭建 offscreen -> SW 方向的桥接(SW -> offscreen 方向见本文件下方 EventPageOffscreenManager
// 内部已有的同名用法)。
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
    // 与 SW 是同一个脚本/进程时必须共用同一个 MessageQueue 实例：chrome.runtime.sendMessage 广播
    // 不会送达发送方自己所在的 frame，两边各自新建 MessageQueue 会导致互相收不到广播
    // (enableScripts/deleteScripts/installScript/setSandboxLanguage 全部失效，crontab 定时脚本
    // 也因此从不会被自动调度)。见 BackgroundEnvManagerBase 构造函数中 messageQueue 参数的说明。
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

    // 不要缓存 sandbox.contentWindow 的快照：刚创建的 iframe 此刻仍是初始的 about:blank 文档，
    // 之后才会导航到真正的 sandbox 页面(manifest sandbox 页在 Firefox 154+ 下是跨源 iframe)。
    // 缓存的 WindowProxy 引用在跨源导航后是否仍与消息事件的 e.source 全等属于浏览器实现细节，
    // 不应依赖；因此传入惰性求值函数，每次发送/比对都重新读取 contentWindow，并在读取时校验非空
    // (覆盖 iframe 之后被移除等场景)。
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

const nativeScheduler =
  //@ts-ignore
  typeof scheduler !== "undefined" && typeof scheduler?.postTask === "function" && scheduler;

/**
 * 让 Firefox MV3 事件页避免被判定为"空闲"而被浏览器回收(自动挂起/卸载)的实验性 workaround。
 *
 * ## 为什么需要这个
 *
 * Firefox MV3 没有 Chrome 那种独立、长驻的 offscreen 文档；`EventPageOffscreenManager` 让事件页
 * 自己兼任 offscreen 角色（见本文件顶部说明）。但事件页本身仍会被 Firefox 按"空闲"策略挂起/回收——
 * 一旦发生，托管在其中的 sandbox iframe 连同它内部所有基于 setTimeout 的状态（尤其是
 * `Runtime.crontabScript()` 为 `@crontab` 脚本创建的 CronJob 定时器，见
 * `src/app/service/sandbox/runtime.ts`）会随之整体销毁，且没有任何机制会在事件页苏醒后重新
 * 挂载这些定时器。这正是"手动运行脚本正常，但 `@crontab` 定时任务从不自动触发"这一类问题的
 * 典型成因之一。
 *
 * ## 工作原理
 *
 * 利用 Firefox 支持、但 Chrome MV3 已禁止的 `webRequestBlocking` 权限：
 * 1. 注册一个 `chrome.webRequest.onBeforeRequest` 的 blocking 监听器，只拦截自己发出的、
 *    带有 `__network_delay` 查询参数、指向一个刻意编造的不存在域名的探测请求，用
 *    `setTimeout` 把该请求"扣住"指定的毫秒数才放行——这段时间里请求处于浏览器认定的
 *    "有未完成网络活动"状态。
 * 2. 用一个 `<img>` 标签持续发起这类探测请求，每次探测结束（无论成功还是失败，反正编造的域名
 *    本来就无法真正连通）就立刻发起下一次，形成自我延续的心跳循环，让事件页在浏览器眼中
 *    "一直很忙"，从而不满足空闲挂起的条件。
 *
 * ## 重要限制与前提
 *
 * - **仅在 Firefox 生效，且需要 `webRequestBlocking` 权限。** 该权限只在
 *   `scripts/pack.js`（构建正式 Firefox 安装包时）动态注入到 manifest 中，`pnpm dev`/
 *   `pnpm build` 产出的 `dist/ext/manifest.json` 默认不包含它——本地用 `dist/ext` 加载临时
 *   扩展调试时，若未手动给 manifest 补上这个权限，下面的 blocking 监听器形同虚设，探测请求会
 *   立即失败而不会被真正"扣住"，导致心跳循环在 `onKeepAliveProbeSettled` 里因耗时不足
 *   `MIN_ROUND_TRIP_TO_CONTINUE_MS` 而提前自行终止（见下方注释），使整个 workaround 悄悄失效
 *   却不会报错。
 * - **这只是启发式手段，不是浏览器保证的持久化机制。** 是否真的能阻止 Firefox 的空闲判定，
 *   取决于 Firefox 内部未公开的具体算法，无法从代码层面完全保证；因此默认关闭，需要显式设置
 *   环境变量 `SC_KEEP_EVENT_PAGE_ACTIVE=true` 才会启用，避免在未经充分验证前影响所有用户。
 */
const startFirefoxEventPageKeepAliveLoop =
  process.env.SC_KEEP_EVENT_PAGE_ACTIVE === "true" && nativeScheduler
    ? () => {
        // 探测请求的目标延迟时长：webRequest 监听器会把匹配的请求扣住这么久才放行
        const DEFAULT_PROBE_DELAY_MS = 10_000;
        const MAX_PROBE_DELAY_MS = 120_000;
        // 若一次探测的实际耗时低于这个阈值，说明 blocking 监听器很可能没有真正扣住请求
        // (例如缺少 webRequestBlocking 权限、或请求提前失败)，此时不再发起下一次探测，
        // 避免在网络失败的情况下无意义地空转循环。
        const MIN_ROUND_TRIP_TO_CONTINUE_MS = 5_000;

        // 刻意编造一个不存在的域名作为探测目标：只需要浏览器认为"有一个进行中的网络请求"，
        // 并不需要它真的连通到任何地方。域名基于扩展自身的 URL 派生，确保不会撞到真实网站。
        const keepAliveProbeUrl = `https://--extensions-${chrome.runtime.getURL("/dummy_image.png").split("//")[1]}`;
        const keepAliveProbeOrigin = new URL(keepAliveProbeUrl).origin;

        // 拦截并延迟放行上面这个探测请求，使其在浏览器眼中长时间处于"进行中"状态。
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
              nativeScheduler.postTask(
                () => {
                  // 延迟结束，放行原始请求
                  resolve({});
                },
                { priority: "user-visible", delay: delayMs }
              );
              // user-visible: try hardest to service promptly regardless of focus state
            });
          },
          {
            urls: [`${keepAliveProbeOrigin}/*`],
            types: ["xmlhttprequest", "image"],
          },
          ["blocking"]
        );

        let probeStartedAt: number;

        // 一次探测请求结束(成功或失败都会触发)后的回调：判断这次探测是否被真正延迟过，
        // 若是则说明 workaround 仍然有效，继续发起下一次探测，维持心跳循环。
        const onKeepAliveProbeSettled = function (this: HTMLImageElement) {
          this.remove();
          if (Date.now() - probeStartedAt < MIN_ROUND_TRIP_TO_CONTINUE_MS) return;
          sendKeepAliveProbe();
        } as any;

        // 发起一次探测请求，作为心跳循环的一拍
        const sendKeepAliveProbe = () => {
          const image = new Image();
          probeStartedAt = Date.now();

          image.onload = onKeepAliveProbeSettled;

          image.onerror = onKeepAliveProbeSettled;

          image.src = `${keepAliveProbeUrl}?__network_delay=${DEFAULT_PROBE_DELAY_MS}&t=${probeStartedAt}`;
          document.documentElement.appendChild(image);
        };

        sendKeepAliveProbe();
      }
    : () => {};
