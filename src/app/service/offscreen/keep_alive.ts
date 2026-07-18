import { type SystemConfig } from "@App/pkg/config/config";
import { isFirefox } from "@App/pkg/utils/utils";
import { sendMessage } from "@Packages/message/client";
import type { IOffscreenSend } from "@Packages/message/types";
import type { IMessageQueue } from "@Packages/message/message_queue";

// Firefox 的 blocking listener 依赖 Scheduler API；Chrome 使用 runtime port 心跳。
const nativeScheduler =
  typeof scheduler !== "undefined" && typeof scheduler?.postTask === "function" ? scheduler : null;

const deferredResponse = <T>(o: T, delayMs: number) =>
  new Promise<T>((resolve) => {
    if (!nativeScheduler) {
      resolve(o);
      return;
    }

    // user-visible 优先级用于尽量减少后台页面降频；它不保证永久存活。
    nativeScheduler.postTask(
      () => {
        resolve(o);
      },
      { priority: "user-visible", delay: delayMs }
    );
  });

// 使用扩展 ID 派生的探测域名，避免访问真实站点；请求是否最终成功并不重要。
const getKeepAliveProbeUrl = () => {
  const extensionId = new URL(chrome.runtime.getURL("/")).hostname;
  return `https://--extensions-${extensionId}.invalid`;
};

const KEEP_ALIVE_PORT_NAME = "scriptcat-keep-alive";
const KEEP_ALIVE_HEARTBEAT_INTERVAL_MS = 20_000;
const KEEP_ALIVE_HEARTBEAT_MESSAGE = { type: "keep-alive" } as const;

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
 * - 当前环境是 Firefox；
 * - 浏览器提供 `scheduler.postTask`；
 * - `keep_ext_background_alive` 运行时配置已开启；
 * - 用户通过安装提示或设置页授予 `webRequestBlocking`；
 *
 * 这不是 Firefox 保证的生命周期机制。Firefox 或 Scheduler 条件不满足时函数为空操作；运行时
 * 配置或权限不满足时不启动探测。探测未被实际延迟时，`onKeepAliveProbeSettled` 会停止循环，
 * 避免快速重试。
 */

const boolFirefox = isFirefox();

// 期望每个 blocking request 保持未完成的时间。
const KEEP_ALIVE_DEFAULT_PROBE_DELAY_MS = 10_000;
// 实际往返过短说明 listener 未阻塞请求（通常是权限缺失或请求提前失败）；
// 此时停止后续探测，避免失败请求形成紧密循环。
const KEEP_ALIVE_MIN_ROUND_TRIP_TO_CONTINUE_MS = 5_000;
const KEEP_ALIVE_MAX_PROBE_DELAY_MS = 120_000;

const createKeepAliveProbeLoop = (keepAliveProbeUrl: string) => {
  let enabled = false;
  let probeStartedAt: number;

  // 注意：不要让 image 在未 settled 前 GC 掉
  let image: HTMLImageElement | null = null;

  const onFirefoxProbeSettled = (ev: Event | string) => {
    if (!(ev instanceof Event)) return;
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();
    if (!image || ev.currentTarget !== image) return;

    // 上一轮的 image 可以被 GC 了
    image.onload = image.onerror = null;
    image = null;
    // 只有请求确实被阻塞了足够久才继续下一轮；过快结束时停止，避免忙循环。
    if (!enabled || Date.now() - probeStartedAt < KEEP_ALIVE_MIN_ROUND_TRIP_TO_CONTINUE_MS) return;
    // 下一轮
    sendKeepAliveProbe();
  };

  // 发起一次探测请求，作为心跳循环的一拍
  const sendKeepAliveProbe = () => {
    image = new Image(1, 1);
    probeStartedAt = Date.now();

    // onload / onerror 在调用前 image 不会被 GC
    image.onload = onFirefoxProbeSettled;
    image.onerror = onFirefoxProbeSettled;
    image.src = `${keepAliveProbeUrl}?__network_delay=${KEEP_ALIVE_DEFAULT_PROBE_DELAY_MS}&t=${probeStartedAt}`;
  };

  return {
    start() {
      if (enabled) return;
      enabled = true;
      sendKeepAliveProbe();
    },
    stop() {
      enabled = false;
    },
    isEnabled() {
      return enabled;
    },
  };
};

