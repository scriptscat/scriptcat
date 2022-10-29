import IoC from "@App/app/ioc";
import MessageCenter from "@App/app/message/center";
import MessageInternal from "@App/app/message/internal";
import { MessageHander } from "@App/app/message/message";
import Hook from "@App/app/service/hook";
import { FileSystemType } from "@Pkg/filesystem/factory";
import ChromeStorage from "./chrome_storage";

export const SystamConfigChange = "systemConfigChange";

export type CloudSyncConfig = {
  enable: boolean;
  syncDelete: boolean;
  filesystem: FileSystemType;
  params: { [key: string]: any };
};

@IoC.Singleton(MessageHander)
export class SystemConfig {
  static hook = new Hook<"update">();

  public cache = new Map<string, any>();

  public storage = new ChromeStorage("system", chrome.storage.sync);

  public message?: MessageCenter;

  public internal?: MessageInternal;

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
      this.cache.set(key, list[key]);
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

  get version() {
    return /* version */ "0.10.0-alpha.1";
  }

  get server() {
    return "https://sc.icodef.com/";
  }

  get externalWhitelist() {
    return [
      "greasyfork.org",
      "scriptcat.org",
      "tampermonkey.net.cn",
      "openuserjs.org",
    ];
  }

  public get changetime() {
    return <number>this.cache.get("changetime") || 0;
  }

  public set changetime(n: number) {
    this.set("changetime", 0);
  }

  // 检查更新周期,单位为秒
  public get checkScriptUpdateCycle(): number {
    return <number>this.cache.get("check_script_update_cycle") || 86400;
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
    return <boolean>this.cache.get("update_disable_script");
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

  get scriptCatFlag() {
    return <string>this.cache.get("script_cat_flag");
  }

  set scriptCatFlag(val: string) {
    this.set("script_cat_flag", val);
  }
}
