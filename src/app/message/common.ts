// 避免页面载入后改动全域物件导致消息传递失败
export const MouseEventClone = MouseEvent;
export const CustomEventClone = CustomEvent;

const performanceClone = (process.env.JEST_TESTING === "true" ? null : performance) as Performance;

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
