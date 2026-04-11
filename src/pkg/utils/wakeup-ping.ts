const PING_INTERVAL_MS = 14_225;

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

    const customPingHandler = (e: Event) => {
      chrome.storage.session.set({ persistentWakeup: `${e.timeStamp}` });
    };

    const pingNode = document.createComment("0");

    const incrementCounter = () => {
      if (!isMutationPending) {
        isMutationPending = true;
        counter = counter > 8 ? 1 : counter + 1;
        pingNode.data = `${counter}`;
      }
    };

    pingNode.addEventListener("custom-ping", customPingHandler);

    const pingTask = async () => {
      channel.postMessage({});
      incrementCounter();
    };

    const mutationObserver = new MutationObserver(() => {
      if (isMutationPending) {
        isMutationPending = false;
        if (nativeScheduler) {
          nativeScheduler.postTask(pingTask, { priority: "background", delay: PING_INTERVAL_MS });
        } else {
          setTimeout(pingTask, PING_INTERVAL_MS);
        }
      }
    });
    mutationObserver.observe(pingNode, { characterData: true });
    incrementCounter();
  }
};

export const listenWakeupPing = (onWakeupPing: (...args: any) => any) => {
  chrome.storage.session.onChanged.addListener((obj) => {
    // consume persistentWakeup
    if (typeof obj.persistentWakeup !== "undefined") {
      onWakeupPing();
    }
  });
  channel.onmessage = (e) => {
    chrome.storage.session.set({ persistentWakeup: `${e.timeStamp}` });
  };
};
