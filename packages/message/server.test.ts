import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import { Server, GetSender } from "./server";
import { CustomEventMessage } from "./custom_event_message";
import type { MessageConnect, MessageSender } from "./types";

describe("Server", () => {
  let contentMessage: CustomEventMessage;
  let injectMessage: CustomEventMessage;
  let server: Server;
  let client: CustomEventMessage;

  beforeEach(() => {
    // 清理 DOM 事件监听器
    global.window = Object.create(window);
    Object.defineProperty(window, "addEventListener", {
      value: vi.fn(),
      writable: true,
    });
    Object.defineProperty(window, "dispatchEvent", {
      value: vi.fn(),
      writable: true,
    });

    // 创建 content 和 inject 之间的消息通道
    contentMessage = new CustomEventMessage("test", true); // content 端
    injectMessage = new CustomEventMessage("test", false); // inject 端

    // 服务端使用 content 消息
    server = new Server("api", contentMessage);

    // 客户端使用 inject 消息
    client = injectMessage;

    // 模拟消息传递 - 从 inject 到 content
    vi.mocked(window.dispatchEvent).mockImplementation((event: Event) => {
      if (event instanceof CustomEvent) {
        const eventType = event.type;
        if (eventType.includes("test")) {
          // 根据事件类型确定目标消息处理器
          if (eventType.startsWith("ct")) {
            // inject -> content
            setTimeout(() => {
              contentMessage.messageHandle(event.detail, {
                postMessage: (data: any) => {
                  // content -> inject 的响应
                  const responseEvent = new CustomEvent("fd" + "test", { detail: data });
                  injectMessage.messageHandle(responseEvent.detail, {
                    postMessage: vi.fn(),
                  });
                },
              });
            }, 0);
          } else if (eventType.startsWith("fd")) {
            // content -> inject
            setTimeout(() => {
              injectMessage.messageHandle(event.detail, {
                postMessage: (data: any) => {
                  // inject -> content 的响应
                  const responseEvent = new CustomEvent("ct" + "test", { detail: data });
                  contentMessage.messageHandle(responseEvent.detail, {
                    postMessage: vi.fn(),
                  });
                },
              });
            }, 0);
          }
        }
      }
      return true;
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe("基本功能测试", () => {
    it("应该能够注册和调用 API", async () => {
      const mockHandler = vi.fn().mockResolvedValue("test response");

      server.on("test", mockHandler);

      const response = await client.sendMessage({
        action: "api/test",
        data: { param: "value" },
      });

      expect(mockHandler).toHaveBeenCalledWith({ param: "value" }, expect.any(GetSender));
      expect(response.code).toBe(0);
      expect(response.data).toBe("test response");
    });

    it("应该能够处理同步函数", async () => {
      const mockHandler = vi.fn().mockReturnValue("sync response");

      server.on("sync", mockHandler);

      const response = await client.sendMessage({
        action: "api/sync",
        data: { param: "value" },
      });

      expect(mockHandler).toHaveBeenCalledWith({ param: "value" }, expect.any(GetSender));
      expect(response.code).toBe(0);
      expect(response.data).toBe("sync response");
    });

    it("应该能够处理异步函数", async () => {
      const mockHandler = vi.fn().mockResolvedValue("async response");

      server.on("async", mockHandler);

      const response = await client.sendMessage({
        action: "api/async",
        data: { param: "value" },
      });

      expect(mockHandler).toHaveBeenCalledWith({ param: "value" }, expect.any(GetSender));
      expect(response.code).toBe(0);
      expect(response.data).toBe("async response");
    });

    it("应该能够处理函数抛出的错误", async () => {
      const error = new Error("test error");
      const mockHandler = vi.fn().mockImplementation(() => {
        throw error;
      });

      server.on("error", mockHandler);

      const response = await client.sendMessage({
        action: "api/error",
        data: {},
      });

      expect(response.code).toBe(-1);
      expect(response.message).toBe("test error");
    });

    it("应该能够处理 Promise 拒绝", async () => {
      const error = new Error("async error");
      const mockHandler = vi.fn().mockRejectedValue(error);

      server.on("reject", mockHandler);

      const response = await client.sendMessage({
        action: "api/reject",
        data: {},
      });

      expect(response.code).toBe(-1);
      expect(response.message).toBe("async error");
    });

    it("应该对不存在的 API 返回错误", async () => {
      const response = await client.sendMessage({
        action: "api/nonexistent",
        data: {},
      });

      expect(response.code).toBe(-1);
      expect(response.message).toBe("no such api nonexistent");
    });

    it("应该忽略不匹配前缀的消息", async () => {
      const mockHandler = vi.fn();
      server.on("test", mockHandler);

      // 对于不匹配前缀的消息，服务器不会响应，客户端会超时
      // 我们使用 Promise.race 来测试超时行为
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 100));

      const messagePromise = client.sendMessage({
        action: "other/test",
        data: {},
      });

      try {
        await Promise.race([messagePromise, timeoutPromise]);
      } catch (error: any) {
        // 应该超时，因为服务器不会响应不匹配前缀的消息
        expect(error.message).toBe("timeout");
      }

      // 消息应该被忽略，不会调用处理器
      expect(mockHandler).not.toHaveBeenCalled();
    });
  });

  describe("Group 功能测试", () => {
    it("应该能够创建和使用 Group", async () => {
      const mockHandler = vi.fn().mockResolvedValue("group response");

      const userGroup = server.group("user");
      userGroup.on("info", mockHandler);

      const response = await client.sendMessage({
        action: "api/user/info",
        data: { userId: 123 },
      });

      expect(mockHandler).toHaveBeenCalledWith({ userId: 123 }, expect.any(GetSender));
      expect(response.code).toBe(0);
      expect(response.data).toBe("group response");
    });

    it("应该能够创建嵌套 Group", async () => {
      const mockHandler = vi.fn().mockResolvedValue("nested response");

      const userGroup = server.group("user");
      const profileGroup = userGroup.group("profile");
      profileGroup.on("get", mockHandler);

      const response = await client.sendMessage({
        action: "api/user/profile/get",
        data: { userId: 123 },
      });

      expect(mockHandler).toHaveBeenCalledWith({ userId: 123 }, expect.any(GetSender));
      expect(response.code).toBe(0);
      expect(response.data).toBe("nested response");
    });

    it("应该自动为 Group 名称添加斜杠", async () => {
      const mockHandler = vi.fn().mockResolvedValue("auto slash response");

      // 测试不带斜杠的情况
      const group1 = server.group("group1");
      group1.on("test", mockHandler);

      // 测试带斜杠的情况
      const group2 = server.group("group2/");
      group2.on("test", mockHandler);

      // 两种方式都应该工作
      const response1 = await client.sendMessage({
        action: "api/group1/test",
        data: {},
      });

      const response2 = await client.sendMessage({
        action: "api/group2/test",
        data: {},
      });

      expect(response1.code).toBe(0);
      expect(response2.code).toBe(0);
      expect(mockHandler).toHaveBeenCalledTimes(2);
    });
  });

  describe("GetSender 功能测试", () => {
    it("应该能够从 MessageSender 获取信息", async () => {
      let capturedSender: GetSender;

      server.on("test", (params, sender) => {
        capturedSender = sender;
      });

      // 模拟带有 sender 信息的消息
      const mockSender: MessageSender = {
        tab: { id: 123 },
        frameId: 456,
        documentId: "doc-123",
      } as MessageSender;

      // 直接调用 messageHandle 来模拟带 sender 的消息
      const sendResponse = vi.fn();
      (server as any).messageHandle("test", { param: "value" }, sendResponse, mockSender);

      expect(capturedSender!).toBeInstanceOf(GetSender);
      expect(capturedSender!.getSender()).toBe(mockSender);

      const extSender = capturedSender!.getExtMessageSender();
      expect(extSender.tabId).toBe(123);
      expect(extSender.frameId).toBe(456);
      expect(extSender.documentId).toBe("doc-123");
    });

    it("应该为没有 tab 的 sender 返回 -1 tabId", async () => {
      let capturedSender: GetSender;

      server.on("test", (params, sender) => {
        capturedSender = sender;
      });

      const mockSender: MessageSender = {
        frameId: 456,
      } as MessageSender;

      const sendResponse = vi.fn();
      (server as any).messageHandle("test", { param: "value" }, sendResponse, mockSender);

      const extSender = capturedSender!.getExtMessageSender();
      expect(extSender.tabId).toBe(-1);
    });
  });

  describe("Connect 功能测试", () => {
    it("应该能够处理连接消息", async () => {
      const mockHandler = vi.fn();
      let capturedConnection: MessageConnect;

      server.on("connect", (params, sender) => {
        capturedConnection = sender.getConnect();
        mockHandler(params, sender);
      });

      // 直接模拟 connect 调用，因为 CustomEventMessage 的 connect 实现比较复杂
      const mockConnect = {
        onMessage: vi.fn(),
        sendMessage: vi.fn(),
        disconnect: vi.fn(),
        onDisconnect: vi.fn(),
      } as MessageConnect;

      // 直接调用 connectHandle
      (server as any).connectHandle("connect", { param: "connect data" }, mockConnect);

      expect(mockHandler).toHaveBeenCalledWith({ param: "connect data" }, expect.any(GetSender));
      expect(capturedConnection!).toBeDefined();
    });

    it("应该能够通过连接发送消息", async () => {
      let serverConnection: MessageConnect;
      const serverMessageHandler = vi.fn();

      server.on("connect", (params, sender) => {
        serverConnection = sender.getConnect();
        serverConnection.onMessage(serverMessageHandler);
      });

      const clientConnection = await client.connect({
        action: "api/connect",
        data: {},
      });

      // 客户端向服务端发送消息
      clientConnection.sendMessage({ action: "test123", data: "hello from client" });

      // 等待消息处理
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(serverMessageHandler).toHaveBeenCalledWith({ action: "test123", data: "hello from client" });
    });

    it("应该在 enableConnect 为 false 时不处理连接", async () => {
      const serverWithoutConnect = new Server("api", contentMessage, false);
      const mockHandler = vi.fn();

      serverWithoutConnect.on("connect", mockHandler);

      // 尝试连接应该不会触发处理器
      await client.connect({
        action: "api/connect",
        data: {},
      });

      expect(mockHandler).not.toHaveBeenCalled();
    });
  });

  describe("边界情况测试", () => {
    it("应该能够处理空参数", async () => {
      const mockHandler = vi.fn().mockResolvedValue("empty response");

      server.on("empty", mockHandler);

      const response = await client.sendMessage({
        action: "api/empty",
        data: null,
      });

      expect(mockHandler).toHaveBeenCalledWith(null, expect.any(GetSender));
      expect(response.code).toBe(0);
      expect(response.data).toBe("empty response");
    });

    it("应该能够处理复杂的数据类型", async () => {
      const complexData = {
        array: [1, 2, 3],
        object: { nested: true },
        number: 42,
        string: "test",
        boolean: true,
        null: null,
        undefined: undefined,
      };

      const mockHandler = vi.fn().mockImplementation((params) => params);

      server.on("complex", mockHandler);

      const response = await client.sendMessage({
        action: "api/complex",
        data: complexData,
      });

      expect(response.code).toBe(0);
      expect(response.data).toEqual(complexData);
    });

    it("应该能够处理返回 undefined 的函数", async () => {
      const mockHandler = vi.fn().mockReturnValue(undefined);

      server.on("undefined", mockHandler);

      const response = await client.sendMessage({
        action: "api/undefined",
        data: {},
      });

      expect(response.code).toBe(0);
      expect(response.data).toBeUndefined();
    });
  });
});
