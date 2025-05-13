import LoggerCore from "./app/logger/core";
import MessageWriter from "./app/logger/message_writer";
import { ExtensionMessage, ExtensionMessageSend } from "@Packages/message/extension_message";
import { CustomEventMessage } from "@Packages/message/custom_event_message";
import { RuntimeClient } from "./app/service/service_worker/client";
import { Server } from "@Packages/message/server";
import ContentRuntime from "./app/service/content/content";

// 建立与service_worker页面的连接
const send = new ExtensionMessageSend();

// 初始化日志组件
const loggerCore = new LoggerCore({
  writer: new MessageWriter(send),
  labels: { env: "content" },
});

const client = new RuntimeClient(send);
client.pageLoad().then((data) => {
  loggerCore.logger().debug("content start");
  const extMsg = new ExtensionMessage();
  const msg = new CustomEventMessage(data.flag, true);
  const server = new Server("content", msg);
  const extServer = new Server("content", extMsg);
  // 初始化运行环境
  const runtime = new ContentRuntime(extServer, server, send, msg);
  runtime.start(data.scripts);
});
