// 避免页面载入后改动全域物件导致消息传递失败
export const MouseEventClone = MouseEvent;
export const CustomEventClone = CustomEvent;
export const FocusEventClone = FocusEvent; // for relatedTarget Setting without cloneInto

const performanceClone = (process.env.VI_TESTING === "true" ? new EventTarget() : performance) as Performance;

// 避免页面载入后改动 EventTarget.prototype 的方法导致消息传递失败
const nativeReflectApply = Reflect.apply;
const nativeFunctionBind = Function.prototype.bind;
const bindNative = <T extends (...args: any[]) => any>(fn: T, receiver: any): T =>
  nativeReflectApply(nativeFunctionBind, fn, [receiver]) as T;

export const pageDispatchEvent = bindNative(performanceClone.dispatchEvent, performanceClone);
export const pageAddEventListener = bindNative(performanceClone.addEventListener, performanceClone);
export const pageRemoveEventListener = bindNative(performanceClone.removeEventListener, performanceClone);
const detailClone = typeof cloneInto === "function" ? cloneInto : null;
export const pageDispatchCustomEvent = <T = any>(eventType: string, detail: T) => {
  if (detailClone && detail) detail = <T>detailClone(detail, performanceClone);
  const ev = new CustomEventClone(eventType, {
    detail,
    cancelable: true,
  });
  return pageDispatchEvent(ev);
};

// data协商
export function broadcastSCIData<T>(messageFlag: string, eData: T, readyCount: number): void {
  // 监听 inject/content 发来的请求 data 的消息
  let remaining = readyCount;
  let broadcastPayload: any = { action: "broadcastData", eData };
  const listener: EventListener = (ev: Event) => {
    if (!(ev instanceof CustomEventClone)) return;
    const action = ev.detail?.action;
    if (action === "requestData") {
      // 广播通信 data 给 inject/content
      pageDispatchCustomEvent(messageFlag, broadcastPayload);
    } else if (action === "dataReceived" && --remaining <= 0) {
      // 已收到两个环境的请求，移除监听
      pageRemoveEventListener(messageFlag, listener);
      broadcastPayload = null;
    }
  };

  // 设置事件，然后广播通信 data 给 inject/content
  pageAddEventListener(messageFlag, listener);
  pageDispatchCustomEvent(messageFlag, broadcastPayload);
}

// 获取协商后的 data
export function obtainSCIData<T>(messageFlag: string, onReady: (eData: T) => void) {
  const listener: EventListener = (ev: Event) => {
    if (!(ev instanceof CustomEventClone)) return;
    const detail = ev.detail;
    const action = detail?.action;
    if (action === "broadcastData") {
      const eData: T = detail.eData;
      pageRemoveEventListener(messageFlag, listener);
      // 告知对方已收到 data
      pageDispatchCustomEvent(messageFlag, { action: "dataReceived" });
      onReady(eData);
    }
  };

  // 设置事件，然后对 scripting 请求 data
  pageAddEventListener(messageFlag, listener);
  pageDispatchCustomEvent(messageFlag, { action: "requestData" });
}

export const createMouseEvent =
  process.env.VI_TESTING === "true"
    ? (type: string, eventInitDict?: MouseEventInit): MouseEvent => {
        const ev = new MouseEventClone(type, eventInitDict);
        eventInitDict = eventInitDict || {};
        for (const [key, value] of Object.entries(eventInitDict)) {
          //@ts-ignore
          if (ev[key] === undefined) ev[key] = value;
        }
        return ev;
      }
    : (type: string, eventInitDict?: MouseEventInit): MouseEvent => {
        return new MouseEventClone(type, eventInitDict);
      };
