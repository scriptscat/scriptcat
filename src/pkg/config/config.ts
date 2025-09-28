import ChromeStorage from "./chrome_storage";
import { defaultConfig } from "../../../packages/eslint/linter-config";
import { defaultConfig as editorDefaultConfig } from "@App/pkg/utils/monaco-editor/config";
import type { FileSystemType } from "@Packages/filesystem/factory";
import type { IMessageQueue, TKeyValue } from "@Packages/message/message_queue";
import { changeLanguage, matchLanguage } from "@App/locales/locales";
import { ExtVersion } from "@App/app/const";
import defaultTypeDefinition from "@App/template/scriptcat.d.tpl";
import { toCamelCase } from "../utils/utils";

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

type WithAsyncValue<T> = T | { asyncValue?: () => Promise<T> };

// typeof获取 SystemConfig 的所有方法，去掉 get/set 前缀，并把方法名的第一个字母改为小写
// 修改为蛇形命名法

// 帮助类型：将驼峰命名转换为蛇形命名
type CamelToSnake<S extends string> = S extends `${infer First}${infer Rest}`
  ? `${Lowercase<First>}${CamelToSnakeRest<Rest>}`
  : S;

// 处理除第一个字符外的其余字符
type CamelToSnakeRest<S extends string> = S extends `${infer T}${infer U}`
  ? `${T extends Capitalize<T> ? "_" : ""}${Lowercase<T>}${CamelToSnakeRest<U>}`
  : S;

// 提取以 get 或 set 开头的方法名，去掉前缀并转换为蛇形命名
type ExtractConfigKey<T> = T extends `get${infer K}` | `set${infer K}`
  ? K extends ""
    ? never
    : CamelToSnake<K>
  : never;

// 从 SystemConfig 的方法名中提取配置键，过滤掉空类型
export type SystemConfigKey = Exclude<ExtractConfigKey<keyof SystemConfig>, never>;

// 帮助类型：将蛇形命名转换为驼峰命名
type SnakeToCamel<S extends string> = S extends `${infer P1}_${infer P2}${infer P3}`
  ? `${P1}${Capitalize<SnakeToCamel<`${P2}${P3}`>>}`
  : S extends `${infer P1}_${infer P2}`
    ? `${P1}${Capitalize<P2>}`
    : S;

// 从配置键构造对应的get方法名
type GetMethodName<K extends SystemConfigKey> = `get${Capitalize<SnakeToCamel<K>>}`;

// 从get方法的返回类型推断值类型
export type SystemConfigValueType<K extends SystemConfigKey> =
  GetMethodName<K> extends keyof SystemConfig
    ? SystemConfig[GetMethodName<K>] extends (...args: any[]) => Promise<infer R>
      ? R
      : SystemConfig[GetMethodName<K>] extends (...args: any[]) => infer R
        ? R
        : never
    : never;

export class SystemConfig {
  private readonly cache = new Map<string, any>();

  private readonly storage = new ChromeStorage("system", true);

