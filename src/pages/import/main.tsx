import React from "react";
import ReactDOM from "react-dom/client";
import "@arco-design/web-react/dist/css/arco.css";
import MessageInternal from "@App/app/message/internal";
import migrate from "@App/app/migrate";
// eslint-disable-next-line import/no-unresolved
import "uno.css";
import "./index.css";
import IoC from "@App/app/ioc";
import { MessageBroadcast, MessageHander } from "@App/app/message/message";
import { LoggerDAO } from "@App/app/repo/logger";
import DBWriter from "@App/app/logger/db_writer";
import LoggerCore from "@App/app/logger/core";
import App from "./App";
import MainLayout from "../components/layout/MainLayout";
import "@App/locales/locales";

migrate();
// 初始化日志组件
const loggerCore = new LoggerCore({
  debug: process.env.NODE_ENV === "development",
  writer: new DBWriter(new LoggerDAO()),
  labels: { env: "background" },
});

loggerCore.logger().debug("import start");

const con = new MessageInternal("confirm");

IoC.registerInstance(MessageInternal, con).alias([
  MessageHander,
  MessageBroadcast,
]);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <div>
    <MainLayout
      className="!flex-col !p-[10px] box-border h-auto overflow-auto"
      pageName="import"
    >
      <App />
    </MainLayout>
  </div>
);
