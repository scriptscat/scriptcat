import { describe, it, expect, vi } from "vitest";
import { initTestEnv } from "@Tests/utils";
import "@Packages/chrome-extension-mock";
import { Server } from "@Packages/message/server";
import { MessageQueue } from "@Packages/message/message_queue";
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

    const manager = new EventPageOffscreenManager(bridge, new MessageQueue());

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

    const manager = new EventPageOffscreenManager(bridge, new MessageQueue());

    // 触发 sandbox 就绪通知：会走 notifyOffscreenReady -> this.serviceWorker.preparationOffscreen()
    manager.preparationSandbox();

    // preparationOffscreen() 内部走 sendMessage，是异步的；等待其对应的微任务/宏任务跑完
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(serviceWorkerHandler).toHaveBeenCalledTimes(1);
  });
});

// 单测重点：SW 与 offscreen 必须共用同一个 MessageQueue 实例，而不是各自新建一个。
// MessageQueue.publish() 的跨上下文广播只走 chrome.runtime.sendMessage，而该 API 明确不会把消息
// 送回发送方自己所在的 frame；Firefox 下 SW 和 offscreen(EventPageOffscreenManager)是同一个
// 脚本/进程/frame，所以如果两边各自 `new MessageQueue()`，SW 侧 mq.publish("enableScripts", ...)
// 永远到不了 offscreen 侧的 ScriptService 订阅——crontab 定时脚本正是靠这条广播才会被 sandbox
// 端调度，这也是"手动运行正常，但 crontab 从不自动触发"的根本原因。
// 修复方式：把 SW 侧已有的 MessageQueue 实例注入进 EventPageOffscreenManager，两边共用同一个
// EventEmitter，这样 publish() 内部的本地 this.EE.emit() 就足以让两边互通，不再依赖
// chrome.runtime.sendMessage 广播。
describe("EventPageOffscreenManager 与 SW 共用 MessageQueue", () => {
  it("构造时传入的 MessageQueue 实例被原样保留，而不是内部另建一个新的", () => {
    const bridge = new InProcessMessage();
    const sharedQueue = new MessageQueue();

    const manager = new EventPageOffscreenManager(bridge, sharedQueue);

    expect((manager as unknown as { messageQueue: MessageQueue }).messageQueue).toBe(sharedQueue);
  });

  it("共用同一个 MessageQueue 时，SW 侧 publish 的 enableScripts 能被 offscreen 侧的订阅收到", () => {
    const sharedQueue = new MessageQueue();

    // 模拟 offscreen 侧(ScriptService.init() 中就是这样订阅 "enableScripts" 的)
    const received: unknown[] = [];
    sharedQueue.subscribe("enableScripts", (data) => received.push(data));

    // 模拟 SW 侧(RuntimeService 的 preparationOffscreen 订阅里就是这样发布的)
    // 注：真实 chrome.runtime.sendMessage 在 Firefox 下不会回送给发送方自己所在的 frame，
    // 但测试用的 chrome-extension-mock 没有模拟"排除发送方所在 frame"这一语义，所以在共用
    // 同一实例时，本地 this.EE.emit() 和 mock 的 chrome.runtime.onMessage 回环各触发一次，
    // 收到 2 条；这里只断言"确实收到了"，不依赖具体次数。
    sharedQueue.publish("enableScripts", [{ uuid: "script-uuid", enable: true }]);

    expect(received.length).toBeGreaterThan(0);
    expect(received[0]).toEqual([{ uuid: "script-uuid", enable: true }]);
  });
});
