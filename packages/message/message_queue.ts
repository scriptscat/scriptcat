import EventEmitter from "eventemitter3";
import LoggerCore from "@App/app/logger/core";
import { type TMessage } from "./types";

export type TKeyValue = { key: string; value: string };

export type SubscribeCallback = (message: NonNullable<any>) => void;
// 释放订阅
export type Unsubscribe = () => void;

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

  handler(topic: string, { action, message }: { action: string; message: NonNullable<any> }) {
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
}
