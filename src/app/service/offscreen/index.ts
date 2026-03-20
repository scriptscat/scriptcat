import { forwardMessage, Server } from "@Packages/message/server";
import type { MessageSend } from "@Packages/message/types";
import { ScriptService } from "./script";
import { type Logger } from "@App/app/repo/logger";
import { WindowMessage } from "@Packages/message/window_message";
import { sendMessage } from "@Packages/message/client";
import GMApi from "./gm_api";
import { MessageQueue } from "@Packages/message/message_queue";
import { VSCodeConnect } from "./vscode-connect";
import { makeBlobURL } from "@App/pkg/utils/utils";

// offscreen环境的管理器
export class OffscreenManager {
  private windowMessage: WindowMessage;

  private windowServer: Server;

  private messageQueue = new MessageQueue();

  constructor(private msgSender: MessageSend) {
    this.windowMessage = new WindowMessage(window, sandbox, true);
    this.windowServer = new Server("offscreen", this.windowMessage);
  }

  logger(data: Logger) {
    // 发送日志消息
    this.sendMessageToServiceWorker({
      action: "logger",
      data,
    });
  }

  preparationSandbox() {
    // 通知初始化好环境了
    sendMessage(this.msgSender, "serviceWorker/preparationOffscreen");
  }

  sendMessageToServiceWorker(data: { action: string; data: any }) {
    return sendMessage(this.msgSender, `serviceWorker/${data.action}`, data.data);
  }

  async initManager() {
    // 监听消息
    this.windowServer.on("logger", this.logger.bind(this));
    this.windowServer.on("preparationSandbox", this.preparationSandbox.bind(this));
    this.windowServer.on("sendMessageToServiceWorker", this.sendMessageToServiceWorker.bind(this));
    const script = new ScriptService(
      this.windowServer.group("script"),
      this.msgSender,
      this.windowMessage,
      this.messageQueue
    );
    script.init();
    // 转发从sandbox来的gm api请求,通过postMessage通道传输(支持Blob等结构化克隆)
    forwardMessage("serviceWorker", "runtime/gmApi", this.windowServer, this.msgSender);
    // 转发valueUpdate与emitEvent
    forwardMessage("sandbox", "runtime/valueUpdate", this.windowServer, this.windowMessage);
    forwardMessage("sandbox", "runtime/emitEvent", this.windowServer, this.windowMessage);

    const gmApi = new GMApi(this.windowServer.group("gmApi"));
    gmApi.init();
    const vscodeConnect = new VSCodeConnect(this.windowServer.group("vscodeConnect"), this.msgSender);
    vscodeConnect.init();

    this.windowServer.on("createObjectURL", async (params: { blob: Blob; persistence: boolean }) => {
      return makeBlobURL(params) as string;
    });
  }
}
