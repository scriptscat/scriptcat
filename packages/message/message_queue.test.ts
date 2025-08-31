import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MessageQueue, MessageQueueGroup } from "./message_queue";

// Mock chrome.runtime
global.chrome = {
  runtime: {
    onMessage: {
      addListener: vi.fn(),
    },
    sendMessage: vi.fn(),
    lastError: null,
  },
} as any;

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

describe("MessageQueueGroup", () => {
  let messageQueue: MessageQueue;

  beforeEach(() => {
    messageQueue = new MessageQueue();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("基本功能测试", () => {
    it("应该能够创建分组", () => {
      const group = messageQueue.group("test");
      expect(group).toBeInstanceOf(MessageQueueGroup);
    });

    it("应该能够在分组中订阅和发布消息", () => {
      const group = messageQueue.group("api");
      const handler = vi.fn();

      group.subscribe("user", handler);
      group.emit("user", { id: 1, name: "test" });

      expect(handler).toHaveBeenCalledWith({ id: 1, name: "test" });
    });

    it("应该自动为分组名称添加斜杠", () => {
      const group1 = messageQueue.group("group1");
      const group2 = messageQueue.group("group2/");

      const handler1 = vi.fn();
      const handler2 = vi.fn();

      group1.subscribe("test", handler1);
      group2.subscribe("test", handler2);

      // 直接通过 messageQueue 发布消息来验证主题名称
      messageQueue.emit("group1/test", "message1");
      messageQueue.emit("group2/test", "message2");

      expect(handler1).toHaveBeenCalledWith("message1");
      expect(handler2).toHaveBeenCalledWith("message2");
    });

    it("应该能够创建嵌套分组", () => {
      const apiGroup = messageQueue.group("api");
      const userGroup = apiGroup.group("user");
      const profileGroup = userGroup.group("profile");

      const handler = vi.fn();
      profileGroup.subscribe("get", handler);

      profileGroup.emit("get", { userId: 123 });

      expect(handler).toHaveBeenCalledWith({ userId: 123 });
    });
  });

  describe("中间件功能测试", () => {
    it("应该能够添加和执行中间件", async () => {
      const middlewareOrder: string[] = [];

      const middleware = vi.fn((topic: string, message: any, next: () => void) => {
        middlewareOrder.push("middleware-before");
        next();
        middlewareOrder.push("middleware-after");
      });

      const group = messageQueue.group("api", middleware);

      const handler = vi.fn(() => {
        middlewareOrder.push("handler");
      });

      group.subscribe("test", handler);

      // 等待异步操作
      group.emit("test", { data: "test" });

      // 使用 setTimeout 确保异步操作完成
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(middlewareOrder).toEqual(["middleware-before", "handler", "middleware-after"]);
      expect(middleware).toHaveBeenCalledWith("api/test", { data: "test" }, expect.any(Function));
      expect(handler).toHaveBeenCalledWith({ data: "test" });
    });

    it("应该能够使用 use 方法添加中间件", async () => {
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

      const group = messageQueue.group("api").use(middleware1).use(middleware2);

      const handler = vi.fn(() => {
        middlewareOrder.push("handler");
      });

      group.subscribe("test", handler);
      group.emit("test", { data: "test" });

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(middlewareOrder).toEqual([
        "middleware1-before",
        "middleware2-before",
        "handler",
        "middleware2-after",
        "middleware1-after",
      ]);
    });

    it("子分组应该继承父分组的中间件", async () => {
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
        middlewareOrder.push("handler");
      });

      childGroup.subscribe("test", handler);
      childGroup.emit("test", { data: "test" });

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(middlewareOrder).toEqual(["parent-middleware", "child-middleware", "handler"]);
    });

    it("应该支持异步中间件", async () => {
      const asyncMiddleware = vi.fn(async (topic: string, message: any, next: () => void) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        next();
      });

      const group = messageQueue.group("api", asyncMiddleware);
      const handler = vi.fn();

      group.subscribe("test", handler);
      group.emit("test", { data: "test" });

      // 等待异步操作完成
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(asyncMiddleware).toHaveBeenCalled();
      expect(handler).toHaveBeenCalledWith({ data: "test" });
    });
  });

  describe("发布方法测试", () => {
    it("publish 方法应该使用 chrome.runtime.sendMessage", () => {
      const group = messageQueue.group("api");

      group.publish("test", { data: "test" });

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        msgQueue: "api/test",
        data: { action: "message", message: { data: "test" } },
      });
    });

    it("emit 方法应该只在本地发布", () => {
      const group = messageQueue.group("api");
      const handler = vi.fn();

      group.subscribe("test", handler);
      group.emit("test", { data: "test" });

      expect(handler).toHaveBeenCalledWith({ data: "test" });
      expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe("取消订阅功能", () => {
    it("应该能够取消订阅", () => {
      const group = messageQueue.group("api");
      const handler = vi.fn();

      const unsubscribe = group.subscribe("test", handler);

      // 发布消息，应该收到
      group.emit("test", { data: "test1" });
      expect(handler).toHaveBeenCalledWith({ data: "test1" });

      // 取消订阅
      unsubscribe();

      // 再次发布消息，不应该收到
      group.emit("test", { data: "test2" });
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe("边界情况测试", () => {
    it("没有中间件的分组应该正常工作", () => {
      const group = messageQueue.group("api");
      const handler = vi.fn();

      group.subscribe("test", handler);
      group.emit("test", { data: "test" });

      expect(handler).toHaveBeenCalledWith({ data: "test" });
    });

    it("应该能够处理复杂的数据类型", () => {
      const group = messageQueue.group("api");
      const handler = vi.fn();

      const complexData = {
        array: [1, 2, 3],
        object: { nested: true },
        number: 42,
        string: "test",
        boolean: true,
        null: null,
        undefined: undefined,
      };

      group.subscribe("test", handler);
      group.emit("test", complexData);

      expect(handler).toHaveBeenCalledWith(complexData);
    });
  });
});
