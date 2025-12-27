import LoggerCore from "./app/logger/core";
import MessageWriter from "./app/logger/message_writer";
import { ExtensionMessage } from "@Packages/message/extension_message";
import { CustomEventMessage, createPageMessaging } from "@Packages/message/custom_event_message";
import { pageAddEventListener, pageDispatchCustomEvent, pageDispatchEvent } from "@Packages/message/common";
import { Server } from "@Packages/message/server";
import ContentRuntime from "./app/service/content/content";
import { initEnvInfo, ScriptExecutor } from "./app/service/content/script_executor";
import type { Message } from "@Packages/message/types";
import { sendMessage } from "@Packages/message/client";
import type { ValueUpdateDataEncoded } from "./app/service/content/types";
import { uuidv4, uuidv5 } from "./pkg/utils/uuid";

/* global MessageFlag */

const mainKey = uuidv5("scriptcat-listen-inject", MessageFlag);

const contentRandomId = uuidv4();

let scriptingMessagingBind = () => {};
// ------------ 對象 ------------

const pageMessaging = createPageMessaging("");
const scriptExecutorPageMessaging = createPageMessaging(uuidv4());

const scriptingMessaging = createPageMessaging("");

const emitters = new Map<string, string>();

const msgInject = new CustomEventMessage(pageMessaging, true);

// ------------ 監聽 ------------

pageAddEventListener(mainKey, (ev) => {
  // 注：即使外部執行 "scriptcat-listen-inject", 不知道 inject.ts 的亂數 flag 是不可能截取資料
  if (ev instanceof CustomEvent && typeof ev.detail?.injectFlagEvt === "string") {
    // 必定由 inject.ts 要求
    ev.preventDefault(); // dispatchEvent 返回 false
    // 按 inject.ts 要求返回 emitter
    const { injectFlagEvt, scripting } = ev.detail;
    let emitter = emitters.get(injectFlagEvt);
    if (!emitter) {
      emitters.set(injectFlagEvt, (emitter = uuidv5(injectFlagEvt, contentRandomId)));
    }
    if (scripting) {
      scriptingMessaging.et = emitter;
      scriptingMessagingBind();
    } else {
      pageMessaging.et = emitter;
      msgInject.bindEmitter();
    }
    // 傳送 emitter 給 inject.ts
    pageDispatchCustomEvent(`${injectFlagEvt}`, {
      [`emitterKeyFor${injectFlagEvt}`]: emitter,
    });
  }
});

// ------------ 连接 ------------

// 建立与service_worker页面的连接
const extMsgComm: Message = new ExtensionMessage(false);
// 初始化日志组件
const loggerCore = new LoggerCore({
  writer: new MessageWriter(extMsgComm, "serviceWorker/logger"),
  labels: { env: "content" },
});

loggerCore.logger().debug("content start");

// 处理scriptExecutor
const scriptExecutorMsg1 = new CustomEventMessage(scriptExecutorPageMessaging, true);
scriptExecutorMsg1.bindEmitter();
const scriptExecutorMsg2 = new CustomEventMessage(scriptExecutorPageMessaging, false);
scriptExecutorMsg2.bindEmitter();
const scriptExecutor = new ScriptExecutor(scriptExecutorMsg2);

const server = new Server("content", [msgInject, scriptExecutorMsg1]);

// Opera中没有chrome.runtime.onConnect，并且content也不需要chrome.runtime.onConnect
// 所以不需要处理连接，设置为false
// const extServer = new Server("content", extMsgComm, false);
// scriptExecutor的消息接口
// 初始化运行环境
const runtime = new ContentRuntime(null, server, extMsgComm, msgInject, scriptExecutorMsg1, scriptExecutor);
runtime.init();
// 页面加载，注入脚本
runtime.pageLoad(initEnvInfo);

scriptingMessagingBind = () => {
  if (!scriptingMessaging.et) throw new Error("scriptingMessaging is not ready or destroyed");
  pageAddEventListener(`evt_${scriptingMessaging.et}_deliveryMessage`, (ev) => {
    if (ev instanceof CustomEvent) {
      const { tag, value } = ev.detail;
      if (tag === "localStorage:scriptInjectMessageFlag") {
        // 反注册所有脚本时，同时中断网页信息传递
        pageMessaging.et = "";
        scriptExecutorPageMessaging.et = "";
        scriptingMessaging.et = "";
      } else if (tag === "valueUpdateDelivery") {
        // const storageName = sendData.storageName;
        // 转发给inject和scriptExecutor
        const sendData = value.sendData as ValueUpdateDataEncoded;
        scriptExecutor.valueUpdate(sendData);
        sendMessage(msgInject, "inject/runtime/valueUpdate", sendData);
      } else if (tag === "content/runtime/emitEvent") {
        const data = value;
        // 转发给inject和scriptExecutor
        scriptExecutor.emitEvent(data);
        sendMessage(msgInject, "inject/runtime/emitEvent", data);
      }
    }
  });
};

// ------------ 請求 ------------
pageDispatchEvent(new CustomEvent(mainKey));
// -----------------------------
