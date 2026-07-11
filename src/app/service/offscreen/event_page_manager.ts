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

// 同一脚本内的进程内消息桥接：Firefox MV3 下事件页本身兼任 offscreen 角色，与 SW 是同一个
// 脚本/进程，彼此之间不能通过 chrome.runtime.sendMessage/connect 通讯——自己发给自己会报
// "Could not establish connection. Receiving end does not exist."。导出给 service_worker.ts
// 用来搭建 offscreen -> SW 方向的桥接(SW -> offscreen 方向见本文件下方 EventPageOffscreenManager
// 内部已有的同名用法)。
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
    // 与 SW 是同一个脚本/进程时必须共用同一个 MessageQueue 实例：chrome.runtime.sendMessage 广播
    // 不会送达发送方自己所在的 frame，两边各自新建 MessageQueue 会导致互相收不到广播
    // (enableScripts/deleteScripts/installScript/setSandboxLanguage 全部失效，crontab 定时脚本
    // 也因此从不会被自动调度)。见 BackgroundEnvManagerBase 构造函数中 messageQueue 参数的说明。
    messageQueue: IMessageQueue
  ) {
    if (typeof document !== "object" || !document?.documentElement) {
      throw new Error("EventPageOffscreenManager requires a DOM-capable Firefox MV3 Event Page.");
    }

    const sandbox = document.createElement("iframe");
    sandbox.src = chrome.runtime.getURL("/src/sandbox.html");
    sandbox.style.display = "none";
    document.documentElement.appendChild(sandbox);

    const message = new InProcessMessage();

    // 不要缓存 sandbox.contentWindow 的快照：刚创建的 iframe 此刻仍是初始的 about:blank 文档，
    // 之后才会导航到真正的 sandbox 页面(manifest sandbox 页在 Firefox 154+ 下是跨源 iframe)。
    // 缓存的 WindowProxy 引用在跨源导航后是否仍与消息事件的 e.source 全等属于浏览器实现细节，
    // 不应依赖；因此传入惰性求值函数，每次发送/比对都重新读取 contentWindow，并在读取时校验非空
    // (覆盖 iframe 之后被移除等场景)。
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
