import LoggerCore from "./app/logger/core";
import MessageWriter from "./app/logger/message_writer";
import { CustomEventMessage } from "@Packages/message/custom_event_message";
import { Server } from "@Packages/message/server";
import { ScriptExecutor } from "./app/service/content/script_executor";
import type { Message } from "@Packages/message/types";
import { getEventFlag } from "@Packages/message/common";
import { ScriptRuntime } from "./app/service/content/script_runtime";
import { ScriptEnvTag } from "@Packages/message/consts";
import { isContent } from "./app/service/content/gm_api/gm_api";

const messageFlag = process.env.SC_RANDOM_KEY!;

getEventFlag(messageFlag, (eventFlag: string) => {
  const scriptEnvTag = isContent ? ScriptEnvTag.content : ScriptEnvTag.inject;

  const msg: Message = new CustomEventMessage(`${eventFlag}${scriptEnvTag}`, false);

  // 初始化日志组件
  const logger = new LoggerCore({
    writer: new MessageWriter(msg, "scripting/logger"),
    consoleLevel: process.env.NODE_ENV === "development" ? "debug" : "none", // 只让日志在scripting环境中打印
    labels: { env: "content", href: window.location.href },
  });

  logger.logger().debug("content start");

  const server = new Server("content", msg);
  const scriptExecutor = new ScriptExecutor(msg);
  const runtime = new ScriptRuntime(scriptEnvTag, server, msg, scriptExecutor, messageFlag);
  runtime.init();
});
