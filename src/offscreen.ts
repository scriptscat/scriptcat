import type { Message } from "@Packages/message/types";
import LoggerCore from "./app/logger/core";
import MessageWriter from "./app/logger/message_writer";
import { OffscreenManager } from "./app/service/offscreen";
import { ExtensionMessage } from "@Packages/message/extension_message";

function main() {
  // 初始化日志组件
  const extMsgSender: Message = new ExtensionMessage();
  const loggerCore = new LoggerCore({
    writer: new MessageWriter(extMsgSender, "serviceWorker/logger"),
    labels: { env: "offscreen" },
  });
  loggerCore.logger().debug("offscreen start");
  // 初始化管理器
  const manager = new OffscreenManager(extMsgSender);
  manager.initManager();
}

main();