const TRANSPARENT_GIF_BASE64 = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

export const startFirefoxEventPageKeepAliveLoop =
  boolFirefox && nativeScheduler
    ? () => {
        let running = false;
        let configEnabled = false;
        let permissionGranted = false;
        // 使用扩展 ID 派生的探测域名，避免访问真实站点；请求是否最终成功并不重要。
        const keepAliveProbeUrl = getKeepAliveProbeUrl();
        const keepAlive = createKeepAliveProbeLoop(keepAliveProbeUrl);
        const keepAliveProbeOrigin = new URL(keepAliveProbeUrl).origin;

        const dataUri = `data:image/gif;base64,${TRANSPARENT_GIF_BASE64}`;

        const syncLoop = () => {
          if (!configEnabled || !permissionGranted) {
            keepAlive.stop();
            return;
          }
          if (running) {
            keepAlive.start();
            return;
          }
          running = true;

          // blocking listener 只处理带延迟标记的探测请求，并在 delayMs 后放行。
          chrome.webRequest.onBeforeRequest.addListener(
            (details) => {
              const lastError = chrome.runtime.lastError;

              if (lastError) {
                console.error("chrome.runtime.lastError in chrome.webRequest.onBeforeRequest:", lastError);
              }

              if (!keepAlive.isEnabled() || !details.url.includes(keepAliveProbeUrl)) {
                return {};
              }
              const url = new URL(details.url);

              // 只延迟明确带有延迟标记的请求，避免误伤同源下的其它请求
              if (!url.searchParams.has("__network_delay")) {
                return {};
              }

              const requestedDelay = Number(url.searchParams.get("__network_delay"));

              const delayMs = Number.isFinite(requestedDelay)
                ? Math.max(0, Math.min(requestedDelay, KEEP_ALIVE_MAX_PROBE_DELAY_MS))
                : KEEP_ALIVE_DEFAULT_PROBE_DELAY_MS;

              const response = { redirectUrl: dataUri };
              return deferredResponse(response, delayMs);
            },
            {
              urls: [`${keepAliveProbeOrigin}/*`],
              types: ["xmlhttprequest", "image"],
            },
            ["blocking"]
          );

          keepAlive.start();
        };

        // 必须在事件页首个同步回合注册；权限移除时立即关闭探测并保留监听器以便重新授权。
        chrome.permissions.onAdded.addListener((permissions) => {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            console.error("chrome.runtime.lastError in chrome.permissions.onAdded:", lastError);
            return;
          }
          if (permissions.permissions?.includes("webRequestBlocking")) {
            permissionGranted = true;
            syncLoop();
          }
        });

        chrome.permissions.onRemoved.addListener((permissions) => {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            console.error("chrome.runtime.lastError in chrome.permissions.onRemoved:", lastError);
            return;
          }
          if (permissions.permissions?.includes("webRequestBlocking")) {
            permissionGranted = false;
            syncLoop();
          }
        });

        void chrome.permissions.contains({ permissions: ["webRequestBlocking"] }).then((granted) => {
          permissionGranted = granted;
          syncLoop();
        });

        return (enabled: boolean) => {
          configEnabled = enabled;
          syncLoop();
        };
      }
    : () => (_enabled: boolean) => {};

export const hookFirefoxEventPageKeepAliveLoop = (systemConfig: SystemConfig) => {
  const setKeepAliveEnabled = startFirefoxEventPageKeepAliveLoop();
  systemConfig.watch("keep_ext_background_alive", (value) => setKeepAliveEnabled(value));
};

/**
 * Chrome MV3 service worker 侧接收 offscreen document 的 runtime port 心跳。
 *
 * Chrome MV3 的 offscreen document 网络事件不会经过扩展 service worker 的 `fetch` 监听器，
 * Chrome 文档说明，长连接上的消息会延长 service worker 生命周期；仅保持 port 打开不够，
 * 因此 offscreen document 每 20 秒发送一条消息。
 */
