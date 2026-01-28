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
export function negotiateEventFlag(messageFlag: string, firstEventFlag: string, responsedCountMax: number = 3) {
  const tag = `${messageFlag}_negotiate`;
  let eventFlag = "";
  // 监听 inject/scripting 发来的请求 EventFlag 的消息
  let responsedCount = 0;
  const EventFlagRequestHandler: EventListener = (ev) => {
    if (!(ev instanceof CustomEvent)) return;
    switch (ev.detail?.action) {
      case "responseEventFlag":
        if (ev.defaultPrevented) return;
        if (eventFlag || !ev.detail?.EventFlag) return;
        if (!eventFlag) {
          eventFlag = ev.detail?.EventFlag;
          if (eventFlag !== firstEventFlag) {
            pageRemoveEventListener(tag, EventFlagRequestHandler);
          }
        }
        break;
      case "requestEventFlag":
        if (ev.defaultPrevented) return;
        responsedCount++;
        if (responsedCount <= responsedCountMax) {
          pageDispatchCustomEvent(tag, { action: "responseEventFlag", EventFlag: firstEventFlag });
          ev.preventDefault();
          ev.stopImmediatePropagation();
          ev.stopPropagation();
        } else {
          pageRemoveEventListener(tag, EventFlagRequestHandler);
        }
        break;
    }
  };
  pageAddEventListener(tag, EventFlagRequestHandler);
  pageDispatchCustomEvent(tag, { action: "requestEventFlag" });
  if (!eventFlag) {
    console.error("negotiateEventFlag failed");
  }
  return eventFlag;
}
