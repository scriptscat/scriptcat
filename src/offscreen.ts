import migrate from "./app/migrate";
import LoggerCore from "./app/logger/core";
import DBWriter from "./app/logger/db_writer";
import { LoggerDAO } from "./app/repo/logger";
import { OffscreenManager } from "./app/service/offscreen";

// 初始化数据库
migrate();

function main() {
  // 初始化日志组件
  const loggerCore = new LoggerCore({
    writer: new DBWriter(new LoggerDAO()),
    labels: { env: "offscreen" },
  });
  loggerCore.logger().debug("offscreen start");
  // 初始化管理器
  const manager = new OffscreenManager();
  manager.initManager();
}

main();
