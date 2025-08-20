import { Message } from "@arco-design/web-react";
import ChromeStorage from "./chrome_storage";
import { defaultConfig } from "../../../packages/eslint/linter-config";
import type { FileSystemType } from "@Packages/filesystem/factory";
import type { MessageQueue, TKeyValue } from "@Packages/message/message_queue";
import { changeLanguage, matchLanguage } from "@App/locales/locales";
import { ExtVersion } from "@App/app/const";

export const SystemConfigChange = "systemConfigChange";

export type CloudSyncConfig = {
  enable: boolean;
  syncDelete: boolean;
  syncStatus: boolean;
  filesystem: FileSystemType;
  params: { [key: string]: any };
};

export type CATFileStorage = {
  filesystem: FileSystemType;
  params: { [key: string]: any };
  status: "unset" | "success" | "error";
};

export class SystemConfig {
  private readonly cache = new Map<string, any>();

  private readonly storage = new ChromeStorage("system", true);

  constructor(private mq: MessageQueue) {
    this.mq.subscribe<TKeyValue>(SystemConfigChange, ({ key, value }) => {
      this.cache.set(key, value);
    });
  }

  addListener(key: string, callback: (value: any) => void) {
    this.mq.subscribe<TKeyValue>(SystemConfigChange, (data) => {
      if (data.key === key) {
        callback(data.value);
      }
    });
  }

  get<T>(key: string, defaultValue: Exclude<T, undefined>): Promise<T> {
    if (this.cache.has(key)) {
      let val = this.cache.get(key);
      val = (val === undefined ? defaultValue : val) as T;
      return Promise.resolve(val);
    }
    return this.storage.get(key).then((val) => {
      this.cache.set(key, val);
      val = (val === undefined ? defaultValue : val) as T;
      return val;
    });
  }

  public set(key: string, value: any) {
    if (value === undefined) {
      this.cache.delete(key);
      this.storage.remove(key);
    } else {
      this.cache.set(key, value);
      this.storage.set(key, value);
    }
    // 发送消息通知更新
    this.mq.publish<TKeyValue>(SystemConfigChange, {
      key,
      value,
    });
  }

  public getChangetime() {
    return this.get<number>("changetime", 0);
  }

  public setChangetime(n: number) {
    this.set("changetime", n);
  }

  // 检查更新周期,单位为秒
  public getCheckScriptUpdateCycle() {
    return this.get<number>("check_script_update_cycle", 86400);
  }

  public setCheckScriptUpdateCycle(n: number) {
    this.set("check_script_update_cycle", n);
  }

  public getSilenceUpdateScript() {
    return this.get<boolean>("silence_update_script", false);
  }

  public setSilenceUpdateScript(val: boolean) {
    this.set("silence_update_script", val);
  }

  public getEnableAutoSync() {
    return this.get<boolean>("enable_auto_sync", true);
  }

  public setEnableAutoSync(enable: boolean) {
    this.set("enable_auto_sync", enable);
  }

  // 更新已经禁用的脚本
  public getUpdateDisableScript() {
    return this.get<boolean>("update_disable_script", true);
  }

  public setUpdateDisableScript(enable: boolean) {
    this.set("update_disable_script", enable);
  }

  public getVscodeUrl() {
    return this.get<string>("vscode_url", "ws://localhost:8642");
  }

  public setVscodeUrl(val: string) {
    this.set("vscode_url", val);
  }

  public getVscodeReconnect() {
    return this.get<boolean>("vscode_reconnect", false);
  }

  public setVscodeReconnect(val: boolean) {
    this.set("vscode_reconnect", val);
  }

  public getBackup() {
    return this.get<Parameters<typeof this.setBackup>[0]>("backup", {
      filesystem: "webdav",
      params: {},
    });
  }

  public setBackup(data: { filesystem: FileSystemType; params: { [key: string]: any } }) {
    this.set("backup", data);
  }

  getCloudSync() {
    return this.get<CloudSyncConfig>("cloud_sync", {
      enable: false,
      syncDelete: true,
      syncStatus: true,
      filesystem: "webdav",
      params: {},
    });
  }

  setCloudSync(data: CloudSyncConfig) {
    this.set("cloud_sync", data);
  }

  getCatFileStorage() {
    return this.get<CATFileStorage>("cat_file_storage", {
      status: "unset",
      filesystem: "webdav",
      params: {},
    });
  }

  setCatFileStorage(data: CATFileStorage | undefined) {
    this.set("cat_file_storage", data);
  }

  getEnableEslint() {
    return this.get<boolean>("enable_eslint", true);
  }

  setEnableEslint(val: boolean) {
    this.set("enable_eslint", val);
  }

  getEslintConfig() {
    return this.get<string>("eslint_config", defaultConfig);
  }

