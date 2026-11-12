import { Client, sendMessage } from "@Packages/message/client";
import { type CustomEventMessage } from "@Packages/message/custom_event_message";
import { forwardMessage, type Server } from "@Packages/message/server";
import type { MessageSend } from "@Packages/message/types";
import { RuntimeClient } from "../service_worker/client";
import { getStorageName, makeBlobURL } from "@App/pkg/utils/utils";
import type { Logger } from "@App/app/repo/logger";
import LoggerCore from "@App/app/logger/core";
import type { ValueSubscription, ValueSubscriptionAck, ValueUpdateDataEncoded } from "./types";
import type { TScriptInfo } from "@App/app/repo/scripts";
import { decodeRValue } from "@App/pkg/utils/message_value";
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
  // 每个 storageName 已应用到的版本；重订阅时交给 SW 判断是否漏收，收到推送时据此去重
  private readonly knownRevisions = new Map<string, number>();
  private readonly uuidsByStorageName = new Map<string, string[]>();
  // 还没交给 content/inject 启动的脚本；这期间的快照和推送直接合并进它们的 value
  private pendingScripts: TScriptInfo[] | undefined;
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
    this.valuePort = new ScriptingValuePort(
      this.senderToExt,
      (data) => this.forwardValueUpdate(data),
      (acks) => this.applySubscriptionAcks(acks)
    );
  }

  private valueSubscriptions(): ValueSubscription[] {
    return [...this.activeStorageNames.keys()].map((storageName) => ({
      storageName,
      revision: this.knownRevisions.get(storageName) ?? 0,
      uuids: this.uuidsByStorageName.get(storageName) ?? [],
    }));
  }

  private applySubscriptionAcks(acks: ValueSubscriptionAck[]) {
    for (const { storageName, revision, values } of acks) {
      const activeOn = this.activeStorageNames.get(storageName);
      if (!activeOn) continue;
      this.knownRevisions.set(storageName, revision);
      if (!values) continue;
      if (this.pendingScripts) {
        for (const script of this.pendingScripts) {
          if (values[script.uuid]) script.value = values[script.uuid];
        }
      } else {
        this.sendToPage("runtime/valueSync", { storageName, values }, activeOn);
      }
    }
  }

  private forwardValueUpdate(data: ValueUpdateDataEncoded) {
    const { storageName, revision } = data;
    const activeOn = this.activeStorageNames.get(storageName);
    if (!activeOn) return;
    if (data.valueUpdated && revision !== undefined) {
      // 已经包含在快照里，或者重复到达
      if (revision <= (this.knownRevisions.get(storageName) ?? -1)) return;
      this.knownRevisions.set(storageName, revision);
    }
    if (this.pendingScripts) {
      // 脚本还没启动，页面里没有 GMApi 能接收；直接改写将要下发的初始值
      if (!data.valueUpdated) return;
      for (const script of this.pendingScripts) {
        if (script.uuid !== data.uuid && getStorageName(script) !== storageName) continue;
        for (const [key, encoded] of data.entries) {
          const value = decodeRValue(encoded);
          if (value === undefined) delete script.value[key];
          else script.value[key] = value;
        }
      }
      return;
    }
    this.sendToPage("runtime/valueUpdate", data, activeOn);
  }

  private sendToPage(action: string, data: unknown, activeOn: PageOrContent) {
    void this.broadcastToPage(action, data, activeOn).catch((error) => {
      LoggerCore.logger().error("forward value message failed", { action, error });
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
        if (e.persisted) client.pageShow();
      });
    }
    // 向service_worker请求脚本列表及环境信息
    client.pageLoad().then(async (o) => {
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
      for (const script of [...injectScriptList, ...contentScriptList]) {
        const name = getStorageName(script);
        // 同一存储的脚本读取 value 的时刻可能不同，取最早的版本，宁可多补一次快照
        const known = this.knownRevisions.get(name);
        const revision = script.valueRevision ?? 0;
        this.knownRevisions.set(name, known === undefined ? revision : Math.min(known, revision));
        this.uuidsByStorageName.set(name, [...(this.uuidsByStorageName.get(name) ?? []), script.uuid]);
      }

      // 先确认中央已建立订阅，再启动页面脚本：早期 GM.setValue 的回执不会落入订阅空窗，
      // pageLoad 读取 value 之后到订阅确认之前的写入也会经快照或推送合并进初始值。
      this.pendingScripts = [...injectScriptList, ...contentScriptList];
      await this.valuePort.subscribe(() => this.valueSubscriptions());
      this.pendingScripts = undefined;

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
