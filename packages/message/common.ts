// 避免页面载入后改动全域物件导致消息传递失败
export const MouseEventClone = MouseEvent;
export const CustomEventClone = CustomEvent;
const performanceClone = performance;

// 避免页面载入后改动 EventTarget.prototype 的方法导致消息传递失败
export const pageDispatchEvent = performance.dispatchEvent.bind(performance);
export const pageAddEventListener = performance.addEventListener.bind(performance);
export const pageRemoveEventListener = performance.removeEventListener.bind(performance);
const detailClone = typeof cloneInto === "function" ? cloneInto : null;
export const pageDispatchCustomEvent = (eventType: string, detail: any) => {
  if (detailClone && detail) detail = detailClone(detail, performanceClone);
  const ev = new CustomEventClone(eventType, {
    detail,
    cancelable: true,
  });
  return pageDispatchEvent(ev);
};
