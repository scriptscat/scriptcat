import { forwardMessage, Server } from "@Packages/message/server";
import type { MessageSend } from "@Packages/message/types";
import { ScriptService } from "./script";
import { type Logger } from "@App/app/repo/logger";
import { WindowMessage } from "@Packages/message/window_message";
import { ServiceWorkerClient } from "../service_worker/client";
import { sendMessage } from "@Packages/message/client";
import GMApi from "./gm_api";
import { MessageQueue } from "@Packages/message/message_queue";
import { VSCodeConnect } from "./vscode-connect";

// offscreen环境的管理器
export class OffscreenManager {
  private windowMessage = new WindowMessage(window, sandbox, true);

  private windowServer: Server = new Server("offscreen", this.windowMessage);

  private messageQueue: MessageQueue = new MessageQueue();

  private serviceWorker = new ServiceWorkerClient(this.extMsgSender);

  constructor(private extMsgSender: MessageSend) {}

  logger(data: Logger) {
    // 发送日志消息
    this.sendMessageToServiceWorker({
      action: "logger",
      data,
    });
  }

  preparationSandbox() {
    // 通知初始化好环境了
    this.serviceWorker.preparationOffscreen();
  }

  sendMessageToServiceWorker(data: { action: string; data: any }) {
    return sendMessage(this.extMsgSender, `serviceWorker/${data.action}`, data.data);
  }

  async initManager() {
    // 监听消息
    this.windowServer.on("logger", this.logger.bind(this));
    this.windowServer.on("preparationSandbox", this.preparationSandbox.bind(this));
    this.windowServer.on("sendMessageToServiceWorker", this.sendMessageToServiceWorker.bind(this));
    const script = new ScriptService(
      this.windowServer.group("script"),
      this.extMsgSender,
      this.windowMessage,
      this.messageQueue
    );
    script.init();
    // 转发从sandbox来的gm api请求
    forwardMessage("serviceWorker", "runtime/gmApi", this.windowServer, this.extMsgSender);
    // 转发valueUpdate与emitEvent
    forwardMessage("sandbox", "runtime/valueUpdate", this.windowServer, this.windowMessage);
    forwardMessage("sandbox", "runtime/emitEvent", this.windowServer, this.windowMessage);

    const gmApi = new GMApi(this.windowServer.group("gmApi"));
    gmApi.init();
    const vscodeConnect = new VSCodeConnect(this.windowServer.group("vscodeConnect"), this.extMsgSender);
    vscodeConnect.init();

    this.windowServer.on("createObjectURL", async (params: { data: Blob; persistence: boolean }) => {
      const url = URL.createObjectURL(params.data);
      if (!params.persistence) {
        // 如果不是持久化的，则在1分钟后释放
        setTimeout(() => {
          URL.revokeObjectURL(url);
        }, 1000 * 60);
      }
      return url;
    });
  }
}
