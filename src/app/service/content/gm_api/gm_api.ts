import { customClone, Native } from "../global";
import type { Message, MessageConnect } from "@Packages/message/types";
import type { CustomEventMessage } from "@Packages/message/custom_event_message";
import type {
  GMRegisterMenuCommandParam,
  GMUnRegisterMenuCommandParam,
  NotificationMessageOption,
  ScriptMenuItemOption,
  SWScriptMenuItemOption,
  TScriptMenuItemID,
  TScriptMenuItemKey,
  MessageRequest,
} from "@App/app/service/service_worker/types";
import { base64ToBlob, randNum, randomMessageFlag, strToBase64 } from "@App/pkg/utils/utils";
import LoggerCore from "@App/app/logger/core";
import type EventEmitter from "eventemitter3";
import GMContext from "./gm_context";
import { type ScriptRunResource } from "@App/app/repo/scripts";
import type { ValueUpdateDataEncoded } from "../types";
import { connect, sendMessage } from "@Packages/message/client";
import { isContent } from "@Packages/message/common";
import { getStorageName } from "@App/pkg/utils/utils";
import { type ListenerManager } from "../listener_manager";
import { decodeRValue, encodeRValue, type REncoded } from "@App/pkg/utils/message_value";
import { type TGMKeyValue } from "@App/app/repo/value";
import type { ContextType } from "./gm_xhr";
import { convObjectToURL, GM_xmlhttpRequest, toBlobURL, urlToDocumentInContentPage } from "./gm_xhr";

// 内部函数呼叫定义
export interface IGM_Base {
  sendMessage(api: string, params: any[]): Promise<any>;
  connect(api: string, params: any[]): Promise<any>;
  valueUpdate(data: ValueUpdateDataEncoded): void;
  emitEvent(event: string, eventId: string, data: any): void;
}

export interface GMRequestHandle {
  /** Abort the ongoing request */
  abort: () => void;
}

const hasGrant = (grants: Set<string>, ...list: string[]) => list.some((grant) => grants.has(grant));

const integrity = {}; // 仅防止非法实例化

let valChangeCounterId = 0;

let valChangeRandomId = `${randNum(8e11, 2e12).toString(36)}`;

const valueChangePromiseMap = new Map<string, any>();

const execEnvInit = (execEnv: GM_Base) => {
  if (!execEnv.contentEnvKey) {
    execEnv.contentEnvKey = randomMessageFlag(); // 不重复识别字串。用于区分 mainframe subframe 等执行环境
    execEnv.menuKeyRegistered = new Set();
    execEnv.menuIdCounter = 0;
    execEnv.regMenuCounter = 0;
  }
};

// GM_Base 定义内部用变量和函数。均使用@protected
// 暂不考虑 Object.getOwnPropertyNames(GM_Base.prototype) 和 ts-morph 脚本生成
export class GM_Base implements IGM_Base {
  @GMContext.protected()
  protected runFlag!: string;

  @GMContext.protected()
  public prefix!: string;

  // Extension Context 无效时释放 scriptRes
  @GMContext.protected()
  public message?: Message | null;

  // Extension Context 无效时释放 scriptRes
  @GMContext.protected()
  public scriptRes?: ScriptRunResource | null;

  // Extension Context 无效时释放 valueChangeListener
  @GMContext.protected()
  public valueChangeListener?: ListenerManager<GMTypes.ValueChangeListener> | null;

  // Extension Context 无效时释放 EE
  @GMContext.protected()
  public EE?: EventEmitter | null;

  @GMContext.protected()
  public context!: any;

  @GMContext.protected()
  public eventId!: number;

  @GMContext.protected()
  protected loadScriptResolve: (() => void) | undefined;

  @GMContext.protected()
  public loadScriptPromise: Promise<void> | undefined;

  constructor(options: any = null, obj: any = null) {
    if (obj !== integrity) throw new TypeError("Illegal invocation");
    Object.assign(this, options);
  }

  @GMContext.protected()
  static createGMBase(options: { [key: string]: any }) {
    return new GM_Base(options, integrity) as GM_Base & { [key: string]: any };
  }

  @GMContext.protected()
  public isInvalidContext!: () => boolean;

  @GMContext.protected()
  public setInvalidContext!: () => void;

  // 单次回调使用
  @GMContext.protected()
  public async sendMessage(api: string, params: any[]) {
    if (!this.message || !this.scriptRes) return;
    if (this.loadScriptPromise) {
      await this.loadScriptPromise;
    }
    let ret;
    try {
      ret = await sendMessage(this.message, `${this.prefix}/runtime/gmApi`, {
        uuid: this.scriptRes.uuid,
        api,
        params,
        runFlag: this.runFlag,
      } as MessageRequest);
    } catch (e: any) {
      if (`${e?.message || e}`.includes("Extension context invalidated.")) {
        this.setInvalidContext(); // 之后不再进行 sendMessage 跟 EE操作
        console.error(e);
      } else {
        throw e;
      }
    }
    return ret;
  }

  // 长连接使用,connect只用于接受消息,不发送消息
  @GMContext.protected()
  public connect(api: string, params: any[]) {
    if (!this.message || !this.scriptRes) return new Promise<MessageConnect>(() => {});
    return connect(this.message, `${this.prefix}/runtime/gmApi`, {
      uuid: this.scriptRes.uuid,
      api,
      params,
      runFlag: this.runFlag,
    } as MessageRequest);
  }

  @GMContext.protected()
  public valueUpdate(data: ValueUpdateDataEncoded) {
    if (!this.scriptRes || !this.valueChangeListener) return;
    const scriptRes = this.scriptRes;
    const { id, uuid, entries, storageName, sender, valueUpdated } = data;
    if (uuid === scriptRes.uuid || storageName === getStorageName(scriptRes)) {
      const valueStore = scriptRes.value;
      const remote = sender.runFlag !== this.runFlag;
      if (!remote && id) {
        const fn = valueChangePromiseMap.get(id);
        if (fn) {
          valueChangePromiseMap.delete(id);
          fn();
        }
      }
      if (valueUpdated) {
        const valueChanges = entries;
        for (const [key, rTyped1, rTyped2] of valueChanges) {
          const value = decodeRValue(rTyped1);
          const oldValue = decodeRValue(rTyped2);
          // 触发,并更新值
          if (value === undefined) {
            if (valueStore[key] !== undefined) {
              delete valueStore[key];
            }
          } else {
            valueStore[key] = value;
          }
          this.valueChangeListener.execute(key, oldValue, value, remote, sender.tabId);
        }
      }
    }
  }

  @GMContext.protected()
  emitEvent(event: string, eventId: string, data: any) {
    if (!this.EE) return;
    this.EE.emit(`${event}:${eventId}`, data);
  }

  /**
   * <tag, notificationId>
   */
  notificationTagMap?: Map<string, string>;

