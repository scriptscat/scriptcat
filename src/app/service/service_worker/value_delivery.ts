import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import { cacheInstance } from "@App/app/cache";
import { CACHE_KEY_VALUE_UPDATE_TARGETS } from "@App/app/cache_key";
import { ExtensionContentMessageSend } from "@Packages/message/extension_message";
import type { ValueUpdateDataEncoded } from "../content/types";

export type ValueUpdateTarget = { tabId: number; frameId: number; documentId?: string };

type FrameRecord = { documentId?: string; storageNames: string[] };
// 持久化形状：frameId → 该 frame 当前 document 运行的 storageName
type PersistedTab = Record<string, FrameRecord>;

type Route = { frameId: number; documentId?: string; items: ValueUpdateDataEncoded[] };

const ACTION = "scripting/runtime/valueUpdates";

/**
 * 把值更新推送给页面里运行该 storageName 的 frame。
 *
 * 投递表的真相在 storage.session，内存里只是副本：SW 被回收后首次使用时恢复，不依赖任何长连接。
 * 同一标签页同时只有一批消息在途，期间到来的更新攒成下一批，高频写入时消息数随标签页数而非写入次数增长；
 * 不同标签页之间互不等待。
 */
export class ValueUpdateDelivery {
  private readonly logger = LoggerCore.logger({ component: "valueUpdateDelivery" });
  private readonly tabs = new Map<number, Map<number, FrameRecord>>();
  private readonly persistedTabs = new Set<number>();
  // 恢复完成前就重新载入或关闭的标签页，持久化里的旧记录不能再合并回来
  private readonly droppedBeforeRestore = new Set<number>();
  private restoring: Promise<void> | null = null;
  private restored = false;
  private readonly queues = new Map<number, ValueUpdateDataEncoded[]>();

