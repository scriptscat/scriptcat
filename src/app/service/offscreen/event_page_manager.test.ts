import { afterEach, describe, it, expect, vi } from "vitest";
import { initTestEnv } from "@Tests/utils";
import chromeMock from "@Packages/chrome-extension-mock";
import { Server } from "@Packages/message/server";
import { MessageQueue } from "@Packages/message/message_queue";
import type LoggerCoreType from "../../logger/core";
import { EventPageOffscreenManager, InProcessMessage } from "./event_page_manager";

initTestEnv();

// keep_alive.ts 在模块顶层把 isFirefox() 固化为 boolFirefox 常量；测试环境不是 Firefox，
// 必须 mock isFirefox 并配合 vi.resetModules() 重新导入，Firefox 保活分支才会生效。
const { isFirefoxMock } = vi.hoisted(() => ({
  isFirefoxMock: vi.fn(() => false),
}));

vi.mock("@App/pkg/utils/utils", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, isFirefox: isFirefoxMock };
});

const RealImage = globalThis.Image;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.stubGlobal("scheduler", undefined);
  vi.restoreAllMocks();
  isFirefoxMock.mockReturnValue(false);
  vi.stubGlobal("Image", RealImage);
  chromeMock.init();
  for (const node of Array.from(document.documentElement.querySelectorAll("iframe,img"))) {
    node.remove();
  }
});

const loadKeepAliveEnabledManager = async () => {
  vi.stubEnv("SC_KEEP_EVENT_PAGE_ACTIVE", "true");
  vi.stubGlobal("scheduler", {
    postTask: vi.fn(),
  });
  isFirefoxMock.mockReturnValue(true);
  // Firefox 分支的探测 <img> 不再挂载到 DOM（仅靠变量引用防 GC），改用可追踪的 Image 替身观察探测请求
  const probeImages: Array<{ src: string; onload: unknown; onerror: unknown }> = [];
  vi.stubGlobal(
    "Image",
    class {
      onload: unknown = null;
      onerror: unknown = null;
      src = "";
      constructor() {
        probeImages.push(this);
      }
    }
  );
  vi.resetModules();
  const loggerModule = await import("../../logger/core.js");
  const LoggerCore = loggerModule.default as unknown as typeof LoggerCoreType;
  const logger = new LoggerCore({
    level: "trace",
    consoleLevel: "trace",
    writer: new loggerModule.EmptyWriter(),
    labels: { env: "test" },
  });
  logger.logger().debug("test start");
  return { ...(await import("./event_page_manager.js")), ...(await import("./keep_alive.js")), probeImages };
};

const loadChromeKeepAlive = async () => {
  isFirefoxMock.mockReturnValue(false);
  vi.resetModules();
  return await import("./keep_alive.js");
};

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

