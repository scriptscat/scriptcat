import { Server } from "@Packages/message/server";
import type {
  IOffscreenSend,
  Message,
  MessageConnect,
  MessageSend,
  RuntimeMessageSender,
  TMessage,
} from "@Packages/message/types";
import { WindowMessage } from "@Packages/message/window_message";
import EventEmitter from "eventemitter3";
import { type IMessageQueue } from "@Packages/message/message_queue";
import { ServiceWorkerClient } from "../service_worker/client";
import { BackgroundEnvManagerBase } from "./base";
import { startFirefoxEventPageKeepAliveLoop } from "./keep_alive";

class InProcessMessageConnect implements MessageConnect {
  private messages = new EventEmitter<string, any>();

  private disconnects = new EventEmitter<string, any>();

  private disconnected = false;

  peer?: InProcessMessageConnect;

  onMessage(callback: (data: TMessage) => void): void {
    this.messages.on("message", callback);
  }

  sendMessage(data: TMessage): void {
    if (!this.disconnected) {
      this.peer?.messages.emit("message", data);
    }
  }

  disconnect(): void {
    if (this.disconnected) {
      return;
    }
    this.disconnected = true;
    this.disconnects.emit("disconnect", true);
    if (this.peer && !this.peer.disconnected) {
      this.peer.disconnected = true;
      this.peer.disconnects.emit("disconnect", false);
    }
  }

  onDisconnect(callback: (isSelfDisconnected: boolean) => void): void {
    this.disconnects.on("disconnect", callback);
  }
}

// Firefox MV3 的 event page 同时承担 service worker 与 offscreen 两个角色，二者处在同一
// JavaScript 上下文。runtime messaging 不会把消息回送给发送者所在的 frame，因此这里用
// EventEmitter 实现进程内的 Message / MessageSend。service_worker.ts 用它承载 offscreen → SW；
// EventPageOffscreenManager 内部的实例承载 SW → offscreen。
export class InProcessMessage implements Message, MessageSend {
  private events = new EventEmitter<string, any>();

  connect(data: TMessage): Promise<MessageConnect> {
    const client = new InProcessMessageConnect();
    const server = new InProcessMessageConnect();
    client.peer = server;
    server.peer = client;
    queueMicrotask(() => {
      this.events.emit("connect", data, server);
    });
    return Promise.resolve(client);
  }

  sendMessage<T = any>(data: TMessage): Promise<T> {
    return new Promise((resolve) => {
      this.events.emit("message", data, resolve, {} as RuntimeMessageSender);
    });
  }

  onConnect(callback: (data: TMessage, con: MessageConnect) => void): void {
    this.events.on("connect", callback);
  }

  onMessage(
    callback: (data: TMessage, sendResponse: (data: any) => void, sender: RuntimeMessageSender) => boolean | void
  ): void {
    this.events.on("message", callback);
  }
}

export class EventPageOffscreenManager extends BackgroundEnvManagerBase implements IOffscreenSend {
  private readonly message: InProcessMessage;
  private initialized = false;

  constructor(
    extMsgSender: MessageSend,
    // Firefox 的 SW 与 offscreen 共处同一 frame，runtime.sendMessage 广播不会回送给发送者；
    // 因此必须注入 SW 已有的队列，让 publish() 的本地 EventEmitter 完成分发。
    // Chrome 的独立 offscreen 文档仍由 BackgroundEnvManagerBase 使用默认队列。
    messageQueue: IMessageQueue
  ) {
    if (typeof document !== "object" || !document?.documentElement) {
      throw new Error("EventPageOffscreenManager requires a DOM-capable Firefox MV3 Event Page.");
    }

    const sandbox = document.createElement("iframe");
    sandbox.src = chrome.runtime.getURL("/src/sandbox.html");
    sandbox.style.display = "none";
    document.documentElement.appendChild(sandbox);

    startFirefoxEventPageKeepAliveLoop();

    const message = new InProcessMessage();

    // iframe 创建后会从 about:blank 导航到跨源 sandbox 页面。惰性读取 contentWindow，避免
    // 在导航前固定目标引用，并在 iframe 被移除时给出明确错误。
    const windowMessage = new WindowMessage(window, () => {
      const win = sandbox.contentWindow;
      if (!win) {
        throw new Error("EventPageOffscreenManager: sandbox iframe has no contentWindow (removed from DOM?).");
      }
      return win;
    });
    const offscreenServer = new Server("offscreen", [message, windowMessage]);
    const serviceWorker = new ServiceWorkerClient(extMsgSender);

    super(extMsgSender, windowMessage, offscreenServer, serviceWorker, messageQueue);
    this.message = message;
  }

  init() {
    if (this.initialized) {
      return;
    }
    this.initialized = true;
    return super.initManager();
  }

  connect(data: TMessage): Promise<MessageConnect> {
    return this.message.connect(data);
  }

  sendMessage<T = any>(data: TMessage): Promise<T> {
    return this.message.sendMessage<T>(data);
  }
}
