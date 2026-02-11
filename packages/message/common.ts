import { randomMessageFlag } from "@App/pkg/utils/utils";

// 避免页面载入后改动全域物件导致消息传递失败
export const MouseEventClone = MouseEvent;
export const CustomEventClone = CustomEvent;

const performanceClone = (process.env.VI_TESTING === "true" ? new EventTarget() : performance) as Performance;

// 判断当前是否运行在 USER_SCRIPT 环境 (content环境)
export const isContent = typeof chrome === "object" && typeof chrome?.runtime?.sendMessage === "function";

// 避免页面载入后改动 EventTarget.prototype 的方法导致消息传递失败
export const pageDispatchEvent = performanceClone.dispatchEvent.bind(performanceClone);
export const pageAddEventListener = performanceClone.addEventListener.bind(performanceClone);
export const pageRemoveEventListener = performanceClone.removeEventListener.bind(performanceClone);
const detailClone = typeof cloneInto === "function" ? cloneInto : null;
export const pageDispatchCustomEvent = <T = any>(eventType: string, detail: T) => {
  if (detailClone && detail) detail = <T>detailClone(detail, performanceClone);
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
  // 监听 inject/content 发来的请求 eventFlag 的消息
  let ready = 0;
  const fnEventFlagRequestHandler: EventListener = (ev: Event) => {
    if (!(ev instanceof CustomEvent)) return;

    switch (ev.detail?.action) {
      case "receivedEventFlag":
        // 对方已收到 eventFlag
        ready += 1;
        if (ready >= readyCount) {
          // 已收到两个环境的请求，移除监听
          pageRemoveEventListener(messageFlag, fnEventFlagRequestHandler);
        }
        break;
      case "requestEventFlag":
        // 广播通信 flag 给 inject/content
        pageDispatchCustomEvent(messageFlag, { action: "broadcastEventFlag", eventFlag: eventFlag });
        break;
    }
  };

  // 设置事件，然后广播通信 flag 给 inject/content
  pageAddEventListener(messageFlag, fnEventFlagRequestHandler);
  pageDispatchCustomEvent(messageFlag, { action: "broadcastEventFlag", eventFlag: eventFlag });
}

// 获取协商后的 eventFlag
export function getEventFlag(messageFlag: string, onReady: (eventFlag: string) => void) {
  let eventFlag = "";
  const fnEventFlagListener: EventListener = (ev: Event) => {
    if (!(ev instanceof CustomEvent)) return;
    if (ev.detail?.action != "broadcastEventFlag") return;
    eventFlag = ev.detail.eventFlag;
    pageRemoveEventListener(messageFlag, fnEventFlagListener);
    // 告知对方已收到 eventFlag
    pageDispatchCustomEvent(messageFlag, { action: "receivedEventFlag" });
    onReady(eventFlag);
  };

  // 设置事件，然后对 scripting 请求 flag
  pageAddEventListener(messageFlag, fnEventFlagListener);
  pageDispatchCustomEvent(messageFlag, { action: "requestEventFlag" });
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

type TPrimitive = string | number | boolean;
interface INestedPrimitive {
  [key: string]: TPrimitive | INestedPrimitive;
}
type TNestedPrimitive = TPrimitive | INestedPrimitive;

export const dispatchMyEvent = <T extends Record<string, TNestedPrimitive>>(
  type: string,
  eventInitDict: MouseEventInit | Omit<T, "movementX" | "relatedTarget">
) => {
  let resFalse;
  if ("movementX" in eventInitDict) {
    resFalse = pageDispatchEvent(createMouseEvent(type, eventInitDict));
  } else {
    resFalse = pageDispatchCustomEvent(type, eventInitDict);
  }
  if (resFalse !== false && eventInitDict.cancelable === true) {
    // 通讯设置正确的话应不会发生
    throw new Error("Page Message Error");
  }
};
