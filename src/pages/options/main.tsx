import React from "react";
import ReactDOM from "react-dom/client";
import registerEditor from "@App/pkg/utils/monaco-editor";
// eslint-disable-next-line import/no-unresolved
import "uno.css";
import "./index.css";
import "@arco-design/web-react/dist/css/arco.css";
import "@App/locales/locales";
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
import { tryConnect } from "@App/pkg/utils/utils";
import { Message } from "@arco-design/web-react";
import Runtime from "@App/runtime/background/runtime";
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

const message = new MessageInternal("options");
// 注册MessageHandler
IoC.registerInstance(MessageHander, message).alias([
  MessageInternal,
  MessageBroadcast,
]);
IoC.instance(SystemConfig);

// 初始化沙盒通讯
// eslint-disable-next-line no-undef
const messageSandbox = new MessageSandbox(sandbox);
IoC.registerInstance(MessageSandbox, messageSandbox);
// 给runtime设置沙盒
(IoC.instance(Runtime) as Runtime).setMessageSandbox(messageSandbox);
// 开启GMApi,用于调试
class DebugPermissionVerify implements IPermissionVerify {
  verify(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

const gmapi = new GMApi(messageSandbox, new DebugPermissionVerify());
gmapi.start();
IoC.registerInstance(GMApi, gmapi);

tryConnect(message, (ok: boolean) => {
  if (ok) {
    Message.success("重新连接成功");
  } else {
    Message.error("后台通信连接失败,请注意保存当前页面数据,尝试重新连接中...");
  }
});

// 处理沙盒加载消息
messageSandbox.setHandler("sandboxOnload", () => {
  return Promise.resolve(true);
});

// 转发value变更消息给沙盒
message.setHandler("valueUpdate", (action, value) => {
  messageSandbox.send("valueUpdate", value);
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <div>
    <MainLayout className="!flex-row" pageName="options">
      <Sider />
    </MainLayout>
  </div>
);
