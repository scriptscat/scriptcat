import ServiceWorkerManager from "./app/service/service_worker";
import LoggerCore from "./app/logger/core";
import DBWriter from "./app/logger/db_writer";
import { LoggerDAO } from "./app/repo/logger";
import { ExtensionMessage } from "@Packages/message/extension_message";
import { Server } from "@Packages/message/server";
import { MessageQueue } from "@Packages/message/message_queue";
import { ServiceWorkerMessageSend } from "@Packages/message/window_message";
import { EventPageOffscreenManager, InProcessMessage } from "./app/service/offscreen/event_page_manager";
import migrate, { migrateChromeStorage } from "./app/migrate";
import { cleanInvalidKeys } from "./app/repo/resource";

migrate();
migrateChromeStorage();

const OFFSCREEN_DOCUMENT_PATH = "src/offscreen.html";

let creating: Promise<void> | null | boolean = null;

async function hasDocument() {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [offscreenUrl],
  });
  return existingContexts.length > 0;
}

async function setupOffscreenDocument() {
  if (typeof chrome.offscreen?.createDocument !== "function") {
    // Firefox 不支持 offscreen document。
    console.error("Your browser does not support chrome.offscreen.createDocument");
    return;
  }
  //if we do not have a document, we are already setup and can skip
  if (!(await hasDocument())) {
    // create offscreen document
    if (!creating) {
      const promise = chrome.offscreen
        .createDocument({
          url: OFFSCREEN_DOCUMENT_PATH,
          reasons: [
            chrome.offscreen.Reason.BLOBS,
            chrome.offscreen.Reason.CLIPBOARD,
            chrome.offscreen.Reason.DOM_SCRAPING,
            chrome.offscreen.Reason.LOCAL_STORAGE,
          ],
          justification: "offscreen page",
        })
        .then(() => {
          if (creating !== promise) {
            console.log("setupOffscreenDocument() calling is invalid.");
            return;
          }
          creating = true; // chrome.offscreen.createDocument 只执行一次
        });
      creating = promise;
    }
    await creating;
  }
}

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
  const messageQueue = new MessageQueue();
  const hasOffscreenDocument = typeof chrome.offscreen?.createDocument === "function";
  if (hasOffscreenDocument) {
    const offscreen = new ServiceWorkerMessageSend();
    // 同时接收ExtensionMessage(chrome.runtime)和ServiceWorkerMessageSend(postMessage)的消息
    const server = new Server("serviceWorker", [message, swMessage]);
    const manager = new ServiceWorkerManager(server, messageQueue, offscreen);
    manager.initManager();
    void setupOffscreenDocument()
      .then(() => messageQueue.emit("offscreenDocumentReady", {}))
      .catch((error) => console.error("Failed to setup offscreen document:", error));
  }
  // Chrome 使用真实 offscreen document；Firefox MV3 改用 event page。
  else {
    // Firefox 的 event page 与 SW 共用同一上下文，runtime 消息不会回送发送者所在 frame；
    // offscreen → SW 因此必须使用进程内桥接，Chrome 的独立 offscreen 文档仍走原通道。
    const offscreenToSw = new InProcessMessage();
    const server = new Server("serviceWorker", [message, swMessage, offscreenToSw]);
    // 同一个 messageQueue 实例同时用于 SW 和 offscreen 两个角色：见 BackgroundEnvManagerBase
    // 构造函数中 messageQueue 参数的说明 - chrome.runtime.sendMessage 广播不会送达发送方自己
    // 所在的 frame，各自新建 MessageQueue 会导致 mq.publish() 广播互相收不到。
    const offscreen = new EventPageOffscreenManager(offscreenToSw, messageQueue);
    const manager = new ServiceWorkerManager(server, messageQueue, offscreen);
    manager.initManager();
  }
}

main();
