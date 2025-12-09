import { randomMessageFlag } from "./pkg/utils/utils";
import { createPageMessaging } from "@Packages/message/custom_event_message";
import { pageAddEventListener, pageDispatchCustomEvent } from "@Packages/message/common";
import { uuidv5 } from "./pkg/utils/uuid";

const scriptingMessaging = createPageMessaging("");
const messageStack: any[] = [];

// 在取得 scriptInjectMessageFlag 前，先堆叠一下，避免漏掉
let dispatchDeliveryMessage = (message: any) => {
  messageStack.push(message);
};

// ------------------------------
chrome.storage.local.onChanged.addListener((changes) => {
  if (changes["localStorage:scriptInjectMessageFlag"]?.newValue) {
    dispatchDeliveryMessage({
      tag: "localStorage:scriptInjectMessageFlag",
      value: changes["localStorage:scriptInjectMessageFlag"]?.newValue,
    });
  }
  if (changes["valueUpdateDelivery"]?.newValue) {
    dispatchDeliveryMessage({
      tag: "valueUpdateDelivery",
      value: changes["valueUpdateDelivery"]?.newValue,
    });
  }
});

chrome.runtime.onMessage.addListener((message, _sender) => {
  if (!message) return;
  const { action, data } = message;
  dispatchDeliveryMessage({
    tag: action,
    value: data,
  });
});

chrome.storage.local.get(["localStorage:scriptInjectMessageFlag"]).then((m) => {
  const MessageFlag = m["localStorage:scriptInjectMessageFlag"].value;

  const mainKey = uuidv5("scriptcat-listen-inject", MessageFlag);

  const dispatchDeliveryMessageAfterEtSet = (detail: any) => {
    if (!scriptingMessaging.et) throw new Error("scriptingMessaging is not ready or destroyed");
    pageDispatchCustomEvent(`evt_${scriptingMessaging.et}_deliveryMessage`, detail);
  };

  const injectFlag = randomMessageFlag();
  const injectFlagEvt = injectFlag;

  // 用來接收 emitter
  pageAddEventListener(
    `${injectFlagEvt}`,
    (ev) => {
      if (ev instanceof CustomEvent && ev.detail?.[`emitterKeyFor${injectFlagEvt}`]) {
        scriptingMessaging.et = ev.detail[`emitterKeyFor${injectFlagEvt}`];
        dispatchDeliveryMessage = dispatchDeliveryMessageAfterEtSet;
        if (messageStack.length > 0) {
          const messages = messageStack.slice();
          messageStack.length = 0;
          for (const message of messages) {
            dispatchDeliveryMessage(message);
          }
        }
      }
    },
    { once: true }
  );

  const submitTarget = () => {
    return pageDispatchCustomEvent(mainKey, { injectFlagEvt, scripting: true });
  };

  if (submitTarget() === true) {
    pageAddEventListener(mainKey, (ev) => {
      if (ev instanceof CustomEvent && !ev.detail) {
        submitTarget();
      }
    });
  }
});
