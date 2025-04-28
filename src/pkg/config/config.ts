import { Message } from "@arco-design/web-react";
import ChromeStorage from "./chrome_storage";
import { defaultConfig } from "../../../packages/eslint/linter-config";
import { FileSystemType } from "@Packages/filesystem/factory";
import { MessageQueue } from "@Packages/message/message_queue";
import i18n from "@App/locales/locales";
import dayjs from "dayjs";
import { ExtVersion } from "@App/app/const";

export const SystamConfigChange = "systemConfigChange";

export type CloudSyncConfig = {
  enable: boolean;
  syncDelete: boolean;
  filesystem: FileSystemType;
  params: { [key: string]: any };
};

export type CATFileStorage = {
  filesystem: FileSystemType;
  params: { [key: string]: any };
  status: "unset" | "success" | "error";
};

export class SystemConfig {
  public cache = new Map<string, any>();

  public storage = new ChromeStorage("system", true);

  constructor(private mq: MessageQueue) {
    this.mq.subscribe("systemConfigChange", (msg) => {
      const { key, value } = msg;
      this.cache.set(key, value);
    });
  }

  addListener(key: string, callback: (value: any) => void) {
    this.mq.subscribe(key, (msg) => {
      const { value } = msg;
      callback(value);
    });
  }

  async getAll(): Promise<{ [key: string]: any }> {
    const ret: { [key: string]: any } = {};
    const list = await this.storage.keys();
    Object.keys(list).forEach((key) => {
      this.cache.set(key, list[key]);
      ret[key] = list[key];
    });
    return ret;
  }

  get<T>(key: string, defaultValue: T): Promise<T> {
    if (this.cache.has(key)) {
      return Promise.resolve(this.cache.get(key));
    }
    return this.storage.get(key).then((val) => {
      if (val === undefined) {
        return defaultValue;
      }
      this.cache.set(key, val);
      return val;
    });
  }

  public set(key: string, val: any) {
    this.cache.set(key, val);
    this.storage.set(key, val);
    // 发送消息通知更新
    this.mq.publish(SystamConfigChange, {
      key,
      value: val,
    });
  }

  public getChangetime() {
    return this.get("changetime", 0);
  }

  public setChangetime(n: number) {
    this.set("changetime", 0);
  }

  // 检查更新周期,单位为秒
  public getCheckScriptUpdateCycle() {
    return this.get("check_script_update_cycle", 86400);
  }

  public setCheckScriptUpdateCycle(n: number) {
    this.set("check_script_update_cycle", n);
  }

  public getSilenceUpdateScript() {
    return this.get("silence_update_script", false);
  }

  public setSilenceUpdateScript(val: boolean) {
    this.set("silence_update_script", val);
  }

  public getEnableAutoSync() {
    return this.get("enable_auto_sync", true);
  }

  public setEnableAutoSync(enable: boolean) {
    this.set("enable_auto_sync", enable);
  }

  // 更新已经禁用的脚本
  public getUpdateDisableScript() {
    return this.get("update_disable_script", true);
  }

  public setUpdateDisableScript(enable: boolean) {
    this.set("update_disable_script", enable);
  }

  public getVscodeUrl() {
    return this.get("vscode_url", "ws://localhost:8642");
  }

  public setVscodeUrl(val: string) {
    this.set("vscode_url", val);
  }

  public getVscodeReconnect() {
    return this.get("vscode_reconnect", false);
  }

  public setVscodeReconnect(val: boolean) {
    this.set("vscode_reconnect", val);
  }

  public getBackup(): Promise<{
    filesystem: FileSystemType;
    params: { [key: string]: any };
  }> {
    return this.get("backup", {
      filesystem: "webdav",
      params: {},
    });
  }

  public setBackup(data: { filesystem: FileSystemType; params: { [key: string]: any } }) {
    this.set("backup", data);
  }

  getCloudSync(): Promise<CloudSyncConfig> {
    return this.get("cloud_sync", {
      enable: false,
      syncDelete: true,
      filesystem: "webdav",
      params: {},
    });
  }

  setCloudSync(data: CloudSyncConfig) {
    this.set("cloud_sync", data);
  }

  getCatFileStorage(): Promise<CATFileStorage> {
    return this.get("cat_file_storage", {
      status: "unset",
      filesystem: "webdav",
      params: {},
    });
  }

  setCatFileStorage(data: CATFileStorage | undefined) {
    this.set("cat_file_storage", data);
  }

  getEnableEslint() {
    return this.get("enable_eslint", true);
  }

  setEnableEslint(val: boolean) {
    this.set("enable_eslint", val);
  }

  getEslintConfig() {
    return this.get("eslint_config", defaultConfig);
  }

  setEslintConfig(v: string) {
    if (v === "") {
      this.set("eslint_config", v);
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
    return this.get("log_clean_cycle", 7);
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
    return this.get("menu_expand_num", 5);
  }

  setMenuExpandNum(val: number) {
    this.set("menu_expand_num", val);
  }

  async getLanguage(acceptLanguages?: string[]): Promise<string> {
    const defaultLanguage = await new Promise<string>(async (resolve) => {
      if (!acceptLanguages) {
        acceptLanguages = await chrome.i18n.getAcceptLanguages();
      }
      // 遍历数组寻找匹配语言
      for (let i = 0; i < acceptLanguages.length; i += 1) {
        const lng = acceptLanguages[i];
        if (i18n.hasResourceBundle(lng, "translation")) {
          resolve(lng);
          break;
        }
      }
    });
    return this.get("language", defaultLanguage || chrome.i18n.getUILanguage());
  }

  setLanguage(value: any) {
    this.set("language", value);
    i18n.changeLanguage(value);
    dayjs.locale(value.toLocaleLowerCase());
  }

  setCheckUpdate(data: { notice: string; version: string; isRead: boolean }) {
    this.set("check_update", {
      notice: data.notice,
      version: data.version,
      isRead: data.isRead,
    });
  }

  getCheckUpdate(): Promise<Parameters<typeof this.setCheckUpdate>[0]> {
    return this.get("check_update", {
      notice: "",
      isRead: false,
      version: ExtVersion,
    });
  }
}
