import type {
  Message,
  MessageConnect,
  MessageSend,
  OnConnectCallback,
  OnMessageCallback,
  RuntimeMessageSender,
  TMessage,
} from "./types";
import { uuidv4 } from "@App/pkg/utils/uuid";
import EventEmitter from "eventemitter3";

const listenerMgr = new EventEmitter<string, any>(); // 单一管理器

// 通过 window.postMessage/onmessage 实现通信

export interface PostMessage {
  postMessage<T = any>(message: T): void;
}

class WindowPostMessage implements PostMessage {
  constructor(private target: Window) {}

  postMessage<T = any>(message: T): void {
    this.target.postMessage(message, "*");
  }
}

// 消息体
export type WindowMessageBody<T = any> = {
  messageId: string; // 消息id
  type: "sendMessage" | "respMessage" | "connect" | "disconnect" | "connectMessage"; // 消息类型
  data: T | null; // 消息数据
};

export class WindowMessage implements Message {
  EE = new EventEmitter<string, any>();

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

  connect(data: TMessage): Promise<MessageConnect> {
    return new Promise((resolve) => {
      const body: WindowMessageBody<TMessage> = {
        messageId: uuidv4(),
        type: "connect",
        data,
      };
      this.target.postMessage(body, "*");
      resolve(new WindowMessageConnect(body.messageId, this.EE, this.target));
    });
  }

  onMessage(
    callback: (data: TMessage, sendResponse: (data: any) => void, sender: RuntimeMessageSender) => boolean | void
  ): void {
    this.EE.addListener("message", callback);
  }

  // 发送消息 注意不进行回调的内存泄漏
  sendMessage<T = any>(data: TMessage): Promise<T> {
    return new Promise((resolve: ((value: T) => void) | null) => {
      const messageId = uuidv4();
      const body: WindowMessageBody<TMessage> = {
        messageId,
        type: "sendMessage",
        data,
      };
      const eventId = `response:${messageId}`;
      this.EE.addListener(eventId, (body: WindowMessageBody<TMessage>) => {
        this.EE.removeAllListeners(eventId);
        resolve!(body.data as T);
        resolve = null; // 设为 null 提醒JS引擎可以GC
      });
      this.target.postMessage(body, "*");
    });
  }
}

export class WindowMessageConnect implements MessageConnect {
  private readonly listenerId = `${uuidv4()}`; // 使用 uuidv4 确保唯一
  private target: PostMessage | null;
  private isSelfDisconnected = false;

  constructor(
    private messageId: string,
    EE: EventEmitter<string, any>,
    target: PostMessage
  ) {
    this.target = target; // 强引用
    const handler = (msg: TMessage) => {
      listenerMgr.emit(`onMessage:${this.listenerId}`, msg);
    };
    const cleanup = () => {
      if (this.target) {
        this.target = null;
        listenerMgr.removeAllListeners(`cleanup:${this.listenerId}`);
        EE.removeAllListeners("connectMessage:" + this.messageId); // 模拟 con.onMessage.removeListener
        EE.removeAllListeners("disconnect:" + this.messageId); // 模拟 con.onDisconnect.removeListener
        listenerMgr.emit(`onDisconnect:${this.listenerId}`, this.isSelfDisconnected);
        listenerMgr.removeAllListeners(`onDisconnect:${this.listenerId}`);
        listenerMgr.removeAllListeners(`onMessage:${this.listenerId}`);
      }
    };
    EE.addListener(`connectMessage:${this.messageId}`, handler); // 模拟 con.onMessage.addListener
    EE.addListener(`disconnect:${this.messageId}`, cleanup); // 模拟 con.onDisconnect.addListener
    listenerMgr.once(`cleanup:${this.listenerId}`, cleanup);
  }

