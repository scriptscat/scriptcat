import LoggerCore from "./app/logger/core";
import MessageWriter from "./app/logger/message_writer";
import { ExtensionMessage } from "@Packages/message/extension_message";
import { CustomEventMessage } from "@Packages/message/custom_event_message";
import { Server } from "@Packages/message/server";
import ContentRuntime from "./app/service/content/content";
import { ScriptExecutor } from "./app/service/content/script_executor";
import { randomMessageFlag } from "./pkg/utils/utils";
import type { Message } from "@Packages/message/types";

/* global MessageFlag  */

if (typeof chrome?.runtime?.onMessage?.addListener !== "function") {
  // Firefox MV3 之类好像没有 chrome.runtime.onMessage.addListener ?
  console.error("chrome.runtime.onMessage.addListener is not a function");
} else {
  // 建立与service_worker页面的连接
  const extMsgComm: Message = new ExtensionMessage(false);
  // 初始化日志组件
  const loggerCore = new LoggerCore({
    writer: new MessageWriter(extMsgComm),
    labels: { env: "content" },
  });

  loggerCore.logger().debug("content start");

  const msgInject = new CustomEventMessage(MessageFlag, true);

  // 处理scriptExecutor
  const scriptExecutorFlag = randomMessageFlag();
  const scriptExecutorMsg = new CustomEventMessage(scriptExecutorFlag, true);
  const scriptExecutor = new ScriptExecutor(new CustomEventMessage(scriptExecutorFlag, false));

  const server = new Server("content", [msgInject, scriptExecutorMsg]);

  // Opera中没有chrome.runtime.onConnect，并且content也不需要chrome.runtime.onConnect
  // 所以不需要处理连接，设置为false
  const extServer = new Server("content", extMsgComm, false);
  // scriptExecutor的消息接口
  // 初始化运行环境
  const runtime = new ContentRuntime(extServer, server, extMsgComm, msgInject, scriptExecutorMsg, scriptExecutor);
  runtime.init();
  // 页面加载，注入脚本
  runtime.pageLoad(MessageFlag);
}
