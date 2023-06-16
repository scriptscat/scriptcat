import React from "react";
import ReactDOM from "react-dom/client";
import registerEditor from "@App/pkg/utils/monaco-editor";
import "@arco-design/web-react/dist/css/arco.css";
import MessageInternal from "@App/app/message/internal";
import migrate from "@App/app/migrate";
// eslint-disable-next-line import/no-unresolved
import "uno.css";
import IoC from "@App/app/ioc";
import DBWriter from "@App/app/logger/db_writer";
import { LoggerDAO } from "@App/app/repo/logger";
import LoggerCore from "@App/app/logger/core";
import { MessageHander } from "@App/app/message/message";
import MainLayout from "../components/layout/MainLayout";
import App from "./App";
import "@App/locales/locales";

migrate();
registerEditor();

// 初始化日志组件
const loggerCore = new LoggerCore({
  debug: process.env.NODE_ENV === "development",
  writer: new DBWriter(new LoggerDAO()),
  labels: { env: "install" },
});
loggerCore.logger().debug("install start");

const con = new MessageInternal("install");

IoC.registerInstance(MessageInternal, con).alias(MessageHander);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <div>
    <MainLayout pageName="install" className="!flex-col !px-4 box-border">
      <App />
    </MainLayout>
  </div>
);
