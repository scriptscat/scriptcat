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
    this.disconnects.emit("disconnect");
    if (this.peer && !this.peer.disconnected) {
      this.peer.disconnected = true;
      this.peer.disconnects.emit("disconnect");
    }
  }

  onDisconnect(callback: () => void): void {
    this.disconnects.on("disconnect", callback);
  }
}

class InProcessMessage implements Message, MessageSend {
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

  constructor(extMsgSender: MessageSend) {
    if (typeof document !== "object" || !document?.documentElement) {
      throw new Error("EventPageOffscreenManager requires a DOM-capable Firefox MV3 Event Page.");
    }

    const sandbox = document.createElement("iframe");
    sandbox.src = chrome.runtime.getURL("src/sandbox.html");
    sandbox.style.display = "none";
    document.documentElement.appendChild(sandbox);

    const target = sandbox.contentWindow;
    if (!target) {
      throw new Error("EventPageOffscreenManager failed to create sandbox iframe.");
    }

    const message = new InProcessMessage();

    const windowMessage = new WindowMessage(window, target);
    const offscreenServer = new Server("offscreen", [message, windowMessage]);
    const serviceWorker = new ServiceWorkerClient(extMsgSender);

    super(extMsgSender, windowMessage, offscreenServer, serviceWorker);
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
