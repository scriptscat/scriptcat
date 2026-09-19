import EventEmitter from "eventemitter3";
import { uuidv4 } from "@App/pkg/utils/uuid";
import type {
  Message,
  MessageConnect,
  OnConnectCallback,
  OnMessageCallback,
  RuntimeMessageSender,
  TMessage,
} from "./types";

export type PageMessageRole = "scripting" | "inject";

type PageMessageType = "sendMessage" | "respMessage" | "connect" | "disconnect" | "connectMessage";

type PageMessageBody = {
  readonly channel: string;
  readonly source: PageMessageRole;
  readonly target: PageMessageRole;
  readonly messageId: string;
  readonly type: PageMessageType;
  readonly data: TMessage | null;
};

const nativeReflectApply = Reflect.apply;
const nativeFunctionBind = Function.prototype.bind;

const bindNative = <T extends (...args: any[]) => any>(fn: T, receiver: any): T =>
  nativeReflectApply(nativeFunctionBind, fn, [receiver]) as T;

const listenerMgr = new EventEmitter<string, any>();

const nativeReflectOwnKeys = Reflect.ownKeys;
const nativeObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;

const parsePageMessageBody = (value: unknown): PageMessageBody | undefined => {
  if (value === null || typeof value !== "object") return undefined;

  let channel: unknown;
  let source: unknown;
  let target: unknown;
  let messageId: unknown;
  let type: unknown;
  let data: unknown;
  try {
    const keys = nativeReflectOwnKeys(value);
    if (keys.length !== 6) return undefined;
    // sendEnvelope 按该字面量顺序构造；保留乱序校验作为兼容路径。
    if (
      keys[0] === "channel" &&
      keys[1] === "source" &&
      keys[2] === "target" &&
      keys[3] === "messageId" &&
      keys[4] === "type" &&
      keys[5] === "data"
    ) {
      const channelDescriptor = nativeObjectGetOwnPropertyDescriptor(value, "channel");
      const sourceDescriptor = nativeObjectGetOwnPropertyDescriptor(value, "source");
      const targetDescriptor = nativeObjectGetOwnPropertyDescriptor(value, "target");
      const messageIdDescriptor = nativeObjectGetOwnPropertyDescriptor(value, "messageId");
      const typeDescriptor = nativeObjectGetOwnPropertyDescriptor(value, "type");
      const dataDescriptor = nativeObjectGetOwnPropertyDescriptor(value, "data");
      if (
        !channelDescriptor ||
        !("value" in channelDescriptor) ||
        !sourceDescriptor ||
        !("value" in sourceDescriptor) ||
        !targetDescriptor ||
        !("value" in targetDescriptor) ||
        !messageIdDescriptor ||
        !("value" in messageIdDescriptor) ||
        !typeDescriptor ||
        !("value" in typeDescriptor) ||
        !dataDescriptor ||
        !("value" in dataDescriptor)
      ) {
        return undefined;
      }
      channel = channelDescriptor.value;
      source = sourceDescriptor.value;
      target = targetDescriptor.value;
      messageId = messageIdDescriptor.value;
      type = typeDescriptor.value;
      data = dataDescriptor.value;
    } else {
      let seen = 0;
      for (let index = 0; index < 6; index += 1) {
        const key = keys[index];
        switch (key) {
          case "channel": {
            const descriptor = nativeObjectGetOwnPropertyDescriptor(value, key);
            if (!descriptor || !("value" in descriptor)) return undefined;
            channel = descriptor.value;
            seen |= 1;
            break;
          }
          case "source": {
            const descriptor = nativeObjectGetOwnPropertyDescriptor(value, key);
            if (!descriptor || !("value" in descriptor)) return undefined;
            source = descriptor.value;
            seen |= 2;
            break;
          }
          case "target": {
            const descriptor = nativeObjectGetOwnPropertyDescriptor(value, key);
            if (!descriptor || !("value" in descriptor)) return undefined;
            target = descriptor.value;
            seen |= 4;
            break;
          }
          case "messageId": {
            const descriptor = nativeObjectGetOwnPropertyDescriptor(value, key);
            if (!descriptor || !("value" in descriptor)) return undefined;
            messageId = descriptor.value;
            seen |= 8;
            break;
          }
          case "type": {
            const descriptor = nativeObjectGetOwnPropertyDescriptor(value, key);
            if (!descriptor || !("value" in descriptor)) return undefined;
            type = descriptor.value;
            seen |= 16;
            break;
          }
          case "data": {
            const descriptor = nativeObjectGetOwnPropertyDescriptor(value, key);
            if (!descriptor || !("value" in descriptor)) return undefined;
            data = descriptor.value;
            seen |= 32;
            break;
          }
          default:
            return undefined;
        }
      }
      if (seen !== 63) return undefined;
    }
  } catch {
    return undefined;
  }
  if (
    typeof channel !== "string" ||
    (source !== "scripting" && source !== "inject") ||
    (target !== "scripting" && target !== "inject") ||
    typeof messageId !== "string" ||
    (type !== "sendMessage" &&
      type !== "respMessage" &&
      type !== "connect" &&
      type !== "disconnect" &&
      type !== "connectMessage")
  ) {
    return undefined;
  }
  return { channel, source, target, messageId, type, data } as PageMessageBody;
};

