import EventEmitter from "eventemitter3";
import LoggerCore from "@App/app/logger/core";

export type TKeyValue = { key: string; value: string };

// 释放订阅
export type Unsubscribe = () => void;

// 消息队列
export class MessageQueue {
  private EE = new EventEmitter<string, any>();

  constructor() {
    chrome.runtime.onMessage.addListener((msg) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.runtime.onMessage:", lastError);
        // 消息API发生错误因此不继续执行
        return false;
      }
      if (msg.action === "messageQueue") {
        this.handler(msg.data);
      }
    });
  }

  handler({ action, topic, message }: { action: string; topic: string; message: any }) {
    LoggerCore.getInstance()
      .logger({ service: "messageQueue" })
      .trace("messageQueueHandler", { action, topic, message });
    if (!topic) {
      throw new Error("topic is required");
    }
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

  publish<T>(topic: string, message: T) {
    chrome.runtime.sendMessage({
      action: "messageQueue",
      data: { action: "message", topic, message },
    });
    this.EE.emit(topic, message);
    if (process.env.NODE_ENV === "development") {
      //@ts-ignore
      LoggerCore.getInstance().logger({ service: "messageQueue" }).trace("publish", { topic, message });
    }
  }

  // 只发布给当前环境
  emit<T>(topic: string, message: T) {
    this.EE.emit(topic, message);
  }
}
