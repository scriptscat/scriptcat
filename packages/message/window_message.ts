import { v4 as uuidv4 } from "uuid";
import { Message, MessageConnect, MessageSend } from "./server";

// 通过 window.postMessage/onmessage 实现通信

import EventEmitter from "eventemitter3";

export interface PostMessage {
  postMessage(message: any): void;
}

class WindowPostMessage implements PostMessage {
  constructor(private target: Window) {}

  postMessage(message: any) {
    this.target.postMessage(message, "*");
  }
}

// 消息体
export type WindowMessageBody = {
  messageId: string; // 消息id
  type: "sendMessage" | "respMessage" | "connect" | "disconnect" | "connectMessage"; // 消息类型
  data: any; // 消息数据
};

export class WindowMessage implements Message {
  EE: EventEmitter = new EventEmitter();

  // source: Window 消息来源
  // target: Window 消息目标
  constructor(
    private source: Window,
    private target: Window,
    private serviceWorker?: boolean
  ) {
    // 监听消息
    this.source.addEventListener("message", (e) => {
      if (e.source === this.target || e.source === this.source) {
        this.messageHandle(e.data, new WindowPostMessage(this.target));
      }
    });
    // 是否监听serviceWorker消息
    if (this.serviceWorker) {
      navigator.serviceWorker.addEventListener("message", (e) => {
        if (e.source) {
          this.messageHandle(e.data, e.source as Window);
        }
      });
    }
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

  onConnect(callback: (data: any, con: MessageConnect) => void) {
    this.EE.addListener("connect", callback);
  }

  connect(data: any): Promise<MessageConnect> {
    return new Promise((resolve) => {
      const body: WindowMessageBody = {
        messageId: uuidv4(),
        type: "connect",
        data,
      };
      this.target.postMessage(body, "*");
      resolve(new WindowMessageConnect(body.messageId, this.EE, this.target));
    });
  }

  onMessage(callback: (data: any, sendResponse: (data: any) => void) => void) {
    this.EE.addListener("message", callback);
  }

  // 发送消息 注意不进行回调的内存泄漏
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
      this.target.postMessage(body, "*");
    });
  }
}

export class WindowMessageConnect implements MessageConnect {
  constructor(
    private messageId: string,
    private EE: EventEmitter,
    private target: PostMessage
  ) {
    this.onDisconnect(() => {
      // 移除所有监听
      this.EE.removeAllListeners("connectMessage:" + this.messageId);
      this.EE.removeAllListeners("disconnect:" + this.messageId);
    });
  }

  sendMessage(data: any) {
    const body: WindowMessageBody = {
      messageId: this.messageId,
      type: "connectMessage",
      data,
    };
    this.target.postMessage(body);
  }

  onMessage(callback: (data: any) => void) {
    this.EE.addListener("connectMessage:" + this.messageId, callback);
  }

  disconnect() {
    const body: WindowMessageBody = {
      messageId: this.messageId,
      type: "disconnect",
      data: null,
    };
    this.target.postMessage(body);
  }

  onDisconnect(callback: () => void) {
    this.EE.addListener("disconnect:" + this.messageId, callback);
  }
}

// service_worker和offscreen同时监听消息,会导致消息被两边同时接收,但是返回结果时会产生问题,导致报错
// 不进行监听的话又无法从service_worker主动发送消息
// 所以service_worker与offscreen使用ServiceWorker的方式进行通信
export class ServiceWorkerMessageSend implements MessageSend {
  EE: EventEmitter = new EventEmitter();

  private target: PostMessage | undefined = undefined;

  constructor() {}

  async init() {
    if (!this.target) {
      const list = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
      this.target = list[0];
      self.addEventListener("message", (e) => {
        this.messageHandle(e.data);
      });
    }
  }

  messageHandle(data: WindowMessageBody) {
    // 处理消息
    if (data.type === "respMessage") {
      // 接收到响应消息
      this.EE.emit("response:" + data.messageId, data);
    } else if (data.type === "disconnect") {
      this.EE.emit("disconnect:" + data.messageId);
    } else if (data.type === "connectMessage") {
      this.EE.emit("connectMessage:" + data.messageId, data.data);
    }
  }

  async connect(data: any): Promise<MessageConnect> {
    await this.init();
    const body: WindowMessageBody = {
      messageId: uuidv4(),
      type: "connect",
      data,
    };
    this.target!.postMessage(body);
    return new WindowMessageConnect(body.messageId, this.EE, this.target!);
  }

  // 发送消息 注意不进行回调的内存泄漏
  async sendMessage(data: any): Promise<any> {
    await this.init();
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
      this.target!.postMessage(body);
    });
  }
}
