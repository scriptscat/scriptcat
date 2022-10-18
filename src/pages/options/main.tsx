import React from "react";
import ReactDOM from "react-dom/client";
import registerEditor from "@App/utils/monaco-editor";
// eslint-disable-next-line import/no-unresolved
import "uno.css";
import "@arco-design/web-react/dist/css/arco.css";
import MessageInternal from "@App/app/message/internal";
import migrate from "@App/app/migrate";
import MessageSandbox from "@App/app/message/sandbox";
import GMApi from "@App/runtime/background/gm_api";
import { MessageBroadcast, MessageHander } from "@App/app/message/message";
import IoC from "@App/app/ioc";
import LoggerCore from "@App/app/logger/core";
import DBWriter from "@App/app/logger/db_writer";
import { LoggerDAO } from "@App/app/repo/logger";
import { IPermissionVerify } from "@App/runtime/background/permission_verify";
import { SystemConfig } from "@App/pkg/config/config";
import MainLayout from "../components/layout/MainLayout";
import Sider from "../components/layout/Sider";

migrate();
// 初始化日志组件
const loggerCore = new LoggerCore({
  debug: process.env.NODE_ENV === "development",
  writer: new DBWriter(new LoggerDAO()),
  labels: { env: "options" },
});
loggerCore.logger().debug("options start");
// 注册编辑器需要的资源
registerEditor();

// 注册MessageHandler
IoC.registerInstance(MessageHander, new MessageInternal("options")).alias([
  MessageInternal,
  MessageBroadcast,
]);

IoC.registerInstance(
  SystemConfig,
  new SystemConfig(IoC.instance(MessageHander), IoC.instance(MessageInternal))
);

// 初始化沙盒通讯
// eslint-disable-next-line no-undef
const messageSandbox = new MessageSandbox(sandbox);
IoC.registerInstance(MessageSandbox, messageSandbox);
// 开启GMApi,用于调试
class DebugPermissionVerify implements IPermissionVerify {
  verify(): Promise<boolean> {
    return Promise.resolve(true);
  }
}
const gmapi = new GMApi(messageSandbox, new DebugPermissionVerify());
gmapi.start();
IoC.registerInstance(GMApi, gmapi);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <div>
    <MainLayout className="!flex-row">
      <Sider />
    </MainLayout>
  </div>
);
