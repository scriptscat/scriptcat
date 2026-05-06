import { Client, sendMessage } from "@Packages/message/client";
import { type CustomEventMessage } from "@Packages/message/custom_event_message";
import { forwardMessage, type Server } from "@Packages/message/server";
import type { MessageSend } from "@Packages/message/types";
import { RuntimeClient } from "../service_worker/client";
import { getStorageName, makeBlobURL } from "@App/pkg/utils/utils";
import type { Logger } from "@App/app/repo/logger";
import LoggerCore from "@App/app/logger/core";
import type { ValueUpdateDataEncoded } from "./types";

const PageOrContent = {
  PAGE: 1,
  CONTENT: 2,
};

type PageOrContent = ValueOf<typeof PageOrContent>;

// For Firefox, StorageArea.setAccessLevel is not implemented.
// See https://bugzilla.mozilla.org/show_bug.cgi?id=1724754
// const deliveryStorage = isFirefox() ? chrome.storage.local : chrome.storage.session;
const deliveryStorage = chrome.storage.local; // 日后再处理

// scripting页的处理
export default class ScriptingRuntime {
  private activeStorageNames = new Map<string, PageOrContent>();
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
  ) {}

  // 广播消息给 content 和 inject
  broadcastToPage(
    action: string,
    data?: any,
    activeOn: PageOrContent = PageOrContent.PAGE | PageOrContent.CONTENT
  ): Promise<undefined> {
    return Promise.all([
      activeOn & PageOrContent.CONTENT && sendMessage(this.senderToContent, "content/" + action, data),
      activeOn & PageOrContent.PAGE && sendMessage(this.senderToInject, "inject/" + action, data),
    ]).then(() => undefined);
  }

  init() {
    this.extServer.on("runtime/emitEvent", (data) => {
      // 转发给inject和content
      return this.broadcastToPage("runtime/emitEvent", data);
    });
    this.extServer.on("runtime/valueUpdate", (data) => {
      // 转发给inject和content
      return this.broadcastToPage("runtime/valueUpdate", data);
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
        const sendData = record.newValue.sendData as ValueUpdateDataEncoded;
        const activeOn = this.activeStorageNames.get(sendData.storageName);
        if (activeOn) {
          // 转发给 content 和 inject
          this.broadcastToPage("runtime/valueUpdate", sendData, activeOn);
        }
      }
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
    // 向service_worker请求脚本列表及环境信息
    client.pageLoad().then((o) => {
      if (!o.ok) return;
      const { injectScriptList, contentScriptList, envInfo } = o;
      const pairs = {} as Record<string, PageOrContent>;
      for (const script of injectScriptList) {
        pairs[getStorageName(script)] |= PageOrContent.PAGE;
      }
      for (const script of contentScriptList) {
        pairs[getStorageName(script)] |= PageOrContent.CONTENT;
      }
      this.activeStorageNames = new Map(Object.entries(pairs));

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
    });
  }
}