const otherRole = (role: PageMessageRole): PageMessageRole => (role === "scripting" ? "inject" : "scripting");

class PageMessageConnect implements MessageConnect {
  private readonly listenerId = uuidv4();
  private target: (() => void) | null;
  private isSelfDisconnected = false;

  constructor(
    private readonly messageId: string,
    private readonly targetRole: PageMessageRole,
    private readonly send: (
      target: PageMessageRole,
      body: Omit<PageMessageBody, "channel" | "source" | "target">
    ) => void,
    private readonly EE: EventEmitter<string, any>
  ) {
    const handler = (message: TMessage) => {
      listenerMgr.emit(`onMessage:${this.listenerId}`, message);
    };
    const cleanup = () => {
      if (!this.target) return;
      this.target = null;
      listenerMgr.removeAllListeners(`cleanup:${this.listenerId}`);
      this.EE.removeAllListeners(`connectMessage:${this.messageId}`);
      this.EE.removeAllListeners(`disconnect:${this.messageId}`);
      listenerMgr.emit(`onDisconnect:${this.listenerId}`, this.isSelfDisconnected);
      listenerMgr.removeAllListeners(`onDisconnect:${this.listenerId}`);
      listenerMgr.removeAllListeners(`onMessage:${this.listenerId}`);
    };
    this.target = cleanup;
    this.EE.addListener(`connectMessage:${this.messageId}`, handler);
    this.EE.addListener(`disconnect:${this.messageId}`, cleanup);
    listenerMgr.once(`cleanup:${this.listenerId}`, cleanup);
  }

  sendMessage(data: TMessage): void {
    if (!this.target) throw new Error("Attempted to sendMessage on a disconnected page channel.");
    this.send(this.targetRole, {
      messageId: this.messageId,
      type: "connectMessage",
      data,
    });
  }

  onMessage(callback: (data: TMessage) => void): void {
    if (!this.target) throw new Error("onMessage on a disconnected page channel.");
    listenerMgr.addListener(`onMessage:${this.listenerId}`, callback);
  }

  disconnect(ignoreAlreadyDisconnected = false): void {
    if (!this.target) {
      if (ignoreAlreadyDisconnected) return;
      throw new Error("Attempted to disconnect a disconnected page channel.");
    }
    this.isSelfDisconnected = true;
    this.send(this.targetRole, {
      messageId: this.messageId,
      type: "disconnect",
      data: null,
    });
    listenerMgr.emit(`cleanup:${this.listenerId}`);
  }

