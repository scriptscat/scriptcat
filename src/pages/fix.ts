let actived = false;

export const fixArcoIssues = () => {
  if (actived) return;
  actived = true;

  const originalAddEventListener = HTMLElement.prototype.addEventListener;
  type BindInfo = { thisArg: Element; listener: EventListener };

  const stackedEvents = new Set<Event>();
  const bindInfoMap = new WeakMap<Event, BindInfo>();
  const executorFn = () => {
    const events = [...stackedEvents];
    stackedEvents.clear();
    for (const ev of events) {
      if (ev.defaultPrevented) continue;
      const bi = bindInfoMap.get(ev);
      if (!bi) continue;
      bindInfoMap.delete(ev);
      try {
        bi.listener.call(bi.thisArg, ev);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const addEventListenerHack = function <K extends keyof HTMLElementEventMap>(
    this: Element,
    type: K,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void {
    if ((type === "focusin" || type === "focusout") && typeof listener === "function") {
      const handler = (event: Event) => {
        stackedEvents.add(event);
        bindInfoMap.set(event, { thisArg: this, listener });
        requestAnimationFrame(executorFn);
      };
      return originalAddEventListener.call(this, type, handler, options);
    }
    return originalAddEventListener.call(this, type, listener, options);
  };
  document.body.addEventListener = addEventListenerHack;

  const root = document.querySelector("div#root");
  if (root) root.addEventListener = addEventListenerHack;
};
