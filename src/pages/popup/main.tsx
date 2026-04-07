import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import LoggerCore from "@App/app/logger/core.ts";
import { message } from "../store/global.ts";
import MessageWriter from "@App/app/logger/message_writer.ts";
import { ThemeProvider } from "../components/theme-provider.tsx";
import "@App/index.css";

// 初始化日志组件
const loggerCore = new LoggerCore({
  writer: new MessageWriter(message),
  labels: { env: "popup" },
});

loggerCore.logger().debug("popup page start");

const Root = (
  <ThemeProvider>
    <App />
  </ThemeProvider>
);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  process.env.NODE_ENV === "development" ? <React.StrictMode>{Root}</React.StrictMode> : Root
);
