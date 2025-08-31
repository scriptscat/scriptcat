import EventEmitter from "eventemitter3";
import LoggerCore from "@App/app/logger/core";
import { type TMessage } from "./types";

export type TKeyValue = { key: string; value: string };

// 中间件函数类型
type MiddlewareFunction<T = any> = (topic: string, message: T, next: () => void) => void | Promise<void>;

// 消息处理函数类型
type MessageHandler<T = any> = (message: T) => void;

// 消息队列
export class MessageQueue {
  private EE = new EventEmitter<string, any>();

  constructor() {
    chrome.runtime.onMessage.addListener((msg: TMessage) => {
      const lastError = chrome.runtime.lastError;
      const topic = msg.msgQueue;
      if (typeof topic !== "string") return;
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.runtime.onMessage:", lastError);
        // 消息API发生错误因此不继续执行
        return false;
      }
      this.handler(topic, msg.data);
    });
  }

  handler(topic: string, { action, message }: { action: string; message: any }) {
    LoggerCore.getInstance()
      .logger({ service: "messageQueue" })
      .trace("messageQueueHandler", { action, topic, message });
    switch (action) {
      case "message":
        this.EE.emit(topic, message);
        break;
      default:
        throw new Error("action not found");
    }
  }

  subscribe<T>(topic: string, handler: (msg: T) => void) {
    this.EE.on(topic, handler);
    return () => {
      this.EE.off(topic, handler);
    };
  }

  publish<T>(topic: string, message: NonNullable<T>) {
    chrome.runtime.sendMessage({
      msgQueue: topic,
      data: { action: "message", message },
    });
    this.EE.emit(topic, message);
    //@ts-ignore
    LoggerCore.getInstance().logger({ service: "messageQueue" }).trace("publish", { topic, message });
  }

  // 只发布给当前环境
  emit<T>(topic: string, message: NonNullable<T>) {
    this.EE.emit(topic, message);
  }

  // 创建分组
  group(name: string, middleware?: MiddlewareFunction) {
    return new MessageQueueGroup(this, name, middleware);
  }
}

// 消息队列分组
export class MessageQueueGroup {
  private middlewares: MiddlewareFunction[] = [];

  constructor(
    private messageQueue: MessageQueue,
    private name: string,
    middleware?: MiddlewareFunction
  ) {
    if (!name.endsWith("/")) {
      this.name += "/";
    }
    if (middleware) {
      this.middlewares.push(middleware);
    }
  }

  // 创建子分组
  group(name: string, middleware?: MiddlewareFunction) {
    const newGroup = new MessageQueueGroup(this.messageQueue, `${this.name}${name}`, middleware);
    // 继承父级的中间件
    newGroup.middlewares = [...this.middlewares, ...newGroup.middlewares];
    return newGroup;
  }

  // 添加中间件
  use(middleware: MiddlewareFunction) {
    this.middlewares.push(middleware);
    return this;
  }

  // 订阅消息
  subscribe<T>(topic: string, handler: MessageHandler<T>) {
    const fullTopic = `${this.name}${topic}`;

    if (this.middlewares.length === 0) {
      // 没有中间件，直接订阅
      return this.messageQueue.subscribe(fullTopic, handler);
    } else {
      // 有中间件，需要包装处理函数
      const wrappedHandler = async (message: T) => {
        let index = 0;

        const next = async (): Promise<void> => {
          if (index < this.middlewares.length) {
            const middleware = this.middlewares[index++];
            const result = middleware(fullTopic, message, next);
            if (result instanceof Promise) {
              await result;
            }
          } else {
            // 所有中间件都执行完毕，执行最终的处理函数
            handler(message);
          }
        };

        await next();
      };

      return this.messageQueue.subscribe(fullTopic, wrappedHandler);
    }
  }

  // 发布消息
  publish<T>(topic: string, message: NonNullable<T>) {
    const fullTopic = `${this.name}${topic}`;
    this.messageQueue.publish(fullTopic, message);
  }

  // 只发布给当前环境
  emit<T>(topic: string, message: NonNullable<T>) {
    const fullTopic = `${this.name}${topic}`;
    this.messageQueue.emit(fullTopic, message);
  }
}
