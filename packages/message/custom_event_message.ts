import type { Message, MessageConnect, RuntimeMessageSender, TMessage } from "./types";
import { uuidv4 } from "@App/pkg/utils/uuid";
import { type PostMessage, type WindowMessageBody, WindowMessageConnect } from "./window_message";
import EventEmitter from "eventemitter3";
import { DefinedFlags } from "@App/app/service/service_worker/runtime.consts";
import {
  pageDispatchEvent,
  pageAddEventListener,
  pageDispatchCustomEvent,
  MouseEventClone,
  CustomEventClone,
  createMouseEvent,
} from "@Packages/message/common";
import { deferred } from "@App/pkg/utils/utils";

// 避免页面载入后改动 Map.prototype 导致消息传递失败
const relatedTargetMap = new Map<number, EventTarget>();
relatedTargetMap.set = Map.prototype.set;
relatedTargetMap.get = Map.prototype.get;
relatedTargetMap.delete = Map.prototype.delete;

let relateId = 0;
const maxInteger = Number.MAX_SAFE_INTEGER;

export class CustomEventPostMessage implements PostMessage {
  constructor(private send: CustomEventMessage) {}

  postMessage<T = any>(message: T): void {
    this.send.nativeSend(message);
  }
}

// 使用CustomEvent来进行通讯, 可以在content与inject中传递一些dom对象
export class CustomEventMessage implements Message {
  EE = new EventEmitter<string, any>();
  readonly receiveFlag: string;
  readonly sendFlag: string;

  // 关联dom目标
  relatedTarget: Map<number, EventTarget> = new Map();
  readyDeferred = deferred<void>();
  isReady = false;

  constructor(
    messageFlag: string,
    protected readonly isInbound: boolean
  ) {
    this.receiveFlag = `${messageFlag}${isInbound ? DefinedFlags.inboundFlag : DefinedFlags.outboundFlag}${DefinedFlags.domEvent}`;
    this.sendFlag = `${messageFlag}${isInbound ? DefinedFlags.outboundFlag : DefinedFlags.inboundFlag}${DefinedFlags.domEvent}`;
    const setReady = () => {
      this.readyDeferred.resolve();
      this.isReady = true;
    };
    pageAddEventListener(this.receiveFlag, (event: Event) => {
      if (event instanceof MouseEventClone && event.movementX === 0 && event.cancelable) {
        event.preventDefault(); // 告知另一端这边已准备好
        setReady(); // 两端已准备好，则 setReady()
      } else if (event instanceof MouseEventClone && event.movementX && event.relatedTarget) {
        relatedTargetMap.set(event.movementX, event.relatedTarget);
      } else if (event instanceof CustomEventClone) {
        this.messageHandle(event.detail, new CustomEventPostMessage(this));
      }
    });
    const ev = createMouseEvent(this.sendFlag, {
      movementX: 0,
      cancelable: true,
    });
    // 如另一端已准备好，则 setReady()
    if (pageDispatchEvent(ev) === false) setReady();
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

  onMessage(
    callback: (data: TMessage, sendResponse: (data: any) => void, _sender: RuntimeMessageSender) => void
  ): void {
    this.EE.addListener("message", callback);
  }

  connect(data: TMessage): Promise<MessageConnect> {
    return new Promise((resolve) => {
      this.readyDeferred.promise.then(() => {
        const body: WindowMessageBody<TMessage> = {
          messageId: uuidv4(),
          type: "connect",
          data,
        };
        this.nativeSend(body);
        // EventEmitter3 采用同步事件设计，callback会被马上执行而不像传统javascript架构以下一个macrotask 执行
        resolve(new WindowMessageConnect(body.messageId, this.EE, new CustomEventPostMessage(this)));
      });
    });
  }

  nativeSend(detail: any) {
    if (!this.isReady) throw new Error("custom_event_message is not ready.");
    pageDispatchCustomEvent(this.sendFlag, detail);
  }

  sendMessage<T = any>(data: TMessage): Promise<T> {
    return new Promise((resolve: ((value: T) => void) | null) => {
      this.readyDeferred.promise.then(() => {
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
        this.nativeSend(body);
      });
    });
  }

  // 同步发送消息
  // 与content页的消息通讯实际是同步,此方法不需要经过background
  // 但是请注意中间不要有promise
  syncSendMessage(data: TMessage): TMessage {
    if (!this.isReady) throw new Error("custom_event_message is not ready.");
    const messageId = uuidv4();
    const body: WindowMessageBody<TMessage> = {
      messageId,
      type: "sendMessage",
      data,
    };
    let ret: TMessage | undefined | null;
    const eventId = `response:${messageId}`;
    this.EE.addListener(eventId, (body: WindowMessageBody<TMessage>) => {
      ret = body.data;
    });
    this.nativeSend(body); // 执行后立即返回 ret
    this.EE.removeAllListeners(eventId); // 即使没有立即执行也能清除callback
    // 如果 data 里含有不正确参数（非 primitive type)，可能导致没有返回值
    if (!ret) throw new Error("syncSendMessage response failed.");
    return ret;
  }

  sendRelatedTarget(target: EventTarget): number {
    if (!this.isReady) throw new Error("custom_event_message is not ready.");
    // 特殊处理relatedTarget，返回id进行关联
    // 先将relatedTarget转换成id发送过去
    const id = (relateId = relateId === maxInteger ? 1 : relateId + 1);
    // 可以使用此种方式交互element
    const ev = createMouseEvent(this.sendFlag, {
      movementX: id,
      relatedTarget: target,
    });
    pageDispatchEvent(ev);
    return id;
  }

  getAndDelRelatedTarget(id: number) {
    const target = relatedTargetMap.get(id);
    relatedTargetMap.delete(id);
    return target;
  }
}
