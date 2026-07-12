// 保活实验依赖 Scheduler API：带 delay 的 user-visible task 相比 setTimeout 更不容易在后台降频。

import { type SystemConfig } from "@App/pkg/config/config";
import { isFirefox } from "@App/pkg/utils/utils";
import { sendMessage } from "@Packages/message/client";
import type { IOffscreenSend } from "@Packages/message/types";
import type { IMessageQueue } from "@Packages/message/message_queue";

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

const boolFirefox = isFirefox();

export const startFirefoxEventPageKeepAliveLoop =
  boolFirefox && process.env.SC_KEEP_EVENT_PAGE_ACTIVE !== "false" && nativeScheduler
    ? () => {
        let running = false;
        let enabled = false;

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
          if (!enabled || Date.now() - probeStartedAt < MIN_ROUND_TRIP_TO_CONTINUE_MS) return;
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
          enabled = true;
          if (running) return;
          running = true;

          // blocking listener 只处理带延迟标记的探测请求，并在 delayMs 后放行。
          chrome.webRequest.onBeforeRequest.addListener(
            (details) => {
              const lastError = chrome.runtime.lastError;

              if (lastError) {
                console.error("chrome.runtime.lastError in chrome.webRequest.onBeforeRequest:", lastError);
              }

              if (!enabled || !details.url.includes(keepAliveProbeUrl)) {
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

        // 必须在事件页首个同步回合注册；权限移除时立即关闭探测并保留监听器以便重新授权。
        chrome.permissions.onAdded.addListener((permissions) => {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            console.error("chrome.runtime.lastError in chrome.permissions.onAdded:", lastError);
            return;
          }
          if (permissions.permissions?.includes("webRequestBlocking")) startLoop();
        });

        chrome.permissions.onRemoved.addListener((permissions) => {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            console.error("chrome.runtime.lastError in chrome.permissions.onRemoved:", lastError);
            return;
          }
          if (permissions.permissions?.includes("webRequestBlocking")) enabled = false;
        });

        void chrome.permissions.contains({ permissions: ["webRequestBlocking"] }).then((granted) => {
          if (granted) startLoop();
        });
      }
    : () => {};

// SW 与 offscreen 共用同一条探测 URL 及延迟上限，两端各自独立计算，避免跨上下文传递闭包状态。
const KEEP_ALIVE_DEFAULT_PROBE_DELAY_MS = 10_000;
const KEEP_ALIVE_MAX_PROBE_DELAY_MS = 120_000;

const getKeepAliveProbeUrl = () => `https://--extensions-${chrome.runtime.getURL("/dummy_image.png").split("//")[1]}`;

let selfSw: ServiceWorkerGlobalScope | null = null;

export const setServiceWorkerSelf = (sw: ServiceWorkerGlobalScope) => {
  selfSw = sw;
};

/**
 * Chrome MV3 service worker 保活实验：仅注册 ServiceWorkerGlobalScope 事件。
 *
 * service worker 没有 DOM，不能创建 `Image`/访问 `document`；发起探测请求的职责在
 * {@link startChromeOffscreenKeepAliveLoop}（offscreen document 里有 DOM）。这里只负责拦截
 * 探测请求并用 `scheduler.postTask()` 延迟响应，使该请求在 offscreen 侧保持未完成状态。
 *
 * Chrome 要求 `install`/`activate`/`fetch` 监听器必须在 worker 脚本初次同步求值时注册，
 * 否则会报 "Event handler ... must be added on the initial evaluation of worker script" 并
 * 丢弃事件。因此监听器在调用时立即、无条件注册；是否真正拦截探测请求由返回的 setter 控制的
 * `enabled` 标志决定，setter 可在配置项异步加载或变更后随时调用。
 */
const startChromeServiceWorkerKeepAliveLoop =
  !boolFirefox && nativeScheduler
    ? () => {
        let enabled = false;

        const keepAliveProbeUrl = getKeepAliveProbeUrl();

        // Helper function to create a delay promise
        const delay = (delayMs: number) =>
          new Promise<void>((resolve) =>
            nativeScheduler.postTask(
              () => {
                resolve();
              },
              { priority: "user-visible", delay: delayMs }
            )
          );

        // Base64 string for a valid, minimal 1x1 transparent GIF
        const TRANSPARENT_GIF_BASE64 = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

        // Convert Base64 to a binary Uint8Array that the Response object can consume
        const gifBytes = Uint8Array.from(atob(TRANSPARENT_GIF_BASE64), (c) => c.charCodeAt(0));

        if (!selfSw) return () => {};

        selfSw.addEventListener("install", (_e: ExtendableEvent) => self.skipWaiting());
        selfSw.addEventListener("activate", (e: ExtendableEvent) => e.waitUntil(self.clients.claim()));

        selfSw.addEventListener("fetch", (event: FetchEvent) => {
          if (!enabled || !event.request.url.includes(keepAliveProbeUrl)) {
            return void 0;
          }
          const url = new URL(event.request.url);

          // 只延迟明确带有延迟标记的请求，避免误伤同源下的其它请求
          if (!url.searchParams.has("__network_delay")) {
            return void 0;
          }

          const requestedDelay = Number(url.searchParams.get("__network_delay"));

          const delayMs = Number.isFinite(requestedDelay)
            ? Math.max(0, Math.min(requestedDelay, KEEP_ALIVE_MAX_PROBE_DELAY_MS))
            : KEEP_ALIVE_DEFAULT_PROBE_DELAY_MS;

          event.respondWith(
            delay(delayMs) // 10-second delay
              .then(
                () =>
                  // Return a fresh Response containing the image binary
                  new Response(gifBytes, {
                    status: 200,
                    statusText: "OK",
                    headers: {
                      "Content-Type": "image/gif",
                      "Content-Length": gifBytes.length.toString(),
                      "Cache-Control": "no-store, must-revalidate", // Prevent browser caching during tests
                    },
                  })
              )
              .catch(() => new Response("Network error occurred", { status: 408 }))
          );
        });

        return (val: boolean) => {
          enabled = val;
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

  systemConfig.watch("keep_chrome_scripts_alive", (value, prev) => {
    enabled = value;
    setKeepAliveEnabled(value);
    if (value !== prev) informOffscreen();
  });
  messageQueue.subscribe("preparationOffscreen", () => {
    offscreenReady = true;
    informOffscreen();
  });
};

/**
 * Chrome MV3 offscreen document 保活实验：负责实际发起探测请求。
 *
 * offscreen document 具备 DOM，可以用 `<img>` 发起请求；请求会被
 * {@link startChromeServiceWorkerKeepAliveLoop} 中注册的 SW `fetch` 监听器拦截并延迟响应，
 * 未完成的探测请求用于减少 service worker 被判定为空闲的概率。
 *
 * 返回一个 setter：配置项初次异步加载完成或用户在设置页切换开关时都会调用它，
 * 从关闭切到开启时立即发起新一轮探测循环，切回关闭时让 `onKeepAliveProbeSettled` 中的
 * `enabled` 检查在当前这次探测结束后自然停止循环。
 */
export const startChromeOffscreenKeepAliveLoop =
  !boolFirefox && nativeScheduler
    ? () => {
        let enabled = false;

        // 实际往返过短说明请求未被 SW 端延迟（通常是 fetch 监听器未注册或请求提前失败）；
        // 此时停止后续探测，避免失败请求形成紧密循环。
        const MIN_ROUND_TRIP_TO_CONTINUE_MS = 5_000;

        const keepAliveProbeUrl = getKeepAliveProbeUrl();

        let probeStartedAt: number;

        // 只有请求确实被阻塞了足够久才继续下一轮；过快结束或已被禁用时停止，避免忙循环。
        const onKeepAliveProbeSettled = function (this: HTMLImageElement) {
          this.remove();
          if (!enabled || Date.now() - probeStartedAt < MIN_ROUND_TRIP_TO_CONTINUE_MS) return;
          sendKeepAliveProbe();
        } as any;

        // 发起一次探测请求，作为心跳循环的一拍
        const sendKeepAliveProbe = () => {
          const image = new Image(1, 1);
          probeStartedAt = Date.now();

          image.onload = onKeepAliveProbeSettled;

          image.onerror = onKeepAliveProbeSettled;

          image.src = `${keepAliveProbeUrl}?__network_delay=${KEEP_ALIVE_DEFAULT_PROBE_DELAY_MS}&t=${probeStartedAt}`;
          document.documentElement.appendChild(image);
        };

        return (val: boolean) => {
          const wasEnabled = enabled;
          enabled = val;
          if (enabled && !wasEnabled) {
            sendKeepAliveProbe();
          }
        };
      }
    : () => (_val: boolean) => {};
