import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import LoggerCore from "@App/app/logger/core.ts";
import { message } from "../store/global.ts";
import MessageWriter from "@App/app/logger/message_writer.ts";
import { ThemeProvider } from "../components/theme-provider.tsx";
import { Toaster } from "../components/ui/sonner.tsx";
import { getIncompleteContextFallbackUrl } from "./context_fallback.ts";
import "@App/index.css";

// 初始化日志组件
const loggerCore = new LoggerCore({
  writer: MessageWriter.serviceWorker(message),
  labels: { env: "install" },
});

loggerCore.logger().debug("install page start");

const Root = (
  <ThemeProvider>
    <App />
    <Toaster placement="decision" />
  </ThemeProvider>
);

const fallbackUrl = getIncompleteContextFallbackUrl(location.search, typeof chrome.tabs !== "undefined");
if (fallbackUrl) {
  location.replace(fallbackUrl);
} else {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    process.env.NODE_ENV === "development" ? <React.StrictMode>{Root}</React.StrictMode> : Root
  );
}
