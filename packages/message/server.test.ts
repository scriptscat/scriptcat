import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import { GetSenderType, SenderConnect, SenderRuntime, Server, type IGetSender } from "./server";
import { createPageMessaging, CustomEventMessage } from "./custom_event_message";
import type { MessageConnect, RuntimeMessageSender } from "./types";
import { DefinedFlags } from "@App/app/service/service_worker/runtime.consts";
import { uuidv4 } from "@App/pkg/utils/uuid";

let contentMessage: CustomEventMessage;
let injectMessage: CustomEventMessage;
let server: Server;
let client: CustomEventMessage;

const nextTick = () => Promise.resolve().then(() => {});

const setupGlobal = () => {
  const testFlag = uuidv4();
  const testPageMessaging = createPageMessaging(testFlag);
  // 创建 content 和 inject 之间的消息通道
  contentMessage = new CustomEventMessage(testPageMessaging, true); // content 端
  injectMessage = new CustomEventMessage(testPageMessaging, false); // inject 端
  contentMessage.bindEmitter();
  injectMessage.bindEmitter();

  // 服务端使用 content 消息
  server = new Server("api", contentMessage);

  // 客户端使用 inject 消息
  client = injectMessage;

  // 清理 DOM 事件监听器
  vi.stubGlobal("window", Object.create(window));
  vi.stubGlobal("addEventListener", vi.fn());

  // 模拟消息传递 - 从 inject 到 content
  vi.stubGlobal(
    "dispatchEvent",
    vi.fn().mockImplementation((event: Event) => {
      if (event instanceof CustomEvent) {
        const eventType = event.type;
        if (eventType.includes(testFlag)) {
          let targetEventType: string;
          let messageThis: CustomEventMessage;
          let messageThat: CustomEventMessage;
          // 根据事件类型确定目标消息处理器
          if (eventType.includes(DefinedFlags.contentFlag)) {
            // inject -> content
            targetEventType = eventType.replace(DefinedFlags.contentFlag, DefinedFlags.injectFlag);
            messageThis = contentMessage;
            messageThat = injectMessage;
          } else if (eventType.includes(DefinedFlags.injectFlag)) {
            // content -> inject
            targetEventType = eventType.replace(DefinedFlags.injectFlag, DefinedFlags.contentFlag);
            messageThis = injectMessage;
            messageThat = contentMessage;
          } else {
            throw new Error("test mock failed");
          }
          nextTick().then(() => {
            messageThis.messageHandle(event.detail, {
              postMessage: (data: any) => {
                // 响应
                const responseEvent = new CustomEvent(targetEventType, { detail: data });
                messageThat.messageHandle(responseEvent.detail, {
                  postMessage: vi.fn(),
                });
              },
            });
          });
        }
      }
      return true;
    })
  );
};