  init() {
    chrome.tabs.onRemoved.addListener((tabId) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.tabs.onRemoved:", lastError);
        return;
      }
      this.removeTab(tabId);
    });
    // 标签页被丢弃等情况下浏览器会用新 tabId 替换原标签页，旧 tabId 不会再触发 onRemoved
    chrome.tabs.onReplaced.addListener((_addedTabId, removedTabId) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.tabs.onReplaced:", lastError);
        return;
      }
      this.removeTab(removedTabId);
    });
  }

  register(target: ValueUpdateTarget, storageNames: string[]) {
    let frames = this.tabs.get(target.tabId);
    if (!frames) {
      frames = new Map();
      this.tabs.set(target.tabId, frames);
    }
    const previous = frames.get(target.frameId);
    frames.set(target.frameId, { documentId: target.documentId, storageNames });
    if (storageNames.length || previous?.storageNames.length) this.persist(target.tabId);
  }

  /**
   * 顶层 frame 开始载入新页面：旧页面的 document 都已不在。
   * 必须在 pageLoad 到达时同步调用，之后才到达的子 frame 登记才不会被一并清掉。
   */
  resetTab(tabId: number) {
    this.dropTab(tabId);
  }

  removeTab(tabId: number) {
    this.dropTab(tabId);
    this.queues.delete(tabId);
  }

  async push(data: ValueUpdateDataEncoded) {
    await this.restore();
    const tabIds = new Set<number>();
    for (const [tabId, frames] of this.tabs) {
      for (const frame of frames.values()) {
        if (frame.storageNames.includes(data.storageName)) {
          tabIds.add(tabId);
          break;
        }
      }
    }
    const senderTabId = data.sender.tabId;
    if (senderTabId !== undefined && senderTabId > 0) tabIds.add(senderTabId);
    for (const tabId of tabIds) {
      const queue = this.queues.get(tabId);
      if (queue) {
        queue.push(data);
      } else {
        const created: ValueUpdateDataEncoded[] = [];
        this.queues.set(tabId, created);
        this.flush(tabId, created, [data]);
      }
    }
  }

  private async flush(tabId: number, queue: ValueUpdateDataEncoded[], batch: ValueUpdateDataEncoded[]) {
    for (;;) {
      await this.sendBatch(tabId, batch);
      // 期间标签页已关闭
      if (this.queues.get(tabId) !== queue) return;
      if (!queue.length) {
        this.queues.delete(tabId);
        return;
      }
      batch = queue.splice(0);
    }
  }

  private sendBatch(tabId: number, batch: ValueUpdateDataEncoded[]) {
    const frames = this.tabs.get(tabId) ?? new Map<number, FrameRecord>();
    const routes = new Map<number, Route>();
    const addRoute = (frameId: number, documentId: string | undefined, item: ValueUpdateDataEncoded) => {
      let route = routes.get(frameId);
      if (!route) {
        route = { frameId, documentId, items: [] };
        routes.set(frameId, route);
      }
      if (route.items[route.items.length - 1] !== item) route.items.push(item);
    };
    for (const item of batch) {
      for (const [frameId, frame] of frames) {
        if (frame.storageNames.includes(item.storageName)) addRoute(frameId, frame.documentId, item);
      }
      const { sender } = item;
      if (sender.tabId === tabId && sender.frameId !== undefined) {
        addRoute(sender.frameId, sender.documentId, item);
      }
    }
    if (routes.size === 0) return Promise.resolve();

    // 单次消息的固定成本约是整页投递里每多一个 frame 的两倍（Chrome 156 实测）：
    // 要投递的 frame 超过约三分之一时，整个标签页发一次（各 frame 的 scripting 再按 storageName 过滤）更便宜
    const frameCount = Math.max(frames.size, routes.size);
    if (routes.size * 3 > frameCount + 2) {
      const items = batch.filter((item) => [...routes.values()].some((route) => route.items.includes(item)));
      return this.send(tabId, items).catch((e) => {
        // 整页都收不到：标签页里已没有存活的 scripting（如被丢弃），等它重新载入时再登记
        this.logger.debug("value update tab unreachable", { tabId }, Logger.E(e));
        this.dropFrames(tabId, frames, [...frames.keys()]);
      });
    }
    return Promise.all(
      [...routes.values()].map((route) =>
        this.send(tabId, route.items, route).catch((e) => {
          // document 已销毁（子 frame 被移除、页面已跳走）
          this.logger.debug("value update frame unreachable", { tabId, frameId: route.frameId }, Logger.E(e));
          this.dropFrames(tabId, frames, [route.frameId]);
        })
      )
    ).then(() => undefined);
  }

  private send(tabId: number, items: ValueUpdateDataEncoded[], route?: Route) {
    const options = route
      ? route.documentId === undefined
        ? { frameId: route.frameId }
        : { frameId: route.frameId, documentId: route.documentId }
      : undefined;
    return new ExtensionContentMessageSend(tabId, options).notify({ action: ACTION, data: items });
  }

  // 只移除发送时看到的那份记录：期间若同一 frame 已重新登记，新记录保留
  private dropFrames(tabId: number, snapshot: Map<number, FrameRecord>, frameIds: number[]) {
    const frames = this.tabs.get(tabId);
    if (!frames) return;
    for (const frameId of frameIds) {
      if (frames.get(frameId) === snapshot.get(frameId)) frames.delete(frameId);
    }
    if (frames.size === 0) this.tabs.delete(tabId);
    this.persist(tabId);
  }

  private dropTab(tabId: number) {
    this.tabs.delete(tabId);
    if (!this.restored) this.droppedBeforeRestore.add(tabId);
    this.persist(tabId);
  }

  private restore() {
    this.restoring ??= this.load();
    return this.restoring;
  }

  private async load() {
    const keys = (await cacheInstance.list()).filter((key) => key.startsWith(CACHE_KEY_VALUE_UPDATE_TARGETS));
    const records = await Promise.all(keys.map((key) => cacheInstance.get<PersistedTab>(key)));
    keys.forEach((key, i) => {
      const tabId = Number(key.slice(CACHE_KEY_VALUE_UPDATE_TARGETS.length));
      this.persistedTabs.add(tabId);
      const record = records[i];
      if (!record || this.droppedBeforeRestore.has(tabId)) return;
      let frames = this.tabs.get(tabId);
      if (!frames) {
        frames = new Map();
        this.tabs.set(tabId, frames);
      }
      for (const [frameId, frame] of Object.entries(record)) {
        // 恢复前已到达的登记更新
        if (!frames.has(Number(frameId))) frames.set(Number(frameId), frame);
      }
    });
    this.droppedBeforeRestore.clear();
    this.restored = true;
  }

  // 在恢复之后写入：恢复前写会用不完整的内存副本覆盖持久化记录。
  // 只落盘运行脚本的 frame：没有脚本的 frame（如反复载入的广告 iframe）只参与「整页还是定向」的计数，
  // SW 重启后少计它们只会让选择偏向整页投递，结果仍然正确
  private persist(tabId: number) {
    this.restore().then(() => {
      const running = [...(this.tabs.get(tabId) ?? [])].filter(([, frame]) => frame.storageNames.length > 0);
      const key = `${CACHE_KEY_VALUE_UPDATE_TARGETS}${tabId}`;
      if (running.length) {
        this.persistedTabs.add(tabId);
        return cacheInstance.set<PersistedTab>(key, Object.fromEntries(running));
      }
      if (this.persistedTabs.delete(tabId)) return cacheInstance.del(key);
    });
  }
}
