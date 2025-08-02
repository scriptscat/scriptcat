import EventEmitter from "eventemitter3";
import LoggerCore from "@App/app/logger/core";

export type SubscribeCallback = (message: any) => void;
// 释放订阅
export type Unsubscribe = () => void;

// 消息队列
export class MessageQueue {
  private EE: EventEmitter = new EventEmitter();

  constructor() {
    chrome.runtime.onMessage.addListener((msg) => {
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

  subscribe(topic: string, handler: SubscribeCallback): Unsubscribe {
    this.EE.on(topic, handler);
    return () => {
      this.EE.off(topic, handler);
    };
  }

  publish(topic: string, message: any) {
    chrome.runtime.sendMessage({
      msgQueue: topic,
      data: { action: "message", message },
    });
    this.EE.emit(topic, message);
    LoggerCore.getInstance().logger({ service: "messageQueue" }).trace("publish", { topic, message });
  }

  // 只发布给当前环境
  emit(topic: string, message: any) {
    this.EE.emit(topic, message);
  }
}