beforeEach(() => {
  setupGlobal();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Server", () => {
  describe("基本功能测试 1", () => {
    it.concurrent("应该能够注册和调用 API", async () => {
      const mockHandler = vi.fn().mockResolvedValue("test response");

      server.on("on-basic", mockHandler);

      const response = await client.sendMessage({
        action: "api/on-basic",
        data: { param: "value-basic" },
      });

      expect(mockHandler).toHaveBeenCalledWith({ param: "value-basic" }, expect.any(SenderRuntime));
      expect(response.code).toBe(0);
      expect(response.data).toBe("test response");
    });

    it.concurrent("应该能够处理同步函数", async () => {
      const mockHandler = vi.fn().mockReturnValue("sync response");

      server.on("on-sync", mockHandler);

      const response = await client.sendMessage({
        action: "api/on-sync",
        data: { param: "value-sync" },
      });

      expect(mockHandler).toHaveBeenCalledWith({ param: "value-sync" }, expect.any(SenderRuntime));
      expect(response.code).toBe(0);
      expect(response.data).toBe("sync response");
    });

    it.concurrent("应该能够处理异步函数", async () => {
      const mockHandler = vi.fn().mockResolvedValue("async response");

      server.on("on-async", mockHandler);

      const response = await client.sendMessage({
        action: "api/on-async",
        data: { param: "value-async" },
      });

      expect(mockHandler).toHaveBeenCalledWith({ param: "value-async" }, expect.any(SenderRuntime));
      expect(response.code).toBe(0);
      expect(response.data).toBe("async response");
    });

    it.concurrent("应该能够处理函数抛出的错误", async () => {
      const error = new Error("test error");
      const mockHandler = vi.fn().mockImplementation(() => {
        throw error;
      });

      server.on("on-error", mockHandler);

      const response = await client.sendMessage({
        action: "api/on-error",
        data: {},
      });

      expect(response.code).toBe(-1);
      expect(response.message).toBe("test error");
    });

    it.concurrent("应该能够处理 Promise 拒绝", async () => {
      const error = new Error("async error");
      const mockHandler = vi.fn().mockRejectedValue(error);

      server.on("on-reject", mockHandler);

      const response = await client.sendMessage({
        action: "api/on-reject",
        data: {},
      });

      expect(response.code).toBe(-1);
      expect(response.message).toBe("async error");
    });

    it.concurrent("应该对不存在的 API 返回错误", async () => {
      const response = await client.sendMessage({
        action: "api/test-nonexistent-404",
        data: {},
      });

      expect(response.code).toBe(-1);
      expect(response.message).toBe("no such api test-nonexistent-404");
    });
  });

  describe("基本功能测试 2", () => {
    it("应该忽略不匹配前缀的消息", async () => {
      const mockHandler = vi.fn();
      server.on("on-prefix-test", mockHandler);

      const tmp: string[] = [];

      // 对于不匹配前缀的消息，服务器不会响应，客户端会超时

      const messagePromise1 = client.sendMessage({
        action: "other/on-prefix-test",
        data: {},
      });
      await nextTick();
      await nextTick();

      const messagePromise2 = client.sendMessage({
        action: "api/on-prefix-test",
        data: {},
      });
      await nextTick();
      await nextTick();

      const messagePromise3 = client.sendMessage({
        action: "other/on-prefix-test",
        data: {},
      });
      await nextTick();
      await nextTick();

      const messagePromise4 = client.sendMessage({
        action: "api/on-prefix-test",
        data: {},
      });
      await nextTick();
      await nextTick();

      messagePromise1.then(() => tmp.push("message1"));
      messagePromise2.then(() => tmp.push("message2"));
      messagePromise3.then(() => tmp.push("message3"));
      messagePromise4.then(() => tmp.push("message4"));

      await nextTick();
      await nextTick();

      // 不在result的被視為客户端超时
      const result = tmp.slice().sort();
      expect(result).toStrictEqual(["message2", "message4"]);

      // 消息应该被忽略，不会调用处理器
      expect(mockHandler).toBeCalledTimes(2);
    });
  });

  describe("Group 功能测试 (基本)", () => {
    it.concurrent("应该能够创建和使用 Group", async () => {
      const mockHandler = vi.fn().mockResolvedValue("group response");

      const userGroup = server.group("group-user");
      userGroup.on("group-info", mockHandler);

      const response = await client.sendMessage({
        action: "api/group-user/group-info",
        data: { userId: 123 },
      });

      expect(mockHandler).toHaveBeenCalledWith({ userId: 123 }, expect.any(SenderRuntime));
      expect(response.code).toBe(0);
      expect(response.data).toBe("group response");
    });

    it.concurrent("应该能够创建嵌套 Group", async () => {
      const mockHandler = vi.fn().mockResolvedValue("nested response");

      const userGroup = server.group("nested-user");
      const profileGroup = userGroup.group("nested-profile");
      profileGroup.on("nested-get", mockHandler);

      const response = await client.sendMessage({
        action: "api/nested-user/nested-profile/nested-get",
        data: { userId: 123 },
      });

      expect(mockHandler).toHaveBeenCalledWith({ userId: 123 }, expect.any(SenderRuntime));
      expect(response.code).toBe(0);
      expect(response.data).toBe("nested response");
    });

    it.concurrent("应该自动为 Group 名称添加斜杠", async () => {
      const mockHandler = vi.fn().mockResolvedValue("auto slash response");

      // 测试不带斜杠的情况
      const group1 = server.group("slash-group1");
      group1.on("slash-test", mockHandler);

      // 测试带斜杠的情况
      const group2 = server.group("slash-group2/");
      group2.on("slash-test", mockHandler);

      // 两种方式都应该工作
      const response1 = await client.sendMessage({
        action: "api/slash-group1/slash-test",
        data: {},
      });

      const response2 = await client.sendMessage({
        action: "api/slash-group2/slash-test",
        data: {},
      });

      expect(response1.code).toBe(0);
      expect(response2.code).toBe(0);
      expect(mockHandler).toHaveBeenCalledTimes(2);
    });
  });

  describe("Group 功能测试 (中間件)", () => {
    it("应该能够在 Group 中添加和执行中间件", async () => {
      const middlewareOrder: string[] = [];

      // 创建一个带中间件的group
      const middleware1 = vi.fn(async (params: any, con: any, next: any) => {
        middlewareOrder.push("middleware1-before");
        const result = await next();
        middlewareOrder.push("middleware1-after");
        return result;
      });

      let group = server.group("api", middleware1);

      // 添加另一个中间件
      const middleware2 = vi.fn(async (params: any, con: any, next: any) => {
        middlewareOrder.push("middleware2-before");
        const result = await next();
        middlewareOrder.push("middleware2-after");
        return result;
      });

      group = group.use(middleware2);

      // 注册一个处理函数
      const handler = vi.fn(async (params: any) => {
        middlewareOrder.push("handler");
        return { success: true, data: params };
      });

      group.on("test", handler);

      // 发送消息
      const response = await client.sendMessage({
        action: "api/api/test",
        data: { message: "hello" },
      });

      // 验证中间件执行顺序
      expect(middlewareOrder).toEqual([
        "middleware1-before",
        "middleware2-before",
        "handler",
        "middleware2-after",
        "middleware1-after",
      ]);

      // 验证响应
      expect(response.code).toBe(0);
      expect(response.data).toEqual({ success: true, data: { message: "hello" } });

      // 验证所有函数都被调用
      expect(middleware1).toHaveBeenCalledTimes(1);
      expect(middleware2).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("子 Group 应该继承父 Group 的中间件", async () => {
      const middlewareOrder: string[] = [];

      // 父group中间件
      const parentMiddleware = vi.fn(async (params: any, con: any, next: any) => {
        middlewareOrder.push("parent-middleware");
        return await next();
      });

      // 子group中间件
      const childMiddleware = vi.fn(async (params: any, con: any, next: any) => {
        middlewareOrder.push("child-middleware");
        return await next();
      });

      const parentGroup = server.group("parent", parentMiddleware);
      const childGroup = parentGroup.group("child", childMiddleware);

      // 在子group中注册处理函数
      const handler = vi.fn(async () => {
        middlewareOrder.push("handler");
        return { success: true };
      });

      childGroup.on("test", handler);

      // 发送消息
      await client.sendMessage({
        action: "api/parent/child/test",
        data: {},
      });

      // 验证中间件执行顺序（父中间件 -> 子中间件 -> 处理函数）
      expect(middlewareOrder).toEqual(["parent-middleware", "child-middleware", "handler"]);
    });

    it("中间件可以修改参数", async () => {
      // 中间件修改参数
      const modifyMiddleware = vi.fn(async (params: any, con: any, next: any) => {
        params.modified = true;
        params.timestamp = Date.now();
        return await next();
      });

      const group = server.group("api", modifyMiddleware);

      const handler = vi.fn(async (params: any) => {
        return { received: params };
      });

      group.on("modify-test", handler);

      // 发送消息
      const response = await client.sendMessage({
        action: "api/api/modify-test",
        data: { original: true },
      });

      // 验证参数被修改
      expect(response.data.received.original).toBe(true);
      expect(response.data.received.modified).toBe(true);
      expect(response.data.received.timestamp).toBeDefined();
    });

    it("中间件可以短路执行", async () => {
      // 短路中间件
      const shortCircuitMiddleware = vi.fn(async (params: any, con: any, next: any) => {
        if (params.skipHandler) {
          return { shortCircuited: true };
        }
        return await next();
      });

      const group = server.group("api", shortCircuitMiddleware);

      const handler = vi.fn(async () => {
        return { fromHandler: true };
      });

      group.on("short-circuit", handler);

      // 测试短路
      const response1 = await client.sendMessage({
        action: "api/api/short-circuit",
        data: { skipHandler: true },
      });

      expect(response1.data).toEqual({ shortCircuited: true });
      expect(handler).not.toHaveBeenCalled();

      // 测试正常执行
      const response2 = await client.sendMessage({
        action: "api/api/short-circuit",
        data: { skipHandler: false },
      });

      expect(response2.data).toEqual({ fromHandler: true });
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("没有中间件的 Group 应该正常工作", async () => {
      const group = server.group("api");

      const handler = vi.fn(async (params: any) => {
        return { data: params };
      });

      group.on("nomiddle", handler);

      const response = await client.sendMessage({
        action: "api/api/nomiddle",
        data: { message: "hello" },
      });

      expect(response.code).toBe(0);
      expect(response.data).toEqual({ data: { message: "hello" } });
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("中间件应该能够处理异步错误", async () => {
      const errorMiddleware = vi.fn(async (params: any, con: any, next: any) => {
        if (params.throwError) {
          throw new Error("Middleware error");
        }
        return await next();
      });

      const group = server.group("api", errorMiddleware);

      const handler = vi.fn(async () => {
        return { success: true };
      });

      group.on("asyncmiddle-error", handler);

      // 测试中间件抛出错误
      const response = await client.sendMessage({
        action: "api/api/asyncmiddle-error",
        data: { throwError: true },
      });

      expect(response.code).toBe(-1);
      expect(response.message).toBe("Middleware error");
      expect(handler).not.toHaveBeenCalled();
    });

    it("多层嵌套的 Group 中间件应该正确执行", async () => {
      const executionOrder: string[] = [];

      const middleware1 = vi.fn(async (params: any, con: any, next: any) => {
        executionOrder.push("level1-before");
        const result = await next();
        executionOrder.push("level1-after");
        return result;
      });

      const middleware2 = vi.fn(async (params: any, con: any, next: any) => {
        executionOrder.push("level2-before");
        const result = await next();
        executionOrder.push("level2-after");
        return result;
      });

      const middleware3 = vi.fn(async (params: any, con: any, next: any) => {
        executionOrder.push("level3-before");
        const result = await next();
        executionOrder.push("level3-after");
        return result;
      });

      const level1 = server.group("level1", middleware1);
      const level2 = level1.group("level2", middleware2);
      const level3 = level2.group("level3", middleware3);

      const handler = vi.fn(async () => {
        executionOrder.push("handler-multilevel");
        return { success: true };
      });

      level3.on("on-multilevel", handler);

      await client.sendMessage({
        action: "api/level1/level2/level3/on-multilevel",
        data: {},
      });

      expect(executionOrder).toEqual([
        "level1-before",
        "level2-before",
        "level3-before",
        "handler-multilevel",
        "level3-after",
        "level2-after",
        "level1-after",
      ]);
    });
  });

  describe("IGetSender 功能测试", () => {
    it.concurrent("应该能够从 RuntimeMessageSender 获取信息", async () => {
      let capturedSender: IGetSender;

      server.on("on-getsender", (params, sender) => {
        capturedSender = sender;
      });

      // 模拟带有 sender 信息的消息
      const mockSender: RuntimeMessageSender = {
        tab: { id: 123 },
        frameId: 456,
        documentId: "doc-123",
      } as RuntimeMessageSender;

      // 直接调用 messageHandle 来模拟带 sender 的消息
      const sendResponse = vi.fn();
      (server as any).messageHandle("on-getsender", { param: "value-getsender" }, sendResponse, mockSender);

      expect(capturedSender!).toBeInstanceOf(SenderRuntime);
      expect(capturedSender!.getSender()).toBe(mockSender);

      const extSender = capturedSender!.getExtMessageSender();
      expect(extSender.tabId).toBe(123);
      expect(extSender.frameId).toBe(456);
      expect(extSender.documentId).toBe("doc-123");
    });

    it.concurrent("应该为没有 tab 的 sender 返回 -1 tabId", async () => {
      let capturedSender: IGetSender;

      server.on("on-notab", (params, sender) => {
        capturedSender = sender;
      });

      const mockSender: RuntimeMessageSender = {
        frameId: 456,
      } as RuntimeMessageSender;

      const sendResponse = vi.fn();
      (server as any).messageHandle("on-notab", { param: "value-notab" }, sendResponse, mockSender);

      const extSender = capturedSender!.getExtMessageSender();
      expect(extSender.tabId).toBe(-1);
    });
  });

  describe("Connect 功能测试", () => {
    it("应该能够处理连接消息", async () => {
      const mockHandler = vi.fn();
      let capturedConnection: MessageConnect;

      server.on("on-connect", (params, sender) => {
        if (!sender.isType(GetSenderType.CONNECT)) {
          throw new Error("sender type error");
        }
        capturedConnection = sender.getConnect()!;
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
      (server as any).connectHandle("on-connect", { param: "value-connect" }, mockConnect);

      expect(mockHandler).toHaveBeenCalledWith({ param: "value-connect" }, expect.any(SenderConnect));
      expect(capturedConnection!).toBeDefined();
    });

    it("应该能够通过连接发送消息", async () => {
      let serverConnection: MessageConnect;
      const serverMessageHandler = vi.fn();

      server.on("on-msgconnect", (params, sender) => {
        if (!sender.isType(GetSenderType.CONNECT)) {
          throw new Error("sender type error");
        }
        serverConnection = sender.getConnect()!;
        serverConnection.onMessage(serverMessageHandler);
      });

      const clientConnection = await client.connect({
        action: "api/on-msgconnect",
        data: {},
      });

      // 客户端向服务端发送消息
      clientConnection.sendMessage({ action: "test123", data: "hello from client" });

      // 等待消息处理
      await nextTick();
      await nextTick();

      expect(serverMessageHandler).toHaveBeenCalledWith({ action: "test123", data: "hello from client" });
    });

    it("应该在 enableConnect 为 false 时不处理连接", async () => {
      const serverWithoutConnect = new Server("api", contentMessage, false);
      const mockHandler = vi.fn();

      serverWithoutConnect.on("on-noconnect", mockHandler);

      // 尝试连接应该不会触发处理器
      await client.connect({
        action: "api/on-noconnect",
        data: {},
      });

      expect(mockHandler).not.toHaveBeenCalled();
    });
  });

  describe("边界情况测试", () => {
    it.concurrent("应该能够处理空参数", async () => {
      const mockHandler = vi.fn().mockResolvedValue("empty response");

      server.on("on-empty", mockHandler);

      const response = await client.sendMessage({
        action: "api/on-empty",
        data: null,
      });

      expect(mockHandler).toHaveBeenCalledWith(null, expect.any(SenderRuntime));
      expect(response.code).toBe(0);
      expect(response.data).toBe("empty response");
    });

    it.concurrent("应该能够处理复杂的数据类型", async () => {
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

      server.on("on-complex", mockHandler);

      const response = await client.sendMessage({
        action: "api/on-complex",
        data: complexData,
      });

      expect(response.code).toBe(0);
      expect(response.data).toEqual(complexData);
    });

    it.concurrent("应该能够处理返回 undefined 的函数", async () => {
      const mockHandler = vi.fn().mockReturnValue(undefined);

      server.on("on-undefined", mockHandler);

      const response = await client.sendMessage({
        action: "api/on-undefined",
        data: {},
      });

      expect(response.code).toBe(0);
      expect(response.data).toBeUndefined();
    });
  });
});