describe("EventPageOffscreenManager Firefox event page 保活权限门控", () => {
  it("权限未授予时不注册 blocking listener，也不发起首拍探测", async () => {
    chromeMock.permissions.__setGrantedPermissions([]);
    const {
      EventPageOffscreenManager: KeepAliveManager,
      InProcessMessage: KeepAliveMessage,
      startFirefoxEventPageKeepAliveLoop,
      probeImages,
    } = await loadKeepAliveEnabledManager();

    startFirefoxEventPageKeepAliveLoop()(true);
    new KeepAliveManager(new KeepAliveMessage(), new MessageQueue());
    await Promise.resolve();

    expect((chrome.webRequest.onBeforeRequest as any).listeners).toHaveLength(0);
    expect(probeImages).toHaveLength(0);
  });

  it("权限已授予时注册 blocking listener 并发起首拍探测", async () => {
    chromeMock.permissions.__setGrantedPermissions(["webRequestBlocking"]);
    const {
      EventPageOffscreenManager: KeepAliveManager,
      InProcessMessage: KeepAliveMessage,
      startFirefoxEventPageKeepAliveLoop,
      probeImages,
    } = await loadKeepAliveEnabledManager();

    startFirefoxEventPageKeepAliveLoop()(true);
    new KeepAliveManager(new KeepAliveMessage(), new MessageQueue());
    await Promise.resolve();

    expect((chrome.webRequest.onBeforeRequest as any).listeners).toHaveLength(1);
    expect((chrome.webRequest.onBeforeRequest as any).listeners[0].extraInfoSpec).toEqual(["blocking"]);
    expect(probeImages).toHaveLength(1);
    expect(probeImages[0].src).toContain("__network_delay=");
  });

  it("运行中收到 webRequestBlocking 授权后启动循环，重复触发不会重复注册", async () => {
    chromeMock.permissions.__setGrantedPermissions([]);
    const {
      EventPageOffscreenManager: KeepAliveManager,
      InProcessMessage: KeepAliveMessage,
      startFirefoxEventPageKeepAliveLoop,
      probeImages,
    } = await loadKeepAliveEnabledManager();

    startFirefoxEventPageKeepAliveLoop()(true);
    new KeepAliveManager(new KeepAliveMessage(), new MessageQueue());
    await Promise.resolve();

    chrome.permissions.request({ permissions: ["webRequestBlocking"] });
    chrome.permissions.request({ permissions: ["webRequestBlocking"] });

    expect((chrome.webRequest.onBeforeRequest as any).listeners).toHaveLength(1);
    expect(probeImages).toHaveLength(1);
  });

  it("移除 webRequestBlocking 后立即停止 blocking 探测，重新授权后恢复", async () => {
    chromeMock.permissions.__setGrantedPermissions(["webRequestBlocking"]);
    const {
      EventPageOffscreenManager: KeepAliveManager,
      InProcessMessage: KeepAliveMessage,
      startFirefoxEventPageKeepAliveLoop,
      probeImages,
    } = await loadKeepAliveEnabledManager();

    startFirefoxEventPageKeepAliveLoop()(true);
    new KeepAliveManager(new KeepAliveMessage(), new MessageQueue());
    await Promise.resolve();

    const listener = (chrome.webRequest.onBeforeRequest as any).listeners[0].callback;
    // 与 keep_alive.ts 相同的派生规则：探测域名来自扩展自身的 runtime.getURL
    const extensionId = new URL(chrome.runtime.getURL("/")).hostname;
    const probeRequest = {
      url: `https://--extensions-${extensionId}.invalid?__network_delay=10000`,
    };

    expect(listener(probeRequest)).toBeInstanceOf(Promise);

    chrome.permissions.remove({ permissions: ["webRequestBlocking"] });

    expect(listener(probeRequest)).toEqual({});

    chrome.permissions.request({ permissions: ["webRequestBlocking"] });

    expect(listener(probeRequest)).toBeInstanceOf(Promise);
    // 首拍探测 + 重新授权后的恢复探测
    expect(probeImages).toHaveLength(2);
  });

  it("构造同步回合内先注册 permissions.onAdded，再等待 contains 结果", async () => {
    chromeMock.permissions.__setGrantedPermissions([]);
    const contains = vi.spyOn(chrome.permissions, "contains").mockReturnValue(new Promise(() => {}) as never);
    const addListener = vi.spyOn(chrome.permissions.onAdded, "addListener");
    const {
      EventPageOffscreenManager: KeepAliveManager,
      InProcessMessage: KeepAliveMessage,
      startFirefoxEventPageKeepAliveLoop,
    } = await loadKeepAliveEnabledManager();

    startFirefoxEventPageKeepAliveLoop();
    new KeepAliveManager(new KeepAliveMessage(), new MessageQueue());

    expect(addListener).toHaveBeenCalledTimes(1);
    expect(contains).toHaveBeenCalledTimes(1);
    expect(addListener.mock.invocationCallOrder[0]).toBeLessThan(contains.mock.invocationCallOrder[0]);
  });
});

describe("Chrome offscreen document 保活探测", () => {
  it("通过 runtime port 每 20 秒发送一次保活消息", async () => {
    const scheduledTasks: Array<() => void> = [];
    const postTask = vi.fn((task: () => void) => {
      scheduledTasks.push(task);
      return Promise.resolve();
    });
    vi.stubGlobal("scheduler", { postTask });
    const port = {
      name: "scriptcat-keep-alive",
      postMessage: vi.fn(),
      disconnect: vi.fn(),
      onDisconnect: { addListener: vi.fn() },
    } as unknown as chrome.runtime.Port;
    const connect = vi.spyOn(chrome.runtime, "connect").mockReturnValue(port);
    const { startChromeOffscreenKeepAliveLoop } = await loadChromeKeepAlive();

    const setKeepAliveEnabled = startChromeOffscreenKeepAliveLoop();
    setKeepAliveEnabled(true);

    expect(connect).toHaveBeenCalledWith({ name: "scriptcat-keep-alive" });
    expect(port.postMessage).toHaveBeenCalledWith({ type: "keep-alive" });
    expect(postTask).toHaveBeenCalledWith(expect.any(Function), {
      priority: "user-visible",
      delay: 20_000,
    });

    scheduledTasks.shift()?.();
    expect(port.postMessage).toHaveBeenCalledTimes(2);
    expect(postTask).toHaveBeenCalledTimes(2);

    setKeepAliveEnabled(false);
    expect(port.disconnect).toHaveBeenCalledTimes(1);
    scheduledTasks.shift()?.();
    expect(port.postMessage).toHaveBeenCalledTimes(2);
    expect(postTask).toHaveBeenCalledTimes(2);
  });
});
