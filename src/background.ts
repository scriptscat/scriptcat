import ConnectCenter from "./app/connect/center";
import LoggerCore from "./app/logger/core";
import DBWriter from "./app/logger/dbWriter";
import migrate from "./app/migrate";
import { LoggerDAO } from "./app/repo/logger";
import ScriptManager from "./app/service/script/manager";
// 数据库初始化
migrate();
// 初始化日志组件
const loggerCore = new LoggerCore({
  debug: process.env.NODE_ENV === "development",
  writer: new DBWriter(new LoggerDAO()),
});

loggerCore.logger({ env: "background" }).debug("background start");
// 通讯中心
const center = new ConnectCenter();
center.listen();
// 脚本后台处理器
const scriptManager = new ScriptManager(center);
scriptManager.start();
