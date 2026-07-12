import LoggerCore from "./app/logger/core";
import MessageWriter from "./app/logger/message_writer";
import { OffscreenManager } from "./app/service/offscreen";
import { ServiceWorkerClientMessage } from "@Packages/message/window_message";
import { MessageQueue } from "@Packages/message/message_queue";
import { SystemConfig } from "./pkg/config/config";

const startChromeOffscreenKeepAliveLoop = (enabled: boolean) => {
  if (!enabled) return;
  // Chrome offscreen 保活循环将在后续实现。
};

function main() {
  // 通过postMessage与SW通信,支持结构化克隆(Blob等)
  const swPostMessage = new ServiceWorkerClientMessage();
  // 初始化日志组件
  const loggerCore = new LoggerCore({
    writer: new MessageWriter(swPostMessage, "serviceWorker/logger"),
    labels: { env: "offscreen" },
  });
  loggerCore.logger().debug("offscreen start");
  // 初始化管理器
  const manager = new OffscreenManager(swPostMessage);
  manager.initManager();
  const systemConfig = new SystemConfig(new MessageQueue());
  void systemConfig.getKeepChromeScriptsAlive().then(startChromeOffscreenKeepAliveLoop);
}

main();
