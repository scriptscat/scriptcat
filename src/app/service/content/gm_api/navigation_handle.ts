class UrlChangeEvent extends Event {
  url: string;
  constructor(type: string, eventInitDict?: EventInit) {
    super(type, eventInitDict);
    this.url = "";
  }
}

// Chrome 102+, Firefox 147+
// https://developer.chrome.com/docs/web-platform/navigation-api
// https://developer.mozilla.org/en-US/docs/Web/API/Navigation_API#browser_compatibility
export const attachNavigateHandler = (win: Window & { navigation: EventTarget }) => {
  // 以 location.href 判断避免 replaceState/pushState 重复执行重复触发
  const loc = win.location;
  const getUrl = Object.getOwnPropertyDescriptor(loc, "href")?.get?.bind(loc);
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
        window.addEventListener("message", resolve, { once: true });
        window.postMessage({ [`${Math.random()}`]: {} }); // 传一个 dummy message
      });
      if (seq !== callSeq) return; // 等待时，或许已经触发了其他 navigate
      newUrl = getUrl?.(); // 再次取得当前 location.href
    }
    if (newUrl === lastUrl) return;
    lastUrl = newUrl;
    const urlChangeEv = new UrlChangeEvent("urlchange");
    urlChangeEv.url = (destUrl || newUrl) as string; // info.url
    dispatch(urlChangeEv);
  };
  win.navigation?.addEventListener("navigate", handler, false);
};
