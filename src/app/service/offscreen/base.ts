import { forwardMessage, type Server } from "@Packages/message/server";
import type { MessageSend } from "@Packages/message/types";
import { ScriptService } from "./script";
import { type Logger as LoggerRecord } from "@App/app/repo/logger";
import LoggerCore from "@App/app/logger/core";
import type { SandboxChannelHost } from "@Packages/message/sandbox_message_channel";
import { type ServiceWorkerClient } from "../service_worker/client";
import { sendMessage } from "@Packages/message/client";
import GMApi from "./gm_api";
import { MessageQueue, type IMessageQueue } from "@Packages/message/message_queue";
import { VSCodeConnect } from "./vscode-connect";
import { ExternalAccessConnect } from "./external-access-connect";
import { HtmlExtractorService } from "./html_extractor";
import { makeBlobURL } from "@App/pkg/utils/utils";
import { startChromeOffscreenKeepAliveLoop } from "./keep_alive";

// offscreen环境的管理器
export class BackgroundEnvManagerBase {
  private readonly handshakeLogger = LoggerCore.getInstance().logger({ component: "offscreen-sandbox-handshake" });

  constructor(
    private readonly extMsgSender: MessageSend,
    private readonly sandboxMessage: SandboxChannelHost,
    private readonly offscreenServer: Server,
    private readonly serviceWorker: ServiceWorkerClient,
    // Chrome: offscreen 文档是独立进程，这里默认创建自己的 MessageQueue，
    // 靠 chrome.runtime.sendMessage 广播与 SW 侧的 MessageQueue 互通，没有问题。
    // Firefox: EventPageOffscreenManager 与 SW 是同一个脚本/进程；
    // chrome.runtime.sendMessage 广播不会送达"发送方自己所在的 frame"
    // (https://developer.chrome.com/docs/extensions/reference/api/runtime#event-onMessage 明确写明
    // "except for the sender's frame")，所以若各自创建独立的 MessageQueue 实例，
    // 广播永远到不了对方，enableScripts/deleteScripts/installScript/setSandboxLanguage 等
    // 全部失效——crontab 定时脚本正是靠 enableScripts 广播才会被 sandbox 端调度，这也是
    // "手动运行正常，但定时任务从不自动触发"的根本原因。因此 Firefox 侧必须把 SW 自己已有的
    // 同一个 MessageQueue 实例注入进来，让两边共用同一份 EventEmitter，而不是各自新建。
    private readonly messageQueue: IMessageQueue = new MessageQueue()
  ) {}

  logger(data: LoggerRecord) {
    // 发送日志消息
    this.sendMessageToServiceWorker({
      action: "logger",
      data,
    });
  }

  async getExtensionEnv(data: { requireUAD: boolean }) {
    return this.sendMessageToServiceWorker({
      action: "getExtensionEnv",
      data: data,
    });
  }

  sendMessageToServiceWorker(data: { action: string; data: any }) {
    return sendMessage(this.extMsgSender, `serviceWorker/${data.action}`, data.data);
  }

  async initManager() {
    // 监听消息
    this.offscreenServer.on("logger", this.logger.bind(this));
    this.offscreenServer.on("getExtensionEnv", this.getExtensionEnv.bind(this));
    this.offscreenServer.on("sendMessageToServiceWorker", this.sendMessageToServiceWorker.bind(this));
    this.offscreenServer.on("keepAlive", startChromeOffscreenKeepAliveLoop());
    const script = new ScriptService(
      this.offscreenServer.group("script"),
      this.extMsgSender,
      this.sandboxMessage,
      this.messageQueue
    );
    script.init();
    // 转发从sandbox来的gm api请求
    forwardMessage("serviceWorker", "runtime/gmApi", this.offscreenServer, this.extMsgSender);
    // 转发 Skill Script 执行请求到 sandbox
    forwardMessage("sandbox", "executeSkillScript", this.offscreenServer, this.sandboxMessage);
    // 转发valueUpdate与emitEvent
    forwardMessage("sandbox", "runtime/valueUpdate", this.offscreenServer, this.sandboxMessage);
    forwardMessage("sandbox", "runtime/emitEvent", this.offscreenServer, this.sandboxMessage);

    const gmApi = new GMApi(this.offscreenServer.group("gmApi"));
    gmApi.init();
    const vscodeConnect = new VSCodeConnect(this.offscreenServer.group("vscodeConnect"), this.extMsgSender);
    vscodeConnect.init();
    const externalAccessConnect = new ExternalAccessConnect(
      this.offscreenServer.group("externalAccessConnect"),
      this.extMsgSender
    );
    externalAccessConnect.init();
    const htmlExtractor = new HtmlExtractorService(this.offscreenServer.group("htmlExtractor"));
    htmlExtractor.init();

    this.offscreenServer.on("createObjectURL", async (params: { blob: Blob; persistence: boolean }) => {
      return makeBlobURL(params) as string;
    });

    // fetch blob URL 并返回 Blob（供 SW 在 chrome.runtime 通道下还原 content script 创建的 blob URL）
    this.offscreenServer.on("fetchBlob", async (params: { url: string }) => {
      const res = await fetch(params.url);
      return await res.blob();
    });

    // 接收到 sandbox transfer 的 MessagePort 本身就是唯一、已验证的 readiness 信号。
    // 不再维护 preparationSandbox RPC、额外 health ping 或“无通道也放行”的 timeout fallback。
    await this.sandboxMessage.ready();
    this.handshakeLogger.debug("offscreen ready (private sandbox MessagePort attached)");
    await this.serviceWorker.preparationOffscreen({ verified: true });
  }
}
