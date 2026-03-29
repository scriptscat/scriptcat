import { describe, expect, it, beforeEach } from "vitest";
import { SystemConfig } from "./config";
import { MessageQueue } from "@Packages/message/message_queue";

describe("SystemConfig 双 storage 与懒迁移", () => {
  let mq: MessageQueue;
  let config: SystemConfig;

  beforeEach(() => {
    // 清空 storage 数据
    chrome.storage.sync.clear();
    chrome.storage.local.clear();
    mq = new MessageQueue();
    config = new SystemConfig(mq);
  });

  describe("local key 读写", () => {
    it("cloud_sync 应写入 local storage 而非 sync", async () => {
      const cloudSync = {
        enable: true,
        syncDelete: false,
        syncStatus: true,
        filesystem: "onedrive" as const,
        params: { token: "test" },
      };
      config.setCloudSync(cloudSync);

      const result = await config.getCloudSync();
      expect(result).toEqual(cloudSync);

      // 验证值在 local 中
      const localData = await chrome.storage.local.get("system_cloud_sync");
      expect(localData["system_cloud_sync"]).toEqual(cloudSync);

      // 验证值不在 sync 中
      const syncData = await chrome.storage.sync.get("system_cloud_sync");
      expect(syncData["system_cloud_sync"]).toBeUndefined();
    });

    it("language 应写入 local storage", async () => {
      config.setLanguage("zh-CN");

      // 通过 storage 验证写入位置
      const localData = await chrome.storage.local.get("system_language");
      expect(localData["system_language"]).toBe("zh-CN");

      const syncData = await chrome.storage.sync.get("system_language");
      expect(syncData["system_language"]).toBeUndefined();
    });

    it("vscode_url 应写入 local storage", async () => {
      config.setVscodeUrl("ws://localhost:9999");

      const localData = await chrome.storage.local.get("system_vscode_url");
      expect(localData["system_vscode_url"]).toBe("ws://localhost:9999");

      const syncData = await chrome.storage.sync.get("system_vscode_url");
      expect(syncData["system_vscode_url"]).toBeUndefined();
    });

    it("enable_script 应写入 local storage", async () => {
      config.setEnableScript(false);

      const localData = await chrome.storage.local.get("system_enable_script");
      expect(localData["system_enable_script"]).toBe(false);

      const syncData = await chrome.storage.sync.get("system_enable_script");
      expect(syncData["system_enable_script"]).toBeUndefined();
    });
  });

  describe("sync key 读写", () => {
    it("check_script_update_cycle 应写入 sync storage", async () => {
      config.setCheckScriptUpdateCycle(3600);

      const syncData = await chrome.storage.sync.get("system_check_script_update_cycle");
      expect(syncData["system_check_script_update_cycle"]).toBe(3600);

      const localData = await chrome.storage.local.get("system_check_script_update_cycle");
      expect(localData["system_check_script_update_cycle"]).toBeUndefined();
    });

    it("enable_eslint 应写入 sync storage", async () => {
      config.setEnableEslint(false);

      const syncData = await chrome.storage.sync.get("system_enable_eslint");
      expect(syncData["system_enable_eslint"]).toBe(false);

      const localData = await chrome.storage.local.get("system_enable_eslint");
      expect(localData["system_enable_eslint"]).toBeUndefined();
    });
  });

  describe("懒迁移：sync → local", () => {
    it("local key 的旧数据应从 sync 迁移到 local", async () => {
      // 模拟旧版本数据在 sync 中
      const oldCloudSync = {
        enable: true,
        syncDelete: false,
        syncStatus: true,
        filesystem: "webdav" as const,
        params: { url: "https://example.com" },
      };
      await chrome.storage.sync.set({ system_cloud_sync: oldCloudSync });

      // 读取时应自动迁移
      const result = await config.getCloudSync();
      expect(result).toEqual(oldCloudSync);

      // 验证已迁移到 local
      const localData = await chrome.storage.local.get("system_cloud_sync");
      expect(localData["system_cloud_sync"]).toEqual(oldCloudSync);

      // 验证已从 sync 中删除
      const syncData = await chrome.storage.sync.get("system_cloud_sync");
      expect(syncData["system_cloud_sync"]).toBeUndefined();
    });

    it("local 有值时不应回退到 sync", async () => {
      const localValue = "zh-CN";
      const syncValue = "en-US";
      await chrome.storage.local.set({ system_language: localValue });
      await chrome.storage.sync.set({ system_language: syncValue });

      const result = await config.getLanguage();
      expect(result).toBe(localValue);

      // sync 中的值不应被删除（因为 local 有值，不触发迁移）
      const syncData = await chrome.storage.sync.get("system_language");
      expect(syncData["system_language"]).toBe(syncValue);
    });

    it("sync 和 local 都没有值时返回默认值", async () => {
      const result = await config.getCloudSync();
      expect(result).toEqual({
        enable: false,
        syncDelete: false,
        syncStatus: true,
        filesystem: "webdav",
        params: {},
      });
    });

    it("迁移后再次读取应走缓存", async () => {
      await chrome.storage.sync.set({ system_vscode_url: "ws://old:8642" });

      // 第一次读取触发迁移
      const first = await config.getVscodeUrl();
      expect(first).toBe("ws://old:8642");

      // 修改 local storage（模拟外部写入），验证缓存生效
      await chrome.storage.local.set({ system_vscode_url: "ws://new:9999" });

      // 第二次读取应返回缓存值
      const second = await config.getVscodeUrl();
      expect(second).toBe("ws://old:8642");
    });
  });
});
