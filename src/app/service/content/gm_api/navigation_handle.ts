import { Native } from "../global";
import { createDeferToNextTaskKernel } from "@App/pkg/utils/mesasge-channel";

export class UrlChangeEvent extends Event {
  readonly url: string;
  constructor(type: string, url: string) {
    super(type);
    this.url = url;
  }
}

interface IDeferToNextTaskKernel {
  release(): void;
  nextMarcoTask(): Promise<void>;
}

let m: IDeferToNextTaskKernel;

let attached = false;

// 仅供测试使用，重置 attached 标记并释放复用的 MessageChannel
export const resetAttachedForTest = () => {
  attached = false;
  m.release();
};

const getPropGetter = <T>(obj: T, key: keyof T) => {
  // 避免直接 obj[key] 读取。或会被 hack
  for (let t = obj; t; t = Native.objectGetPrototypeOf(t)) {
    const pd = Native.objectGetOwnPropertyDescriptor(t, key);
    if (pd) return pd.get ? Native.bind(pd.get, obj) : undefined;
  }
};

// Chrome 102+, Firefox 147+
// https://developer.chrome.com/docs/web-platform/navigation-api
// https://developer.mozilla.org/en-US/docs/Web/API/Navigation_API#browser_compatibility
export const attachNavigateHandler = (win: Window & { navigation: EventTarget }) => {
  if (attached) return;
  if (!win.navigation) return; // 不支持 Navigation API
  attached = true;
  // 以 location.href 判断避免 replaceState/pushState 重复执行重复触发
  const loc = win.location;
  const getUrl = getPropGetter(loc, "href");
  const dispatch = Native.bind(win.dispatchEvent, win);
  let lastUrl = getUrl?.();
  let callSeq = 0;
  m = createDeferToNextTaskKernel();
  const handler = async (ev: Event): Promise<void> => {
    callSeq = callSeq > 512 ? 1 : callSeq + 1;
    const seq = callSeq;
    let newUrl = getUrl?.(); // 取得当前 location.href
    const destUrl = (ev as any).destination?.url;
    if (destUrl !== newUrl && newUrl === lastUrl) {
      // 某些情况，location.href 未更新就触发了。复用一个私有 MessageChannel
      // 让出一个 task；同一轮内的重叠导航共享这次等待，再由 callSeq 丢弃旧 continuation。
      await m.nextMarcoTask();
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
