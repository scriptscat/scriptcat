import { describe, expect, it, beforeEach, vi } from "vitest";
import { SystemConfig } from "./config";
import { MessageQueue } from "@Packages/message/message_queue";
import { defaultConfig as eslintDefaultConfig } from "@Packages/eslint/linter-config";
import { defaultConfig as editorDefaultConfig } from "@App/pkg/utils/monaco-editor/config";

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

    it("编辑器偏好应返回默认值并写入 sync storage", async () => {
      await expect(config.getEditorPreferences()).resolves.toEqual({
        version: 1,
        fontSize: 14,
        mouseWheelScrollSensitivity: 1,
        smoothScrolling: true,
      });

      const value = { version: 1 as const, fontSize: 16, mouseWheelScrollSensitivity: 1.5, smoothScrolling: false };
      config.setEditorPreferences(value);

      await expect(config.getEditorPreferences()).resolves.toEqual(value);
      const syncData = await chrome.storage.sync.get("system_editor_preferences");
      expect(syncData["system_editor_preferences"]).toEqual(value);

      const localData = await chrome.storage.local.get("system_editor_preferences");
      expect(localData["system_editor_preferences"]).toBeUndefined();
    });

    it("编辑器偏好重置后应回到当前默认值", async () => {
      config.setEditorPreferences({ version: 1, fontSize: 18, mouseWheelScrollSensitivity: 2, smoothScrolling: false });
      config.setEditorPreferences(undefined);

      await expect(config.getEditorPreferences()).resolves.toEqual(config.defaultEditorPreferences());
      const syncData = await chrome.storage.sync.get("system_editor_preferences");
      expect(syncData["system_editor_preferences"]).toBeUndefined();
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

  describe("JSON 配置的稀疏存储与默认值合并", () => {
    it("未修改时应返回最新默认配置", async () => {
      await expect(config.getEslintConfig()).resolves.toBe(eslintDefaultConfig);
      await expect(config.getEditorConfig()).resolves.toBe(editorDefaultConfig);
    });

    it("保存时应只存储与默认配置的差异", async () => {
      const modified = JSON.parse(eslintDefaultConfig);
      modified.rules["no-debugger"] = ["warn"];
      modified.rules["custom/added-rule"] = ["error"];
      config.setEslintConfig(JSON.stringify(modified));

      await vi.waitFor(async () => {
        const syncData = await chrome.storage.sync.get("system_eslint_config");
        expect(JSON.parse(syncData["system_eslint_config"] as string)).toEqual({
          rules: { "no-debugger": ["warn"], "custom/added-rule": ["error"] },
        });
      });
    });

    it("读取时应将存储的差异合并到最新默认配置", async () => {
      await chrome.storage.sync.set({
        system_eslint_config: JSON.stringify({ rules: { "no-debugger": ["warn"] } }),
      });

      const result = JSON.parse(await new SystemConfig(new MessageQueue()).getEslintConfig());
      const defaults = JSON.parse(eslintDefaultConfig);
      expect(result.rules["no-debugger"]).toEqual(["warn"]);
      expect(result.rules["no-empty"]).toEqual(defaults.rules["no-empty"]);
      expect(result.globals).toEqual(defaults.globals);
    });

    it("旧版全量配置应自动获得新默认字段且保留用户改动", async () => {
      // 模拟旧版本存储的全量 JSON：缺少后续新增的默认规则，且用户改过其中一条
      const legacy = JSON.parse(eslintDefaultConfig);
      legacy.rules["no-debugger"] = ["off"];
      delete legacy.rules["no-empty"];
      await chrome.storage.sync.set({ system_eslint_config: JSON.stringify(legacy) });

      const result = JSON.parse(await new SystemConfig(new MessageQueue()).getEslintConfig());
      expect(result.rules["no-debugger"]).toEqual(["off"]);
      // 新增的默认规则应自动生效
      expect(result.rules["no-empty"]).toEqual(JSON.parse(eslintDefaultConfig).rules["no-empty"]);
    });

    it("保存与默认配置一致的内容时应清除存储", async () => {
      // 使用紧凑格式，验证差异按语义比较而非字符串比较
      config.setEslintConfig(JSON.stringify(JSON.parse(eslintDefaultConfig)));

      await vi.waitFor(async () => {
        const syncData = await chrome.storage.sync.get("system_eslint_config");
        expect(syncData["system_eslint_config"]).toBeUndefined();
      });
      // 重新读取（新实例，不走缓存）应返回默认配置
      await expect(new SystemConfig(new MessageQueue()).getEslintConfig()).resolves.toBe(eslintDefaultConfig);
    });

    it("保存空字符串应恢复默认配置", async () => {
      config.setEslintConfig(JSON.stringify({ rules: { "no-debugger": ["warn"] } }));
      config.setEslintConfig("");

      await vi.waitFor(async () => {
        const syncData = await chrome.storage.sync.get("system_eslint_config");
        expect(syncData["system_eslint_config"]).toBeUndefined();
      });
      await expect(config.getEslintConfig()).resolves.toBe(eslintDefaultConfig);
    });

    it("editor_config 同样只存储差异并合并读取", async () => {
      const modified = JSON.parse(editorDefaultConfig);
      modified.strict = false;
      config.setEditorConfig(JSON.stringify(modified));

      await vi.waitFor(async () => {
        const syncData = await chrome.storage.sync.get("system_editor_config");
        expect(JSON.parse(syncData["system_editor_config"] as string)).toEqual({ strict: false });
      });

      const result = JSON.parse(await new SystemConfig(new MessageQueue()).getEditorConfig());
      expect(result).toEqual({ ...JSON.parse(editorDefaultConfig), strict: false });
    });
  });

  describe("React 外部存储适配器", () => {
    it("同一配置键应返回稳定的 store 实例", () => {
      expect(config.externalStore("favicon_service")).toBe(config.externalStore("favicon_service"));
    });

    it("订阅时应加载初始快照并通知监听器", async () => {
      const store = config.externalStore("favicon_service");
      const listener = vi.fn();
      const unsubscribe = store.subscribe(listener);

      await vi.waitFor(() => expect(store.getSnapshot()).toBe("scriptcat"));
      expect(listener).toHaveBeenCalledTimes(1);
      unsubscribe();
    });

    it("通知期间新增的监听器不应加入当前派发", async () => {
      const store = config.externalStore("favicon_service");
      const lateListener = vi.fn();
      store.subscribe(() => store.subscribe(lateListener));

      await vi.waitFor(() => expect(store.getSnapshot()).toBe("scriptcat"));
      expect(lateListener).not.toHaveBeenCalled();
    });

    it("store setter 应同步更新快照且不提前触发旧 addListener", () => {
      const store = config.externalStore("favicon_service");
      const storeListener = vi.fn();
      const legacyListener = vi.fn();
      store.subscribe(storeListener);
      config.addListener("favicon_service", legacyListener);
      storeListener.mockClear();

      store.set("google");

      expect(store.getSnapshot()).toBe("google");
      expect(storeListener).toHaveBeenCalledTimes(1);
      expect(legacyListener).not.toHaveBeenCalled();
    });

    it("延迟的初始读取不应覆盖 store setter 的新值", async () => {
      let resolveRead!: () => void;
      vi.spyOn(chrome.storage.sync, "get").mockImplementationOnce(((
        _key: string,
        callback: (items: Record<string, unknown>) => void
      ) => {
        resolveRead = () => callback({ system_favicon_service: "scriptcat" });
      }) as never);
      const store = config.externalStore("favicon_service");
      store.subscribe(() => {});

      store.set("google");
      resolveRead();
      await Promise.resolve();

      expect(store.getSnapshot()).toBe("google");
      await expect(config.get("favicon_service")).resolves.toBe("google");
    });
  });
});