export const startChromeServiceWorkerKeepAliveLoop = !boolFirefox
  ? () => {
      let keepAlivePort: chrome.runtime.Port | null = null;

      chrome.runtime.onConnect.addListener((port) => {
        if (port.name !== KEEP_ALIVE_PORT_NAME) return;
        keepAlivePort?.disconnect();
        keepAlivePort = port;
        port.onMessage.addListener((message) => {
          if (message?.type !== KEEP_ALIVE_HEARTBEAT_MESSAGE.type) return;
        });
        port.onDisconnect.addListener(() => {
          if (keepAlivePort === port) keepAlivePort = null;
        });
      });

      return (val: boolean) => {
        if (val) return;
        keepAlivePort?.disconnect();
        keepAlivePort = null;
      };
    }
  : () => (_val: boolean) => {};

export const hookServiceWorkerKeepAliveLoop = (
  systemConfig: SystemConfig,
  messageQueue: IMessageQueue,
  offscreenSend: IOffscreenSend
) => {
  const setKeepAliveEnabled = startChromeServiceWorkerKeepAliveLoop();
  let offscreenReady = false;
  let enabled = false;

  const informOffscreen = () => {
    if (!offscreenReady) return;
    void sendMessage(offscreenSend, "offscreen/keepAlive", enabled).catch((error) => {
      console.error("Failed to update offscreen keep-alive state:", error);
    });
  };

  systemConfig.watch("keep_ext_background_alive", (value, prev) => {
    enabled = value;
    setKeepAliveEnabled(value);
    if (value !== prev) informOffscreen();
  });
  messageQueue.subscribe("preparationOffscreen", (data: { verified: boolean }) => {
    if (!data.verified) return;
    offscreenReady = true;
    informOffscreen();
  });
  // Chrome 的 offscreen document 生命周期可跨 service worker 重启；重新发现既有文档时，
  // sandbox 不会重新加载并再次握手，因此需要独立同步当前保活配置。
  messageQueue.subscribe("offscreenDocumentReady", () => {
    offscreenReady = true;
    informOffscreen();
  });
};

/**
 * Chrome MV3 offscreen document 通过 runtime port 发送保活心跳。
 *
 * offscreen document 的生命周期独立于 service worker，因此它可以作为心跳发送端；service
 * worker 收到每条消息后会刷新 MV3 的活动窗口。
 *
 * 返回一个 setter：配置项初次异步加载完成或用户在设置页切换开关时都会调用它，
 * 从关闭切到开启时立即发起新一轮探测循环，切回关闭时让 `onKeepAliveProbeSettled` 中的
 * `enabled` 检查在当前这次探测结束后自然停止循环。
 */
export const startChromeOffscreenKeepAliveLoop =
  !boolFirefox && nativeScheduler
    ? () => {
        let enabled = false;
        let port: chrome.runtime.Port | null = null;
        let heartbeatScheduled = false;

        const sendHeartbeat = () => {
          if (!enabled) return;
          if (!port) {
            port = chrome.runtime.connect({ name: KEEP_ALIVE_PORT_NAME });
            const connectedPort = port;
            port.onDisconnect.addListener(() => {
              if (port === connectedPort) port = null;
            });
          }
          try {
            port.postMessage(KEEP_ALIVE_HEARTBEAT_MESSAGE);
          } catch {
            port = null;
          }
        };

        const scheduleHeartbeat = () => {
          if (!enabled || heartbeatScheduled || !nativeScheduler) return;
          heartbeatScheduled = true;
          nativeScheduler.postTask(
            () => {
              heartbeatScheduled = false;
              if (!enabled) return;
              sendHeartbeat();
              scheduleHeartbeat();
            },
            { priority: "user-visible", delay: KEEP_ALIVE_HEARTBEAT_INTERVAL_MS }
          );
        };

        return (val: boolean) => {
          enabled = val;
          if (enabled) {
            sendHeartbeat();
            scheduleHeartbeat();
            return;
          }
          port?.disconnect();
          port = null;
        };
      }
    : () => (_val: boolean) => {};
