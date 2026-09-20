import { Client } from "@Packages/message/client";
import { type CustomEventMessage } from "@Packages/message/custom_event_message";
import { forwardMessage, type Server } from "@Packages/message/server";
import type { MessageSend } from "@Packages/message/types";
import type { TScriptInfo } from "@App/app/repo/scripts";
import type { SerializedDocumentResponse } from "./gm_api/gm_xhr";
import { RuntimeClient } from "../service_worker/client";
import { makeBlobURL } from "@App/pkg/utils/utils";
import type { Logger } from "@App/app/repo/logger";
import LoggerCore from "@App/app/logger/core";
import type { GMInfoEnv } from "./types";
import { getExtensionOrigin, getPageRpcAllowedAPIs, PageRpcRegistry, validatePageGMRequest } from "./page_rpc";
import { uuidv4 } from "@App/pkg/utils/uuid";
import { isContextMenuScript } from "./utils";

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
  // The page-visible fallback can start only MAIN scripts without GM capabilities.
  private fallbackInjectPageLoad?: { scripts: TScriptInfo[]; envInfo: GMInfoEnv };
  // 页面请求必须先在此注册句柄，再由 transform 解析为隔离 broker 可接受的身份。
  private readonly pageRpc = new PageRpcRegistry();
  constructor(
    // 监听来自inject的消息
    private readonly server: Server,
    // 发送给扩展service_worker的通信接口
    private readonly senderToExt: MessageSend,
    // 发送给 content的消息接口
    private readonly senderToContent: CustomEventMessage,
    // 发送给inject的消息接口
    private readonly senderToInject: MessageSend
  ) {}

  init() {
    this.server.on("pageLoadFallback", () => {
      const pageLoad = this.fallbackInjectPageLoad;
      if (!pageLoad) return undefined;
      return new Client(this.senderToInject, "inject").do("pageLoadFallback", pageLoad);
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
        // 所有来自页面的 GM RPC 都在转发前完成字段、句柄、授权和参数复制检查。
        const request = validatePageGMRequest(data, this.pageRpc);
        return {
          uuid: request.uuid,
          api: request.api,
          params: request.params,
          runFlag: request.runFlag,
          executionHandle: request.handle,
          version: 1 as const,
          requestId: request.requestId,
          handle: request.handle,
          envTag: request.envTag,
        };
      }
    );
  }

  pageLoad() {
    const client = new RuntimeClient(this.senderToExt);
    // bfcache 还原不会重新执行 content script，pageLoad 因此只发生一次；
    // 但页面里的脚本仍在运行，需要补一次上报，否则 Popup 会误判本页没有脚本在跑。
    // 只有顶层 frame 参与判定，子 frame 不必上报。
    if (window.top === window) {
      window.addEventListener("pageshow", (e) => {
        if (e.persisted) client.pageShow();
      });
    }
    // 向service_worker请求脚本列表及环境信息
    client.pageLoad("it").then((o) => {
      if (!o.ok) return;
      const { injectScriptList, envInfo, userScriptBootstrapToken, userScriptInjectBootstrapToken } = o;
      // 每次页面加载都废弃旧句柄，避免无 documentId 的浏览器复用上一文档的授权。
      this.pageRpc.revokeAll();
      const prepareScripts = (scripts: typeof injectScriptList, envTag: "it" | "ct") =>
        scripts.map((script) => {
          const allowedAPIs = getPageRpcAllowedAPIs(script.metadata.grant || []);
          const executionRunFlag = script.executionRunFlag || uuidv4();
          const executionHandle =
            script.executionHandle ||
            this.pageRpc.register(script.uuid, envTag, allowedAPIs, undefined, executionRunFlag);
          if (script.executionHandle) {
            // service worker 已签发的句柄要在本页 registry 中恢复，保持跨 context 身份一致。
            this.pageRpc.register(script.uuid, envTag, allowedAPIs, script.executionHandle, executionRunFlag);
          }
          return { ...script, executionHandle, executionEnvTag: envTag, executionRunFlag };
        });
      const preparedInjectScriptList = prepareScripts(injectScriptList, "it");

      if (typeof userScriptBootstrapToken === "string" && userScriptBootstrapToken.length > 0) {
        const contentClient = new Client(this.senderToContent, "content");
        contentClient.do("pageLoad", {
          bootstrapToken: userScriptBootstrapToken,
          envInfo,
          extensionOrigin: getExtensionOrigin(),
        });
      }

      if (typeof userScriptInjectBootstrapToken === "string" && userScriptInjectBootstrapToken.length > 0) {
        const fallbackScripts: TScriptInfo[] = [];
        for (const script of preparedInjectScriptList) {
          const grants = script.metadata.grant || [];
          if (grants.some((grant) => grant !== "none") || isContextMenuScript(script.metadata)) continue;
          const {
            executionHandle: _executionHandle,
            executionEnvTag: _executionEnvTag,
            executionRunFlag: _executionRunFlag,
            ...fallbackScript
          } = {
            ...script,
            value: {},
            config: undefined,
            userConfig: undefined,
            userConfigStr: "",
            resource: {},
            requireCssResource: {},
          };
          fallbackScripts.push(fallbackScript);
        }
        this.fallbackInjectPageLoad = { scripts: fallbackScripts, envInfo };
        const injectClient = new Client(this.senderToInject, "inject");
        injectClient.do("bootstrap", { bootstrapToken: userScriptInjectBootstrapToken });
      }
    });
  }
}
