import LoggerCore from "./app/logger/core";
import MessageWriter from "./app/logger/message_writer";
import { CustomEventMessage, createPageMessaging } from "@Packages/message/custom_event_message";
import { pageAddEventListener, pageDispatchCustomEvent } from "@Packages/message/common";
import { Server } from "@Packages/message/server";
import type { TScriptInfo } from "./app/repo/scripts";
import type { GMInfoEnv } from "./app/service/content/types";
import { InjectRuntime } from "./app/service/content/inject";
import { initEnvInfo, ScriptExecutor } from "./app/service/content/script_executor";
import { randomMessageFlag } from "./pkg/utils/utils";
import { uuidv5 } from "./pkg/utils/uuid";

/* global MessageFlag */

const mainKey = uuidv5("scriptcat-listen-inject", MessageFlag);

const pageMessaging = createPageMessaging("");

const msg = new CustomEventMessage(pageMessaging, false);

// 加载logger组件
const logger = new LoggerCore({
  writer: new MessageWriter(msg, "content/logger"),
  consoleLevel: "none", // 只让日志在content环境中打印
  labels: { env: "inject", href: window.location.href },
});

const server = new Server("inject", msg);
const scriptExecutor = new ScriptExecutor(msg);
const runtime = new InjectRuntime(server, msg, scriptExecutor);
runtime.init();

// 检查early-start的脚本
scriptExecutor.checkEarlyStartScript("inject", MessageFlag, initEnvInfo);

server.on("pageLoad", (data: { injectScriptList: TScriptInfo[]; envInfo: GMInfoEnv }) => {
  logger.logger().debug("inject start");
  // 监听事件
  runtime.startScripts(data.injectScriptList, data.envInfo);
  runtime.onInjectPageLoaded();
});

const injectFlag = randomMessageFlag();
const injectFlagEvt = injectFlag;

// 用來接收 emitter
pageAddEventListener(
  `${injectFlagEvt}`,
  (ev) => {
    if (ev instanceof CustomEvent && ev.detail?.[`emitterKeyFor${injectFlagEvt}`]) {
      pageMessaging.et = ev.detail[`emitterKeyFor${injectFlagEvt}`];
      msg.bindEmitter();
    }
  },
  { once: true }
);

const submitTarget = () => {
  return pageDispatchCustomEvent(mainKey, { injectFlagEvt });
};

if (submitTarget() === true) {
  pageAddEventListener(mainKey, (ev) => {
    if (ev instanceof CustomEvent && !ev.detail) {
      submitTarget();
    }
  });
}
