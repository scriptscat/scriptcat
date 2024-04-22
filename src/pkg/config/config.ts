import IoC from "@App/app/ioc";
import MessageCenter from "@App/app/message/center";
import MessageInternal from "@App/app/message/internal";
import { MessageHander } from "@App/app/message/message";
import { Message } from "@arco-design/web-react";
import Hook from "@App/app/service/hook";
import { FileSystemType } from "@Pkg/filesystem/factory";
import ChromeStorage from "./chrome_storage";
// @ts-ignore
import { defaultConfig } from "../../../eslint/linter-config";

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

@IoC.Singleton(MessageHander)
export class SystemConfig {
  static hook = new Hook<"update">();

  public cache = new Map<string, any>();

  public storage = new ChromeStorage("system", true);

  public message?: MessageCenter;

  public internal?: MessageInternal;

  private loadOk = false;

  constructor(message: MessageHander) {
    if (message instanceof MessageCenter) {
      this.message = message;
    }
    if (message instanceof MessageInternal) {
      this.internal = message;
    }
    this.syncConfig();
  }

  public async syncConfig() {
    const list = await this.storage.keys();
    Object.keys(list).forEach((key) => {
      if (!this.cache.has(key)) {
        this.cache.set(key, list[key]);
      }
    });
    this.loadOk = true;
  }

  // 由于加载数据是异步,需要等待数据加载完成
  public awaitLoad(): Promise<SystemConfig> {
    return new Promise((resolve) => {
      if (this.loadOk) {
        resolve(this);
        return;
      }
      const timer = setInterval(() => {
        if (this.loadOk) {
          clearInterval(timer);
          resolve(this);
        }
      }, 100);
    });
  }

  public async init() {
    // 监听消息设置变化
    this.message?.setHandler(
      SystamConfigChange,
      (action: string, data: any) => {
        this.storage.set(data.key, data.val);
        this.cache.set(data.key, data.val);
        SystemConfig.hook.trigger("update", data.key, data.val);
      }
    );
  }

  public set(key: string, val: any) {
    this.cache.set(key, val);
    if (this.internal) {
      this.internal.send(SystamConfigChange, { key, val });
    } else {
      this.storage.set(key, val);
    }
  }

  public list() {
    const ret: { [key: string]: any } = {};
    this.cache.forEach((val, key) => {
      ret[key] = val;
    });
    return ret;
  }

  public get changetime() {
    return <number>this.cache.get("changetime") || 0;
  }

  public set changetime(n: number) {
    this.set("changetime", 0);
  }

  // 检查更新周期,单位为秒
  public get checkScriptUpdateCycle(): number {
    if (this.cache.get("check_script_update_cycle") === undefined) {
      return 86400;
    }
    return <number>this.cache.get("check_script_update_cycle");
  }

  public set checkScriptUpdateCycle(n: number) {
    this.set("check_script_update_cycle", n);
  }

  public get silenceUpdateScript(): boolean {
    return <boolean>this.cache.get("silence_update_script") || false;
  }

  public set silenceUpdateScript(val: boolean) {
    this.set("silence_update_script", val);
  }

  public get enableAutoSync(): boolean {
    if (!this.cache.has("enable_auto_sync")) {
      return true;
    }
    return <boolean>this.cache.get("enable_auto_sync");
  }

  public set enableAutoSync(enable: boolean) {
    this.set("enable_auto_sync", enable);
  }

  // 更新已经禁用的脚本
  public get updateDisableScript(): boolean {
    const value = <boolean>this.cache.get("update_disable_script");
    return value === undefined ? true : value;
  }

  public set updateDisableScript(enable: boolean) {
    this.set("update_disable_script", enable);
  }

  public get vscodeUrl(): string {
    return <string>this.cache.get("vscode_url") || "ws://localhost:8642";
  }

  public set vscodeUrl(val: string) {
    this.set("vscode_url", val);
  }

  public get vscodeReconnect(): boolean {
    return <boolean>this.cache.get("vscode_reconnect") || false;
  }

  public set vscodeReconnect(val: boolean) {
    this.set("vscode_reconnect", val);
  }

  public get backup(): {
    filesystem: FileSystemType;
    params: { [key: string]: any };
  } {
    return (
      this.cache.get("backup") || {
        filesystem: "webdav",
        params: {},
      }
    );
  }

  public set backup(data: {
    filesystem: FileSystemType;
    params: { [key: string]: any };
  }) {
    this.set("backup", data);
  }

  get cloudSync(): CloudSyncConfig {
    return (
      this.cache.get("cloud_sync") || {
        enable: false,
        syncDelete: true,
        filesystem: "webdav",
        params: {},
      }
    );
  }

  set cloudSync(data: CloudSyncConfig) {
    this.set("cloud_sync", data);
  }

  get catFileStorage(): CATFileStorage {
    return (
      this.cache.get("cat_file_storage") || {
        status: "unset",
        filesystem: "webdav",
        params: {},
      }
    );
  }

  set catFileStorage(data: CATFileStorage | undefined) {
    this.set("cat_file_storage", data);
  }

  get scriptCatFlag() {
    return <string>this.cache.get("script_cat_flag");
  }

  set scriptCatFlag(val: string) {
    this.set("script_cat_flag", val);
  }

  get enableEslint() {
    return <boolean>this.cache.get("enable_eslint");
  }

  set enableEslint(val: boolean) {
    this.set("enable_eslint", val);
  }

  get eslintConfig() {
    return <string>this.cache.get("eslint_config") || defaultConfig;
  }

  set eslintConfig(v: string) {
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
  get logCleanCycle() {
    return <number>this.cache.get("log_clean_cycle") || 7;
  }

  set logCleanCycle(val: number) {
    this.set("log_clean_cycle", val);
  }

  // 设置脚本列表列宽度
  get scriptListColumnWidth() {
    return (
      <{ [key: string]: number }>this.cache.get("script_list_column_width") ||
      {}
    );
  }

  set scriptListColumnWidth(val: { [key: string]: number }) {
    this.set("script_list_column_width", val);
  }

  // 展开菜单数
  get menuExpandNum() {
    return <number>this.cache.get("menu_expand_num") || 5;
  }

  set menuExpandNum(val: number) {
    this.set("menu_expand_num", val);
  }
}
