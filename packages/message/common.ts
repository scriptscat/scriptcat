// 避免页面载入后改动全域物件导致消息传递失败
export const MouseEventClone = MouseEvent;
export const CustomEventClone = CustomEvent;
const performanceClone = process.env.VI_TESTING === "true" ? window : performance;

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
export function negotiateEventFlag(messageFlag: string, eventFlag: string, readyCount: number = 2): void {
  // 广播通信 flag 给 inject/scripting
  pageDispatchCustomEvent(messageFlag, { action: "broadcastEventFlag", EventFlag: eventFlag });

  // 监听 inject/scripting 发来的请求 EventFlag 的消息
  let ready = 0;
  const EventFlagRequestHandler: EventListener = (ev) => {
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
}

// 获取协商后的 EventFlag
export function getEventFlag(messageFlag: string): string {
  let eventFlag = "";
  const EventFlagListener: EventListener = (ev) => {
    if (!(ev instanceof CustomEvent)) return;
    if (ev.detail?.action != "broadcastEventFlag") return;
    eventFlag = ev.detail.EventFlag;
    pageRemoveEventListener(messageFlag, EventFlagListener);
    // 告知对方已收到 EventFlag
    pageDispatchCustomEvent(messageFlag, { action: "receivedEventFlag" });
  };

  pageAddEventListener(messageFlag, EventFlagListener);

  // 基于同步机制，判断是否已经收到 EventFlag
  // 如果没有收到，则主动请求一次
  if (!eventFlag) {
    pageDispatchCustomEvent(messageFlag, { action: "requestEventFlag" });
  }

  return eventFlag;
}