  onDisconnect(callback: (isSelfDisconnected: boolean) => void): void {
    if (!this.target) throw new Error("onDisconnect on a disconnected page channel.");
    listenerMgr.once(`onDisconnect:${this.listenerId}`, callback);
  }
}

/**
 * 页面异步 RPC 专用通道。
 *
 * role 与 channel 只负责传输路由；调用方仍必须验证每个请求，并把权限绑定到隔离执行记录。
 */
export class PageMessage implements Message {
  readonly EE = new EventEmitter<string, any>();
  private readonly postMessage: (message: unknown, targetOrigin: string) => void;
  private readonly messageHandler: (event: MessageEvent) => void;
  private readonly targetRole: PageMessageRole;

  constructor(
    private readonly channel: string,
    private readonly role: PageMessageRole,
    private readonly sourceWindow: Window = window
  ) {
    if (typeof sourceWindow.postMessage !== "function") throw new TypeError("window.postMessage is unavailable");
    this.postMessage = bindNative(sourceWindow.postMessage, sourceWindow);
    this.targetRole = otherRole(role);
    this.messageHandler = (event: MessageEvent) => {
      if (event.source !== null && event.source !== sourceWindow) return;
      const body = parsePageMessageBody(event.data);
      if (
        !body ||
        body.channel !== this.channel ||
        body.target !== this.role ||
        body.source !== this.targetRole ||
        typeof body.messageId !== "string"
      ) {
        return;
      }
      this.messageHandle(body as PageMessageBody);
    };
    sourceWindow.addEventListener("message", this.messageHandler);
  }

  private sendEnvelope(target: PageMessageRole, body: Omit<PageMessageBody, "channel" | "source" | "target">): void {
    this.postMessage(
      {
        channel: this.channel,
        source: this.role,
        target,
        ...body,
      } satisfies PageMessageBody,
      "*"
    );
  }

  private messageHandle(body: PageMessageBody): void {
    if (body.type === "sendMessage") {
      this.EE.emit(
        "message",
        body.data,
        (response: TMessage) => {
          this.sendEnvelope(body.source, {
            messageId: body.messageId,
            type: "respMessage",
            data: response,
          });
        },
        {} as RuntimeMessageSender
      );
    } else if (body.type === "respMessage") {
      this.EE.emit(`response:${body.messageId}`, body);
    } else if (body.type === "connect") {
      this.EE.emit(
        "connect",
        body.data,
        new PageMessageConnect(body.messageId, body.source, this.sendEnvelope.bind(this), this.EE)
      );
    } else if (body.type === "disconnect") {
      this.EE.emit(`disconnect:${body.messageId}`);
    } else if (body.type === "connectMessage") {
      this.EE.emit(`connectMessage:${body.messageId}`, body.data);
    }
  }

  onConnect(callback: OnConnectCallback): void {
    this.EE.addListener("connect", callback);
  }

  onMessage(callback: OnMessageCallback): void {
    this.EE.addListener("message", callback);
  }

  connect(data: TMessage): Promise<MessageConnect> {
    const messageId = uuidv4();
    this.sendEnvelope(this.targetRole, { messageId, type: "connect", data });
    return Promise.resolve(new PageMessageConnect(messageId, this.targetRole, this.sendEnvelope.bind(this), this.EE));
  }

  sendMessage<T = any>(data: TMessage): Promise<T> {
    return new Promise<T>((resolve) => {
      const messageId = uuidv4();
      const eventId = `response:${messageId}`;
      this.EE.addListener(eventId, (body: PageMessageBody) => {
        this.EE.removeAllListeners(eventId);
        resolve(body.data as T);
      });
      this.sendEnvelope(this.targetRole, { messageId, type: "sendMessage", data });
    });
  }

  dispose(): void {
    this.sourceWindow.removeEventListener("message", this.messageHandler);
    this.EE.removeAllListeners();
  }
}
