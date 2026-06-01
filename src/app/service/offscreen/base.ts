import { forwardMessage, type Server } from "@Packages/message/server";
import type { MessageSend } from "@Packages/message/types";
import { ScriptService } from "./script";
import { type Logger } from "@App/app/repo/logger";
import { type WindowMessage } from "@Packages/message/window_message";
import { type ServiceWorkerClient } from "../service_worker/client";
import { sendMessage } from "@Packages/message/client";
import GMApi from "./gm_api";
import { MessageQueue } from "@Packages/message/message_queue";
import { VSCodeConnect } from "./vscode-connect";
import { makeBlobURL } from "@App/pkg/utils/utils";

// offscreen环境的管理器
export class BackgroundEnvManagerBase {
  private readonly messageQueue = new MessageQueue();

  constructor(
    private readonly extMsgSender: MessageSend,
    private readonly windowMessage: WindowMessage,
    private readonly offscreenServer: Server,
    private readonly serviceWorker: ServiceWorkerClient
  ) {}

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
    this.offscreenServer.on("logger", this.logger.bind(this));
    this.offscreenServer.on("preparationSandbox", this.preparationSandbox.bind(this));
    this.offscreenServer.on("sendMessageToServiceWorker", this.sendMessageToServiceWorker.bind(this));
    const script = new ScriptService(
      this.offscreenServer.group("script"),
      this.extMsgSender,
      this.windowMessage,
      this.messageQueue
    );
    script.init();
    // 转发从sandbox来的gm api请求
    forwardMessage("serviceWorker", "runtime/gmApi", this.offscreenServer, this.extMsgSender);
    // 转发valueUpdate与emitEvent
    forwardMessage("sandbox", "runtime/valueUpdate", this.offscreenServer, this.windowMessage);
    forwardMessage("sandbox", "runtime/emitEvent", this.offscreenServer, this.windowMessage);

    const gmApi = new GMApi(this.offscreenServer.group("gmApi"));
    gmApi.init();
    const vscodeConnect = new VSCodeConnect(this.offscreenServer.group("vscodeConnect"), this.extMsgSender);
    vscodeConnect.init();

    this.offscreenServer.on("createObjectURL", async (params: { blob: Blob; persistence: boolean }) => {
      return makeBlobURL(params) as string;
    });
  }
}
