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
import { CustomEventClone, pageAddEventListener, pageDispatchCustomEvent, pageRemoveEventListener } from "./common";
import { parseWindowMessageBody, type WindowMessageBody } from "./window_message";

export type PageEventMessageRole = "scripting" | "inject";

const nativeReflectApply = Reflect.apply;
const nativeFunctionBind = Function.prototype.bind;

const bindNative = <T extends (...args: any[]) => any>(fn: T, receiver: any): T =>
  nativeReflectApply(nativeFunctionBind, fn, [receiver]) as T;

const listenerMgr = new EventEmitter<string, any>();

const otherRole = (role: PageEventMessageRole): PageEventMessageRole => (role === "scripting" ? "inject" : "scripting");

class PageEventMessageConnect implements MessageConnect {
  private readonly listenerId = uuidv4();
  private target: (() => void) | null;
  private isSelfDisconnected = false;

  constructor(
    private readonly messageId: string,
    private readonly targetRole: PageEventMessageRole,
    private readonly send: (target: PageEventMessageRole, body: WindowMessageBody) => void,
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
 * 页面 RPC 专用通道。
 *
 * 使用随机 channel 派生的 performance CustomEvent 名称，避免把所有跨世界 payload 暴露到
 * host page 可无条件监听的 window "message" 总线上。event name 只降低普通页面代码的被动
 * 可观察性，不是认证边界；调用方仍必须验证每个请求，并把权限绑定到隔离执行记录。
 */
export class PageEventMessage implements Message {
  readonly EE = new EventEmitter<string, any>();
  private readonly receiveEventName: string;
  private readonly messageHandler: (event: Event) => void;
  private readonly targetRole: PageEventMessageRole;

  constructor(
    private readonly channel: string,
    private readonly role: PageEventMessageRole
  ) {
    this.targetRole = otherRole(role);
    this.receiveEventName = `${channel}.pageEventMessage.${this.targetRole}.${role}`;
    this.messageHandler = (event: Event) => {
      if (!(event instanceof CustomEventClone)) return;
      const body = parseWindowMessageBody(event.detail);
      if (!body) return;
      this.messageHandle(body);
    };
    pageAddEventListener(this.receiveEventName, this.messageHandler);
  }

  private sendEnvelope(target: PageEventMessageRole, body: WindowMessageBody): void {
    pageDispatchCustomEvent(`${this.channel}.pageEventMessage.${this.role}.${target}`, body);
  }

  private messageHandle(body: WindowMessageBody): void {
    if (body.type === "sendMessage") {
      this.EE.emit(
        "message",
        body.data,
        (response: TMessage) => {
          this.sendEnvelope(this.targetRole, {
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
        new PageEventMessageConnect(body.messageId, this.targetRole, bindNative(this.sendEnvelope, this), this.EE)
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
    return Promise.resolve(
      new PageEventMessageConnect(messageId, this.targetRole, bindNative(this.sendEnvelope, this), this.EE)
    );
  }

  sendMessage<T = any>(data: TMessage): Promise<T> {
    return new Promise<T>((resolve) => {
      const messageId = uuidv4();
      const eventId = `response:${messageId}`;
      this.EE.addListener(eventId, (body: WindowMessageBody) => {
        this.EE.removeAllListeners(eventId);
        resolve(body.data as T);
      });
      this.sendEnvelope(this.targetRole, { messageId, type: "sendMessage", data });
    });
  }

  dispose(): void {
    pageRemoveEventListener(this.receiveEventName, this.messageHandler);
    this.EE.removeAllListeners();
  }
}
