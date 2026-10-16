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
import {
  parseWindowMessageBody,
  type PostMessage,
  type WindowMessageBody,
  WindowMessageConnect,
} from "./window_message";

export type PageEventMessageRole = "scripting" | "inject";

const otherRole = (role: PageEventMessageRole): PageEventMessageRole => (role === "scripting" ? "inject" : "scripting");

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
  private readonly target: PostMessage = {
    postMessage: (body) => {
      this.sendEnvelope(this.targetRole, body as WindowMessageBody);
    },
  };

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
      this.EE.emit("connect", body.data, new WindowMessageConnect(body.messageId, this.EE, this.target));
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
    return Promise.resolve(new WindowMessageConnect(messageId, this.EE, this.target));
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