  sendMessage(data: TMessage) {
    if (!this.target) {
      console.error("Attempted to sendMessage on a disconnected Target.");
      // 無法 sendMessage 不应该屏蔽错误
      throw new Error("Attempted to sendMessage on a disconnected Target.");
    }
    const body: WindowMessageBody<TMessage> = {
      messageId: this.messageId,
      type: "connectMessage",
      data,
    };
    this.target.postMessage(body);
  }

  onMessage(callback: (data: TMessage) => void) {
    if (!this.target) {
      console.error("onMessage Invalid Target");
      // 無法監聽的話不应该屏蔽错误
      throw new Error("onMessage Invalid Target");
    }
    listenerMgr.addListener(`onMessage:${this.listenerId}`, callback);
  }

  disconnect() {
    if (!this.target) {
      console.warn("Attempted to disconnect on a disconnected Target.");
      // 重复 disconnect() 不应该屏蔽错误
      throw new Error("Attempted to disconnect on a disconnected Target.");
    }
    this.isSelfDisconnected = true;
    const body: WindowMessageBody<TMessage> = {
      messageId: this.messageId,
      type: "disconnect",
      data: null,
    };
    this.target.postMessage(body);
    // Note: .disconnect() will NOT automatically trigger the 'cleanup' listener
    listenerMgr.emit(`cleanup:${this.listenerId}`);
  }

  onDisconnect(callback: (isSelfDisconnected: boolean) => void) {
    if (!this.target) {
      console.error("onDisconnect Invalid Target");
      // 無法監聽的話不应该屏蔽错误
      throw new Error("onDisconnect Invalid Target");
    }
    listenerMgr.once(`onDisconnect:${this.listenerId}`, callback);
  }
}

// service_worker和offscreen同时监听消息,会导致消息被两边同时接收,但是返回结果时会产生问题,导致报错
// 不进行监听的话又无法从service_worker主动发送消息
// 所以service_worker与offscreen使用ServiceWorker的方式进行通信
// 现在同时支持接收来自offscreen的请求(实现完整Message接口),使双向通道都走postMessage(结构化克隆,支持Blob)
export class ServiceWorkerMessageSend implements Message {
  EE = new EventEmitter<string, any>();

  private target: PostMessage | undefined = undefined;

  constructor() {
    // 在构造函数中设置监听,确保能接收来自offscreen的请求
    self.addEventListener("message", (e: MessageEvent) => {
      this.messageHandle(e.data, e.source as PostMessage);
    });
  }

  async init() {
    if (!this.target && self.clients) {
      const list = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
      // 找到offscreen.html窗口
      this.target = list.find((client) => client.url == chrome.runtime.getURL("src/offscreen.html")) as PostMessage;
    }
  }

  messageHandle(data: WindowMessageBody, source?: PostMessage) {
    // 处理消息
    if (data.type === "sendMessage" && source) {
      // 接收到来自offscreen的请求消息
      // 第三个参数传空对象作为sender,避免Server中SenderRuntime访问undefined属性
      // 空对象经过getExtMessageSender()会得到tabId=-1等值,表示后台脚本
      this.EE.emit(
        "message",
        data.data,
        (resp: any) => {
          if (!data.messageId) {
            return;
          }
          const body: WindowMessageBody = {
            messageId: data.messageId,
            type: "respMessage",
            data: resp,
          };
          source.postMessage(body);
        },
        {} as RuntimeMessageSender
      );
    } else if (data.type === "connect" && source) {
      // 接收到来自offscreen的连接请求
      this.EE.emit("connect", data.data, new WindowMessageConnect(data.messageId, this.EE, source));
    } else if (data.type === "respMessage") {
      // 接收到响应消息
      this.EE.emit(`response:${data.messageId}`, data);
    } else if (data.type === "disconnect") {
      this.EE.emit(`disconnect:${data.messageId}`);
    } else if (data.type === "connectMessage") {
      this.EE.emit(`connectMessage:${data.messageId}`, data.data);
    }
  }

  onMessage(callback: OnMessageCallback): void {
    this.EE.addListener("message", callback);
  }

