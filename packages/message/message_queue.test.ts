import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MessageQueue, MessageQueueGroup, type IMessageQueue } from "./message_queue";

// Mock LoggerCore
vi.mock("@App/app/logger/core", () => ({
  default: {
    getInstance: () => ({
      logger: () => ({
        trace: vi.fn(),
      }),
    }),
  },
}));

const nextTick = () => Promise.resolve().then(() => {});

describe("MessageQueueGroup", () => {
  let messageQueue: IMessageQueue;

  beforeEach(() => {
    messageQueue = new MessageQueue();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("基本功能测试", () => {
    it.concurrent("应该能够创建分组", () => {
      const group = messageQueue.group("api-group");
      expect(group).toBeInstanceOf(MessageQueueGroup);
    });

    it.concurrent("应该能够在分组中订阅和发布消息", () => {
      const group = messageQueue.group("api-sendBasic");
      const handler = vi.fn();

      group.subscribe("user1", handler);
      group.emit("user1", { id: 1, name: "test" });

      expect(handler).toHaveBeenCalledWith({ id: 1, name: "test" });
    });

    it.concurrent("应该自动为分组名称添加斜杠", () => {
      const group1 = messageQueue.group("group1");
      const group2 = messageQueue.group("group2/");

      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();
      const handler4 = vi.fn();

      group1.subscribe("test1", handler1);
      group2.subscribe("test1", handler2);
      group1.subscribe("test2", handler3);
      group2.subscribe("test2", handler4);

      // 直接通过 messageQueue 发布消息来验证主题名称
      messageQueue.emit("group1/test1", "message1");
      messageQueue.emit("group2/test1", "message2");

      expect(handler1).toHaveBeenCalledWith("message1");
      expect(handler2).toHaveBeenCalledWith("message2");

      expect(handler3).not.toHaveBeenCalled();
      expect(handler4).not.toHaveBeenCalled();
    });

    it.concurrent("应该能够创建嵌套分组", () => {
      const apiGroup = messageQueue.group("api-groupNested");
      const userGroup = apiGroup.group("user2");
      const profileGroup = userGroup.group("profile");

      const handler = vi.fn();
      profileGroup.subscribe("get1", handler);

      profileGroup.emit("get1", { userId: 123 });

      expect(handler).toHaveBeenCalledWith({ userId: 123 });
    });
  });

  describe("中间件功能测试", () => {
    it.concurrent("应该能够添加和执行中间件", async () => {
      const middlewareOrder: string[] = [];

      const middleware = vi.fn((topic: string, message: any, next: () => void) => {
        middlewareOrder.push("middleware-before");
        next();
        middlewareOrder.push("middleware-after");
      });

      const group = messageQueue.group("api-middleware", middleware);

      const handler = vi.fn(() => {
        middlewareOrder.push("handler-middle");
      });

      group.subscribe("good", handler);

      // 等待异步操作
      group.emit("good", { data: "bye" });

      await nextTick();
      await nextTick();

      expect(middlewareOrder).toEqual(["middleware-before", "handler-middle", "middleware-after"]);
      expect(middleware).toHaveBeenCalledWith("api-middleware/good", { data: "bye" }, expect.any(Function));
      expect(handler).toHaveBeenCalledWith({ data: "bye" });
    });

    it.concurrent("应该能够使用 use 方法添加中间件", async () => {
      const middlewareOrder: string[] = [];

      const middleware1 = vi.fn((topic: string, message: any, next: () => void) => {
        middlewareOrder.push("middleware1-before");
        next();
        middlewareOrder.push("middleware1-after");
      });

      const middleware2 = vi.fn((topic: string, message: any, next: () => void) => {
        middlewareOrder.push("middleware2-before");
        next();
        middlewareOrder.push("middleware2-after");
      });

      const group = messageQueue.group("group-08").use(middleware1).use(middleware2);

      const handler = vi.fn(() => {
        middlewareOrder.push("handler-08");
      });

      group.subscribe("test-08", handler);
      group.emit("test-08", { data: "test-08" });

      await nextTick();
      await nextTick();

      expect(middlewareOrder).toEqual([
        "middleware1-before",
        "middleware2-before",
        "handler-08",
        "middleware2-after",
        "middleware1-after",
      ]);
    });

    it.concurrent("子分组应该继承父分组的中间件", async () => {
      const middlewareOrder: string[] = [];

      const parentMiddleware = vi.fn((topic: string, message: any, next: () => void) => {
        middlewareOrder.push("parent-middleware");
        next();
      });

      const childMiddleware = vi.fn((topic: string, message: any, next: () => void) => {
        middlewareOrder.push("child-middleware");
        next();
      });

      const parentGroup = messageQueue.group("parent", parentMiddleware);
      const childGroup = parentGroup.group("child", childMiddleware);

      const handler = vi.fn(() => {
        middlewareOrder.push("handler-09");
      });

      childGroup.subscribe("test-09", handler);
      childGroup.emit("test-09", { data: "test-09" });

      await nextTick();
      await nextTick();

      expect(middlewareOrder).toEqual(["parent-middleware", "child-middleware", "handler-09"]);
    });

    it.concurrent("应该支持异步中间件", async () => {
      const asyncMiddleware = vi.fn(async (topic: string, message: any, next: () => void) => {
        await nextTick();
        next();
      });

      const group = messageQueue.group("api-middlewareAsync", asyncMiddleware);
      const handler = vi.fn();

      group.subscribe("test4", handler);
      group.emit("test4", { data: "test4" });

      // 等待异步操作完成
      await nextTick();
      await nextTick();

      expect(asyncMiddleware).toHaveBeenCalled();
      expect(handler).toHaveBeenCalledWith({ data: "test4" });
    });
  });

  describe("发布方法测试", () => {
    it("publish 方法应该使用 chrome.runtime.sendMessage", () => {
      const group = messageQueue.group("api-sendChromeMessage");

      const sendSpy = vi.spyOn(chrome.runtime, "sendMessage");
      group.publish("test-sendChromeMessage", { data: "test-sendChromeMessage" });

      expect(sendSpy).toHaveBeenCalledWith({
        msgQueue: "api-sendChromeMessage/test-sendChromeMessage",
        data: { action: "message", message: { data: "test-sendChromeMessage" } },
      });
    });

    it("emit 方法应该只在本地发布", () => {
      const group = messageQueue.group("api-emitLocal");
      const handler = vi.fn();

      const sendSpy = vi.spyOn(chrome.runtime, "sendMessage"); // 不能 concurrent
      group.subscribe("test-emitLocal", handler);
      group.emit("test-emitLocal", { data: "test-emitLocal" });

      expect(handler).toHaveBeenCalledWith({ data: "test-emitLocal" });
      expect(sendSpy).not.toHaveBeenCalled();
    });
  });

  describe("取消订阅功能", () => {
    it.concurrent("应该能够取消订阅", () => {
      const group = messageQueue.group("api-unsubscribe");
      const handler = vi.fn();

      const unsubscribe = group.subscribe("test-unsubscribe", handler);

      // 发布消息，应该收到
      group.emit("test-unsubscribe", { data: "test1" });
      expect(handler).toHaveBeenCalledWith({ data: "test1" });

      // 取消订阅
      unsubscribe();

      // 再次发布消息，不应该收到
      group.emit("test-unsubscribe", { data: "test2" });
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe("边界情况测试", () => {
    it.concurrent("没有中间件的分组应该正常工作", () => {
      const group = messageQueue.group("api-groupNoMiddleware");
      const handler = vi.fn();

      group.subscribe("test-groupNoMiddleware", handler);
      group.emit("test-groupNoMiddleware", { data: "test-groupNoMiddleware" });

      expect(handler).toHaveBeenCalledWith({ data: "test-groupNoMiddleware" });
    });

    it.concurrent("应该能够处理复杂的数据类型", () => {
      const group = messageQueue.group("api-complexPayload");
      const handler = vi.fn();

      const complexData = {
        array: [1, 2, 3],
        object: { nested: true },
        number: 42,
        string: "test-complexPayload",
        boolean: true,
        null: null,
        undefined: undefined,
      };

      group.subscribe("test-complexPayload", handler);
      group.emit("test-complexPayload", complexData);

      expect(handler).toHaveBeenCalledWith(complexData);
    });
  });
});
