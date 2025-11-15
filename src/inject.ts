import LoggerCore from "./app/logger/core";
import MessageWriter from "./app/logger/message_writer";
import { CustomEventMessage } from "@Packages/message/custom_event_message";
import { Server } from "@Packages/message/server";
import type { ScriptLoadInfo } from "./app/service/service_worker/types";
import type { GMInfoEnv } from "./app/service/content/types";
import { InjectRuntime } from "./app/service/content/inject";
import { ScriptExecutor } from "./app/service/content/script_executor";
import type { Message } from "@Packages/message/types";

/* global MessageFlags  */

const msg: Message = new CustomEventMessage(MessageFlags, false);

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
scriptExecutor.checkEarlyStartScript("inject", MessageFlags);

server.on("pageLoad", (data: { scripts: ScriptLoadInfo[]; envInfo: GMInfoEnv }) => {
  logger.logger().debug("inject start");
  // 监听事件
  runtime.setEnvInfo(data.envInfo);
  runtime.startScripts(data.scripts);
  runtime.onInjectPageLoaded();
});
