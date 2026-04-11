const PING_INTERVAL_MS_1 = 13_225;
const PING_INTERVAL_MS_2 = 17_765;

/**
 * scheduler 用于后台排程：Chrome 94+, Firefox 142+
 * @link https://developer.mozilla.org/en-US/docs/Web/API/Scheduler/postTask
 */
const nativeScheduler =
  //@ts-ignore
  typeof scheduler !== "undefined" && typeof scheduler?.postTask === "function" && scheduler;

// 高效的 BroadcastChannel 通讯：service worker 和 offscreen 共用同一通道
const channel = new BroadcastChannel("custom-ping");

export const startRepetitivePing = () => {
  if (typeof frameElement === "object" && typeof document === "object" && document) {
    let counter = 0;
    let isMutationPending = false;

    const pingNode = document.createComment("0");

    const incrementCounter = () => {
      if (!isMutationPending) {
        isMutationPending = true;
        counter = counter > 8 ? 1 : counter + 1;
        pingNode.data = `${counter}`;
      }
    };

    const pingTask = async () => {
      channel.postMessage({});
      incrementCounter();
    };

    const mutationObserver = new MutationObserver(() => {
      if (isMutationPending) {
        isMutationPending = false;
        const pingIntervalMs = Math.random() * (PING_INTERVAL_MS_2 - PING_INTERVAL_MS_1) + PING_INTERVAL_MS_1;
        if (nativeScheduler) {
          nativeScheduler.postTask(pingTask, { priority: "background", delay: pingIntervalMs });
        } else {
          setTimeout(pingTask, pingIntervalMs);
        }
      }
    });
    mutationObserver.observe(pingNode, { characterData: true });
    incrementCounter();
  }
};

export const listenWakeupPing = (onWakeupPing: (...args: any) => any) => {
  chrome.storage.session.onChanged.addListener((obj) => {
    // 消耗 persistentWakeup
    if (typeof obj.persistentWakeup !== "undefined") {
      // 执行任意 callback
      onWakeupPing();
    }
  });
  channel.onmessage = (e) => {
    // 触发 chrome storage onChanged 使 service worker 保持活跃
    chrome.storage.session.set({ persistentWakeup: `${e.timeStamp}` });
  };
};
