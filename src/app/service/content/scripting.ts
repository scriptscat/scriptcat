import { Client, sendMessage } from "@Packages/message/client";
import { type CustomEventMessage } from "@Packages/message/custom_event_message";
import { forwardMessage, type Server } from "@Packages/message/server";
import type { MessageSend } from "@Packages/message/types";
import type { TScriptInfo } from "@App/app/repo/scripts";
import type { SerializedDocumentResponse } from "./gm_api/gm_xhr";
import { RuntimeClient } from "../service_worker/client";
import { makeBlobURL } from "@App/pkg/utils/utils";
import type { Logger } from "@App/app/repo/logger";
import LoggerCore from "@App/app/logger/core";
import {
  getExtensionOrigin,
  getPageRpcAllowedAPIs,
  PAGE_RPC_VERSION,
  PageRpcRegistry,
  validatePageGMRequest,
} from "./page_rpc";
import { getEffectiveScriptGrants } from "./utils";
import type { MainTransportClientResolution, MainTransportResolution } from "../service_worker/types";

const PageOrContent = {
  PAGE: 1,
  CONTENT: 2,
  PAGE_AND_CONTENT: 3,
} as const;

type PageOrContent = ValueOf<typeof PageOrContent>;

export const serializeDocumentResponse = (
  response: Document | null,
  contentType: string
): SerializedDocumentResponse | undefined => {
  if (!response) return undefined;
  try {
    return { text: new XMLSerializer().serializeToString(response), contentType };
  } catch {
    return undefined;
  }
};

// scripting页的处理
export default class ScriptingRuntime {
  private mainTransportToken?: string;
  private mainFallbackActive = false;
  private fallbackPumpRunning = false;
  private mainResolutionTimer?: ReturnType<typeof setTimeout>;
  // 页面请求必须先在此注册句柄，再由 transform 解析为隔离 broker 可接受的身份。
  private readonly pageRpc = new PageRpcRegistry();
  constructor(
    // 监听来自service_worker的消息
    private readonly extServer: Server,
    // 监听来自inject的消息
    private readonly server: Server,
    // 发送给扩展service_worker的通信接口
    private readonly senderToExt: MessageSend,
    // 发送给 content的消息接口
    private readonly senderToContent: CustomEventMessage,
    // 发送给inject的消息接口
    private readonly senderToInject: MessageSend
  ) {}

  // 广播消息给 content 和 inject
  broadcastToPage(
    action: string,
    data?: any,
    activeOn: PageOrContent = (PageOrContent.PAGE | PageOrContent.CONTENT) as PageOrContent
  ): Promise<undefined> {
    return Promise.all([
      activeOn & PageOrContent.CONTENT && sendMessage(this.senderToContent, "content/" + action, data),
      activeOn & PageOrContent.PAGE && sendMessage(this.senderToInject, "inject/" + action, data),
    ]).then(() => undefined);
  }

  init() {
    this.extServer.on("runtime/emitEvent", () => {
      if (!this.mainFallbackActive) return undefined;
      return this.deliverFallbackBatch();
    });
    this.extServer.on("runtime/valueUpdate", () => {
      if (!this.mainFallbackActive) return undefined;
      return this.deliverFallbackBatch();
    });
    this.extServer.on("runtime/pumpFallback", (data: { transportToken?: unknown }) => {
      if (!this.mainFallbackActive || data?.transportToken !== this.mainTransportToken) return undefined;
      return this.deliverFallbackBatch();
    });
    this.server.on("logger", (data: Logger) => {
      LoggerCore.logger().log(data.level, data.message, data.label);
    });

    forwardMessage("serviceWorker", "script/isInstalled", this.server, this.senderToExt);
    forwardMessage(
      "serviceWorker",
      "runtime/gmApi",
      this.server,
      this.senderToExt,
      (data: { api: string; params: any }) => {
        if (!this.mainFallbackActive) throw new Error("MAIN fallback transport is inactive");
        // 拦截关注的 API，未命中则返回 false 交由默认转发处理
        switch (data.api) {
          case "CAT_createBlobUrl": {
            const file = data.params[0] as File;
            const url = makeBlobURL({ blob: file, persistence: false }) as string;
            return url;
          }
          case "CAT_fetchBlob": {
            return fetch(data.params[0]).then((res) => res.blob());
          }
          case "CAT_agentOPFS": {
            // chrome.runtime 不支持 Blob，write 操作的 Blob content 需先转为 blob URL
            const req = data.params[0];
            if (req?.action === "write" && req.content instanceof Blob) {
              req.content = makeBlobURL({ blob: req.content, persistence: true }) as string;
            }
            return false; // 继续转发到 SW
          }
          case "CAT_fetchDocument": {
            return new Promise((resolve) => {
              const xhr = new XMLHttpRequest();
              xhr.responseType = "document";
              xhr.open("GET", data.params[0]);
              xhr.onloadend = () => {
                resolve(
                  serializeDocumentResponse(
                    xhr.response as Document | null,
                    xhr.getResponseHeader("Content-Type") || ""
                  )
                );
              };
              xhr.onerror = () => resolve(undefined);
              xhr.send();
            });
          }
          case "GM_log":
            // 拦截 GM_log：直接打印到控制台（某些页面可能劫持 console.log）
            switch (data.params.length) {
              case 1:
                console.log(data.params[0]);
                break;
              case 2:
                console.log("[" + data.params[1] + "]", data.params[0]);
                break;
              case 3:
                console.log("[" + data.params[1] + "]", data.params[0], data.params[2]);
                break;
            }
            break;
        }
        return false;
      },
      (data) => {
        // 所有来自页面的 GM RPC 都在转发前完成字段、句柄、授权和参数复制检查；
        // wire 身份只带 handle，canonical uuid/runFlag/envTag 由 SW 依据 handle + 真实 sender 解析。
        const request = validatePageGMRequest(data, this.pageRpc);
        return {
          version: PAGE_RPC_VERSION,
          sequence: request.sequence,
          handle: request.handle,
          api: request.api,
          params: request.params,
        };
      }
    );
  }

