import { describe, it, expect, vi } from "vitest";
import { initTestEnv } from "@Tests/utils";
import "@Packages/chrome-extension-mock";
import { Server } from "@Packages/message/server";
import { EventPageOffscreenManager, InProcessMessage } from "./event_page_manager";

initTestEnv();

// 单测重点：Firefox MV3 下事件页(EventPageOffscreenManager)与 service worker 是同一个脚本/进程，
// offscreen -> SW 方向不能走 chrome.runtime.sendMessage(自己发给自己会报 "Could not establish
// connection. Receiving end does not exist."，进而在 packages/message/client.ts 的 sendMessage()
// 里因 res 为 undefined 触发 "can't access property data" 的错误日志)。
// 这里验证：只要把一个 InProcessMessage 桥接实例，同时注册为 "serviceWorker" Server 的 receiver、
// 并传给 EventPageOffscreenManager 作为 extMsgSender，offscreen -> SW 的调用就能在进程内真正
// 送达并拿到响应，而不是得到 undefined。
describe("EventPageOffscreenManager <-> serviceWorker 进程内桥接", () => {
  it("offscreen 发起的 getExtensionEnv 通过进程内桥接真正到达 serviceWorker 端处理器并拿到响应", async () => {
    const bridge = new InProcessMessage();
    const serviceWorkerHandler = vi.fn().mockResolvedValue({ inIncognitoContext: false });
    const serviceWorkerServer = new Server("serviceWorker", bridge);
    serviceWorkerServer.on("getExtensionEnv", serviceWorkerHandler);

    const manager = new EventPageOffscreenManager(bridge);

    const result = await manager.getExtensionEnv({ requireUAD: false });

    expect(serviceWorkerHandler).toHaveBeenCalledTimes(1);
    expect(serviceWorkerHandler).toHaveBeenCalledWith({ requireUAD: false }, expect.anything());
    expect(result).toEqual({ inIncognitoContext: false });
  });

  it("offscreen 发起的 preparationOffscreen 通知也通过进程内桥接真正到达 serviceWorker 端处理器", async () => {
    const bridge = new InProcessMessage();
    const serviceWorkerHandler = vi.fn().mockResolvedValue(undefined);
    const serviceWorkerServer = new Server("serviceWorker", bridge);
    serviceWorkerServer.on("preparationOffscreen", serviceWorkerHandler);

    const manager = new EventPageOffscreenManager(bridge);

    // 触发 sandbox 就绪通知：会走 notifyOffscreenReady -> this.serviceWorker.preparationOffscreen()
    manager.preparationSandbox();

    // preparationOffscreen() 内部走 sendMessage，是异步的；等待其对应的微任务/宏任务跑完
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(serviceWorkerHandler).toHaveBeenCalledTimes(1);
  });
});
