import { Client, sendMessage } from "@Packages/message/client";
import { type CustomEventMessage } from "@Packages/message/custom_event_message";
import { forwardMessage, type Server } from "@Packages/message/server";
import type { MessageSend } from "@Packages/message/types";
import { RuntimeClient } from "../service_worker/client";
import { getStorageName, makeBlobURL } from "@App/pkg/utils/utils";
import type { Logger } from "@App/app/repo/logger";
import LoggerCore from "@App/app/logger/core";
import type { ValueSnapshot, ValueUpdateDataEncoded, ValueVersion } from "./types";
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
  private readonly versions = new Map<string, ValueVersion>();
  private stagedScripts?: { injectScriptList: TScriptInfo[]; contentScriptList: TScriptInfo[] };
  private readonly stagedDirty = new Set<string>();
  private scriptsStarted = false;
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
      (snapshot) => this.forwardValueSnapshot(snapshot),
      () => Object.fromEntries(this.versions)
    );
  }

  private isNewer(storageName: string, version: ValueVersion): boolean {
    const known = this.versions.get(storageName);
    if (!known) return true;
    if (known.epoch !== version.epoch) return true;
    return version.revision > known.revision;
  }

  private forEachStaged(storageName: string, callback: (script: TScriptInfo) => void) {
    if (!this.stagedScripts) return;
    for (const script of [...this.stagedScripts.injectScriptList, ...this.stagedScripts.contentScriptList]) {
      if (getStorageName(script) === storageName) callback(script);
    }
  }

  private forwardValueUpdate(data: ValueUpdateDataEncoded) {
    const activeOn = this.activeStorageNames.get(data.storageName);
    if (!activeOn) return;
    if (data.revision !== undefined && data.epoch !== undefined) {
      const known = this.versions.get(data.storageName);
      if (!this.isNewer(data.storageName, { revision: data.revision, epoch: data.epoch })) return;
      if (
        (known?.epoch && known.epoch !== data.epoch) ||
        (known?.epoch === data.epoch && data.revision > known.revision + 1)
      ) {
        this.valuePort.refresh();
        return;
      }
      this.versions.set(data.storageName, { revision: data.revision, epoch: data.epoch });
    }
    if (!this.scriptsStarted) {
      this.forEachStaged(data.storageName, (script) => {
        for (const [key, encoded] of data.entries) {
          const value = decodeRValue(encoded);
          if (value === undefined) delete script.value[key];
          else script.value[key] = value;
        }
        script.valueRevision = data.revision;
        script.valueEpoch = data.epoch;
      });
      this.stagedDirty.add(data.storageName);
      return;
    }
    void this.broadcastToPage("runtime/valueUpdate", data, activeOn).catch((error) => {
      LoggerCore.logger().error("forward value update failed", { storageName: data.storageName, error });
    });
  }

  private forwardValueSnapshot(snapshot: ValueSnapshot) {
    const activeOn = this.activeStorageNames.get(snapshot.storageName);
    if (!activeOn || !this.isNewer(snapshot.storageName, snapshot)) return;
    this.versions.set(snapshot.storageName, { revision: snapshot.revision, epoch: snapshot.epoch });
    if (!this.scriptsStarted) {
      this.forEachStaged(snapshot.storageName, (script) => {
        const values = { ...snapshot.values };
        // Initial pageLoad includes user-config defaults; preserve that same wire
        // contract when a newer snapshot replaces values before script execution.
        for (const [tabName, tab] of Object.entries(script.config ?? {})) {
          if (!tab || typeof tab !== "object") continue;
          for (const [key, option] of Object.entries(tab)) {
            if (!option || typeof option !== "object" || !("default" in option)) continue;
            const field = `${tabName}.${key}`;
            if (values[field] === undefined) values[field] = option.default;
          }
        }
        script.value = values;
        script.valueRevision = snapshot.revision;
        script.valueEpoch = snapshot.epoch;
      });
      this.stagedDirty.add(snapshot.storageName);
      return;
    }
    void this.broadcastToPage("runtime/valueSnapshot", snapshot, activeOn).catch((error) => {
      LoggerCore.logger().error("forward value snapshot failed", { storageName: snapshot.storageName, error });
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
    // Retry only the initial fetch; never dispatch pageLoad into script worlds twice.
    // Recoverable SW outages do not invalidate the existing document.
    const requestPageLoad = async () => {
      let retryDelay = 250;
      for (;;) {
        try {
          return await client.pageLoad();
        } catch (error) {
          if (/Extension context (?:was )?invalidated/i.test(String(error)) || !chrome.runtime?.id) throw error;
          await new Promise<void>((resolve) =>
            setTimeout(resolve, retryDelay + Math.random() * retryDelay)
          );
          retryDelay = Math.min(retryDelay * 2, 10000);
        }
      }
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
      this.stagedScripts = { injectScriptList, contentScriptList };
      const latestScripts = new Map<string, TScriptInfo>();
      for (const script of [...injectScriptList, ...contentScriptList]) {
        const name = getStorageName(script);
        const version = { revision: script.valueRevision ?? 0, epoch: script.valueEpoch ?? "" };
        const known = this.versions.get(name);
        if (!known || (known.epoch === version.epoch && version.revision > known.revision)) {
          this.versions.set(name, version);
          latestScripts.set(name, script);
        }
      }
      // Shared storageName scripts can be read at different revisions during pageLoad.
      // Normalize only stale snapshots; do not duplicate large value objects on the common path.
      for (const script of [...injectScriptList, ...contentScriptList]) {
        const latest = latestScripts.get(getStorageName(script));
        if (latest && latest !== script &&
          latest.valueEpoch === script.valueEpoch &&
          (latest.valueRevision ?? 0) > (script.valueRevision ?? 0)) {
          script.value = { ...latest.value };
          script.valueRevision = latest.valueRevision;
        }
      }

      // The subscription handshake covers updates between pageLoad's snapshot and script execution.
      await this.valuePort.subscribe([...pairs.keys()]);
      const starts: Promise<unknown>[] = [];
      if (contentScriptList.length) {
        starts.push(
          new Client(this.senderToContent, "content").do("pageLoad", { scripts: contentScriptList, envInfo })
        );
      }
      if (injectScriptList.length) {
        starts.push(new Client(this.senderToInject, "inject").do("pageLoad", { scripts: injectScriptList, envInfo }));
      }
      const outcomes = await Promise.allSettled(starts);
      for (const outcome of outcomes) {
        if (outcome.status === "rejected") {
          LoggerCore.logger().error("script world startup failed", { error: outcome.reason });
        }
      }
      this.scriptsStarted = true;
      // Changes which raced with the world startup are reconciled once, not replayed as listeners.
      for (const name of this.stagedDirty) {
        const script = [...injectScriptList, ...contentScriptList].find((item) => getStorageName(item) === name);
        const version = this.versions.get(name);
        const activeOn = pairs.get(name);
        if (script && version && activeOn) {
          void this.broadcastToPage(
            "runtime/valueSnapshot",
            { storageName: name, ...version, values: script.value } satisfies ValueSnapshot,
            activeOn
          ).catch((error) => LoggerCore.logger().error("startup value snapshot failed", { error }));
        }
      }
      this.stagedDirty.clear();
      this.stagedScripts = undefined;
    }).catch((error) => {
      LoggerCore.logger().error("pageLoad or value subscription failed", { error });
    });
  }
}
