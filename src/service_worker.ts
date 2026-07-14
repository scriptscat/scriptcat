import ServiceWorkerManager from "./app/service/service_worker";
import LoggerCore from "./app/logger/core";
import DBWriter from "./app/logger/db_writer";
import { LoggerDAO } from "./app/repo/logger";
import { ExtensionMessage } from "@Packages/message/extension_message";
import { Server } from "@Packages/message/server";
import { MessageQueue } from "@Packages/message/message_queue";
import { ServiceWorkerMessageSend } from "@Packages/message/window_message";
import { EventPageOffscreenManager } from "./app/service/offscreen/event_page_manager";
import migrate, { migrateChromeStorage } from "./app/migrate";
import { cleanInvalidKeys } from "./app/repo/resource";
import { setupOffscreenDocument } from "./app/service/service_worker/offscreen_setup";

migrate();
migrateChromeStorage();

function main() {
  cleanInvalidKeys();
  // 初始化管理器
  const message = new ExtensionMessage(true);
  // 初始化日志组件
  const loggerCore = new LoggerCore({
    writer: new DBWriter(new LoggerDAO()),
    labels: { env: "service_worker" },
  });
  loggerCore.logger().debug("service worker start");
  const swMessage = new ServiceWorkerMessageSend();
  // 同时接收ExtensionMessage(chrome.runtime)和ServiceWorkerMessageSend(postMessage)的消息
  const server = new Server("serviceWorker", [message, swMessage]);
  const messageQueue = new MessageQueue();
  const hasOffscreenDocument = typeof chrome.offscreen?.createDocument === "function";
  // Chrome needs a real offscreen document. Firefox MV3 uses EventPageOffscreenManager instead.
  if (hasOffscreenDocument) {
    const offscreen = new ServiceWorkerMessageSend();
    const manager = new ServiceWorkerManager(server, messageQueue, offscreen);
    manager.initManager();
    setupOffscreenDocument();
  } else {
    const offscreen = new EventPageOffscreenManager(message);
    const manager = new ServiceWorkerManager(server, messageQueue, offscreen);
    manager.initManager();
    // ServiceWorkerManager installs its preparationOffscreen subscribers after .initManager().
    // In Firefox MV3 there is no real offscreen document, so the background event page
    // itself is already the DOM-capable offscreen environment.
    setTimeout(() => {
      messageQueue.emit("preparationOffscreen", {});
    }, 0);
  }
}

main();
