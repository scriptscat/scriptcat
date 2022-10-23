import MessageCenter from "./app/message/center";
import MessageSandbox from "./app/message/sandbox";
import LoggerCore from "./app/logger/core";
import DBWriter from "./app/logger/db_writer";
import { ListenerMessage } from "./app/logger/message_writer";
import migrate from "./app/migrate";
import { LoggerDAO } from "./app/repo/logger";
import { ResourceManager } from "./app/service/resource/manager";
import ScriptManager from "./app/service/script/manager";
import { ValueManager } from "./app/service/value/manager";
import Runtime from "./runtime/background/runtime";
import GMApi from "./runtime/background/gm_api";
import IoC from "./app/ioc";
import { MessageBroadcast, MessageHander } from "./app/message/message";
import PermissionVerify from "./runtime/background/permission_verify";
import { SystemConfig } from "./pkg/config/config";
import SystemManager from "./app/service/system/manager";
import SynchronizeManager from "./app/service/synchronize/manager";
// 数据库初始化
migrate();
// 初始化日志组件
const loggerCore = new LoggerCore({
  debug: process.env.NODE_ENV === "development",
  writer: new DBWriter(new LoggerDAO()),
  labels: { env: "background" },
});

loggerCore.logger().debug("background start");
// 沙盒通讯
// eslint-disable-next-line no-undef
const sandboxConnect = new MessageSandbox(sandbox);
// 通讯中心
const center = new MessageCenter();
center.start();
IoC.registerInstance(MessageCenter, center).alias([
  MessageHander,
  MessageBroadcast,
]);
// 监听logger messagewriter
ListenerMessage(new LoggerDAO(), center);
// 启动系统配置
IoC.registerInstance(SystemConfig, new SystemConfig(center));

IoC.instance(SystemManager).init();

// 等待沙盒启动后再进行后续的步骤
center.setHandler("sandboxOnload", () => {
  // 资源管理器
  const resourceManager = new ResourceManager(center);
  // value管理器
  const valueManager = new ValueManager(center, center);
  const runtime = new Runtime(
    center,
    sandboxConnect,
    resourceManager,
    valueManager
  );
  IoC.registerInstance(Runtime, runtime);
  // 脚本后台处理器
  runtime.listenEvent();
  IoC.instance(ScriptManager).start();
  // 同步处理器
  IoC.instance(SynchronizeManager).start();
});

// 启动gm api的监听
const gm = new GMApi(center, new PermissionVerify());
gm.start();