  onConnect(callback: OnConnectCallback): void {
    this.EE.addListener("connect", callback);
  }

  async connect(data: TMessage): Promise<MessageConnect> {
    await this.init();
    const body: WindowMessageBody<TMessage> = {
      messageId: uuidv4(),
      type: "connect",
      data,
    };
    this.target!.postMessage(body);
    return new WindowMessageConnect(body.messageId, this.EE, this.target!);
  }

  // 发送消息 注意不进行回调的内存泄漏
  async sendMessage<T = any>(data: TMessage): Promise<T> {
    await this.init();
    return new Promise((resolve: ((value: T) => void) | null) => {
      const messageId = uuidv4();
      const body: WindowMessageBody<TMessage> = {
        messageId,
        type: "sendMessage",
        data,
      };
      const eventId = `response:${messageId}`;
      this.EE.addListener(eventId, (body: WindowMessageBody<TMessage>) => {
        this.EE.removeAllListeners(eventId);
        resolve!(body.data as T);
        resolve = null; // 设为 null 提醒JS引擎可以GC
      });
      this.target!.postMessage(body);
    });
  }
}

// Offscreen端通过navigator.serviceWorker向SW发送postMessage消息
// 与ServiceWorkerMessageSend配对使用,实现Offscreen→SW的postMessage通道
// 注意: 扩展offscreen页面的navigator.serviceWorker.controller通常为null,
// 需要通过navigator.serviceWorker.ready获取registration.active
export class ServiceWorkerClientMessage implements MessageSend {
  EE = new EventEmitter<string, any>();

  private sw: ServiceWorker | null = null;
  private swReady: Promise<ServiceWorker>;

  constructor() {
    navigator.serviceWorker.addEventListener("message", (e) => {
      this.messageHandle(e.data);
    });
    // controller在扩展offscreen页面中通常为null,通过ready获取active
    this.sw = navigator.serviceWorker.controller;
    if (this.sw) {
      this.swReady = Promise.resolve(this.sw);
    } else {
      this.swReady = navigator.serviceWorker.ready.then((reg) => {
        this.sw = reg.active!;
        return this.sw;
      });
    }
  }

  messageHandle(data: WindowMessageBody) {
    // 只处理响应类消息,请求类消息由WindowMessage处理
    if (data.type === "respMessage") {
      this.EE.emit(`response:${data.messageId}`, data);
    } else if (data.type === "disconnect") {
      this.EE.emit(`disconnect:${data.messageId}`);
    } else if (data.type === "connectMessage") {
      this.EE.emit(`connectMessage:${data.messageId}`, data.data);
    }
  }

  private postToServiceWorker(message: any) {
    if (this.sw) {
      this.sw.postMessage(message);
    } else {
      // 初始化期间还没获取到SW引用,等待ready后发送
      this.swReady.then((sw) => sw.postMessage(message));
    }
  }

  async connect(data: TMessage): Promise<MessageConnect> {
    const body: WindowMessageBody<TMessage> = {
      messageId: uuidv4(),
      type: "connect",
      data,
    };
    const target: PostMessage = {
      postMessage: (msg) => this.postToServiceWorker(msg),
    };
    this.postToServiceWorker(body);
    return new WindowMessageConnect(body.messageId, this.EE, target);
  }

  sendMessage<T = any>(data: TMessage): Promise<T> {
    return new Promise((resolve: ((value: T) => void) | null) => {
      const messageId = uuidv4();
      const body: WindowMessageBody<TMessage> = {
        messageId,
        type: "sendMessage",
        data,
      };
      const eventId = `response:${messageId}`;
      this.EE.addListener(eventId, (body: WindowMessageBody<TMessage>) => {
        this.EE.removeAllListeners(eventId);
        resolve!(body.data as T);
        resolve = null;
      });
      this.postToServiceWorker(body);
    });
  }
}
