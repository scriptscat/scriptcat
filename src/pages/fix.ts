// 修复 Arco Design 在 React 17+ 环境下 focusin / focusout 事件重复触发导致的 UI 卡顿问题
// 参考 PR：https://github.com/scriptscat/scriptcat/pull/1224
// 核心思路：将 focusin/focusout 的事件监听器执行延迟到下一个 macrotask，避免在同一渲染帧内被 Arco 多次触发

let actived = false; // 防止多次调用 fixArcoIssues 导致重复 patch

export const fixArcoIssues = () => {
  if (actived) return; // 已修复过则直接返回
  actived = true;

  // 保存原生的 addEventListener / removeEventListener 方法
  const originalAddEventListener = HTMLElement.prototype.addEventListener;
  const originalRemoveEventListener = HTMLElement.prototype.removeEventListener;

  // 用来暂存需要延迟执行的事件对象（同一 tick 内的事件会被合并）
  const stackedEvents = new Set<Event>();

  // 记录每个事件对应的 thisArg 和 listener（因为我们会包一层 handler）
  const bindInfoMap = new WeakMap<Event, { thisArg: Element; listener: EventListener }>();

  // 真正执行被延迟的事件回调
  const executorFn = () => {
    if (!stackedEvents.size) return;

    // 复制一份后清空，避免在执行期间又有新事件进来
    const events = [...stackedEvents];
    stackedEvents.clear();

    for (const ev of events) {
      const bi = bindInfoMap.get(ev);
      if (!bi) continue;

      // 使用完成后立即清理，减少 WeakMap 的引用存活时间
      bindInfoMap.delete(ev);

      // 如果事件已被 preventDefault，则不再执行原回调
      // 保持浏览器原生事件行为一致
      if (ev.defaultPrevented) continue;

      try {
        // 使用原来的 this 和 listener 执行
        bi.listener.call(bi.thisArg, ev);
      } catch (err) {
        // 捕获异常，避免影响后续事件执行
        console.error("Failed to execute delayed callback.", err);
      }
    }
  };

  // 使用 postMessage + message 事件来模拟 macrotask
  // 相比 setTimeout(0)，更稳定且调度开销更小
  self.addEventListener("message", (ev) => {
    if (typeof ev.data === "object" && ev.data?.processNextTick === "addEventListenerHack") {
      executorFn();
    }
  });

  // 记录原始 listener 与包装后 handler 的映射关系
  // 以便 removeEventListener 时能正确移除
  const handlerMap = new WeakMap<EventListener, EventListener>();

  // 自定义的 addEventListener
  // 只针对 focusin / focusout 且 options 为简单 boolean 的情况生效
  const addEventListenerHack = function <K extends keyof HTMLElementEventMap>(
    this: Element,
    type: K,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void {
    // 只拦截 focusin / focusout，且 listener 是函数，且 options 是简单的 capture/bubble 设定
    // （排除 once、passive 等进阶选项，避免破坏其他使用方式）
    if (
      (type === "focusin" || type === "focusout") &&
      typeof listener === "function" &&
      typeof (options ?? false) === "boolean" // 只接受 boolean 或 undefined 的 options
    ) {
      // 包装一层 handler，收集事件并推迟执行
      const handler = (ev: Event) => {
        stackedEvents.add(ev);
        bindInfoMap.set(ev, { thisArg: this, listener });
        // 发送 macrotask 讯号，让 executor 在下一个事件循环执行
        self.postMessage({ processNextTick: "addEventListenerHack" }, "*");
      };

      // 保存原 listener 与包装 handler 的对应关系
      handlerMap.set(listener, handler);

      // 实际注册的是包装后的 handler
      return originalAddEventListener.call(this, type, handler, options);
    }

    // 其他事件保持原生行为，不做任何干预
    return originalAddEventListener.call(this, type, listener, options);
  };

  // 自定义的 removeEventListener
  // 如果 listener 曾被包装过，这里需要移除对应的 handler
  const removeEventListenerHack = function <K extends keyof HTMLElementEventMap>(
    this: Element,
    type: K,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void {
    const handler = typeof listener === "function" && handlerMap.get(listener);
    return originalRemoveEventListener.call(this, type, handler || listener, options);
  };

  // 针对 body 打补丁（Arco 大量事件绑在 document 或 body 上）
  document.body.addEventListener = addEventListenerHack;
  document.body.removeEventListener = removeEventListenerHack;

  // 也针对 React 根节点 #root 打补丁（部分组件可能绑在根元素）
  const root = document.querySelector("div#root");
  if (root) {
    root.addEventListener = addEventListenerHack;
    root.removeEventListener = removeEventListenerHack;
  }
};
