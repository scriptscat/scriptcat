// 修复 Arco Design 在 React 17+ 环境下 focusin / focusout 事件重复触发导致的 UI 卡顿问题
// 参考 PR：https://github.com/scriptscat/scriptcat/pull/1224
// 核心思路：将 focusin/focusout 的事件监听器执行延迟到下一个 macrotask，避免在同一渲染帧内被 Arco 多次触发

let actived = false; // 防止多次调用 fixArcoIssues 导致重复 patch

export const fixArcoIssues = () => {
  if (actived) return; // 已修复过则直接返回
  actived = true;

  // 保存原生的 addEventListener 方法
  const originalAddEventListener = HTMLElement.prototype.addEventListener;

  // 用来暂存需要延迟执行的事件物件
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

      bindInfoMap.delete(ev); // 用完即清理，减少 WeakMap 引用

      // 如果事件已被 preventDefault，则不再执行原回调（保持标准行为）
      if (ev.defaultPrevented) continue;

      try {
        // 使用原来的 this 和 listener 执行
        bi.listener.call(bi.thisArg, ev);
      } catch (err) {
        console.error("Failed to execute delayed callback.", err);
      }
    }
  };

  // 使用 postMessage + message 事件来实现 macrotask（比 setTimeout(0) 更可靠且开销较小）
  self.addEventListener("message", (ev) => {
    if (typeof ev.data === "object" && ev.data?.processNextTick === "addEventListenerHack") {
      executorFn();
    }
  });

  // 自订的 addEventListener 拦截器，只针对 focusin/focusout 且 options 为简单 boolean 时生效
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

      // 用包装后的 handler 注册真正的事件
      return originalAddEventListener.call(this, type, handler, options);
    }

    // 其他事件走原生方法，不做干预
    return originalAddEventListener.call(this, type, listener, options);
  };

  // 针对 body 打补丁（Arco 大量事件绑在 document 或 body 上）
  document.body.addEventListener = addEventListenerHack;

  // 也针对 React 根节点 #root 打补丁（部分组件可能绑在根元素）
  const root = document.querySelector("div#root");
  if (root) {
    root.addEventListener = addEventListenerHack;
  }
};
