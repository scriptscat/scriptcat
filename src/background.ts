import MessageCenter from "./app/message/center";
import MessageSandbox from "./app/message/sandbox";
import LoggerCore from "./app/logger/core";
import DBWriter from "./app/logger/dbWriter";
import { ListenerMessage } from "./app/logger/messageWriter";
import migrate from "./app/migrate";
import { LoggerDAO } from "./app/repo/logger";
import { ResourceManager } from "./app/service/resource/manager";
import ScriptManager from "./app/service/script/manager";
import { ValueManager } from "./app/service/value/manager";
import Runtime from "./runtime/background/runtime";
import GMApi from "./runtime/background/gm_api";
// 数据库初始化
migrate();
// 初始化日志组件
const loggerCore = new LoggerCore({
  debug: process.env.NODE_ENV === "development",
  writer: new DBWriter(new LoggerDAO()),
});

loggerCore.logger({ env: "background" }).debug("background start");
// 沙盒通讯
// eslint-disable-next-line no-undef
const sandboxConnect = new MessageSandbox(sandbox);
// 通讯中心
const center = new MessageCenter();
center.start();
// 监听logger messagewriter
ListenerMessage(new LoggerDAO(), center);

// 等待沙盒启动后再进行后续的步骤
center.setHandler("sandboxOnload", () => {
  // 资源管理器
  const resourceManager = new ResourceManager(center);
  // value管理器
  const valueManager = new ValueManager(center);
  // 脚本后台处理器
  const scriptManager = new ScriptManager(
    center,
    new Runtime(sandboxConnect, resourceManager, valueManager)
  );
  scriptManager.start();
});

// 启动gm api的监听
const gm = new GMApi();
gm.start();
