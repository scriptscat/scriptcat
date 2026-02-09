// 修复arco中的事件问题 https://github.com/scriptscat/scriptcat/pull/1224/

let actived = false;

export const fixArcoIssues = () => {
  if (actived) return;
  actived = true;

  const originalAddEventListener = HTMLElement.prototype.addEventListener;
  type BindInfo = { thisArg: Element; listener: EventListener };

  const stackedEvents = new Set<Event>();
  const bindInfoMap = new WeakMap<Event, BindInfo>();
  const executorFn = () => {
    if (!stackedEvents.size) return;
    const events = [...stackedEvents];
    stackedEvents.clear();
    for (const ev of events) {
      const bi = bindInfoMap.get(ev);
      if (!bi) continue;
      bindInfoMap.delete(ev);
      if (ev.defaultPrevented) continue;
      try {
        bi.listener.call(bi.thisArg, ev);
      } catch (err) {
        console.error(err);
      }
    }
  };

  self.addEventListener("message", (ev) => {
    if (typeof ev.data === "object" && ev.data?.browserNextTick === "addEventListenerHack") {
      executorFn();
    }
  });

  const addEventListenerHack = function <K extends keyof HTMLElementEventMap>(
    this: Element,
    type: K,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void {
    if (
      (type === "focusin" || type === "focusout") &&
      typeof listener === "function" &&
      typeof (options ?? false) === "boolean" // accept capture event or bubble event but exclude the advanced options like "once"
    ) {
      const handler = (ev: Event) => {
        stackedEvents.add(ev);
        bindInfoMap.set(ev, { thisArg: this, listener });
        self.postMessage({ browserNextTick: "addEventListenerHack" });
      };
      return originalAddEventListener.call(this, type, handler, options);
    }
    return originalAddEventListener.call(this, type, listener, options);
  };
  document.body.addEventListener = addEventListenerHack;

  const root = document.querySelector("div#root");
  if (root) root.addEventListener = addEventListenerHack;
};
