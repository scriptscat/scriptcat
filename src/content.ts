import LoggerCore from "./app/logger/core";
import MessageWriter from "./app/logger/message_writer";
import { CustomEventMessage } from "@Packages/message/custom_event_message";
import { Server } from "@Packages/message/server";
import { ScriptExecutor } from "./app/service/content/script_executor";
import type { Message } from "@Packages/message/types";
import { getEventFlag } from "@Packages/message/common";
import { ScriptRuntime } from "./app/service/content/script_runtime";
import { ScriptEnvTag } from "@Packages/message/consts";

const MessageFlag = process.env.SC_RANDOM_KEY || "scriptcat-default-flag";

getEventFlag(MessageFlag, (EventFlag) => {
  console.log("content EventFlag", EventFlag);
  const isContent = typeof chrome.runtime?.sendMessage === "function";
  const scriptEnvTag = isContent ? ScriptEnvTag.content : ScriptEnvTag.inject;

  const msg: Message = new CustomEventMessage(`${EventFlag}${scriptEnvTag}`, false);

  // 初始化日志组件
  const logger = new LoggerCore({
    writer: new MessageWriter(msg, "scripting/logger"),
    labels: { env: "content", href: window.location.href },
  });

  logger.logger().debug("content start");

  const server = new Server("content", msg);
  const scriptExecutor = new ScriptExecutor(msg);
  const runtime = new ScriptRuntime(scriptEnvTag, server, msg, scriptExecutor, MessageFlag);
  runtime.init();
});
