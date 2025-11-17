import LoggerCore from "./app/logger/core";
import MessageWriter from "./app/logger/message_writer";
import { CustomEventMessage } from "@Packages/message/custom_event_message";
import { Server } from "@Packages/message/server";
import type { TScriptInfo } from "./app/repo/scripts";
import type { GMInfoEnv } from "./app/service/content/types";
import { InjectRuntime } from "./app/service/content/inject";
import { ScriptExecutor } from "./app/service/content/script_executor";
import type { Message } from "@Packages/message/types";

/* global MessageFlag  */

const msg: Message = new CustomEventMessage(MessageFlag, false);

// 加载logger组件
const logger = new LoggerCore({
  writer: new MessageWriter(msg),
  labels: { env: "inject", href: window.location.href },
});

const server = new Server("inject", msg);
const scriptExecutor = new ScriptExecutor(msg);
const runtime = new InjectRuntime(server, msg, scriptExecutor);
runtime.init();
// 检查early-start的脚本
scriptExecutor.checkEarlyStartScript("inject", MessageFlag);

server.on("pageLoad", (data: { injectScriptList: TScriptInfo[]; envInfo: GMInfoEnv }) => {
  logger.logger().debug("inject start");
  // 监听事件
  runtime.setEnvInfo(data.envInfo);
  runtime.startScripts(data.injectScriptList);
  runtime.onInjectPageLoaded();
});
