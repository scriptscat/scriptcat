import { forwardMessage, MessageSend, Server } from "@Packages/message/server";
import { ScriptService } from "./script";
import { Logger, LoggerDAO } from "@App/app/repo/logger";
import { WindowMessage } from "@Packages/message/window_message";
import { ExtensionMessageSend } from "@Packages/message/extension_message";
import { ServiceWorkerClient } from "../service_worker/client";
import { sendMessage } from "@Packages/message/client";
import GMApi from "./gm_api";
import { MessageQueue } from "@Packages/message/message_queue";

// offscreen环境的管理器
export class OffscreenManager {
  private extensionMessage: MessageSend = new ExtensionMessageSend();

  private windowMessage = new WindowMessage(window, sandbox, true);

  private windowServer: Server = new Server("offscreen", this.windowMessage);

  private messageQueue: MessageQueue = new MessageQueue();

  private serviceWorker = new ServiceWorkerClient(this.extensionMessage);

  constructor(private extensionMessage:MessageSend) {

  }

  logger(data: Logger) {
    const dao = new LoggerDAO();
    dao.save(data);
  }

  preparationSandbox() {
    // 通知初始化好环境了
    this.serviceWorker.preparationOffscreen();
  }

  sendMessageToServiceWorker(data: { action: string; data: any }) {
    return sendMessage(this.extensionMessage, "serviceWorker/" + data.action, data.data);
  }

  async initManager() {
    // 监听消息
    this.windowServer.on("logger", this.logger.bind(this));
    this.windowServer.on("preparationSandbox", this.preparationSandbox.bind(this));
    this.windowServer.on("sendMessageToServiceWorker", this.sendMessageToServiceWorker.bind(this));
    const script = new ScriptService(
      this.windowServer.group("script"),
      this.extensionMessage,
      this.windowMessage,
      this.messageQueue
    );
    script.init();
    // 转发从sandbox来的gm api请求
    forwardMessage("serviceWorker", "runtime/gmApi", this.windowServer, this.extensionMessage);
    // 转发valueUpdate与emitEvent
    forwardMessage("sandbox", "runtime/valueUpdate", this.windowServer, this.windowMessage);
    forwardMessage("sandbox", "runtime/emitEvent", this.windowServer, this.windowMessage);

    const gmApi = new GMApi(this.windowServer.group("gmApi"));
    gmApi.init();

    this.windowServer.on("createObjectURL", (data: Blob) => {
      console.log("createObjectURL", data);
      const url = URL.createObjectURL(data);
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1000 * 60);
      return Promise.resolve(url);
    });
  }
}
