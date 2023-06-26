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
import SubscribeManager from "./app/service/subscribe/manager";
import "@App/locales/locales";

// 数据库初始化
migrate();
// 初始化日志组件
const loggerCore = new LoggerCore({
  debug: process.env.NODE_ENV === "development",
  writer: new DBWriter(new LoggerDAO()),
  labels: { env: "background" },
});

loggerCore.logger().debug("background start");
// 通讯中心
const center = new MessageCenter();
center.start();

IoC.registerInstance(MessageCenter, center).alias([
  MessageHander,
  MessageBroadcast,
]);
// 监听logger messagewriter
ListenerMessage(new LoggerDAO(), center);

(IoC.instance(SystemConfig) as SystemConfig).init();

(IoC.instance(SystemManager) as SystemManager).init();
// 资源管理器
const resourceManager = new ResourceManager(center);
// value管理器
const valueManager = new ValueManager(center, center);
const runtime = new Runtime(center, resourceManager, valueManager);
IoC.registerInstance(Runtime, runtime);
// 脚本后台处理器
runtime.start();
// 值后台处理器
valueManager.start();
// 资源后台处理器
resourceManager.start();
(IoC.instance(ScriptManager) as ScriptManager).start();
(IoC.instance(SubscribeManager) as SubscribeManager).start();
// 同步处理器
(IoC.instance(SynchronizeManager) as SynchronizeManager).start();

// 监听沙盒加载
window.onload = () => {
  // 沙盒通讯
  // eslint-disable-next-line no-undef
  const sandboxConnect = new MessageSandbox(sandbox);
  runtime.startSandbox(sandboxConnect);
  // eslint-disable-next-line no-undef
  center.setSandbox(sandbox);
};
center.setHandler("sandboxOnload", () => {
  return Promise.resolve(true);
});
// 启动gm api的监听
const gm = new GMApi(center, new PermissionVerify());
gm.start();
