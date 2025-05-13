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

  subscribe(topic: string, handler: SubscribeCallback): Unsubscribe {
    this.EE.on(topic, handler);
    return () => {
      this.EE.off(topic, handler);
    };
  }

  publish(topic: string, message: any) {
    chrome.runtime.sendMessage({
      action: "messageQueue",
      data: { action: "message", topic, message },
    });
    this.EE.emit(topic, message);
    LoggerCore.getInstance().logger({ service: "messageQueue" }).trace("publish", { topic, message });
  }

  // 只发布给当前环境
  emit(topic: string, message: any) {
    this.EE.emit(topic, message);
  }
}
