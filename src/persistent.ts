export const keepEventPageRunning = () => {
  if (typeof document === "undefined") return;
  if (typeof document.documentElement === "undefined") return;
  if (document.getElementById("ff_persistent")) return;
  // chrome.webNavigation.onHistoryStateUpdated.addListener(
  //   (_details) => {
  //     if (chrome.runtime.lastError) {
  //       // ignored
  //     }
  //     // console.log("ff_wakeup by webNavigation");
  //     // nil
  //   },
  //   {
  //     url: [{ hostEquals: new URL(chrome.runtime.getURL("/")).hostname }],
  //   }
  // );
  // chrome.alarms.onAlarm.addListener((alarmInfo) => {
  //   if (chrome.runtime.lastError) {
  //     // ignored
  //   }
  //   if (alarmInfo.name === "ff_wakeup") {
  //     // console.log("ff_wakeup by Alarms");
  //     // nil
  //   }
  // });
  chrome.storage.session.onChanged.addListener((obj) => {
    typeof obj.ff_wakeup !== "undefined";
    // if (typeof obj.ff_wakeup !== "undefined") {
    // console.log("ff_wakeup by storage");
    // nil
    // }
  });
  // window.addEventListener("message", (response) => {
  //   if (typeof response.data === "object" && response.data?.myCustomAction === "wake-up-please") {
  //     (<Window>response.source)?.postMessage({ myCustomAction: "waked-up" }, "*");
  //   }
  // });
  // chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  //   if (chrome.runtime.lastError) {
  //     // ignored
  //   }
  //   if (message.myCustomAction === "wake-up-please") {
  //     // console.log("Received in background:", message.payload);

  //     // Send response back to popup
  //     sendResponse({ now: Date.now() });
  //   }
  //   return false; // true for asynchronous
  // });
  const iframe = document.createElement("iframe");
  iframe.id = "ff_persistent";
  iframe.src = chrome.runtime.getURL("/src/ff_persistent.html");
  document.documentElement.appendChild(iframe);
};
