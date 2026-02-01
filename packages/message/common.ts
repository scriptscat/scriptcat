import { randomMessageFlag } from "@App/pkg/utils/utils";

// 避免页面载入后改动全域物件导致消息传递失败
export const MouseEventClone = MouseEvent;
export const CustomEventClone = CustomEvent;

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

/**
 * 在同一个页面中，通过自定义事件「协商」出一个唯一可用的 EventFlag
 *
 * 设计目的：
 * - 页面中可能同时存在多个实例
 * - 需要确保最终只有一个 EventFlag 被选中并使用
 *
 * 协商思路（基于同步事件机制）：
 * 1. 先广播一次【不带 EventFlag 的询问事件】
 * 2. 所有实例都会收到该事件，并根据收到的内容做判断：
 *    - 如果收到【已带 EventFlag 的事件】
 *        → 说明已有实例成功声明旗标，直接采用该值
 *        → 如果不是自己期望的旗标，立刻退出协商
 *    - 如果收到【不带 EventFlag 的事件】
 *        → 视为一次“空回应”
 *        → 在可接受次数内，主动声明自己的 preferredFlag
 * 3. 若空回应次数超过上限仍未成功，则放弃协商
 *
 * 注意事项：
 * - dispatchEvent 是同步执行的
 * - 实例也会收到自己发出的事件
 * - 只有一个实例时，通常立即采用 preferredFlag
 * - 多实例并存时，先成功拦截并声明的实例胜出
 */
export function getSyncFlag(channelKey: string, preferredFlag: string, maxEmptyResponses: number = 3) {
  /** 协商所使用的事件名称 */
  const eventName = `${channelKey}_syncFlag`;

  /** 最终确认并采用的 EventFlag */
  let finalFlag = "";

  /** 已收到的“空事件”次数（不带 EventFlag） */
  let emptyEventCount = 0;

  /**
   * 处理协商事件的核心监听函数
   */
  const fnHandler: EventListener = (event) => {
    if (!(event instanceof CustomEvent)) return;
    if (event.defaultPrevented) return;

    const receivedFlag = event.detail?.EventFlag;

    // ───────────── 情况一：收到已声明 EventFlag 的事件 ─────────────
    if (receivedFlag) {
      // 只在尚未确定最终结果时处理
      if (!finalFlag) {
        finalFlag = receivedFlag;

        // 若旗标不是自己期望的，说明其他实例已胜出
        if (receivedFlag !== preferredFlag) {
          pageRemoveEventListener(eventName, fnHandler);
        }
      }
      return;
    }

    // ───────────── 情况二：收到不带 EventFlag 的空事件 ─────────────
    emptyEventCount++;

    if (emptyEventCount <= maxEmptyResponses) {
      // 在允许范围内，主动声明自己的旗标
      pageDispatchCustomEvent(eventName, {
        EventFlag: preferredFlag,
      });

      // 阻止事件继续传播，避免被其他实例抢先处理
      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();
    } else {
      // 超过最大尝试次数，放弃协商
      pageRemoveEventListener(eventName, fnHandler);
    }
  };

  // 开始监听协商事件
  pageAddEventListener(eventName, fnHandler);

  // 发送第一次询问事件（不带 EventFlag）
  pageDispatchCustomEvent(eventName, {});

  if (!finalFlag) {
    throw new Error("Unexpected Error in syncFlag");
  }

  return finalFlag;
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
