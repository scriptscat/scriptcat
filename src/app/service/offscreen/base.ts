import { forwardMessage, type Server } from "@Packages/message/server";
import type { MessageSend } from "@Packages/message/types";
import { ScriptService } from "./script";
import { type Logger as LoggerRecord } from "@App/app/repo/logger";
import LoggerCore from "@App/app/logger/core";
import { type WindowMessage } from "@Packages/message/window_message";
import { type ServiceWorkerClient } from "../service_worker/client";
import { sendMessage } from "@Packages/message/client";
import GMApi from "./gm_api";
import { MessageQueue, type IMessageQueue } from "@Packages/message/message_queue";
import { VSCodeConnect } from "./vscode-connect";
import { HtmlExtractorService } from "./html_extractor";
import { makeBlobURL } from "@App/pkg/utils/utils";
import { type SandboxChannelHealth } from "./client";
import { startChromeOffscreenKeepAliveLoop } from "./keep_alive";

// 兜底超时：sandbox 若在此时长内从未发出就绪通知(iframe 加载失败/脚本异常等)，
// 也不能让 SW 永久卡在等待 offscreen 就绪上，超时后仍放行，但打印明确的错误日志
export const SANDBOX_READY_FALLBACK_MS = 15000;

// offscreen环境的管理器
export class BackgroundEnvManagerBase {
  private readonly handshakeLogger = LoggerCore.getInstance().logger({ component: "offscreen-sandbox-handshake" });

  // fallback 只能表示父层不再无限等待，不能证明 sandbox 通道可用；真实握手需要独立记录，
  // 这样 fallback 先发生时，迟到的 verified 握手仍可触发一次必要的状态重放。
  private fallbackReadyNotified = false;
  private sandboxReadyVerified = false;

  constructor(
    private readonly extMsgSender: MessageSend,
    private readonly windowMessage: WindowMessage,
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

  preparationSandbox() {
    // sandbox 主动通知自己已就绪(而非由父层猜测/轮询/ping 探测)。
    // Firefox 154+ 下 sandbox manifest 页面是跨源 iframe：contentDocument 为 null，
    // contentWindow.location 不可读，父层没有别的办法探测其就绪状态，也不该去 ping sandbox——
    // 只有 sandbox 自己知道它什么时候真正就绪。sandbox 还会自行做一次通道自检，
    // 结果通过 reportSandboxChannelHealth 单独上报(见下)。
    if (this.sandboxReadyVerified) return;
    this.sandboxReadyVerified = true;
    this.notifyOffscreenReady(true, "sandbox reported readiness");
  }

  // sandbox 自己主动做的通道连通性自检结果，记录到父层(offscreen 文档 / Firefox event page)的日志，
  // 因为 sandbox 自身的控制台通常不便查看
  reportSandboxChannelHealth(health: SandboxChannelHealth) {
    if (health.ok) {
      this.handshakeLogger.debug(`sandbox communication verified (${health.roundTripMs}ms round trip)`);
    } else {
      this.handshakeLogger.error(`sandbox communication check failed: ${health.error}`);
    }
  }

  private notifyOffscreenReady(verified: boolean, reason: string) {
    this.handshakeLogger.debug(`offscreen ready (${reason})`);
    // 通知初始化好环境了
    this.serviceWorker.preparationOffscreen({ verified });
  }

  // 兜底：sandbox 若因 iframe 加载失败/脚本异常等原因从未发出就绪通知，也不能让 SW 永久
  // 卡在等待 offscreen 就绪上 —— 超时后仍然放行，只是没有经过连通性验证
  private armReadyFallback() {
    setTimeout(() => {
      if (!this.sandboxReadyVerified && !this.fallbackReadyNotified) {
        this.fallbackReadyNotified = true;
        this.handshakeLogger.error(
          `no sandbox readiness signal received within ${SANDBOX_READY_FALLBACK_MS}ms; proceeding without a verified sandbox channel`
        );
        this.notifyOffscreenReady(false, "fallback timeout, sandbox never reported readiness");
      }
    }, SANDBOX_READY_FALLBACK_MS);
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
    this.offscreenServer.on("preparationSandbox", this.preparationSandbox.bind(this));
    this.offscreenServer.on("reportSandboxChannelHealth", this.reportSandboxChannelHealth.bind(this));
    this.offscreenServer.on("getExtensionEnv", this.getExtensionEnv.bind(this));
    this.offscreenServer.on("sendMessageToServiceWorker", this.sendMessageToServiceWorker.bind(this));
    this.offscreenServer.on("keepAlive", startChromeOffscreenKeepAliveLoop());
    this.armReadyFallback();
    const script = new ScriptService(
      this.offscreenServer.group("script"),
      this.extMsgSender,
      this.windowMessage,
      this.messageQueue
    );
    script.init();
    // 转发从sandbox来的gm api请求
    forwardMessage("serviceWorker", "runtime/gmApi", this.offscreenServer, this.extMsgSender);
    // 转发 Skill Script 执行请求到 sandbox
    forwardMessage("sandbox", "executeSkillScript", this.offscreenServer, this.windowMessage);
    // 转发valueUpdate与emitEvent
    forwardMessage("sandbox", "runtime/valueUpdate", this.offscreenServer, this.windowMessage);
    forwardMessage("sandbox", "runtime/emitEvent", this.offscreenServer, this.windowMessage);

    const gmApi = new GMApi(this.offscreenServer.group("gmApi"));
    gmApi.init();
    const vscodeConnect = new VSCodeConnect(this.offscreenServer.group("vscodeConnect"), this.extMsgSender);
    vscodeConnect.init();
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
  }
}
