import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import MainLayout from "../components/layout/MainLayout.tsx";
import "@arco-design/web-react/dist/css/arco.css";
import "@App/locales/locales";
import "@App/index.css";
import { Provider } from "react-redux";
import { store } from "@App/pages/store/store.ts";
import LoggerCore from "@App/app/logger/core.ts";
import MessageWriter from "@App/app/logger/message_writer.ts";
import { message } from "../store/global.ts";

// 初始化日志组件
const loggerCore = new LoggerCore({
  writer: new MessageWriter(message),
  labels: { env: "import" },
});

loggerCore.logger().debug("page start");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Provider store={store}>
      <MainLayout className="!flex-col !p-[10px] box-border h-auto overflow-auto">
        <App />
      </MainLayout>
    </Provider>
  </React.StrictMode>
);
