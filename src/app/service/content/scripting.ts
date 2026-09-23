import { Client, sendMessage } from "@Packages/message/client";
import { type CustomEventMessage } from "@Packages/message/custom_event_message";
import { forwardMessage, type Server } from "@Packages/message/server";
import type { MessageSend } from "@Packages/message/types";
import type { SerializedDocumentResponse } from "./gm_api/gm_xhr";
import { RuntimeClient } from "../service_worker/client";
import { getStorageName, makeBlobURL } from "@App/pkg/utils/utils";
import type { Logger } from "@App/app/repo/logger";
import LoggerCore from "@App/app/logger/core";
import type { ValueUpdateDataEncoded } from "./types";
import {
  getExtensionOrigin,
  getPageRpcAllowedAPIs,
  PAGE_RPC_VERSION,
  PageRpcRegistry,
  validatePageGMRequest,
} from "./page_rpc";
import { getEffectiveScriptGrants } from "./utils";

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

// For Firefox, StorageArea.setAccessLevel is not implemented.
// See https://bugzilla.mozilla.org/show_bug.cgi?id=1724754
// const deliveryStorage = isFirefox() ? chrome.storage.local : chrome.storage.session;
const deliveryStorage = chrome.storage.local; // 日后再处理

// scripting页的处理
export default class ScriptingRuntime {
  // 只记录当前页面仍有脚本使用的 storageName，storage 广播不应唤醒无关脚本。
  private activeStorageNames = new Map<string, PageOrContent>();
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
    this.extServer.on("runtime/emitEvent", (data) => {
      // USER_SCRIPT 的私有回调通过原生扩展端口投递。
      return this.broadcastToPage("runtime/emitEvent", data, PageOrContent.PAGE);
    });
    this.extServer.on("runtime/valueUpdate", (data) => {
      // USER_SCRIPT 的私有值更新通过原生扩展端口投递。
      return this.broadcastToPage("runtime/valueUpdate", data, PageOrContent.PAGE);
    });
    this.server.on("logger", (data: Logger) => {
      LoggerCore.logger().log(data.level, data.message, data.label);
    });

    // ================================
    // 来自 service_worker 的投递：storage 广播（类似 UDP）
    // ================================

    // 接收 service_worker 的 chrome.storage.local 值改变通知 （一对多广播）
    // 类似 UDP 原理，service_worker 不会有任何「等待处理」
    // 由于 changes 会包括新旧值 (Chrome: JSON serialization, Firefox: Structured Clone)
    // 因此需要注意资讯量不要过大导致 onChanged 的触发过慢
    deliveryStorage.onChanged.addListener((changes) => {
      const record = changes["valueUpdateDelivery"];
      if (record?.newValue) {
        const sendData = (record.newValue as { sendData: ValueUpdateDataEncoded }).sendData;
        const activeOn = this.activeStorageNames.get(sendData.storageName);
        if (activeOn) {
          // 转发给 content 和 inject
          this.broadcastToPage("runtime/valueUpdate", sendData, (activeOn & PageOrContent.PAGE) as PageOrContent);
        }
      }
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
      const { injectScriptList, envInfo, userScriptBootstrapToken } = o;
      // 每次页面加载都废弃旧句柄，避免无 documentId 的浏览器复用上一文档的授权。
      this.pageRpc.revokeAll();
      const prepareScripts = (scripts: typeof injectScriptList) => {
        const prepared: typeof injectScriptList = [];
        for (const script of scripts) {
          const executionHandle = script.executionHandle;
          if (!executionHandle) {
            // v2 执行句柄必须由 service worker 签发；content 不再自行伪造替代句柄，
            // 缺失时丢弃该脚本而不是让整个 pageLoad 失败。
            console.warn(`ScriptCat: script ${script.uuid} has no authoritative execution handle, skipping`);
            continue;
          }
          const allowedAPIs = getPageRpcAllowedAPIs(getEffectiveScriptGrants(script.metadata));
          // service worker 已签发的句柄要在本页 registry 中恢复，保持跨 context 身份一致。
          this.pageRpc.register(executionHandle, allowedAPIs);
          prepared.push(script);
        }
        return prepared;
      };
      const preparedInjectScriptList = prepareScripts(injectScriptList);
      const pairs = {} as Record<string, PageOrContent>;
      for (const script of preparedInjectScriptList) {
        pairs[getStorageName(script)] |= PageOrContent.PAGE;
      }
      this.activeStorageNames = new Map(Object.entries(pairs));

      if (typeof userScriptBootstrapToken === "string" && userScriptBootstrapToken.length > 0) {
        const contentClient = new Client(this.senderToContent, "content");
        contentClient.do("pageLoad", {
          bootstrapToken: userScriptBootstrapToken,
          envInfo,
          extensionOrigin: getExtensionOrigin(),
        });
      }

      if (preparedInjectScriptList.length > 0) {
        const injectClient = new Client(this.senderToInject, "inject");
        injectClient.do("pageLoad", { scripts: preparedInjectScriptList, envInfo });
      }
    });
  }
}
