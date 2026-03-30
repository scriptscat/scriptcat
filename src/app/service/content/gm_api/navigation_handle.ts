export class UrlChangeEvent extends Event {
  readonly url: string;
  constructor(type: string, url: string) {
    super(type);
    this.url = url;
  }
}

let attached = false;

const getPropGetter = (obj: any, key: string) => {
  // 避免直接 obj[key] 读取。或会被 hack
  let t = obj;
  let pd: PropertyDescriptor | undefined;
  while (t) {
    pd = Object.getOwnPropertyDescriptor(t, key);
    if (pd) break;
    t = Object.getPrototypeOf(t);
  }
  if (pd) {
    return pd?.get?.bind(obj);
  }
};

// Chrome 102+, Firefox 147+
// https://developer.chrome.com/docs/web-platform/navigation-api
// https://developer.mozilla.org/en-US/docs/Web/API/Navigation_API#browser_compatibility
export const attachNavigateHandler = (win: Window & { navigation: EventTarget }) => {
  if (attached) return;
  attached = true;
  // 以 location.href 判断避免 replaceState/pushState 重复执行重复触发
  const loc = win.location;
  const getUrl = getPropGetter(loc, "href");
  const dispatch = win.dispatchEvent.bind(win);
  let lastUrl = getUrl?.();
  let callSeq = 0;
  const handler = async (ev: Event): Promise<void> => {
    callSeq = callSeq > 512 ? 1 : callSeq + 1;
    const seq = callSeq;
    let newUrl = getUrl?.(); // 取得当前 location.href
    const destUrl = (ev as any).destination?.url;
    if (destUrl !== newUrl && newUrl === lastUrl) {
      // 某些情况，location.href 未更新就触发了
      // 用 postMessage 推迟到下一个 macrotask 阶段
      await new Promise((resolve) => {
        self.addEventListener("message", resolve, { once: true });
        self.postMessage({ [`${Math.random()}`]: {} }, "*"); // 传一个 dummy message
      });
      if (seq !== callSeq) return; // 等待时，或许已经触发了其他 navigate
      newUrl = getUrl?.(); // 再次取得当前 location.href
    }
    if (newUrl === lastUrl) return;
    lastUrl = newUrl;
    const urlChangeEv = new UrlChangeEvent("urlchange", (destUrl || newUrl) as string);
    dispatch(urlChangeEv);
  };
  win.navigation?.addEventListener("navigate", handler, false);
};