  // 已注册的「菜单唯一键」集合，用于去重与解除绑定。
  // 唯一键格式：{contentEnvKey}.t{注册ID}，由 execEnvInit() 建立/维护。
  menuKeyRegistered: Set<string> | undefined;

  // 自动产生的菜单 ID 累计器（仅在未提供 options.id 时使用）。
  // 每个 contentEnvKey（执行环境）初始化时会重设；不持久化、只保证当前环境内递增唯一。
  menuIdCounter: number | undefined;

  // 菜单注册累计器 - 用于稳定同一Tab不同frame之选项的单独项目不合并状态
  // 每个 contentEnvKey（执行环境）初始化时会重设；不持久化、只保证当前环境内递增唯一。
  regMenuCounter: number | undefined;

  // 内容脚本执行环境识别符，用于区分 mainframe / subframe 等环境并作为 menu key 的命名空间。
  // 由 execEnvInit() 以 randomMessageFlag() 生成，避免跨 frame 的 ID 碰撞。
  // (同一环境跨脚本也不一样)
  contentEnvKey: string | undefined;
}

export const createGMApis = (gtx: GM_Base, scriptGrants: Set<string>) => {
  let invalid = false;

  gtx.setInvalidContext = () => {
    if (invalid) return;
    invalid = true;
    gtx.valueChangeListener?.clear();
    gtx.EE?.removeAllListeners();
    // 释放记忆
    gtx.message = null;
    gtx.scriptRes = null;
    gtx.valueChangeListener = null;
    gtx.EE = null;
  };
  gtx.isInvalidContext = () => {
    return invalid;
  };

  // API 定義

  let apis;

  const {
    // 在这里抽出代码，打包时压缩名字
    _GM_getValue,
    GM_getValues,
    _GM_setValue,
    _GM_setValues,
    _GM_registerMenuCommand,
    _GM_unregisterMenuCommand,
    GM_log,
    GM_addStyle,
    GM_addElement,
    GM_openInTab,
    GM_saveTab,
    GM_getTab,
    GM_getTabs,
    GM_getResourceText,
    GM_getResourceURL,
    GM_setClipboard,
    _GM_download,
    _GM_notification,
    GM_cookie,
  } = (apis = {
    // 获取脚本的值,可以通过@storageName让多个脚本共享一个储存空间
    _GM_getValue(key: string, defaultValue?: any) {
      if (!gtx.scriptRes) return undefined;
      const ret = gtx.scriptRes.value[key];
      if (ret !== undefined) {
        if (ret && typeof ret === "object") {
          return customClone(ret)!;
        }
        return ret;
      }
      return defaultValue;
    },
    ...(hasGrant(scriptGrants, "GM.getValue", "GM_getValue") && {
      GM_getValue(key: string, defaultValue?: any) {
        return _GM_getValue(key, defaultValue);
      },
      "GM.getValue"(key: string, defaultValue?: any): Promise<any> {
        // 兼容GM.getValue
        return new Promise((resolve) => {
          const ret = _GM_getValue(key, defaultValue);
          resolve(ret);
        });
      },
    }),

    _GM_setValue(promise: any, key: string, value: any) {
      if (!gtx.scriptRes) return;
      if (valChangeCounterId > 1e8) {
        // 防止 valChangeCounterId 过大导致无法正常工作
        valChangeCounterId = 0;
        valChangeRandomId = `${randNum(8e11, 2e12).toString(36)}`;
      }
      const id = `${valChangeRandomId}::${++valChangeCounterId}`;
      if (promise) {
        valueChangePromiseMap.set(id, promise);
      }
      if (value === undefined) {
        delete gtx.scriptRes.value[key];
        gtx.sendMessage("GM_setValue", [id, key]);
      } else {
        // 对object的value进行一次转化
        if (value && typeof value === "object") {
          value = customClone(value);
        }
        // customClone 可能返回 undefined
        gtx.scriptRes.value[key] = value;
        if (value === undefined) {
          gtx.sendMessage("GM_setValue", [id, key]);
        } else {
          gtx.sendMessage("GM_setValue", [id, key, value]);
        }
      }
      return id;
    },

    _GM_setValues(promise: any, values: TGMKeyValue) {
      if (!gtx.scriptRes) return;
      if (valChangeCounterId > 1e8) {
        // 防止 valChangeCounterId 过大导致无法正常工作
        valChangeCounterId = 0;
        valChangeRandomId = `${randNum(8e11, 2e12).toString(36)}`;
      }
      const id = `${valChangeRandomId}::${++valChangeCounterId}`;
      if (promise) {
        valueChangePromiseMap.set(id, promise);
      }
      const valueStore = gtx.scriptRes.value;
      const keyValuePairs = [] as [string, REncoded<unknown>][];
      for (const [key, value] of Object.entries(values)) {
        let value_ = value;
        if (value_ === undefined) {
          if (valueStore[key]) delete valueStore[key];
        } else {
          // 对object的value进行一次转化
          if (value_ && typeof value_ === "object") {
            value_ = customClone(value_);
          }
          // customClone 可能返回 undefined
          valueStore[key] = value_;
        }
        // 避免undefined 等空值流失，先进行映射处理
        keyValuePairs.push([key, encodeRValue(value_)]);
      }
      gtx.sendMessage("GM_setValues", [id, keyValuePairs]);
      return id;
    },

    ...(hasGrant(scriptGrants, "GM.setValue", "GM_setValue") && {
      GM_setValue(key: string, value: any) {
        _GM_setValue(null, key, value);
      },

      "GM.setValue"(key: string, value: any): Promise<void> {
        // Asynchronous wrapper for GM_setValue to support GM.setValue
        return new Promise((resolve) => {
          _GM_setValue(resolve, key, value);
        });
      },
    }),

    ...(hasGrant(scriptGrants, "GM.deleteValue", "GM_deleteValue") && {
      GM_deleteValue(key: string): void {
        _GM_setValue(null, key, undefined);
      },

      "GM.deleteValue"(key: string): Promise<void> {
        // Asynchronous wrapper for GM_deleteValue to support GM.deleteValue
        return new Promise((resolve) => {
          _GM_setValue(resolve, key, undefined);
        });
      },
    }),

    ...(hasGrant(scriptGrants, "GM.listValues", "GM_listValues") && {
      GM_listValues(): string[] {
        if (!gtx.scriptRes) return [];
        const keys = Object.keys(gtx.scriptRes.value);
        return keys;
      },

      "GM.listValues"(): Promise<string[]> {
        // Asynchronous wrapper for GM_listValues to support GM.listValues
        return new Promise((resolve) => {
          if (!gtx.scriptRes) return resolve([]);
          const keys = Object.keys(gtx.scriptRes.value);
          resolve(keys);
        });
      },
    }),

    ...(hasGrant(scriptGrants, "GM.setValues", "GM_setValues") && {
      GM_setValues(values: TGMKeyValue) {
        if (!values || typeof values !== "object") {
          throw new Error("GM_setValues: values must be an object");
        }
        _GM_setValues(null, values);
      },

      "GM.setValues"(values: { [key: string]: any }): Promise<void> {
        if (!gtx.scriptRes) return new Promise<void>(() => {});
        return new Promise((resolve) => {
          if (!values || typeof values !== "object") {
            throw new Error("GM.setValues: values must be an object");
          }
          _GM_setValues(resolve, values);
        });
      },
    }),

    ...(hasGrant(scriptGrants, "GM.getValues", "GM_getValues") && {
      GM_getValues(keysOrDefaults: TGMKeyValue | string[] | null | undefined) {
        if (!gtx.scriptRes) return {};
        if (!keysOrDefaults) {
          // Returns all values
          return customClone(gtx.scriptRes.value)!;
        }
        const result: TGMKeyValue = {};
        if (Array.isArray(keysOrDefaults)) {
          // 键名数组
          // Handle array of keys (e.g., ['foo', 'bar'])
          for (let index = 0; index < keysOrDefaults.length; index++) {
            const key = keysOrDefaults[index];
            if (key in gtx.scriptRes.value) {
              // 对object的value进行一次转化
              let value = gtx.scriptRes.value[key];
              if (value && typeof value === "object") {
                value = customClone(value)!;
              }
              result[key] = value;
            }
          }
        } else {
          // 对象 键: 默认值
          // Handle object with default values (e.g., { foo: 1, bar: 2, baz: 3 })
          for (const key of Object.keys(keysOrDefaults)) {
            const defaultValue = keysOrDefaults[key];
            result[key] = _GM_getValue(key, defaultValue);
          }
        }
        return result;
      },

      // Asynchronous wrapper for GM.getValues
      "GM.getValues"(keysOrDefaults: TGMKeyValue | string[] | null | undefined): Promise<TGMKeyValue> {
        if (!gtx.scriptRes) return new Promise<TGMKeyValue>(() => {});
        return new Promise((resolve) => {
          const ret = GM_getValues!(keysOrDefaults);
          resolve(ret);
        });
      },
    }),

    ...(hasGrant(scriptGrants, "GM.deleteValues", "GM_deleteValues") && {
      GM_deleteValues(keys: string[]) {
        if (!gtx.scriptRes) return;
        if (!Array.isArray(keys)) {
          console.warn("GM_deleteValues: keys must be string[]");
          return;
        }
        const req = {} as Record<string, undefined>;
        for (const key of keys) {
          req[key] = undefined;
        }
        _GM_setValues(null, req);
      },

      // Asynchronous wrapper for GM.deleteValues
      "GM.deleteValues"(keys: string[]): Promise<void> {
        if (!gtx.scriptRes) return new Promise<void>(() => {});
        return new Promise((resolve) => {
          if (!Array.isArray(keys)) {
            throw new Error("GM.deleteValues: keys must be string[]");
          } else {
            const req = {} as Record<string, undefined>;
            for (const key of keys) {
              req[key] = undefined;
            }
            _GM_setValues(resolve, req);
          }
        });
      },
    }),

    ...(hasGrant(scriptGrants, "GM_addValueChangeListener", "GM.addValueChangeListener") && {
      GM_addValueChangeListener(name: string, listener: GMTypes.ValueChangeListener): number {
        return gtx.valueChangeListener ? gtx.valueChangeListener.add(name, listener) : 0;
      },

      "GM.addValueChangeListener"(name: string, listener: GMTypes.ValueChangeListener): Promise<number> {
        return new Promise<number>((resolve) => {
          const ret = gtx.valueChangeListener ? gtx.valueChangeListener.add(name, listener) : 0;
          resolve(ret);
        });
      },
    }),

    ...(hasGrant(scriptGrants, "GM_removeValueChangeListener", "GM.removeValueChangeListener") && {
      GM_removeValueChangeListener(listenerId: number): void {
        gtx.valueChangeListener?.remove(listenerId);
      },

      "GM.removeValueChangeListener"(listenerId: number): Promise<void> {
        return new Promise<void>((resolve) => {
          gtx.valueChangeListener?.remove(listenerId);
          resolve();
        });
      },
    }),

    ...(hasGrant(scriptGrants, "GM_log", "GM.log") && {
      GM_log(message: string, level: GMTypes.LoggerLevel = "info", ...labels: GMTypes.LoggerLabel[]): void {
        if (gtx.isInvalidContext()) return;
        if (typeof message !== "string") {
          message = Native.jsonStringify(message);
        }
        gtx.sendMessage("GM_log", [message, level, labels]);
      },

      "GM.log"(message: string, level: GMTypes.LoggerLevel = "info", ...labels: GMTypes.LoggerLabel[]): Promise<void> {
        return new Promise<void>((resolve) => {
          GM_log!(message, level, ...labels);
          resolve();
        });
      },
    }),

    ...(hasGrant(scriptGrants, "CAT_createBlobUrl") && {
      CAT_createBlobUrl(blob: Blob): Promise<string> {
        return Promise.resolve(toBlobURL(gtx, blob));
      },
    }),

    ...(hasGrant(scriptGrants, "CAT_fetchBlob") && {
      // 辅助GM_xml获取blob数据
      CAT_fetchBlob(url: string): Promise<Blob> {
        return gtx.sendMessage("CAT_fetchBlob", [url]);
      },
    }),

    ...(hasGrant(scriptGrants, "CAT_fetchDocument") && {
      async CAT_fetchDocument(url: string): Promise<Document | undefined> {
        return urlToDocumentInContentPage(gtx, url, isContent);
      },
    }),

    ...(hasGrant(scriptGrants, "GM.cookie", "GM_cookie") && {
      GM_cookie(
        action: string,
        details: GMTypes.CookieDetails,
        done: (cookie: GMTypes.Cookie[] | any, error: any | undefined) => void
      ) {
        // 如果url和域名都没有，自动填充当前url
        if (!details.url && !details.domain) {
          details.url = window.location.href;
        }
        // 如果是set、delete操作，自动填充当前url
        if (action === "set" || action === "delete") {
          if (!details.url) {
            details.url = window.location.href;
          }
        }
        gtx
          .sendMessage("GM_cookie", [action, details])
          .then((resp: any) => {
            done && done(resp, undefined);
          })
          .catch((err) => {
            done && done(undefined, err);
          });
      },

      "GM.cookie"(action: string, details: GMTypes.CookieDetails) {
        return new Promise((resolve, reject) => {
          GM_cookie!(action, details, (cookie, error) => {
            error ? reject(error) : resolve(cookie);
          });
        });
      },

      "GM.cookie.set"(details: GMTypes.CookieDetails) {
        return new Promise((resolve, reject) => {
          GM_cookie!("set", details, (cookie, error) => {
            error ? reject(error) : resolve(cookie);
          });
        });
      },

      "GM.cookie.list"(details: GMTypes.CookieDetails) {
        return new Promise((resolve, reject) => {
          GM_cookie!("list", details, (cookie, error) => {
            error ? reject(error) : resolve(cookie);
          });
        });
      },

      "GM.cookie.delete"(details: GMTypes.CookieDetails) {
        return new Promise((resolve, reject) => {
          GM_cookie!("delete", details, (cookie, error) => {
            error ? reject(error) : resolve(cookie);
          });
        });
      },

      "GM_cookie.set"(
        details: GMTypes.CookieDetails,
        done: (cookie: GMTypes.Cookie[] | any, error: any | undefined) => void
      ) {
        GM_cookie!("set", details, done);
      },

      "GM_cookie.list"(
        details: GMTypes.CookieDetails,
        done: (cookie: GMTypes.Cookie[] | any, error: any | undefined) => void
      ) {
        GM_cookie!("list", details, done);
      },

      "GM_cookie.delete"(
        details: GMTypes.CookieDetails,
        done: (cookie: GMTypes.Cookie[] | any, error: any | undefined) => void
      ) {
        GM_cookie!("delete", details, done);
      },
    }),

    _GM_registerMenuCommand(
      name: string,
      listener?: (inputValue?: any) => void,
      options_or_accessKey?: ScriptMenuItemOption | string
    ): TScriptMenuItemID {
      if (!gtx.EE) return -1;
      execEnvInit(gtx);
      gtx.regMenuCounter! += 1;
      // 兼容 GM_registerMenuCommand(name, options_or_accessKey)
      if (!options_or_accessKey && typeof listener === "object") {
        options_or_accessKey = listener;
        listener = undefined;
      }
      // 浅拷贝避免修改/共用参数
      const options: SWScriptMenuItemOption = (
        typeof options_or_accessKey === "string"
          ? { accessKey: options_or_accessKey }
          : options_or_accessKey
            ? { ...options_or_accessKey, id: undefined, individual: undefined } // id不直接储存在options (id 影响 groupKey 操作)
            : {}
      ) as ScriptMenuItemOption;
      const isSeparator = !listener && !name;
      let isIndividual = typeof options_or_accessKey === "object" ? options_or_accessKey.individual : undefined;
      if (isIndividual === undefined && isSeparator) {
        isIndividual = true;
      }
      options.mIndividualKey = isIndividual ? gtx.regMenuCounter : 0;
      if (options.autoClose === undefined) {
        options.autoClose = true;
      }
      if (options.nested === undefined) {
        options.nested = true;
      }
      if (isSeparator) {
        // GM_registerMenuCommand("") 时自动设为分隔线
        options.mSeparator = true;
        name = "";
        listener = undefined;
      } else {
        options.mSeparator = false;
      }
      let providedId: string | number | undefined =
        typeof options_or_accessKey === "object" ? options_or_accessKey.id : undefined;
      if (providedId === undefined) providedId = gtx.menuIdCounter! += 1; // 如无指定，使用累计器id
      const ret = providedId! as TScriptMenuItemID;
      providedId = `t${providedId!}`; // 见 TScriptMenuItemID 注释
      providedId = `${gtx.contentEnvKey!}.${providedId}` as TScriptMenuItemKey; // 区分 subframe mainframe，见 TScriptMenuItemKey 注释
      const menuKey = providedId; // menuKey为唯一键：{环境识别符}.t{注册ID}
      // 检查之前有否注册
      if (menuKey && gtx.menuKeyRegistered!.has(menuKey)) {
        // 有注册过，先移除 listeners
        gtx.EE.removeAllListeners("menuClick:" + menuKey);
      } else {
        // 没注册过，先记录一下
        gtx.menuKeyRegistered!.add(menuKey);
      }
      if (listener) {
        // GM_registerMenuCommand("hi", undefined, {accessKey:"h"}) 时TM不会报错
        gtx.EE.addListener("menuClick:" + menuKey, listener);
      }
      // 发送至 service worker 处理（唯一键，显示名字，不包括id的其他设定）
      gtx.sendMessage("GM_registerMenuCommand", [menuKey, name, options] as GMRegisterMenuCommandParam);
      return ret;
    },

    ...(hasGrant(scriptGrants, "GM_registerMenuCommand", "GM.registerMenuCommand") && {
      GM_registerMenuCommand(
        name: string,
        listener?: (inputValue?: any) => void,
        options_or_accessKey?: ScriptMenuItemOption | string
      ): TScriptMenuItemID {
        return _GM_registerMenuCommand(name, listener, options_or_accessKey);
      },

      "GM.registerMenuCommand"(
        name: string,
        listener?: (inputValue?: any) => void,
        options_or_accessKey?: ScriptMenuItemOption | string
      ): Promise<TScriptMenuItemID> {
        return new Promise((resolve) => {
          const ret = _GM_registerMenuCommand(name, listener, options_or_accessKey);
          resolve(ret);
        });
      },
    }),

    ...(hasGrant(scriptGrants, "CAT_registerMenuInput") && {
      CAT_registerMenuInput(
        name: string,
        listener?: (inputValue?: any) => void,
        options_or_accessKey?: ScriptMenuItemOption | string
      ): TScriptMenuItemID {
        return _GM_registerMenuCommand(name, listener, options_or_accessKey);
      },
    }),

    _GM_unregisterMenuCommand(menuId: TScriptMenuItemID): void {
      if (!gtx.EE) return;
      if (!gtx.contentEnvKey) {
        return;
      }
      let menuKey = `t${menuId}`; // 见 TScriptMenuItemID 注释
      menuKey = `${gtx.contentEnvKey!}.${menuKey}` as TScriptMenuItemKey; // 区分 subframe mainframe，见 TScriptMenuItemKey 注释
      gtx.menuKeyRegistered!.delete(menuKey);
      gtx.EE.removeAllListeners("menuClick:" + menuKey);
      // 发送至 service worker 处理（唯一键）
      gtx.sendMessage("GM_unregisterMenuCommand", [menuKey] as GMUnRegisterMenuCommandParam);
    },

    ...(hasGrant(scriptGrants, "GM_unregisterMenuCommand", "GM.unregisterMenuCommand") && {
      GM_unregisterMenuCommand(menuId: TScriptMenuItemID): void {
        return _GM_unregisterMenuCommand(menuId);
      },

      "GM.unregisterMenuCommand"(menuId: TScriptMenuItemID): Promise<void> {
        return new Promise<void>((resolve) => {
          _GM_unregisterMenuCommand(menuId);
          resolve();
        });
      },
    }),

    ...(hasGrant(scriptGrants, "CAT_unregisterMenuInput") && {
      CAT_unregisterMenuInput(menuId: TScriptMenuItemID): void {
        _GM_unregisterMenuCommand(menuId);
      },
    }),

    ...(hasGrant(scriptGrants, "GM_addStyle", "GM.addStyle") && {
      GM_addStyle(css: string): Element | undefined {
        if (!gtx.message || !gtx.scriptRes) return;
        if (typeof css !== "string") throw new Error("The parameter 'css' of GM_addStyle shall be a string.");
        // 与content页的消息通讯实际是同步,此方法不需要经过background
        // 这里直接使用同步的方式去处理, 不要有promise
        const resp = (<CustomEventMessage>gtx.message).syncSendMessage({
          action: `${gtx.prefix}/runtime/gmApi`,
          data: {
            uuid: gtx.scriptRes.uuid,
            api: "GM_addElement",
            params: [
              null,
              "style",
              {
                textContent: css,
              },
              isContent,
            ],
          },
        });
        if (resp.code) {
          throw new Error(resp.message);
        }
        return (<CustomEventMessage>gtx.message).getAndDelRelatedTarget(resp.data) as Element;
      },

      "GM.addStyle"(css: string): Promise<Element | undefined> {
        return new Promise((resolve) => {
          const ret = GM_addStyle!(css);
          resolve(ret);
        });
      },
    }),

    ...(hasGrant(scriptGrants, "GM_addElement", "GM.addElement") && {
      GM_addElement(
        parentNode: Node | string,
        tagName: string | Record<string, string | number | boolean>,
        attrs: Record<string, string | number | boolean> = {}
      ): Element | undefined {
        if (!gtx.message || !gtx.scriptRes) return;
        // 与content页的消息通讯实际是同步,此方法不需要经过background
        // 这里直接使用同步的方式去处理, 不要有promise
        let parentNodeId: number | null;
        if (typeof parentNode !== "string") {
          const id = (<CustomEventMessage>gtx.message).sendRelatedTarget(parentNode);
          parentNodeId = id;
        } else {
          parentNodeId = null;
          attrs = (tagName || {}) as Record<string, string | number | boolean>;
          tagName = parentNode as string;
        }
        if (typeof tagName !== "string") throw new Error("The parameter 'tagName' of GM_addElement shall be a string.");
        if (typeof attrs !== "object") throw new Error("The parameter 'attrs' of GM_addElement shall be an object.");
        const resp = (<CustomEventMessage>gtx.message).syncSendMessage({
          action: `${gtx.prefix}/runtime/gmApi`,
          data: {
            uuid: gtx.scriptRes.uuid,
            api: "GM_addElement",
            params: [parentNodeId, tagName, attrs, isContent],
          },
        });
        if (resp.code) {
          throw new Error(resp.message);
        }
        return (<CustomEventMessage>gtx.message).getAndDelRelatedTarget(resp.data) as Element;
      },

      "GM.addElement"(
        parentNode: Node | string,
        tagName: string | Record<string, string | number | boolean>,
        attrs: Record<string, string | number | boolean> = {}
      ): Promise<Element | undefined> {
        return new Promise<Element | undefined>((resolve) => {
          const ret = GM_addElement!(parentNode, tagName, attrs);
          resolve(ret);
        });
      },
    }),

    ...(hasGrant(scriptGrants, "CAT_userConfig") && {
      CAT_userConfig() {
        return gtx.sendMessage("CAT_userConfig", []);
      },
    }),

    ...(hasGrant(scriptGrants, "CAT_fileStorage") && {
      async CAT_fileStorage(action: "list" | "download" | "upload" | "delete" | "config", details: any) {
        if (action === "config") {
          gtx.sendMessage("CAT_fileStorage", ["config"]);
          return;
        }
        const sendDetails: CATType.CATFileStorageDetails = {
          baseDir: details.baseDir || "",
          path: details.path || "",
          filename: details.filename,
          file: details.file,
        };
        if (action === "upload") {
          const url = await toBlobURL(gtx, details.data);
          sendDetails.data = url;
        }
        gtx.sendMessage("CAT_fileStorage", [action, sendDetails]).then(async (resp: { action: string; data: any }) => {
          switch (resp.action) {
            case "onload": {
              if (action === "download") {
                // 读取blob
                const blob = await gtx.sendMessage("CAT_fetchBlob", [resp.data]);
                details.onload && details.onload(blob);
              } else {
                details.onload && details.onload(resp.data);
              }
              break;
            }
            case "error": {
              if (typeof resp.data.code === "undefined") {
                details.onerror && details.onerror({ code: -1, message: resp.data.message });
                return;
              }
              details.onerror && details.onerror(resp.data);
            }
          }
        });
      },
    }),

    ...(hasGrant(scriptGrants, "GM_xmlhttpRequest", "GM.xmlHttpRequest", "GM_xmlHttpRequest", "GM.xmlhttpRequest") && {
      // 用于脚本跨域请求,需要@connect domain指定允许的域名
      GM_xmlhttpRequest(details: GMTypes.XHRDetails) {
        const { abort } = GM_xmlhttpRequest(gtx, details, false);
        return { abort };
      },

      "GM.xmlHttpRequest"(details: GMTypes.XHRDetails): Promise<GMTypes.XHRResponse> & GMRequestHandle {
        const { retPromise, abort } = GM_xmlhttpRequest(gtx, details, true);
        const ret = retPromise as Promise<GMTypes.XHRResponse> & GMRequestHandle;
        ret.abort = abort;
        return ret;
      },
    }),

    /**
     *
     * SC的 downloadMode 设置在API呼叫，TM 的 downloadMode 设置在扩展设定
     * native, disabled, browser
     * native: 后台xhr下载 -> 后台chrome.download API，disabled: 禁止下载，browser: 后台chrome.download API
     *
     */
    _GM_download(details: GMTypes.DownloadDetails<string | Blob | File>, requirePromise: boolean) {
      if (gtx.isInvalidContext()) {
        return {
          retPromise: requirePromise ? Promise.reject("GM_download: Invalid Context") : null,
          abort: () => {},
        };
      }
      let retPromiseResolve: (value: unknown) => void | undefined;
      let retPromiseReject: (reason?: any) => void | undefined;
      const retPromise = requirePromise
        ? new Promise((resolve, reject) => {
            retPromiseResolve = resolve;
            retPromiseReject = reject;
          })
        : null;
      const urlPromiseLike = typeof details.url === "object" ? convObjectToURL(details.url) : details.url;
      let aborted = false;
      let connect: MessageConnect;
      let nativeAbort: (() => any) | null = null;
      const contentContext = details.context;
      const makeCallbackParam = <T extends Record<string, any>, K extends T & { data?: any; context?: ContextType }>(
        o: T
      ): K => {
        const retParam = { ...o } as unknown as K;
        if (o?.data) {
          retParam.data = o.data;
        }
        if (typeof contentContext !== "undefined") {
          retParam.context = contentContext;
        }
        return retParam as K;
      };
      const handle = async () => {
        const url = await urlPromiseLike;
        const downloadMode = details.downloadMode || "native"; // native = sc_default; browser = chrome api
        details.url = url;
        if (downloadMode === "browser" || url.startsWith("blob:")) {
          if (typeof details.user === "string" && details.user) {
            // scheme://[user[:password]@]host[:port]/path[?query][#fragment]
            try {
              const u = new URL(details.url);
              const userPart = `${encodeURIComponent(details.user)}`;
              const passwordPart = details.password ? `:${encodeURIComponent(details.password)}` : "";
              details.url = `${u.protocol}//${userPart}${passwordPart}@${u.host}${u.pathname}${u.search}${u.hash}`;
            } catch {
              // ignored
            }
          }
          const con = await gtx.connect("GM_download", [
            {
              method: details.method,
              downloadMode: "browser", // 默认使用xhr下载
              url: url as string,
              name: details.name,
              headers: details.headers,
              saveAs: details.saveAs,
              timeout: details.timeout,
              cookie: details.cookie,
              anonymous: details.anonymous,
            } as GMTypes.DownloadDetails<string>,
          ]);
          if (aborted) return;
          connect = con;
          connect.onMessage((data) => {
            switch (data.action) {
              case "onload":
                details.onload?.(makeCallbackParam({ ...data.data }));
                retPromiseResolve?.(data.data);
                break;
              case "onprogress":
                details.onprogress?.(makeCallbackParam({ ...data.data, mode: "browser" }));
                retPromiseReject?.(new Error("Timeout ERROR"));
                break;
              case "ontimeout":
                details.ontimeout?.(makeCallbackParam({}));
                retPromiseReject?.(new Error("Timeout ERROR"));
                break;
              case "onerror":
                details.onerror?.(makeCallbackParam({ error: "unknown" }) as GMTypes.DownloadError);
                retPromiseReject?.(new Error("Unknown ERROR"));
                break;
              default:
                LoggerCore.logger().warn("GM_download resp is error", {
                  data,
                });
                retPromiseReject?.(new Error("Unexpected Internal ERROR"));
                break;
            }
          });
        } else {
          // native
          const xhrParams = {
            url: url,
            fetch: true, // 跟随TM使用 fetch; 使用 fetch 避免 1) 大量数据存放offscreen xhr 2) vivaldi offscreen client block
            responseType: "blob",
            onloadend: async (res) => {
              if (aborted) return;
              if (res.response instanceof Blob) {
                const url = URL.createObjectURL(res.response); // 生命周期跟随当前 content/page 而非 offscreen
                const con = await gtx.connect("GM_download", [
                  {
                    method: details.method,
                    downloadMode: "browser",
                    url: url as string,
                    name: details.name,
                    headers: details.headers,
                    saveAs: details.saveAs,
                    timeout: details.timeout,
                    cookie: details.cookie,
                    anonymous: details.anonymous,
                  } as GMTypes.DownloadDetails<string>,
                ]);
                if (aborted) return;
                connect = con;
                connect.onMessage((data) => {
                  switch (data.action) {
                    case "onload":
                      details.onload?.(makeCallbackParam({ ...data.data }));
                      retPromiseResolve?.(data.data);
                      setTimeout(() => {
                        // 释放不需要的 URL
                        URL.revokeObjectURL(url);
                      }, 1);
                      break;
                    case "ontimeout":
                      details.ontimeout?.(makeCallbackParam({}));
                      retPromiseReject?.(new Error("Timeout ERROR"));
                      break;
                    case "onerror":
                      details.onerror?.(makeCallbackParam({ error: "unknown" }) as GMTypes.DownloadError);
                      retPromiseReject?.(new Error("Unknown ERROR"));
                      break;
                    default:
                      LoggerCore.logger().warn("GM_download resp is error", {
                        data,
                      });
                      retPromiseReject?.(new Error("Unexpected Internal ERROR"));
                      break;
                  }
                });
              }
            },
            onload: () => {
              // details.onload?.(makeCallbackParam({}))
            },
            onprogress: (e) => {
              details.onprogress?.(makeCallbackParam({ ...e, mode: "native" }));
            },
            ontimeout: () => {
              details.ontimeout?.(makeCallbackParam({}));
            },
            onerror: () => {
              details.onerror?.(makeCallbackParam({ error: "unknown" }) as GMTypes.DownloadError);
            },
          } as GMTypes.XHRDetails;
          if (typeof details.headers === "object") {
            xhrParams.headers = details.headers;
          }
          // -- 其他参数 --
          if (typeof details.method === "string") {
            xhrParams.method = details.method || "GET";
          }
          if (typeof details.timeout === "number") {
            xhrParams.timeout = details.timeout;
          }
          if (typeof details.cookie === "string") {
            xhrParams.cookie = details.cookie;
          }
          if (typeof details.anonymous === "boolean") {
            xhrParams.anonymous = details.anonymous;
          }
          if (typeof details.user === "string" && details.user) {
            xhrParams.user = details.user;
            xhrParams.password = details.password || "";
          }
          // -- 其他参数 --
          const { retPromise, abort } = GM_xmlhttpRequest(gtx, xhrParams, true, true);
          retPromise?.catch(() => {
            if (aborted) return;
            retPromiseReject?.(new Error("Native Download ERROR"));
          });
          nativeAbort = abort;
        }
      };
      handle().catch(console.error);

      return {
        retPromise,
        abort: () => {
          aborted = true;
          connect?.disconnect();
          nativeAbort?.();
        },
      };
    },

    ...(hasGrant(scriptGrants, "GM_download", "GM.download") && {
      // 用于脚本跨域请求,需要@connect domain指定允许的域名
      GM_download(arg1: GMTypes.DownloadDetails<string | Blob | File> | string, arg2?: string) {
        const details = typeof arg1 === "string" ? { url: arg1, name: arg2 } : { ...arg1 };
        const { abort } = _GM_download(details as GMTypes.DownloadDetails<string | Blob | File>, false);
        return { abort };
      },

      "GM.download"(arg1: GMTypes.DownloadDetails<string | Blob | File> | string, arg2?: string) {
        const details = typeof arg1 === "string" ? { url: arg1, name: arg2 } : { ...arg1 };
        const { retPromise, abort } = _GM_download(details as GMTypes.DownloadDetails<string | Blob | File>, true);
        const ret = retPromise as Promise<GMTypes.XHRResponse> & GMRequestHandle;
        ret.abort = abort;
        return ret;
      },
    }),

    _GM_notification(
      detail: GMTypes.NotificationDetails | string,
      ondone?: GMTypes.NotificationOnDone | string,
      image?: string,
      onclick?: GMTypes.NotificationOnClick
    ): Promise<void> {
      if (gtx.isInvalidContext()) return Promise.resolve();
      const notificationTagMap: Map<string, string> = gtx.notificationTagMap || (gtx.notificationTagMap = new Map());
      gtx.eventId += 1;
      let data: GMTypes.NotificationDetails;
      if (typeof detail === "string") {
        data = {};
        data.text = detail;
        switch (arguments.length) {
          case 4:
            data.onclick = onclick;
          // eslint-disable-next-line no-fallthrough
          case 3:
            data.image = image;
          // eslint-disable-next-line no-fallthrough
          case 2:
            data.title = <string>ondone;
          // eslint-disable-next-line no-fallthrough
          default:
            break;
        }
      } else {
        data = Object.assign({}, detail);
        data.ondone = data.ondone || <GMTypes.NotificationOnDone>ondone;
      }
      let click: GMTypes.NotificationOnClick;
      let done: GMTypes.NotificationOnDone;
      let create: GMTypes.NotificationOnClick;
      if (data.onclick) {
        click = data.onclick;
        delete data.onclick;
      }
      if (data.ondone) {
        done = data.ondone;
        delete data.ondone;
      }
      if (data.oncreate) {
        create = data.oncreate;
        delete data.oncreate;
      }
      let notificationId: string | undefined = undefined;
      if (typeof data.tag === "string") {
        notificationId = notificationTagMap.get(data.tag);
      }
      gtx.sendMessage("GM_notification", [data, notificationId]).then((id) => {
        if (!gtx.EE) return;
        if (create) {
          create.apply({ id }, [id]);
        }
        if (typeof data.tag === "string") {
          notificationTagMap.set(data.tag, id);
        }
        let isPreventDefault = false;
        gtx.EE.addListener("GM_notification:" + id, (resp: NotificationMessageOption) => {
          if (!gtx.EE) return;
          /**
           * 清除保存的通知的tag
           */
          const clearNotificationIdMap = () => {
            if (typeof data.tag === "string") {
              notificationTagMap.delete(data.tag);
            }
          };
          switch (resp.event) {
            case "click":
            case "buttonClick": {
              const clickEvent: GMTypes.NotificationOnClickEvent = {
                event: resp.event,
                id: id,
                isButtonClick: resp.event === "buttonClick",
                buttonClickIndex: resp.params.index,
                byUser: resp.params.byUser,
                preventDefault: function () {
                  isPreventDefault = true;
                },
                highlight: data.highlight,
                image: data.image,
                silent: data.silent,
                tag: data.tag,
                text: data.tag,
                timeout: data.timeout,
                title: data.title,
                url: data.url,
              };
              click && click.apply({ id }, [clickEvent]);
              done && done.apply({ id }, []);

              if (!isPreventDefault) {
                if (typeof data.url === "string") {
                  window.open(data.url, "_blank");
                  LoggerCore.logger().info("GM_notification open url: " + data.url, {
                    data,
                  });
                }
              }
              break;
            }
            case "close": {
              done && done.apply({ id }, [resp.params.byUser]);
              clearNotificationIdMap();
              gtx.EE.removeAllListeners("GM_notification:" + gtx.eventId);
              break;
            }
            default:
              LoggerCore.logger().warn("GM_notification resp is error", {
                resp,
              });
              break;
          }
        });
      });
      return Promise.resolve();
    },

    ...(hasGrant(scriptGrants, "GM.notification", "GM_notification") && {
      async "GM.notification"(
        detail: GMTypes.NotificationDetails | string,
        ondone?: GMTypes.NotificationOnDone | string,
        image?: string,
        onclick?: GMTypes.NotificationOnClick
      ): Promise<void> {
        return _GM_notification(detail, ondone, image, onclick);
      },

      GM_notification(
        detail: GMTypes.NotificationDetails | string,
        ondone?: GMTypes.NotificationOnDone | string,
        image?: string,
        onclick?: GMTypes.NotificationOnClick
      ): void {
        _GM_notification(detail, ondone, image, onclick);
      },
    }),

    ...(hasGrant(scriptGrants, "GM_closeNotification", "GM.closeNotification") && {
      // ScriptCat 额外API
      GM_closeNotification(id: string): void {
        if (gtx.isInvalidContext()) return;
        gtx.sendMessage("GM_closeNotification", [id]);
      },
      "GM.closeNotification"(id: string): void {
        if (gtx.isInvalidContext()) return;
        gtx.sendMessage("GM_closeNotification", [id]);
      },
    }),

    ...(hasGrant(scriptGrants, "GM_updateNotification", "GM.updateNotification") && {
      // ScriptCat 额外API
      GM_updateNotification(id: string, details: GMTypes.NotificationDetails): void {
        if (gtx.isInvalidContext()) return;
        gtx.sendMessage("GM_updateNotification", [id, details]);
      },
      "GM.updateNotification"(id: string, details: GMTypes.NotificationDetails): void {
        if (gtx.isInvalidContext()) return;
        gtx.sendMessage("GM_updateNotification", [id, details]);
      },
    }),

    ...(hasGrant(scriptGrants, "GM_openInTab", "GM.openInTab") && {
      GM_openInTab(url: string, param?: GMTypes.OpenTabOptions | boolean): GMTypes.Tab | undefined {
        if (gtx.isInvalidContext()) return undefined;
        let option = {} as GMTypes.OpenTabOptions;
        if (typeof param === "boolean") {
          option.active = !param; // Greasemonkey 3.x loadInBackground
        } else if (param) {
          option = { ...param } as GMTypes.OpenTabOptions;
        }
        if (typeof option.active !== "boolean" && typeof option.loadInBackground === "boolean") {
          // TM 同时兼容 active 和 loadInBackground ( active 优先 )
          option.active = !option.loadInBackground;
        } else if (option.active === undefined) {
          option.active = true; // TM 预设 active: false；VM 预设 active: true；旧SC 预设 active: true；GM 依从 浏览器
        }
        if (option.insert === undefined) {
          option.insert = true; // TM 预设 insert: true；VM 预设 insert: true；旧SC 无此设计 (false)
        }
        if (option.setParent === undefined) {
          option.setParent = true; // TM 预设 setParent: false; 旧SC 预设 setParent: true;
          // SC 预设 setParent: true 以避免不可预计的问题
        }
        let tabid: any;

        const ret: GMTypes.Tab = {
          close: () => {
            tabid && !gtx.isInvalidContext() && gtx.sendMessage("GM_closeInTab", [tabid]);
          },
          closed: false,
          // 占位
          onclose() {},
        };

        gtx.sendMessage("GM_openInTab", [url, option as GMTypes.SWOpenTabOptions]).then((id) => {
          if (!gtx.EE) return;
          if (id) {
            tabid = id;
            gtx.EE.addListener("GM_openInTab:" + id, (resp: any) => {
              if (!gtx.EE) return;
              switch (resp.event) {
                case "oncreate":
                  tabid = resp.tabId;
                  break;
                case "onclose":
                  ret.onclose && ret.onclose();
                  ret.closed = true;
                  gtx.EE.removeAllListeners("GM_openInTab:" + id);
                  break;
                default:
                  LoggerCore.logger().warn("GM_openInTab resp is error", {
                    resp,
                  });
                  break;
              }
            });
          } else {
            ret.onclose && ret.onclose();
            ret.closed = true;
          }
        });

        return ret;
      },

      "GM.openInTab"(url: string, param?: GMTypes.OpenTabOptions | boolean): Promise<GMTypes.Tab | undefined> {
        return new Promise<GMTypes.Tab | undefined>((resolve) => {
          const ret = GM_openInTab!(url, param);
          resolve(ret);
        });
      },
    }),

    ...(hasGrant(scriptGrants, "GM_closeInTab", "GM.closeInTab") && {
      // ScriptCat 额外API
      GM_closeInTab(tabid: string) {
        if (gtx.isInvalidContext()) return;
        return gtx.sendMessage("GM_closeInTab", [tabid]);
      },
      "GM.closeInTab"(tabid: string) {
        if (gtx.isInvalidContext()) return;
        return gtx.sendMessage("GM_closeInTab", [tabid]);
      },
    }),

    ...(hasGrant(scriptGrants, "GM.getTab", "GM_getTab") && {
      GM_getTab(callback: (tabData: object) => void) {
        if (gtx.isInvalidContext()) return;
        gtx.sendMessage("GM_getTab", []).then((tabData) => {
          callback(tabData ?? {});
        });
      },

      "GM.getTab"(): Promise<object> {
        return new Promise<object>((resolve) => {
          GM_getTab!((data) => {
            resolve(data);
          });
        });
      },
    }),

    ...(hasGrant(scriptGrants, "GM.saveTab", "GM_saveTab") && {
      GM_saveTab(tabData: object): void {
        if (gtx.isInvalidContext()) return;
        if (typeof tabData === "object") {
          tabData = customClone(tabData);
        }
        gtx.sendMessage("GM_saveTab", [tabData]);
      },

      "GM.saveTab"(tabData: object): Promise<void> {
        return new Promise<void>((resolve) => {
          GM_saveTab!(tabData);
          resolve();
        });
      },
    }),

    ...(hasGrant(scriptGrants, "GM.getTabs", "GM_getTabs") && {
      GM_getTabs(callback: (tabsData: { [key: number]: object }) => any) {
        if (gtx.isInvalidContext()) return;
        gtx.sendMessage("GM_getTabs", []).then((tabsData) => {
          callback(tabsData);
        });
      },

      "GM.getTabs"(): Promise<{ [key: number]: object }> {
        return new Promise<{ [key: number]: object }>((resolve) => {
          GM_getTabs!((tabsData) => {
            resolve(tabsData);
          });
        });
      },
    }),

    ...(hasGrant(scriptGrants, "GM.setClipboard", "GM_setClipboard") && {
      GM_setClipboard(data: string, info?: GMTypes.GMClipboardInfo, cb?: () => void) {
        if (gtx.isInvalidContext()) return;
        // 物件参数意义不明。日后再检视特殊处理
        // 未支持 TM4.19+ application/octet-stream
        // 参考： https://github.com/Tampermonkey/tampermonkey/issues/1250
        let mimetype: string | undefined;
        if (typeof info === "object" && info?.mimetype) {
          mimetype = info.mimetype;
        } else {
          mimetype = (typeof info === "string" ? info : info?.type) || "text/plain";
          if (mimetype === "text") mimetype = "text/plain";
          else if (mimetype === "html") mimetype = "text/html";
        }
        data = `${data}`; // 强制 string type
        gtx
          .sendMessage("GM_setClipboard", [data, mimetype])
          .then(() => {
            if (typeof cb === "function") {
              cb();
            }
          })
          .catch(() => {
            if (typeof cb === "function") {
              cb();
            }
          });
      },

      "GM.setClipboard"(data: string, info?: string | { type?: string; mimetype?: string }): Promise<void> {
        if (gtx.isInvalidContext()) return new Promise<void>(() => {});
        return new Promise<void>((resolve) => {
          GM_setClipboard!(data, info, () => {
            resolve();
          });
        });
      },
    }),

    ...(hasGrant(scriptGrants, "GM_getResourceText", "GM.getResourceText") && {
      GM_getResourceText(name: string): string | undefined {
        const r = gtx.scriptRes?.resource?.[name];
        if (r) {
          return r.content;
        }
        return undefined;
      },

      "GM.getResourceText"(name: string): Promise<string | undefined> {
        // Asynchronous wrapper for GM_getResourceText to support GM.getResourceText
        return new Promise((resolve) => {
          const ret = GM_getResourceText!(name);
          resolve(ret);
        });
      },
    }),

    ...(hasGrant(scriptGrants, "GM_getResourceURL", "GM.getResourceUrl", "GM_getResourceUrl", "GM.getResourceURL") && {
      GM_getResourceURL(name: string, isBlobUrl?: boolean): string | undefined {
        const r = gtx.scriptRes?.resource?.[name];
        if (r) {
          let base64 = r.base64;
          if (!base64) {
            // 没有base64的话,则使用content转化
            base64 = `data:${r.contentType};base64,${strToBase64(r.content)}`;
          }
          if (isBlobUrl) {
            return URL.createObjectURL(base64ToBlob(base64));
          }
          return base64;
        }
        return undefined;
      },

      // GM_getResourceURL的异步版本，用来兼容GM.getResourceUrl
      "GM.getResourceUrl"(name: string, isBlobUrl?: boolean): Promise<string | undefined> {
        // Asynchronous wrapper for GM_getResourceURL to support GM.getResourceURL
        return new Promise((resolve) => {
          const ret = GM_getResourceURL!(name, isBlobUrl);
          resolve(ret);
        });
      },
    }),

    ...(hasGrant(scriptGrants, "window.close") && {
      "window.close"() {
        return gtx.sendMessage("window.close", []);
      },
    }),

    ...(hasGrant(scriptGrants, "window.focus") && {
      "window.focus"() {
        return gtx.sendMessage("window.focus", []);
      },
    }),

    ...(hasGrant(scriptGrants, "CAT_scriptLoaded") && {
      CAT_scriptLoaded() {
        return gtx.loadScriptPromise;
      },
    }),
  } as const);

  return apis;
};

// 从 GM_Base 对象中解构出 createGMBase 函数并导出（可供其他模块使用）
export const { createGMBase } = GM_Base;
