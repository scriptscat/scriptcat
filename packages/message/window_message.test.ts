import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  ServiceWorkerMessageSend,
  ServiceWorkerClientMessage,
  WindowMessage,
  type WindowMessageBody,
} from "./window_message";
import { Server } from "./server";
import type { MessageConnect } from "./types";

// 模拟 SW 的 postMessage
let swPostMessageMock: ReturnType<typeof vi.fn>;
// 捕获 self.addEventListener("message") 注册的 handler
let swMessageHandler: ((e: any) => void) | null;
// 捕获 navigator.serviceWorker.addEventListener("message") 注册的 handler
let clientMessageHandler: ((e: any) => void) | null;

// 需要在每次测试前设置好 mock，因为构造函数中会访问这些全局对象
beforeEach(() => {
  swMessageHandler = null;
  clientMessageHandler = null;
  swPostMessageMock = vi.fn();

  vi.spyOn(self, "addEventListener").mockImplementation(((event: string, handler: any) => {
    if (event === "message") swMessageHandler = handler;
  }) as any);

  (self as any).clients = {
    matchAll: vi.fn().mockResolvedValue([]),
  };

  Object.defineProperty(navigator, "serviceWorker", {
    value: {
      addEventListener: vi.fn((event: string, handler: any) => {
        if (event === "message") clientMessageHandler = handler;
      }),
      controller: { postMessage: swPostMessageMock },
      ready: Promise.resolve({ active: { postMessage: swPostMessageMock } }),
    },
    configurable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (self as any).clients;
});

describe("ServiceWorkerMessageSend", () => {
  describe("messageHandle 处理来自 Offscreen 的请求", () => {
    it("处理 sendMessage 类型，调用 onMessage 回调并发送响应", () => {
      const swSend = new ServiceWorkerMessageSend();

      const handler = vi.fn((..._args: any[]) => {
        const sendResponse = _args[1] as (data: any) => void;
        sendResponse({ code: 0, data: "pong" });
      });
      swSend.onMessage(handler);

      const source = { postMessage: vi.fn() };

      swSend.messageHandle({ messageId: "msg-1", type: "sendMessage", data: { action: "test", data: "ping" } }, source);

      // 验证传了3个参数: data, sendResponse, sender(空对象)
      expect(handler).toHaveBeenCalledWith({ action: "test", data: "ping" }, expect.any(Function), expect.any(Object));
      // sender 应该是空对象,经过 SenderRuntime.getExtMessageSender() 后得到 tabId=-1 等值
      const sender = handler.mock.calls[0]![2];
      expect(sender).toEqual({});
      expect(source.postMessage).toHaveBeenCalledWith({
        messageId: "msg-1",
        type: "respMessage",
        data: { code: 0, data: "pong" },
      });
    });

    it("处理 connect 类型，调用 onConnect 回调并创建 WindowMessageConnect", () => {
      const swSend = new ServiceWorkerMessageSend();

      const connectHandler = vi.fn();
      swSend.onConnect(connectHandler);

      const source = { postMessage: vi.fn() };

      swSend.messageHandle({ messageId: "conn-1", type: "connect", data: { action: "test/connect" } }, source);

      expect(connectHandler).toHaveBeenCalledWith(
        { action: "test/connect" },
        expect.objectContaining({
          sendMessage: expect.any(Function),
          onMessage: expect.any(Function),
          disconnect: expect.any(Function),
          onDisconnect: expect.any(Function),
        })
      );
    });

    it("没有 source 时忽略 sendMessage 和 connect", () => {
      const swSend = new ServiceWorkerMessageSend();

      const msgHandler = vi.fn();
      const conHandler = vi.fn();
      swSend.onMessage(msgHandler);
      swSend.onConnect(conHandler);

      // 无 source
      swSend.messageHandle({ messageId: "x", type: "sendMessage", data: {} });
      swSend.messageHandle({ messageId: "y", type: "connect", data: {} });

      expect(msgHandler).not.toHaveBeenCalled();
      expect(conHandler).not.toHaveBeenCalled();
    });

    it("仍然正常处理 respMessage / disconnect / connectMessage", () => {
      const swSend = new ServiceWorkerMessageSend();

      const respHandler = vi.fn();
      const disconnectHandler = vi.fn();
      const connMsgHandler = vi.fn();

      swSend.EE.addListener("response:resp-1", respHandler);
      swSend.EE.addListener("disconnect:disc-1", disconnectHandler);
      swSend.EE.addListener("connectMessage:cm-1", connMsgHandler);

      swSend.messageHandle({ messageId: "resp-1", type: "respMessage", data: "r" });
      swSend.messageHandle({ messageId: "disc-1", type: "disconnect", data: null });
      swSend.messageHandle({ messageId: "cm-1", type: "connectMessage", data: "m" });

      expect(respHandler).toHaveBeenCalled();
      expect(disconnectHandler).toHaveBeenCalled();
      expect(connMsgHandler).toHaveBeenCalledWith("m");
    });
  });
});

describe("ServiceWorkerClientMessage", () => {
  it("controller 可用时直接使用", () => {
    const clientMsg = new ServiceWorkerClientMessage();

    expect((clientMsg as any).sw).not.toBeNull();
    expect((clientMsg as any).sw.postMessage).toBe(swPostMessageMock);
  });

  it("controller 为 null 时通过 ready 获取 active SW", async () => {
    const readyPostMessage = vi.fn();
    Object.defineProperty(navigator, "serviceWorker", {
      value: {
        addEventListener: vi.fn((event: string, handler: any) => {
          if (event === "message") clientMessageHandler = handler;
        }),
        controller: null,
        ready: Promise.resolve({ active: { postMessage: readyPostMessage } }),
      },
      configurable: true,
    });

    const clientMsg = new ServiceWorkerClientMessage();

    expect((clientMsg as any).sw).toBeNull();

    // 等待 ready resolve
    await new Promise((r) => setTimeout(r, 0));

    expect((clientMsg as any).sw).not.toBeNull();
    expect((clientMsg as any).sw.postMessage).toBe(readyPostMessage);
  });

  it("可接收 service worker 主动发送的请求并交给 Server 处理", () => {
    const clientMsg = new ServiceWorkerClientMessage();
    const server = new Server("offscreen", clientMsg);
    const keepAlive = vi.fn((enabled: boolean) => enabled);
    server.on("keepAlive", keepAlive);
    const source = { postMessage: vi.fn() };

    clientMsg.messageHandle(
      { messageId: "keep-alive-1", type: "sendMessage", data: { action: "offscreen/keepAlive", data: true } },
      source
    );

    expect(keepAlive).toHaveBeenCalledWith(true, expect.anything());
    expect(source.postMessage).toHaveBeenCalledWith({
      messageId: "keep-alive-1",
      type: "respMessage",
      data: { code: 0, data: true },
    });
  });
});

describe("WindowMessage.connect", () => {
  it("connect 返回的连接 sendMessage 应带 '*' targetOrigin", async () => {
    // 模拟 target window，验证 postMessage 被调用时带 "*"
    const targetPostMessage = vi.fn();
    const sourceWindow = {
      addEventListener: vi.fn(),
    } as unknown as Window;
    const targetWindow = {
      postMessage: targetPostMessage,
    } as unknown as Window;

    const wm = new WindowMessage(sourceWindow, targetWindow);

    const con = await wm.connect({ action: "test/connect", data: "init" });

    // connect() 本身会调用一次 postMessage（发送 connect 消息）
    expect(targetPostMessage).toHaveBeenCalledTimes(1);
    expect(targetPostMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "connect" }), "*");

    targetPostMessage.mockClear();

    // 通过返回的连接发送消息，也应该带 "*"
    con.sendMessage({ action: "test/msg", data: "hello" });

    expect(targetPostMessage).toHaveBeenCalledTimes(1);
    expect(targetPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "connectMessage", data: { action: "test/msg", data: "hello" } }),
      "*"
    );
  });
});