  constructor(private mq: IMessageQueue) {
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

  private _get<T extends string | number | boolean | object>(
    key: SystemConfigKey,
    defaultValue: WithAsyncValue<Exclude<T, undefined>>
  ): Promise<T> {
    if (this.cache.has(key)) {
      let val = this.cache.get(key);
      //@ts-ignore
      val = (val === undefined ? defaultValue?.asyncValue?.() || defaultValue : val) as T | Promise<T>;
      return Promise.resolve(val);
    }
    return this.storage.get(key).then((val) => {
      this.cache.set(key, val);
      //@ts-ignore
      val = (val === undefined ? defaultValue?.asyncValue?.() || defaultValue : val) as T | Promise<T>;
      return val;
    });
  }

  public get(key: SystemConfigKey | SystemConfigKey[]): Promise<any | any[]> {
    if (Array.isArray(key)) {
      const promises = key.map((key) => {
        const funcName = `get${toCamelCase(key)}`;
        // @ts-ignore
        if (typeof this[funcName] === "function") {
          // @ts-ignore
          return this[funcName]() as Promise<any>;
        } else {
          throw new Error(`Method ${funcName} does not exist on SystemConfig`);
        }
      });
      return Promise.all(promises);
    }
    const funcName = `get${toCamelCase(key)}`;
    // @ts-ignore
    if (typeof this[funcName] === "function") {
      // @ts-ignore
      return this[funcName]() as Promise<any>;
    } else {
      throw new Error(`Method ${funcName} does not exist on SystemConfig`);
    }
  }

  public set(key: SystemConfigKey, value: any): void {
    const funcName = `set${toCamelCase(key)}`;
    // @ts-ignore
    if (typeof this[funcName] === "function") {
      // @ts-ignore
      this[funcName](value);
    } else {
      throw new Error(`Method ${funcName} does not exist on SystemConfig`);
    }
  }

  private _set(key: SystemConfigKey, value: any) {
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
    return this._get<number>("changetime", 0);
  }

  public setChangetime(n: number) {
    this._set("changetime", n);
  }

  defaultCheckScriptUpdateCycle() {
    return 86400;
  }

  // 检查更新周期,单位为秒
  public getCheckScriptUpdateCycle() {
    return this._get<number>("check_script_update_cycle", this.defaultCheckScriptUpdateCycle());
  }

  public setCheckScriptUpdateCycle(n: number) {
    this._set("check_script_update_cycle", n);
  }

  public getSilenceUpdateScript() {
    return this._get<boolean>("silence_update_script", false);
  }

  public setSilenceUpdateScript(val: boolean) {
    this._set("silence_update_script", val);
  }

  public getEnableAutoSync() {
    return this._get<boolean>("enable_auto_sync", true);
  }

  public setEnableAutoSync(enable: boolean) {
    this._set("enable_auto_sync", enable);
  }

  // 更新已经禁用的脚本
  public getUpdateDisableScript() {
    return this._get<boolean>("update_disable_script", true);
  }

  public setUpdateDisableScript(enable: boolean) {
    this._set("update_disable_script", enable);
  }

  public getVscodeUrl() {
    return this._get<string>("vscode_url", "ws://localhost:8642");
  }

  public setVscodeUrl(val: string) {
    this._set("vscode_url", val);
  }

  public getVscodeReconnect() {
    return this._get<boolean>("vscode_reconnect", false);
  }

  public setVscodeReconnect(val: boolean) {
    this._set("vscode_reconnect", val);
  }

  defaultBackup(): Parameters<typeof this.setBackup>[0] {
    return {
      filesystem: "webdav" as FileSystemType,
      params: {},
    };
  }

  public getBackup() {
    return this._get<Parameters<typeof this.setBackup>[0]>("backup", this.defaultBackup());
  }

  public setBackup(data: { filesystem: FileSystemType; params: { [key: string]: any } }) {
    this._set("backup", data);
  }

  defaultCloudSync(): CloudSyncConfig {
    return {
      enable: false,
      syncDelete: true,
      syncStatus: true,
      filesystem: "webdav",
      params: {},
    };
  }

  getCloudSync() {
    return this._get<CloudSyncConfig>("cloud_sync", this.defaultCloudSync());
  }

  setCloudSync(data: CloudSyncConfig) {
    this._set("cloud_sync", data);
  }

  defaultCatFileStorage(): CATFileStorage {
    return {
      status: "unset",
      filesystem: "webdav",
      params: {},
    };
  }

  getCatFileStorage() {
    return this._get<CATFileStorage>("cat_file_storage", this.defaultCatFileStorage());
  }

  setCatFileStorage(data: CATFileStorage | undefined) {
    this._set("cat_file_storage", data);
  }

  getEnableEslint() {
    return this._get<boolean>("enable_eslint", true);
  }

  setEnableEslint(val: boolean) {
    this._set("enable_eslint", val);
  }

  getEslintConfig() {
    return this._get<string>("eslint_config", defaultConfig);
  }

  setEslintConfig(v: string) {
    if (v === "") {
      this._set("eslint_config", undefined);
      return;
    }
    JSON.parse(v);
    return this._set("eslint_config", v);
  }

  getEditorConfig() {
    return this._get<string>("editor_config", editorDefaultConfig);
  }

  setEditorConfig(v: string) {
    if (v === "") {
      this._set("editor_config", undefined);
      return;
    }
    JSON.parse(v);
    return this._set("editor_config", v);
  }

  // 获取typescript类型定义
  getEditorTypeDefinition() {
    return localStorage.getItem("editor_type_definition") || defaultTypeDefinition;
  }

  // 由于内容过大，只能存储到localStorage中
  setEditorTypeDefinition(v: string) {
    if (v === "") {
      delete localStorage["editor_type_definition"];
      return;
    }
    localStorage.setItem("editor_type_definition", v);
  }

  // 日志清理周期
  getLogCleanCycle() {
    return this._get<number>("log_clean_cycle", 7);
  }

  setLogCleanCycle(val: number) {
    this._set("log_clean_cycle", val);
  }

  // 设置脚本列表列宽度
  getScriptListColumnWidth() {
    return this._get<{ [key: string]: number }>("script_list_column_width", {});
  }

  setScriptListColumnWidth(val: { [key: string]: number }) {
    this._set("script_list_column_width", val);
  }

  defaultMenuExpandNum() {
    return 5;
  }

  // 展开菜单数
  getMenuExpandNum() {
    return this._get<number>("menu_expand_num", this.defaultMenuExpandNum());
  }

  setMenuExpandNum(val: number) {
    this._set("menu_expand_num", val);
  }

  async getLanguage() {
    if (globalThis.localStorage) {
      const cachedLanguage = localStorage.getItem("language");
      if (cachedLanguage) {
        return cachedLanguage;
      }
    }
    return this._get<string>("language", {
      // 取预设值时呼叫 asyncValue 进行异步取值
      asyncValue() {
        return matchLanguage().then((matchLanguageRes) => {
          return matchLanguageRes || chrome.i18n.getUILanguage();
        });
      },
    }).then((lng) => {
      // 设置进入缓存
      if (globalThis.localStorage) {
        localStorage.setItem("language", `${lng}`);
      }
      return lng;
    });
  }

  setLanguage(value: string) {
    this._set("language", value);
    changeLanguage(value);
    if (globalThis.localStorage) {
      localStorage.setItem("language", value);
    }
  }

  setCheckUpdate(data: { notice: string; version: string; isRead: boolean }) {
    this._set("check_update", {
      notice: data.notice,
      version: data.version,
      isRead: data.isRead,
    });
  }

  getCheckUpdate() {
    return this._get<Parameters<typeof this.setCheckUpdate>[0]>("check_update", {
      notice: "",
      isRead: false,
      version: ExtVersion,
    });
  }

  setEnableScript(enable: boolean) {
    if (chrome.extension.inIncognitoContext) {
      this._set("enable_script_incognito", enable);
    } else {
      this._set("enable_script", enable);
    }
  }

  async getEnableScript() {
    if (chrome.extension.inIncognitoContext) {
      // 如果是隐身窗口，主窗口设置为false，直接返回false
      // 主窗口和隐身窗口都是true的情况下才会返回true
      const [enableNormal, enableIncognito] = await Promise.all([
        this._get<boolean>("enable_script", true),
        this._get<boolean>("enable_script_incognito", true),
      ]);
      return enableNormal && enableIncognito;
    } else {
      return this._get<boolean>("enable_script", true);
    }
  }

  async getEnableScriptNormal() {
    return this._get<boolean>("enable_script", true);
  }

  async getEnableScriptIncognito() {
    return this._get<boolean>("enable_script_incognito", true);
  }

  setBlacklist(blacklist: string) {
    this._set("blacklist", blacklist);
  }

  getBlacklist() {
    return this._get<string>("blacklist", "");
  }

  // 设置徽标数字类型，不显示，运行次数，脚本个数
  setBadgeNumberType(type: "none" | "run_count" | "script_count") {
    this._set("badge_number_type", type);
  }

  getBadgeNumberType() {
    return this._get<"none" | "run_count" | "script_count">("badge_number_type", "run_count");
  }

  setBadgeBackgroundColor(color: string) {
    this._set("badge_background_color", color);
  }

  getBadgeBackgroundColor() {
    return this._get<string>("badge_background_color", "#4e5969");
  }

  setBadgeTextColor(color: string) {
    this._set("badge_text_color", color);
  }

  getBadgeTextColor() {
    return this._get<string>("badge_text_color", "#ffffff");
  }

  // 设置显示脚本注册的菜单，不在浏览器中显示，全部显示
  setScriptMenuDisplayType(type: "no_browser" | "all") {
    this._set("script_menu_display_type", type);
  }

  getScriptMenuDisplayType(): Promise<"no_browser" | "all"> {
    return this._get("script_menu_display_type", "all");
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
