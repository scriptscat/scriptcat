import { uuidv4 } from "@App/pkg/utils/uuid";
import EventEmitter from "eventemitter3";
import type {
  Message,
  MessageConnect,
  OnConnectCallback,
  OnMessageCallback,
  RuntimeMessageSender,
  TMessage,
} from "./types";
import {
  WindowMessageConnect,
  parseWindowMessageBody,
  type PostMessage,
  type WindowMessageBody,
} from "./window_message";

const nativeReflectApply = Reflect.apply;
const nativeFunctionBind = Function.prototype.bind;
const bindNative = <T extends (...args: any[]) => any>(fn: T, receiver: any): T =>
  nativeReflectApply(nativeFunctionBind, fn, [receiver]) as T;

class MessagePortPostMessage implements PostMessage {
  private readonly post: (message: unknown) => void;

  constructor(port: MessagePort) {
    this.post = bindNative(port.postMessage, port) as (message: unknown) => void;
  }

  postMessage<T = any>(message: T): void {
    this.post(message);
  }
}

/**
 * Message implementation backed by a private MessagePort.
 *
 * Unlike WindowMessage, traffic is delivered only to code holding the port reference; it is not
 * broadcast through the host Window's global "message" event. The wire envelope intentionally
 * stays compatible with WindowMessage so existing Server/Client/MessageConnect semantics remain
 * unchanged while the carrier is replaced.
 */
export class MessagePortMessage implements Message {
  readonly EE = new EventEmitter<string, any>();

  private readonly target: PostMessage;
  private readonly removeMessageListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
  private readonly closePort: () => void;
  private readonly messageHandler: EventListener;
  private disposed = false;

  constructor(private readonly port: MessagePort) {
    const addMessageListener = bindNative(port.addEventListener, port);
    this.removeMessageListener = bindNative(port.removeEventListener, port);
    const startPort = bindNative(port.start, port);
    this.closePort = bindNative(port.close, port);
    this.target = new MessagePortPostMessage(port);
    this.messageHandler = ((event: MessageEvent) => {
      this.messageHandle(event.data);
    }) as EventListener;
    addMessageListener("message", this.messageHandler);
    startPort();
  }

  private assertOpen() {
    if (this.disposed) {
      throw new Error("MessagePortMessage is disposed.");
    }
  }

  private messageHandle(value: unknown) {
    const data = parseWindowMessageBody(value);
    if (!data || this.disposed) return;

    if (data.type === "sendMessage") {
      this.EE.emit(
        "message",
        data.data,
        (resp: any) => {
          if (!data.messageId || this.disposed) return;
          this.target.postMessage({
            messageId: data.messageId,
            type: "respMessage",
            data: resp,
          } satisfies WindowMessageBody);
        },
        {} as RuntimeMessageSender
      );
    } else if (data.type === "respMessage") {
      this.EE.emit(`response:${data.messageId}`, data);
    } else if (data.type === "connect") {
      this.EE.emit("connect", data.data, new WindowMessageConnect(data.messageId, this.EE, this.target));
    } else if (data.type === "disconnect") {
      this.EE.emit(`disconnect:${data.messageId}`);
    } else if (data.type === "connectMessage") {
      this.EE.emit(`connectMessage:${data.messageId}`, data.data);
    }
  }

  onConnect(callback: OnConnectCallback): void {
    this.assertOpen();
    this.EE.addListener("connect", callback);
  }

  connect(data: TMessage): Promise<MessageConnect> {
    this.assertOpen();
    const messageId = uuidv4();
    this.target.postMessage({
      messageId,
      type: "connect",
      data,
    } satisfies WindowMessageBody<TMessage>);
    return Promise.resolve(new WindowMessageConnect(messageId, this.EE, this.target));
  }

  onMessage(callback: OnMessageCallback): void {
    this.assertOpen();
    this.EE.addListener("message", callback);
  }

  sendMessage<T = any>(data: TMessage): Promise<T> {
    this.assertOpen();
    return new Promise<T>((resolve, reject) => {
      const messageId = uuidv4();
      const eventId = `response:${messageId}`;
      const handler = (body: WindowMessageBody<T>) => {
        this.EE.removeAllListeners(eventId);
        resolve(body.data as T);
      };
      this.EE.addListener(eventId, handler);
      try {
        this.target.postMessage({
          messageId,
          type: "sendMessage",
          data,
        } satisfies WindowMessageBody<TMessage>);
      } catch (error) {
        this.EE.removeAllListeners(eventId);
        reject(error);
      }
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.removeMessageListener("message", this.messageHandler);
    this.EE.removeAllListeners();
    this.closePort();
  }
}
