import React from "react";
import ReactDOM from "react-dom/client";
import "@arco-design/web-react/dist/css/arco.css";
import MessageInternal from "@App/app/message/internal";
import migrate from "@App/app/migrate";
// eslint-disable-next-line import/no-unresolved
import "uno.css";
import { MessageBroadcast, MessageHander } from "@App/app/message/message";
import IoC from "@App/app/ioc";
import { SystemConfig } from "@App/pkg/config/config";
import "./index.css";
import LoggerCore from "@App/app/logger/core";
import DBWriter from "@App/app/logger/db_writer";
import { LoggerDAO } from "@App/app/repo/logger";
import { switchLight } from "../components/layout/MainLayout";
import App from "./App";
import "@App/locales/locales";

migrate();
// 初始化日志组件
const loggerCore = new LoggerCore({
  debug: process.env.NODE_ENV === "development",
  writer: new DBWriter(new LoggerDAO()),
  labels: { env: "options" },
});
loggerCore.logger().debug("popup start");

const con = new MessageInternal("popup");

IoC.registerInstance(MessageInternal, con).alias([
  MessageHander,
  MessageBroadcast,
]);

IoC.registerInstance(SystemConfig, new SystemConfig(con));

switchLight(localStorage.lightMode || "auto");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <div
    style={{
      borderBottom: "1px solid var(--color-neutral-3)",
    }}
  >
    <App />
  </div>
);
