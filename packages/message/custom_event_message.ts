import { Message, MessageConnect } from "./server";
import { v4 as uuidv4 } from "uuid";
import { PostMessage, WindowMessageBody, WindowMessageConnect } from "./window_message";
import LoggerCore from "@App/app/logger/core";
import EventEmitter from "eventemitter3";

export class CustomEventPostMessage implements PostMessage {
  constructor(private send: CustomEventMessage) {}

  postMessage(message: any): void {
    this.send.nativeSend(message);
  }
}

// 使用CustomEvent来进行通讯, 可以在content与inject中传递一些dom对象
export class CustomEventMessage implements Message {
  EE: EventEmitter = new EventEmitter();

  // 关联dom目标
  relatedTarget: Map<number, EventTarget> = new Map();

  constructor(
    protected flag: string,
    protected isContent: boolean
  ) {
    window.addEventListener((isContent ? "ct" : "fd") + flag, (event) => {
      if (event instanceof MouseEvent) {
        this.relatedTarget.set(event.clientX, event.relatedTarget!);
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
      this.EE.emit("response:" + data.messageId, data);
    } else if (data.type === "connect") {
      this.EE.emit("connect", data.data, new WindowMessageConnect(data.messageId, this.EE, target));
    } else if (data.type === "disconnect") {
      this.EE.emit("disconnect:" + data.messageId);
    } else if (data.type === "connectMessage") {
      this.EE.emit("connectMessage:" + data.messageId, data.data);
    }
  }

  onConnect(callback: (data: any, con: MessageConnect) => void): void {
    this.EE.addListener("connect", callback);
  }

  onMessage(callback: (data: any, sendResponse: (data: any) => void) => void): void {
    this.EE.addListener("message", callback);
  }

  connect(data: any): Promise<MessageConnect> {
    return new Promise((resolve) => {
      const body: WindowMessageBody = {
        messageId: uuidv4(),
        type: "connect",
        data,
      };
      this.nativeSend(body);
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

  sendMessage(data: any): Promise<any> {
    return new Promise((resolve) => {
      const body: WindowMessageBody = {
        messageId: uuidv4(),
        type: "sendMessage",
        data,
      };
      const callback = (body: WindowMessageBody) => {
        this.EE.removeListener("response:" + body.messageId, callback);
        resolve(body.data);
      };
      this.EE.addListener("response:" + body.messageId, callback);
      this.nativeSend(body);
    });
  }

  // 同步发送消息
  // 与content页的消息通讯实际是同步,此方法不需要经过background
  // 但是请注意中间不要有promise
  syncSendMessage(data: any): any {
    const body: WindowMessageBody = {
      messageId: uuidv4(),
      type: "sendMessage",
      data,
    };
    let ret: any;
    const callback = (body: WindowMessageBody) => {
      this.EE.removeListener("response:" + body.messageId, callback);
      ret = body.data;
    };
    this.EE.addListener("response:" + body.messageId, callback);
    this.nativeSend(body);
    return ret;
  }

  relateId = 0;

  sendRelatedTarget(target: EventTarget): number {
    // 特殊处理relatedTarget，返回id进行关联
    // 先将relatedTarget转换成id发送过去
    const id = ++this.relateId;
    // 可以使用此种方式交互element
    const ev = new MouseEvent((this.isContent ? "fd" : "ct") + this.flag, {
      clientX: id,
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
