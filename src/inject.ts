import LoggerCore from "./app/logger/core";
import MessageWriter from "./app/logger/message_writer";
import { CustomEventMessage } from "@Packages/message/custom_event_message";
import { PageEventMessage } from "@Packages/message/page_event_message";
import { Server } from "@Packages/message/server";
import { ScriptExecutor } from "./app/service/content/script_executor";
import type { Message } from "@Packages/message/types";
import { getEventFlag } from "@Packages/message/common";
import { ScriptRuntime } from "./app/service/content/script_runtime";
import { ScriptEnvTag } from "@Packages/message/consts";
import { type TExtensionEnv } from "./app/service/extension/extension_env";

const messageFlag = process.env.SC_RANDOM_KEY!;

getEventFlag(messageFlag, (eventFlag: string, extensionEnv: TExtensionEnv | undefined) => {
  const scriptEnvTag = ScriptEnvTag.inject;

  // MAIN world 使用唯一的 keyed performance-event bridge。
  // privileged GM RPC 仍由 scripting broker + service worker 对 execution binding / grant / sequence 做最终验证。
  const msg: Message = new PageEventMessage(eventFlag, "inject");

  const logger = new LoggerCore({
    writer: new MessageWriter(msg, "scripting/logger"),
    consoleLevel: process.env.NODE_ENV === "development" ? "debug" : "none",
    labels: { env: "inject", href: window.location.href },
  });

  logger.logger().debug("inject start");

  const server = new Server("inject", msg);
  const scriptExecutor = new ScriptExecutor(
    msg,
    new CustomEventMessage(eventFlag, true, ScriptEnvTag.content),
    "scripting"
  );
  const runtime = new ScriptRuntime(scriptEnvTag, server, msg, scriptExecutor, extensionEnv);
  runtime.init();

  // inject环境，直接判断白名单，注入对外接口
  runtime.externalMessage("scripting", msg);
});
