import { WindowMessenger } from "@Packages/message/window_message";
import LoggerCore from "./app/logger/core";
import MessageWriter from "./app/logger/message_writer";
import { SandboxManager } from "./app/service/sandbox";

function main() {
  // 建立与offscreen页面的连接
  const msg = new WindowMessenger(window, parent);

  // 初始化日志组件
  const loggerCore = new LoggerCore({
    writer: new MessageWriter(msg, "offscreen/logger"),
    labels: { env: "sandbox" },
  });
  loggerCore.logger().debug("offscreen start");

  // 初始化管理器
  const manager = new SandboxManager(msg);
  manager.initManager();
}

main();
