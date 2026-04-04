// persistent_frame.ts
const WAKE_UP_INTERVAL = 2000;
const RUNNER_RATE = 496.75;
let waitState = 0;
let lastNow = 0;
if (typeof frameElement === "object" && frameElement) {
  const cNode = document.createComment("0");
  let cVal = 0;
  //@ts-ignore
  const scheduler_ = typeof scheduler !== "undefined" && typeof scheduler?.postTask === "function" ? scheduler : null;
  const runner = (ts: number) => {
    waitState = 1;
    cVal = cVal > 8 ? 1 : cVal + 1;
    cNode.data = `${cVal}`;
    const now = ts;
    if (now - lastNow > WAKE_UP_INTERVAL) {
      lastNow = now;
      chrome.storage.session.set({ persistentWakeup: `${now}` });
      document.title = `wakup at ${now}`; // debug
    }
  };
  window.addEventListener("message", (ev) => {
    if (waitState === 2) {
      if (typeof ev.data === "object" && ev.data?.myCustomAction === "waked-up") {
        if (scheduler_) {
          scheduler_.postTask(() => runner(Date.now()), { priority: "background", delay: RUNNER_RATE });
        } else {
          runner(ev.timeStamp);
        }
      }
    }
  });
  const mutObserver = new MutationObserver(() => {
    if (waitState === 1) {
      waitState = 2;
      window?.postMessage({ myCustomAction: "waked-up" }, "*");
    }
  });
  mutObserver.observe(cNode, { characterData: true });
  runner(0);
}
