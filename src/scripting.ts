import { getEventFlag } from "@Packages/message/common";
import { ExtensionMessage } from "@Packages/message/extension_message";
import LoggerCore from "./app/logger/core";
import MessageWriter from "./app/logger/message_writer";
import type { Message } from "@Packages/message/types";
import { CustomEventMessage } from "@Packages/message/custom_event_message";
import { ScriptEnvTag } from "@Packages/message/consts";
import { Server } from "@Packages/message/server";
import ScriptingRuntime from "./app/service/content/scripting";

const MessageFlag = process.env.SC_RANDOM_KEY || "scriptcat-default-flag";

const EventFlag = getEventFlag(MessageFlag);

// 建立与service_worker页面的连接
const extMsgComm: Message = new ExtensionMessage(false);
// 初始化日志组件
const logger = new LoggerCore({
  writer: new MessageWriter(extMsgComm, "serviceWorker/logger"),
  labels: { env: "scripting" },
});

logger.logger().debug("scripting start");

const contentMsg = new CustomEventMessage(`${EventFlag}${ScriptEnvTag.content}`, true);
const injectMsg = new CustomEventMessage(`${EventFlag}${ScriptEnvTag.inject}`, true);

const server = new Server("scripting", [contentMsg, injectMsg]);

// Opera中没有chrome.runtime.onConnect，并且content也不需要chrome.runtime.onConnect
// 所以不需要处理连接，设置为false
const extServer = new Server("scripting", extMsgComm, false);
// scriptExecutor的消息接口
// 初始化运行环境
const runtime = new ScriptingRuntime(extServer, server, extMsgComm, contentMsg, injectMsg);
runtime.init();
// 页面加载，注入脚本
runtime.pageLoad();
