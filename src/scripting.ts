import { randomMessageFlag } from "./pkg/utils/utils";
import { createPageMessaging, pageDispatchCustomEvent } from "@Packages/message/custom_event_message";
import { uuidv5 } from "./pkg/utils/uuid";

const scriptingMessaging = createPageMessaging("");

chrome.storage.local.get(["localStorage:scriptInjectMessageFlag"]).then((m) => {
  const MessageFlag = m["localStorage:scriptInjectMessageFlag"].value;

  const mainKey = uuidv5("scriptcat-listen-inject", MessageFlag);

  const dispatchDeliveryMessage = (detail: any) => {
    if (!scriptingMessaging.et) throw new Error("scriptingMessaging is not ready or destroyed");
    pageDispatchCustomEvent(`evt_${scriptingMessaging.et}_deliveryMessage`, detail);
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

  const injectFlag = randomMessageFlag();
  const injectFlagEvt = injectFlag;

  // 用來接收 emitter
  performance.addEventListener(
    `${injectFlagEvt}`,
    (ev) => {
      if (ev instanceof CustomEvent && ev.detail?.[`emitterKeyFor${injectFlagEvt}`]) {
        scriptingMessaging.et = ev.detail[`emitterKeyFor${injectFlagEvt}`];
      }
    },
    { once: true }
  );

  const submitTarget = () => {
    return pageDispatchCustomEvent(mainKey, { injectFlagEvt, scripting: true });
  };

  if (submitTarget() === true) {
    performance.addEventListener(mainKey, (ev) => {
      if (ev instanceof CustomEvent && !ev.detail) {
        submitTarget();
      }
    });
  }
});
