import { Client, sendMessage } from "@Packages/message/client";
import { type CustomEventMessage } from "@Packages/message/custom_event_message";
import { forwardMessage, type Server } from "@Packages/message/server";
import type { MessageSend } from "@Packages/message/types";
import { RuntimeClient } from "../service_worker/client";
import { getStorageName, makeBlobURL } from "@App/pkg/utils/utils";
import type { Logger } from "@App/app/repo/logger";
import LoggerCore from "@App/app/logger/core";
import type { ValueUpdateDataEncoded } from "./types";
import ScriptingValuePort from "./value_port";

const PageOrContent = {
  PAGE: 1,
  CONTENT: 2,
  PAGE_AND_CONTENT: 3,
} as const;

type PageOrContent = ValueOf<typeof PageOrContent>;

// scripting页的处理
export default class ScriptingRuntime {
  private activeStorageNames = new Map<string, PageOrContent>();
  private readonly valuePort: ScriptingValuePort;
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
    private readonly senderToInject: CustomEventMessage
  ) {
    this.valuePort = new ScriptingValuePort(this.senderToExt, (data) => this.forwardValueUpdate(data));
  }

  private forwardValueUpdate(data: ValueUpdateDataEncoded) {
    const activeOn = this.activeStorageNames.get(data.storageName);
    if (!activeOn) return;
    void this.broadcastToPage("runtime/valueUpdate", data, activeOn).catch((error) => {
      LoggerCore.logger().error("forward value update failed", { storageName: data.storageName, error });
    });
  }

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
    this.valuePort.start();
    this.extServer.on("runtime/emitEvent", (data) => {
      // 转发给inject和content
      return this.broadcastToPage("runtime/emitEvent", data);
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
      (data: { api: string; params: any; uuid: string }) => {
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
            const [url, isContent] = data.params;
            // 根据来源选择不同的消息桥（content / inject）
            let msg: CustomEventMessage | null = isContent ? this.senderToContent : this.senderToInject;
            return new Promise((resolve) => {
              const xhr = new XMLHttpRequest();
              xhr.responseType = "document";
              xhr.open("GET", url);
              xhr.onloadend = function () {
                const nodeId = msg!.sendRelatedTarget(this.response);
                resolve(nodeId);
                msg = null;
              };
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
        if (e.persisted && chrome.runtime?.id) {
          void client.pageShow().catch((error) => {
            LoggerCore.logger().error("bfcache restore report failed", { error });
          });
        }
      });
    }
    // 向service_worker请求脚本列表及环境信息
    // Initial page injection must be finite and must never replay an already started userscript.
    const requestPageLoad = async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          return await client.pageLoad();
        } catch (error) {
          if (/Extension context (?:was )?invalidated/i.test(String(error)) ||
              !chrome.runtime?.id || attempt === 2) throw error;
          await new Promise<void>((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
        }
      }
      throw new Error("pageLoad failed");
    };
    void requestPageLoad().then(async (o) => {
      if (!o.ok) {
        this.valuePort.stop();
        return;
      }
      const { injectScriptList, contentScriptList, envInfo } = o;
      const pairs = new Map<string, PageOrContent>();
      for (const script of injectScriptList) {
        const name = getStorageName(script);
        pairs.set(name, ((pairs.get(name) || 0) | PageOrContent.PAGE) as PageOrContent);
      }
      for (const script of contentScriptList) {
        const name = getStorageName(script);
        pairs.set(name, ((pairs.get(name) || 0) | PageOrContent.CONTENT) as PageOrContent);
      }
      this.activeStorageNames = pairs;

      // 先确认中央已建立订阅，再启动页面脚本；早期 GM.setValue 的回执不会落入订阅空窗。
      await this.valuePort.subscribe([...this.activeStorageNames.keys()]);

      // 向页面 发送脚本列表及环境信息
      if (contentScriptList.length) {
        const contentClient = new Client(this.senderToContent, "content");
        // 根据@inject-into content过滤脚本
        contentClient.do("pageLoad", { scripts: contentScriptList, envInfo });
      }

      if (injectScriptList.length) {
        const injectClient = new Client(this.senderToInject, "inject");
        // 根据@inject-into content过滤脚本
        injectClient.do("pageLoad", { scripts: injectScriptList, envInfo });
      }
    }).catch((error) => {
      LoggerCore.logger().error("pageLoad or value subscription failed", { error });
    });
  }
}
