import type { Message, MessageConnect, RuntimeMessageSender, TMessage } from "./types";
import { v4 as uuidv4 } from "uuid";
import { type PostMessage, type WindowMessageBody, WindowMessageConnect } from "./window_message";
import EventEmitter from "eventemitter3";
import { DefinedFlags } from "@App/app/service/service_worker/runtime.consts";

// 避免页面载入后改动 EventTarget.prototype 的方法导致消息传递失败
export const pageDispatchEvent = performance.dispatchEvent.bind(performance);
export const pageAddEventListener = performance.addEventListener.bind(performance);
export const pageRemoveEventListener = performance.removeEventListener.bind(performance);
const detailClone = typeof cloneInto === "function" ? cloneInto : null;
export const pageDispatchCustomEvent = (eventType: string, detail: any) => {
  if (detailClone && detail) detail = detailClone(detail, document.defaultView);
  const ev = new CustomEventClone(eventType, {
    detail,
    cancelable: true,
  });
  return pageDispatchEvent(ev);
};

// 避免页面载入后改动全域物件导致消息传递失败
const MouseEventClone = MouseEvent;
const CustomEventClone = CustomEvent;

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

export type PageMessaging = {
  et: string;
  bindEmitter?: () => void;
  waitReady?: Promise<void>;
  waitReadyResolve?: () => any;
  onReady?: (callback: () => any) => any;
};

export const createPageMessaging = (et: string) => {
  const pageMessaging = { et } as PageMessaging;
  pageMessaging.waitReady = new Promise<void>((resolve) => {
    pageMessaging.waitReadyResolve = resolve;
  });
  pageMessaging.onReady = (callback: () => any) => {
    if (pageMessaging.et) {
      callback();
    } else {
      pageMessaging.waitReady!.then(callback);
    }
  };
  return pageMessaging;
};

// 使用CustomEvent来进行通讯, 可以在content与inject中传递一些dom对象
export class CustomEventMessage implements Message {
  EE = new EventEmitter<string, any>();
  readonly receiveFlag: string;
  readonly sendFlag: string;
  readonly pageMessagingHandler: (event: Event) => any;

  // 关联dom目标
  relatedTarget: Map<number, EventTarget> = new Map();

  constructor(
    private pageMessaging: PageMessaging,
    protected readonly isContent: boolean
  ) {
    this.receiveFlag = `${isContent ? DefinedFlags.contentFlag : DefinedFlags.injectFlag}${DefinedFlags.domEvent}`;
    this.sendFlag = `${isContent ? DefinedFlags.injectFlag : DefinedFlags.contentFlag}${DefinedFlags.domEvent}`;
    this.pageMessagingHandler = (event: Event) => {
      if (event instanceof MouseEventClone && event.movementX && event.relatedTarget) {
        relatedTargetMap.set(event.movementX, event.relatedTarget);
      } else if (event instanceof CustomEventClone) {
        this.messageHandle(event.detail, new CustomEventPostMessage(this));
      }
    };
  }

  bindEmitter() {
    if (!this.pageMessaging.et) throw new Error("bindEmitter() failed");
    const receiveFlag = `evt_${this.pageMessaging.et}_${this.receiveFlag}`;
    pageRemoveEventListener(receiveFlag, this.pageMessagingHandler); // 避免重覆
    pageAddEventListener(receiveFlag, this.pageMessagingHandler);
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
      this.pageMessaging.onReady!(() => {
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
    if (!this.pageMessaging.et) throw new Error("inject.js is not ready or destroyed.");
    pageDispatchCustomEvent(`evt_${this.pageMessaging.et}_${this.sendFlag}`, detail);
  }

  sendMessage<T = any>(data: TMessage): Promise<T> {
    return new Promise((resolve: ((value: T) => void) | null) => {
      this.pageMessaging.onReady!(() => {
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
    if (!this.pageMessaging.et) throw new Error("inject.js is not ready or destroyed.");
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
    if (!this.pageMessaging.et) throw new Error("inject.js is not ready or destroyed.");
    // 特殊处理relatedTarget，返回id进行关联
    // 先将relatedTarget转换成id发送过去
    const id = (relateId = relateId === maxInteger ? 1 : relateId + 1);
    // 可以使用此种方式交互element
    const ev = new MouseEventClone(`evt_${this.pageMessaging.et}_${this.sendFlag}`, {
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