// 单测重点：target 支持传入惰性求值函数，避免在 Firefox sandbox iframe 尚处于初始 about:blank
// 阶段就缓存 contentWindow 快照——导航到真正的 sandbox 页面后，浏览器是否仍保证该快照与
// 事件的 e.source 全等属于实现细节，不可依赖；每次发送/比对都应重新读取当前值。
describe("WindowMessage 惰性 target(懒解析)", () => {
  it("target 为函数时，每次发送都重新读取当前返回值，而非构造时的快照", () => {
    const sourceWindow = { addEventListener: vi.fn() } as unknown as Window;

    // 模拟 iframe 导航前(about:blank)与导航后(真正的 sandbox 页面)两个不同的 Window 引用
    const blankPostMessage = vi.fn();
    const realPostMessage = vi.fn();
    let current: Window = { postMessage: blankPostMessage } as unknown as Window;

    const wm = new WindowMessage(sourceWindow, () => current);

    wm.sendMessage({ action: "before-nav", data: 1 });
    expect(blankPostMessage).toHaveBeenCalledTimes(1);
    expect(realPostMessage).not.toHaveBeenCalled();

    // 模拟导航完成：iframe 现在指向真正的 sandbox 页面
    current = { postMessage: realPostMessage } as unknown as Window;

    wm.sendMessage({ action: "after-nav", data: 2 });
    expect(realPostMessage).toHaveBeenCalledTimes(1);
  });

  it("接收消息时按当前(而非构造时)读取的 target 比对 e.source，导航后不会误丢消息", () => {
    let messageHandler: ((e: any) => void) | null = null;
    const sourceWindow = {
      addEventListener: vi.fn((event: string, handler: any) => {
        if (event === "message") messageHandler = handler;
      }),
    } as unknown as Window;

    // 构造时若立即读取 contentWindow 会拿到 about:blank 的引用；
    // 这里用函数延迟到真正需要比对时才读取，模拟构造之后才完成导航的时序
    const blankWindow = {} as unknown as Window;
    const realWindow = {} as unknown as Window;
    let current: Window = blankWindow;

    const wm = new WindowMessage(sourceWindow, () => current);

    // 模拟导航完成
    current = realWindow;

    const handler = vi.fn();
    wm.onMessage(handler);

    // 真正导航后的 sandbox 页面发出的消息，其 e.source 就是 realWindow
    messageHandler!({
      source: realWindow,
      data: { messageId: "m1", type: "sendMessage", data: { action: "ping" } },
    });

    expect(handler.mock.calls[0]?.[0]).toEqual({ action: "ping" });
  });

  it("target 解析抛错时不让异常冒出事件回调，且不影响后续消息的正常处理", () => {
    let messageHandler: ((e: any) => void) | null = null;
    const sourceWindow = {
      addEventListener: vi.fn((event: string, handler: any) => {
        if (event === "message") messageHandler = handler;
      }),
    } as unknown as Window;

    // 模拟 sandbox iframe 已从 DOM 移除：contentWindow 变为 null，getTarget() 因此抛错
    let shouldThrow = true;
    const realWindow = {} as unknown as Window;
    const wm = new WindowMessage(sourceWindow, () => {
      if (shouldThrow) {
        throw new Error("contentWindow is null");
      }
      return realWindow;
    });

    const handler = vi.fn();
    wm.onMessage(handler);

    // target 解析失败期间收到的消息：不应抛出未捕获异常，消息被安全丢弃
    expect(() =>
      messageHandler!({
        source: realWindow,
        data: { messageId: "m1", type: "sendMessage", data: { action: "dropped" } },
      })
    ).not.toThrow();
    expect(handler).not.toHaveBeenCalled();

    // target 恢复可用后，后续消息应正常处理（证明前一次异常没有破坏监听器本身）
    shouldThrow = false;
    messageHandler!({
      source: realWindow,
      data: { messageId: "m2", type: "sendMessage", data: { action: "recovered" } },
    });
    expect(handler.mock.calls[0]?.[0]).toEqual({ action: "recovered" });
  });
});

