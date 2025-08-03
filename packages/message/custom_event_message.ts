import type { Message, MessageConnect, TMessage } from "./types";
import { v4 as uuidv4 } from "uuid";
import { type PostMessage, type WindowMessageBody, WindowMessageConnect } from "./window_message";
import LoggerCore from "@App/app/logger/core";
import EventEmitter from "eventemitter3";

export class CustomEventPostMessage implements PostMessage {
  constructor(private send: CustomEventMessage) {}

  postMessage<T = any>(message: T): void {
    this.send.nativeSend(message);
  }
}

// 使用CustomEvent来进行通讯, 可以在content与inject中传递一些dom对象
export class CustomEventMessage implements Message {
  EE = new EventEmitter<string, any>();

  // 关联dom目标
  relatedTarget: Map<number, EventTarget> = new Map();

  constructor(
    protected flag: string,
    protected isContent: boolean
  ) {
    window.addEventListener((isContent ? "ct" : "fd") + flag, (event) => {
      if (event instanceof MouseEvent) {
        this.relatedTarget.set(event.movementX, event.relatedTarget!);
        return;
      } else if (event instanceof CustomEvent) {
        this.messageHandle(event.detail, new CustomEventPostMessage(this));
      }
    });
  }

  messageHandle(data: WindowMessageBody, target: PostMessage) {
    // 处理消息
    if (data.type === "sendMessage") {
      // 接收到消息
      this.EE.emit("message", data.data, (resp: any) => {
        // 发送响应消息
        // 无消息id则不发送响应消息
        if (!data.messageId) {
          return;
        }
        const body: WindowMessageBody = {
          messageId: data.messageId,
          type: "respMessage",
          data: resp,
        };
        target.postMessage(body);
      });
    } else if (data.type === "respMessage") {
      // 接收到响应消息
      this.EE.emit(`response:${data.messageId}`, data);
    } else if (data.type === "connect") {
      this.EE.emit("connect", data.data, new WindowMessageConnect(data.messageId, this.EE, target));
    } else if (data.type === "disconnect") {
      this.EE.emit(`disconnect:${data.messageId}`);
    } else if (data.type === "connectMessage") {
      this.EE.emit(`connectMessage:${data.messageId}`, data.data);
    }
  }

  onConnect(callback: (data: TMessage, con: MessageConnect) => void): void {
    this.EE.addListener("connect", callback);
  }

  onMessage(callback: (data: TMessage, sendResponse: (data: any) => void) => void): void {
    this.EE.addListener("message", callback);
  }

  connect(data: TMessage): Promise<MessageConnect> {
    return new Promise((resolve) => {
      const body: WindowMessageBody<TMessage> = {
        messageId: uuidv4(),
        type: "connect",
        data,
      };
      this.nativeSend(body);
      // EventEmitter3 採用同步事件设计，callback会被马上执行而不像传统javascript架构以下一个macrotask 执行
      resolve(new WindowMessageConnect(body.messageId, this.EE, new CustomEventPostMessage(this)));
    });
  }

  nativeSend(detail: any) {
    if (typeof cloneInto !== "undefined") {
      try {
        LoggerCore.logger().info("nativeSend");
        detail = cloneInto(detail, document.defaultView);
      } catch (e) {
        console.log(e);
        LoggerCore.logger().info("error data");
      }
    }

    const ev = new CustomEvent((this.isContent ? "fd" : "ct") + this.flag, {
      detail,
    });
    window.dispatchEvent(ev);
  }

  sendMessage<T = any>(data: TMessage): Promise<T> {
    return new Promise((resolve: ((value: T) => void) | null) => {
      const body: WindowMessageBody<TMessage> = {
        messageId: uuidv4(),
        type: "sendMessage",
        data,
      };
      const eventId = `response:${body.messageId}`;
      let callback: EventEmitter.EventListener<string, any> | null = (body: WindowMessageBody<TMessage>) => {
        if (callback !== null) {
          this.EE.removeListener(eventId, callback);
          resolve!(body.data as T);
          callback = null; // 设为 null 提醒JS引擎可以GC
          resolve = null;
        }
      };
      this.EE.addListener(eventId, callback);
      this.nativeSend(body);
    });
  }

  // 同步发送消息
  // 与content页的消息通讯实际是同步,此方法不需要经过background
  // 但是请注意中间不要有promise
  syncSendMessage(data: TMessage): TMessage {
    const body: WindowMessageBody<TMessage> = {
      messageId: uuidv4(),
      type: "sendMessage",
      data,
    };
    let ret: TMessage;
    const eventId = `response:${body.messageId}`;
    let callback: EventEmitter.EventListener<string, any> | null = (body: WindowMessageBody<TMessage>) => {
      if (callback !== null) {
        this.EE.removeListener(eventId, callback);
        ret = body.data!;
        callback = null; // 设为 null 提醒JS引擎可以GC
      }
    };
    this.EE.addListener(eventId, callback);
    this.nativeSend(body);
    return ret!;
  }

  relateId = 0;

  sendRelatedTarget(target: EventTarget): number {
    // 特殊处理relatedTarget，返回id进行关联
    // 先将relatedTarget转换成id发送过去
    const id = ++this.relateId;
    // 可以使用此种方式交互element
    const ev = new MouseEvent((this.isContent ? "fd" : "ct") + this.flag, {
      movementX: id,
      relatedTarget: target,
    });
    window.dispatchEvent(ev);
    return id;
  }

  getAndDelRelatedTarget(id: number) {
    const target = this.relatedTarget.get(id);
    this.relatedTarget.delete(id);
    return target;
  }
}
