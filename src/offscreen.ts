import { MessageSend } from "@Packages/message/server";
import LoggerCore from "./app/logger/core";
import MessageWriter from "./app/logger/message_writer";
import { OffscreenManager } from "./app/service/offscreen";
import { ExtensionMessageSend } from "@Packages/message/extension_message";

function main() {
  // 初始化日志组件
  const extensionMessage: MessageSend = new ExtensionMessageSend();
  const loggerCore = new LoggerCore({
    writer: new MessageWriter(extensionMessage),
    labels: { env: "offscreen" },
  });
  loggerCore.logger().debug("offscreen start");
  // 初始化管理器
  const manager = new OffscreenManager(extensionMessage);
  manager.initManager();
}

main();
