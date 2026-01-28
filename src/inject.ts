import LoggerCore from "./app/logger/core";
import MessageWriter from "./app/logger/message_writer";
import { CustomEventMessage } from "@Packages/message/custom_event_message";
import { Server } from "@Packages/message/server";
import { ScriptExecutor } from "./app/service/content/script_executor";
import type { Message } from "@Packages/message/types";
import { negotiateEventFlag } from "@Packages/message/common";
import { randomMessageFlag } from "./pkg/utils/utils";
import { ScriptRuntime } from "./app/service/content/script_runtime";
import { ScriptEnvTag } from "@Packages/message/consts";

const MessageFlag = process.env.SC_RANDOM_KEY;

const EventFlag = negotiateEventFlag(MessageFlag, randomMessageFlag());

const isContent = typeof chrome.runtime?.sendMessage === "function";
const scriptEnvTag = isContent ? ScriptEnvTag.content : ScriptEnvTag.inject;

const msg: Message = new CustomEventMessage(`${EventFlag}${scriptEnvTag}`, false);

// 加载logger组件
const logger = new LoggerCore({
  writer: new MessageWriter(msg, "scripting/logger"),
  consoleLevel: "none", // 只让日志在scripting环境中打印
  labels: { env: "inject", href: window.location.href },
});

logger.logger().debug("inject start");

const server = new Server("inject", msg);
const scriptExecutor = new ScriptExecutor(msg);
const runtime = new ScriptRuntime(scriptEnvTag, server, msg, scriptExecutor, MessageFlag);
runtime.init();

// inject环境，直接判断白名单，注入对外接口
runtime.externalMessage();
