import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import { AppProvider } from "../store/AppContext.tsx";
import MainLayout from "../components/layout/MainLayout.tsx";
import LoggerCore from "@App/app/logger/core.ts";
import { message } from "../store/global.ts";
import MessageWriter from "@App/app/logger/message_writer.ts";
import "@arco-design/web-react/dist/css/arco.css";
import "@App/locales/locales";
import "@App/index.css";

// 初始化日志组件
const loggerCore = new LoggerCore({
  writer: new MessageWriter(message),
  labels: { env: "import" },
});

loggerCore.logger().debug("import page start");

const Root = (
  <AppProvider>
    <MainLayout className="!uno-flex-col !uno-p-[10px] uno-box-border uno-h-auto uno-overflow-auto">
      <App />
    </MainLayout>
  </AppProvider>
);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  process.env.NODE_ENV === "development" ? <React.StrictMode>{Root}</React.StrictMode> : Root
);
