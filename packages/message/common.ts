import { randomMessageFlag } from "@App/pkg/utils/utils";

// 避免页面载入后改动全域物件导致消息传递失败
export const MouseEventClone = MouseEvent;
export const CustomEventClone = CustomEvent;

//@ts-ignore
const performanceClone = (process.env.VI_TESTING === "true" ? new EventTarget() : performance) as Performance;

// 避免页面载入后改动 EventTarget.prototype 的方法导致消息传递失败
export const pageDispatchEvent = performanceClone.dispatchEvent.bind(performanceClone);
export const pageAddEventListener = performanceClone.addEventListener.bind(performanceClone);
export const pageRemoveEventListener = performanceClone.removeEventListener.bind(performanceClone);
const detailClone = typeof cloneInto === "function" ? cloneInto : null;
export const pageDispatchCustomEvent = (eventType: string, detail: any) => {
  if (detailClone && detail) detail = detailClone(detail, performanceClone);
  const ev = new CustomEventClone(eventType, {
    detail,
    cancelable: true,
  });
  return pageDispatchEvent(ev);
};

// flag协商
export function negotiateEventFlag(messageFlag: string, readyCount: number, onInit: (eventFlag: string) => void): void {
  const eventFlag = randomMessageFlag();
  onInit(eventFlag);
  // 监听 inject/scripting 发来的请求 EventFlag 的消息
  let ready = 0;
  const EventFlagRequestHandler: EventListenerOrEventListenerObject = (ev) => {
    if (!(ev instanceof CustomEvent)) return;

    switch (ev.detail?.action) {
      case "receivedEventFlag":
        // 对方已收到 EventFlag
        ready += 1;
        if (ready >= readyCount) {
          // 已收到两个环境的请求，移除监听
          pageRemoveEventListener(messageFlag, EventFlagRequestHandler);
        }
        break;
      case "requestEventFlag":
        // 广播通信 flag 给 inject/scripting
        pageDispatchCustomEvent(messageFlag, { action: "broadcastEventFlag", EventFlag: eventFlag });
        break;
    }
  };

  pageAddEventListener(messageFlag, EventFlagRequestHandler);

  // 广播通信 flag 给 inject/scripting
  pageDispatchCustomEvent(messageFlag, { action: "broadcastEventFlag", EventFlag: eventFlag });
}

// 获取协商后的 EventFlag
export function getEventFlag(messageFlag: string, onReady: (eventFlag: string) => void) {
  let eventFlag = "";
  const EventFlagListener: EventListenerOrEventListenerObject = (ev) => {
    if (!(ev instanceof CustomEvent)) return;
    if (ev.detail?.action != "broadcastEventFlag") return;
    eventFlag = ev.detail.EventFlag;
    pageRemoveEventListener(messageFlag, EventFlagListener);
    // 告知对方已收到 EventFlag
    pageDispatchCustomEvent(messageFlag, { action: "receivedEventFlag" });
    onReady(eventFlag);
  };

  pageAddEventListener(messageFlag, EventFlagListener);

  // 基于同步机制，判断是否已经收到 EventFlag
  // 如果没有收到，则主动请求一次
  if (!eventFlag) {
    pageDispatchCustomEvent(messageFlag, { action: "requestEventFlag" });
  }
}

export const createMouseEvent =
  process.env.VI_TESTING === "true"
    ? (type: string, eventInitDict?: MouseEventInit | undefined): MouseEvent => {
        const ev = new MouseEventClone(type, eventInitDict);
        eventInitDict = eventInitDict || {};
        for (const [key, value] of Object.entries(eventInitDict)) {
          //@ts-ignore
          if (ev[key] === undefined) ev[key] = value;
        }
        return ev;
      }
    : (type: string, eventInitDict?: MouseEventInit | undefined): MouseEvent => {
        return new MouseEventClone(type, eventInitDict);
      };