describe("ServiceWorkerMessageSend ↔ ServiceWorkerClientMessage 双向通信", () => {
  // 辅助函数: 将两端连接起来，模拟 postMessage 通道
  function createWiredPair() {
    const swSend = new ServiceWorkerMessageSend();
    const clientMsg = new ServiceWorkerClientMessage();

    // 模拟 offscreen client（SW 发送给 offscreen 时的 target）
    const offscreenPostMessage = vi.fn((data: WindowMessageBody) => {
      // SW → Offscreen: 投递到 clientMsg 的 messageHandle
      clientMessageHandler?.({ data });
    });

    // client.postToServiceWorker → 投递到 SW 的 messageHandle
    swPostMessageMock.mockImplementation((data: WindowMessageBody) => {
      const source = { postMessage: offscreenPostMessage };
      swMessageHandler?.({ data, source } as any);
    });

    return { swSend, clientMsg };
  }

  it("sendMessage: client→SW 请求并收到响应", async () => {
    const { swSend, clientMsg } = createWiredPair();

    // SW 端注册处理器
    swSend.onMessage((msg: any, sendResponse: any) => {
      sendResponse({ code: 0, data: (msg.data as string) + " world" });
      return true;
    });

    const result = await clientMsg.sendMessage({ action: "test/echo", data: "hello" });
    expect(result).toEqual({ code: 0, data: "hello world" });
  });

  it("connect: 建立连接后双向通信", async () => {
    const { swSend, clientMsg } = createWiredPair();

    const serverReceived: any[] = [];

    // SW 端处理 connect
    swSend.onConnect((_msg: any, con: MessageConnect) => {
      con.onMessage((data: any) => {
        serverReceived.push(data);
        // 回复
        con.sendMessage({ action: "reply", data: "got: " + data.data });
      });
    });

    // Client 端建立连接
    const con = await clientMsg.connect({ action: "test/stream", data: "init" });

    const clientReceived: any[] = [];
    con.onMessage((data: any) => {
      clientReceived.push(data);
    });

    // Client → SW
    con.sendMessage({ action: "msg1", data: "ping" });

    // 等待异步消息传递
    await new Promise((r) => setTimeout(r, 10));

    expect(serverReceived).toHaveLength(1);
    expect(serverReceived[0]).toEqual({ action: "msg1", data: "ping" });

    expect(clientReceived).toHaveLength(1);
    expect(clientReceived[0]).toEqual({ action: "reply", data: "got: ping" });
  });

  it("connect: disconnect 正确清理", async () => {
    const { swSend, clientMsg } = createWiredPair();

    let serverDisconnected = false;

    swSend.onConnect((_msg: any, con: MessageConnect) => {
      con.onDisconnect(() => {
        serverDisconnected = true;
      });
    });

    const con = await clientMsg.connect({ action: "test/disconnect" });

    con.disconnect();

    await new Promise((r) => setTimeout(r, 10));

    expect(serverDisconnected).toBe(true);
  });

  it("sendMessage: 支持传输复杂对象（模拟结构化克隆场景）", async () => {
    const { swSend, clientMsg } = createWiredPair();

    swSend.onMessage((msg: any, sendResponse: any) => {
      // 原样返回，验证数据完整性
      sendResponse({ code: 0, data: msg.data });
      return true;
    });

    const complexData = {
      array: [1, 2, 3],
      nested: { a: { b: "deep" } },
      nullVal: null,
      boolVal: true,
    };

    const result = await clientMsg.sendMessage({ action: "test/complex", data: complexData });
    expect((result as any).data).toEqual(complexData);
  });

  it("与 Server 集成: forwardMessage 路径", async () => {
    const swSend = new ServiceWorkerMessageSend();
    const clientMsg = new ServiceWorkerClientMessage();

    // Wire
    const offscreenPostMessage = vi.fn((data: WindowMessageBody) => {
      clientMessageHandler?.({ data });
    });
    swPostMessageMock.mockImplementation((data: WindowMessageBody) => {
      swMessageHandler?.({ data, source: { postMessage: offscreenPostMessage } } as any);
    });

    // 用 ServiceWorkerMessageSend 作为 Server 的消息源
    const server = new Server("serviceWorker", swSend);
    server.on("runtime/gmApi/test", async (params: any) => {
      return { result: params.value * 2 };
    });

    // Client 通过 sendMessage 调用 Server 的 API
    const resp = await clientMsg.sendMessage({ action: "serviceWorker/runtime/gmApi/test", data: { value: 21 } });

    expect((resp as any).code).toBe(0);
    expect((resp as any).data).toEqual({ result: 42 });
  });
});
