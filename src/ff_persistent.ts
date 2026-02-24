let waitState = 0;

let lastNow = 0;

const dom = document.createElement("dom");

const runner = () => {
  waitState = 1;
  const c = +(dom.getAttribute("domvalue") || 0) as number;
  const s = c > 255 ? "1" : `${c + 1}`;
  dom.setAttribute("domvalue", s);
  const now = Date.now();
  if (now - lastNow > 2000) {
    lastNow = now;
    // history.replaceState({ now: now }, "", `${location.pathname}?t=${now}`);
    // chrome.alarms.create("ff_wakeup", {
    //   when: now + Math.round(Math.random() * 30 + 60),
    // });
    chrome.storage.session.set({ ff_wakeup: `${now}` });
    document.title = `wakup at ${now}`; // debug
  }
};

window.addEventListener("message", (response) => {
  if (waitState === 2 && typeof response.data === "object" && response.data?.myCustomAction === "waked-up") {
    runner();
  }
});
const mutObserver = new MutationObserver(() => {
  if (waitState === 1) {
    waitState = 2;
    //   chrome.runtime.sendMessage({ myCustomAction: "wake-up-please" }, (_response) => {
    //     if (chrome.runtime.lastError) {
    //       // ignored
    //     }
    //     // nil
    //     top?.postMessage({ myCustomAction: "wake-up-please" }, "*");
    //   });
    // top?.postMessage({ myCustomAction: "wake-up-please" }, "*");
    window?.postMessage({ myCustomAction: "waked-up" }, "*");
  }
});
mutObserver.observe(dom, { attributes: true, attributeFilter: ["domvalue"] });
// console.log("ff_persistent");

runner();