  setEslintConfig(v: string) {
    if (v === "") {
      this.set("eslint_config", undefined);
      Message.success("ESLint规则已重置");
      return;
    }
    try {
      JSON.parse(v);
      this.set("eslint_config", v);
      Message.success("ESLint规则已保存");
    } catch (err: any) {
      Message.error(err.toString());
    }
  }

  // 日志清理周期
  getLogCleanCycle() {
    return this.get<number>("log_clean_cycle", 7);
  }

  setLogCleanCycle(val: number) {
    this.set("log_clean_cycle", val);
  }

  // 设置脚本列表列宽度
  getScriptListColumnWidth() {
    return this.get<{ [key: string]: number }>("script_list_column_width", {});
  }

  setScriptListColumnWidth(val: { [key: string]: number }) {
    this.set("script_list_column_width", val);
  }

  // 展开菜单数
  getMenuExpandNum() {
    return this.get<number>("menu_expand_num", 5);
  }

  setMenuExpandNum(val: number) {
    this.set("menu_expand_num", val);
  }

  async getLanguage() {
    if (globalThis.localStorage) {
      const cachedLanguage = localStorage.getItem("language");
      if (cachedLanguage) {
        return cachedLanguage;
      }
    }
    const lng = await this.get("language", (await matchLanguage()) || chrome.i18n.getUILanguage());
    // 设置进入缓存
    if (globalThis.localStorage) {
      localStorage.setItem("language", lng);
    }
    return lng;
  }

  setLanguage(value: string) {
    this.set("language", value);
    changeLanguage(value);
    if (globalThis.localStorage) {
      localStorage.setItem("language", value);
    }
  }

  setCheckUpdate(data: { notice: string; version: string; isRead: boolean }) {
    this.set("check_update", {
      notice: data.notice,
      version: data.version,
      isRead: data.isRead,
    });
  }

  getCheckUpdate() {
    return this.get<Parameters<typeof this.setCheckUpdate>[0]>("check_update", {
      notice: "",
      isRead: false,
      version: ExtVersion,
    });
  }

  setEnableScript(enable: boolean) {
    if (chrome.extension.inIncognitoContext) {
      this.set("enable_script_incognito", enable);
    } else {
      this.set("enable_script", enable);
    }
  }

  async getEnableScript() {
    if (chrome.extension.inIncognitoContext) {
      // 如果是隐身窗口，主窗口设置为false，直接返回false
      // 主窗口和隐身窗口都是true的情况下才会返回true
      const [enableNormal, enableIncognite] = await Promise.all([
        this.get<boolean>("enable_script", true),
        this.get<boolean>("enable_script_incognito", true),
      ]);
      return enableNormal && enableIncognite;
    } else {
      return this.get<boolean>("enable_script", true);
    }
  }

  async getEnableScriptNormal() {
    return this.get<boolean>("enable_script", true);
  }

  async getEnableScriptIncognite() {
    return this.get<boolean>("enable_script_incognito", true);
  }

  setBlacklist(blacklist: string) {
    this.set("blacklist", blacklist);
  }

  getBlacklist() {
    return this.get<string>("blacklist", "");
  }

  // 设置徽标数字类型，不显示，运行次数，脚本个数
  setBadgeNumberType(type: "none" | "run_count" | "script_count") {
    this.set("badge_number_type", type);
  }

  getBadgeNumberType() {
    return this.get<"none" | "run_count" | "script_count">("badge_number_type", "run_count");
  }

  setBadgeBackgroundColor(color: string) {
    this.set("badge_background_color", color);
  }

  getBadgeBackgroundColor() {
    return this.get<string>("badge_background_color", "#4e5969");
  }

  setBadgeTextColor(color: string) {
    this.set("badge_text_color", color);
  }

  getBadgeTextColor() {
    return this.get<string>("badge_text_color", "#ffffff");
  }

  // 设置显示脚本注册的菜单，不在浏览器中显示，全部显示
  setScriptMenuDisplayType(type: "no_browser" | "all") {
    this.set("script_menu_display_type", type);
  }

  getScriptMenuDisplayType() {
    return this.get<"no_browser" | "all">("script_menu_display_type", "all");
  }
}

let lazyScriptNamePrefix: string = "";
let lazyScriptIndex = 0;

// 新腳本自動改名
export const lazyScriptName = (code: string) => {
  if (!lazyScriptNamePrefix) {
    // 使用執行時的亂數種子
    // prefix 為 A000 ~ ZZZZ
    lazyScriptNamePrefix = (((Math.random() * (1679615 - 466560 + 1)) | 0) + 466560).toString(36).toUpperCase();
  }
  code = code.replace(/@name\s+(New Userscript)[\r\n]/g, (s, name) => {
    return s.replace(name, `${name} ${lazyScriptNamePrefix}-${++lazyScriptIndex}`);
  });
  return code;
};
