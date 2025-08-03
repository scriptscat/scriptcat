import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import { Provider } from "react-redux";
import { store } from "@App/pages/store/store.ts";
import MainLayout from "../components/layout/MainLayout.tsx";
import LoggerCore from "@App/app/logger/core.ts";
import { message } from "../store/global.ts";
import MessageWriter from "@App/app/logger/message_writer.ts";
import "@arco-design/web-react/dist/css/arco.css";
import "@App/locales/locales";
import "@App/index.css";
import "./index.css";

// 初始化日志组件
const loggerCore = new LoggerCore({
  writer: new MessageWriter(message),
  labels: { env: "install" },
});

loggerCore.logger().debug("install page start");

// 接收FileSystemType
window.addEventListener(
  "message",
  (event) => {
    if (event.data && event.data.type === "file") {
      // 将FileSystemType存储到全局变量中
      window.localFile = event.data.file;
      window.localFileHandle = event.data.fileHandle;
    }
  },
  false
);

const Root = (
  <Provider store={store}>
    <MainLayout className="!flex-col !px-4 box-border install-main-layout">
      <App />
    </MainLayout>
  </Provider>
);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  process.env.NODE_ENV === "development" ? <React.StrictMode>{Root}</React.StrictMode> : Root
);