  private activateFallback(resolution: MainTransportResolution): TScriptInfo[] | undefined {
    if (resolution.mode !== "fallback") return undefined;
    this.pageRpc.revokeAll();
    const activeScripts: TScriptInfo[] = [];
    for (const script of resolution.scripts as TScriptInfo[]) {
      const handle = script.executionHandle;
      if (!handle || !script.executionRunFlag) continue;
      const allowedAPIs = getPageRpcAllowedAPIs(getEffectiveScriptGrants(script.metadata));
      this.pageRpc.register(script.uuid, "it", allowedAPIs, handle, script.executionRunFlag);
      activeScripts.push(script);
    }
    this.mainFallbackActive = true;
    return activeScripts;
  }

  private async deliverFallbackBatch(): Promise<undefined> {
    if (!this.mainFallbackActive || !this.mainTransportToken || this.fallbackPumpRunning) return undefined;
    this.fallbackPumpRunning = true;
    try {
      const client = new RuntimeClient(this.senderToExt);
      while (this.mainFallbackActive && this.mainTransportToken) {
        const resolution = await client.advanceMainFallback({ transportToken: this.mainTransportToken });
        if (resolution.mode === "ambiguous") {
          this.scheduleMainTransportResolution(50);
          return undefined;
        }
        if (resolution.mode !== "fallback" || !resolution.batch) return undefined;
        const receipt = await sendMessage(this.senderToInject, "inject/fallbackBatch", resolution.batch);
        if (!receipt || typeof receipt !== "object" || (receipt as { applied?: unknown }).applied !== true)
          return undefined;
        const acknowledged = await client.advanceMainFallback({
          transportToken: this.mainTransportToken,
          ackBatchId: resolution.batch.id,
        });
        if (acknowledged.mode === "ambiguous") {
          this.scheduleMainTransportResolution(50);
          return undefined;
        }
      }
    } finally {
      this.fallbackPumpRunning = false;
    }
    return undefined;
  }

  private scheduleMainTransportResolution(delayMs: number): void {
    if (this.mainResolutionTimer) clearTimeout(this.mainResolutionTimer);
    this.mainResolutionTimer = setTimeout(
      () => {
        this.mainResolutionTimer = undefined;
        void this.resolveMainTransport();
      },
      Math.max(0, delayMs)
    );
  }

  private async resolveMainTransport(): Promise<void> {
    if (!this.mainTransportToken || this.mainFallbackActive) return;
    const resolution: MainTransportClientResolution = await new RuntimeClient(this.senderToExt).resolveMainTransport({
      transportToken: this.mainTransportToken,
    });
    if (resolution.mode === "ambiguous") {
      this.scheduleMainTransportResolution(50);
    } else if (resolution.mode === "pending") {
      this.scheduleMainTransportResolution(Math.max(10, resolution.retryAfterMs ?? 50));
    } else if (resolution.mode === "fallback") {
      const scripts = this.activateFallback(resolution);
      if (!scripts) return;
      await sendMessage(this.senderToInject, "inject/pageLoad", {
        scripts,
        envInfo: resolution.envInfo,
        reconnectToken: undefined,
      });
      await this.deliverFallbackBatch();
    }
  }

  pageLoad() {
    const client = new RuntimeClient(this.senderToExt);
    let lifecycleSequence = 0;
    window.addEventListener("pageshow", (e) => {
      if (e.persisted && this.mainTransportToken) {
        void client
          .mainTransportLifecycle({
            transportToken: this.mainTransportToken,
            lifecycleSequence: ++lifecycleSequence,
            event: "pageshow",
            persisted: true,
          })
          .then((result) =>
            result.mode === "ambiguous" ? this.scheduleMainTransportResolution(50) : this.deliverFallbackBatch()
          );
        void client.pageShow();
      }
    });
    window.addEventListener("pagehide", (e) => {
      if (this.mainTransportToken) {
        void client.mainTransportLifecycle({
          transportToken: this.mainTransportToken,
          lifecycleSequence: ++lifecycleSequence,
          event: "pagehide",
          persisted: e.persisted,
        });
      }
    });
    // 向service_worker请求脚本列表及环境信息
    const pageLoadPromise = client.pageLoad("it");
    this.mainTransportToken = client.mainTransportToken;
    pageLoadPromise.then((o) => {
      if (!o.ok) return;
      const { envInfo, userScriptBootstrapToken, userScriptInjectBootstrapToken } = o;
      this.mainTransportToken = o.mainTransportToken || client.mainTransportToken;
      this.pageRpc.revokeAll();
      if (typeof userScriptBootstrapToken === "string" && userScriptBootstrapToken.length > 0) {
        const contentClient = new Client(this.senderToContent, "content");
        contentClient.do("pageLoad", {
          bootstrapToken: userScriptBootstrapToken,
          envInfo,
          extensionOrigin: getExtensionOrigin(),
        });
      }

      if (typeof userScriptInjectBootstrapToken === "string" && userScriptInjectBootstrapToken.length > 0) {
        const injectClient = new Client(this.senderToInject, "inject");
        injectClient.do("bootstrap", { bootstrapToken: userScriptInjectBootstrapToken });
      }
      this.scheduleMainTransportResolution(o.mainTransportFallbackRetryAfterMs ?? 0);
    });
  }
}
