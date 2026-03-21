import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { ServiceWorkerMessageSend, ServiceWorkerClientMessage, type WindowMessageBody } from "./window_message";
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
