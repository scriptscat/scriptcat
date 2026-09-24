import { ExtensionMessage } from "@Packages/message/extension_message";
import LoggerCore from "./app/logger/core";
import MessageWriter from "./app/logger/message_writer";
import type { Message } from "@Packages/message/types";
import { CustomEventMessage } from "@Packages/message/custom_event_message";
import { PageEventMessage } from "@Packages/message/page_event_message";
import { ScriptEnvTag } from "@Packages/message/consts";
import { Server } from "@Packages/message/server";
import ScriptingRuntime from "./app/service/content/scripting";
import { negotiateEventFlag } from "@Packages/message/common";
import { extensionEnv } from "./app/service/extension/extension_env";
import { RuntimeClient } from "./app/service/service_worker/client";

const messageFlag = process.env.SC_RANDOM_KEY!;

// SW pageLoad 不依赖 MAIN/content 的 eventFlag。document_start 一进入 isolated scripting
// world 就立即发出 authoritative bootstrap，请求与 bridge negotiation 并行进行；这样 early
// userscript 仍按 registered wrapper 的时机马上执行，而需要 execution binding 的 GM API
// 只等待不可避免的 SW 往返，不再额外串行等待页面桥初始化。
const extMsgComm: Message = new ExtensionMessage(false);
const pageLoadPromise = new RuntimeClient(extMsgComm).pageLoad("it");

// 将初始化流程完成后，将EventFlag通知到其他环境
negotiateEventFlag(messageFlag, extensionEnv, 2, (eventFlag) => {
  // 初始化日志组件
  const logger = new LoggerCore({
    writer: new MessageWriter(extMsgComm, "serviceWorker/logger"),
    labels: { env: "scripting" },
  });

  logger.logger().debug("scripting start");

  const contentMsg = new CustomEventMessage(eventFlag, true, ScriptEnvTag.content);
  const injectMsg = new PageEventMessage(eventFlag, "scripting");

  const server = new Server("scripting", [contentMsg, injectMsg]);

  // Opera中没有chrome.runtime.onConnect，并且content也不需要chrome.runtime.onConnect
  // 所以不需要处理连接，设置为false
  const extServer = new Server("scripting", extMsgComm, false);
  // scriptExecutor的消息接口
  // 初始化运行环境
  const runtime = new ScriptingRuntime(extServer, server, extMsgComm, contentMsg, injectMsg);
  runtime.init();
  // pageLoad 已在 eventFlag negotiation 前启动；此处只消费同一个结果并建立页面侧 binding。
  runtime.pageLoad(pageLoadPromise);
});
