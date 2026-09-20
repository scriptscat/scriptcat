import { customClone, nativeApply, Native } from "../global";
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
} from "@App/app/service/service_worker/types";
import { base64ToBlob, randNum, randomMessageFlag, strToBase64 } from "@App/pkg/utils/utils";
import { uuidv4 } from "@App/pkg/utils/uuid";
import LoggerCore from "@App/app/logger/core";
import EventEmitter from "eventemitter3";
import GMContext from "./gm_context";
import { type ScriptRunResource } from "@App/app/repo/scripts";
import type { ValueUpdateDataEncoded } from "../types";
import { connect, sendMessage } from "@Packages/message/client";
import { ScriptEnvTag } from "@Packages/message/consts";
import { isExtensionBlobUrl } from "../page_rpc";
import { getStorageName } from "@App/pkg/utils/utils";
import { ListenerManager } from "../listener_manager";
import { decodeRValue, encodeRValue, type REncoded } from "@App/pkg/utils/message_value";
import { type TGMKeyValue } from "@App/app/repo/value";
import type { ContextType } from "./gm_xhr";
import { convObjectToURL, GM_xmlhttpRequest, parseSerializedDocumentResponse, toBlobURL } from "./gm_xhr";
// 导入 CAT Agent API 以触发装饰器注册
// 注意：不能使用 import "./cat_agent"，sideEffects 配置会导致 tree-shaking 移除纯副作用导入
import CATAgentApi from "./cat_agent";
void CATAgentApi;
import CATAgentSkillsApi from "./cat_agent_skills";
void CATAgentSkillsApi;
import CATAgentDomApi from "./cat_agent_dom";
void CATAgentDomApi;
import CATAgentTaskApi from "./cat_agent_task";
void CATAgentTaskApi;
import CATAgentModelApi from "./cat_agent_model";
void CATAgentModelApi;
import CATAgentOPFSApi from "./cat_agent_opfs";
void CATAgentOPFSApi;

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

const integrity = {}; // 仅防止非法实例化

let valChangeCounterId = 0;

let valChangeRandomId = `${randNum(8e11, 2e12).toString(36)}`;

const copyOwnEnumerableDataProperties = (value: object): Record<string, unknown> => {
  const result = Native.objectCreate(null) as Record<string, unknown>;
  const keys = Native.reflectOwnKeys(value);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (typeof key !== "string") continue;
    const descriptor = Native.objectGetOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) continue;
    result[key] = descriptor.value;
  }
  return result;
};

// 回调表不暴露 Map 原型，避免页面改写 Map 方法后影响值更新确认。
const valueChangePromiseMap: Record<string, () => void> = Object.create(null);

const setOwnValue = (store: Record<string, any>, key: string, value: any): void => {
  Native.objectDefineProperty(store, key, {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  });
};

// 通知 ID 只属于对应 GM context；WeakMap 不让脚本结束后残留监听状态。
const notificationTagMaps = new Native.WeakMap<object, Map<string, string>>();

const getNotificationTagMap = (owner: object): Map<string, string> => {
  let map = notificationTagMaps.get(owner);
  if (!map) {
    map = new Native.Map<string, string>();
    notificationTagMaps.set(owner, map);
  }
  return map;
};

const execEnvInit = (execEnv: GMApi) => {
  if (!execEnv.contentEnvKey) {
    execEnv.contentEnvKey = randomMessageFlag(); // 不重复识别字串。用于区分 mainframe subframe 等执行环境
    execEnv.menuKeyRegistered = new Native.Set();
    execEnv.menuIdCounter = 0;
    execEnv.regMenuCounter = 0;
  }
};

// GM_Base 定义内部用变量和函数。均使用@protected
// 暂不考虑 Object.getOwnPropertyNames(GM_Base.prototype) 和 ts-morph 脚本生成
class GM_Base implements IGM_Base {
  @GMContext.protected()
  protected runFlag!: string;

  @GMContext.protected()
  protected prefix!: string;

  // Extension Context 无效时释放 scriptRes
  @GMContext.protected()
  protected message?: Message | null;

  @GMContext.protected()
  protected contentMsg!: Message;

  // Extension Context 无效时释放 scriptRes
  @GMContext.protected()
  protected scriptRes?: ScriptRunResource | null;

  // Extension Context 无效时释放 valueChangeListener
  @GMContext.protected()
  protected valueChangeListener?: ListenerManager<GMTypes.ValueChangeListener>;

  // Extension Context 无效时释放 EE
  @GMContext.protected()
  protected EE?: EventEmitter | null;

  @GMContext.protected()
  public context!: any;

  @GMContext.protected()
  public grantSet!: any;

  @GMContext.protected()
  public eventId!: number;

  @GMContext.protected()
  protected loadScriptResolve: (() => void) | undefined;

  @GMContext.protected()
  protected loadScriptPromise: Promise<void> | undefined;

  constructor(options: any = null, obj: any = null) {
    if (obj !== integrity) throw new TypeError("Illegal invocation");
    Native.objectAssign(this, options);
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
    // USER_SCRIPT 自己的 realm 已有 DOM 与 fetch；这些辅助操作必须留在本地，
    // 不能改走只有隔离 broker 才实现的内部 CAT service worker 请求。
    if (this.scriptRes.executionEnvTag === ScriptEnvTag.content) {
      if (api === "CAT_fetchBlob") {
        if (!isExtensionBlobUrl(params[0])) throw new Error("CAT_fetchBlob expects an extension blob URL");
        return fetch(params[0]).then((response) => response.blob());
      }
      if (api === "CAT_createBlobUrl") {
        if (typeof URL.createObjectURL !== "function") throw new Error("Blob URLs are unavailable in USER_SCRIPT");
        return URL.createObjectURL(params[0] as Blob);
      }
    }
    let ret;
    try {
      // 有页面句柄时走版本化 RPC；后台脚本和未迁移上下文继续使用旧请求形状。
      const request = this.scriptRes.executionHandle
        ? {
            version: 1 as const,
            requestId: uuidv4(),
            handle: this.scriptRes.executionHandle,
            ...(this.scriptRes.executionEnvTag === "ct" ? { executionHandle: this.scriptRes.executionHandle } : {}),
            api,
            params,
          }
        : {
            uuid: this.scriptRes.uuid,
            api,
            params,
            runFlag: this.runFlag,
          };
      ret = await sendMessage(this.message, `${this.prefix}/runtime/gmApi`, request);
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
  public async connect(api: string, params: any[]) {
    if (!this.message || !this.scriptRes) return new Promise<MessageConnect>(() => {});
    if (this.loadScriptPromise) {
      await this.loadScriptPromise;
    }
    if (!this.message || !this.scriptRes) return new Promise<MessageConnect>(() => {});
    // 长连接也必须携带同一页面句柄，否则 broker 无法把连接绑定回脚本和文档。
    const request = this.scriptRes.executionHandle
      ? {
          version: 1 as const,
          requestId: uuidv4(),
          handle: this.scriptRes.executionHandle,
          ...(this.scriptRes.executionEnvTag === "ct" ? { executionHandle: this.scriptRes.executionHandle } : {}),
          api,
          params,
        }
      : {
          uuid: this.scriptRes.uuid,
          api,
          params,
          runFlag: this.runFlag,
        };
    return connect(this.message, `${this.prefix}/runtime/gmApi`, request);
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
        const fn = valueChangePromiseMap[id];
        if (fn) {
          delete valueChangePromiseMap[id];
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
            if (Native.objectHasOwn(valueStore, key)) {
              delete valueStore[key];
            }
          } else {
            setOwnValue(valueStore, key, value);
          }
          // 监听器属于脚本，传副本避免回调修改 GM 存储或跨 context 共享对象。
          const listenerValue = value && typeof value === "object" ? customClone(value) : value;
          const listenerOldValue = oldValue && typeof oldValue === "object" ? customClone(oldValue) : oldValue;
          this.valueChangeListener.execute(key, listenerOldValue, listenerValue, remote, sender.tabId);
        }
      }
    }
  }

  @GMContext.protected()
  emitEvent(event: string, eventId: string, data: any) {
    if (!this.EE) return;
    // 事件回调同样不能拿到 broker 内部对象的可变引用。
    const callbackData = data && typeof data === "object" ? customClone(data) : data;
    this.EE.emit(`${event}:${eventId}`, callbackData);
  }
}

// GMApi 定义 外部用API函数。不使用@protected
export default class GMApi extends GM_Base {
  constructor(
    public prefix: string,
    public message: Message,
    public contentMsg: Message,
    public scriptRes: ScriptRunResource
  ) {
    // testing only 仅供测试用
    const valueChangeListener = new ListenerManager<GMTypes.ValueChangeListener>();
    const EE = new EventEmitter<string, any>();
    let invalid = false;
    super(
      {
        prefix,
        message,
        scriptRes,
        valueChangeListener,
        EE,
        eventId: 0,
        setInvalidContext() {
          if (invalid) return;
          invalid = true;
          this.valueChangeListener.clear();
          this.EE.removeAllListeners();
          // 释放记忆
          this.message = null;
          this.scriptRes = null;
          this.valueChangeListener = null;
          this.EE = null;
        },
        isInvalidContext() {
          return invalid;
        },
      },
      integrity
    );
  }

  static _GM_getValue(a: GMApi, key: string, defaultValue?: any) {
    if (!a.scriptRes) return undefined;
    const ret = Native.objectHasOwn(a.scriptRes.value, key) ? a.scriptRes.value[key] : undefined;
    if (ret !== undefined) {
      if (ret && typeof ret === "object") {
        return customClone(ret)!;
      }
      return ret;
    }
    return defaultValue;
  }

  // 获取脚本的值,可以通过@storageName让多个脚本共享一个储存空间
  @GMContext.API()
  public GM_getValue(ctx: GMApi, key: string, defaultValue?: any) {
    return _GM_getValue(ctx, key, defaultValue);
  }

  @GMContext.API()
  public "GM.getValue"(ctx: GMApi, key: string, defaultValue?: any): Promise<any> {
    // 兼容GM.getValue
    return new Promise((resolve) => {
      const ret = _GM_getValue(ctx, key, defaultValue);
      resolve(ret);
    });
  }

  static _GM_setValue(a: GMApi, promise: any, key: string, value: any) {
    key = `${key}`;
    if (!a.scriptRes) return;
    if (valChangeCounterId > 1e8) {
      // 防止 valChangeCounterId 过大导致无法正常工作
      valChangeCounterId = 0;
      valChangeRandomId = `${randNum(8e11, 2e12).toString(36)}`;
    }
    const id = `${valChangeRandomId}::${++valChangeCounterId}`;
    if (promise) {
      valueChangePromiseMap[id] = promise;
    }
    if (value === undefined) {
      delete a.scriptRes.value[key];
      a.sendMessage("GM_setValue", [id, key]);
    } else {
      // 对对象或函数值进行一次转化
      if (typeof value === "function" || typeof value === "symbol" || (value !== null && typeof value === "object")) {
        value = customClone(value);
      }
      // customClone 可能返回 undefined
      setOwnValue(a.scriptRes.value, key, value);
      if (value === undefined) {
        a.sendMessage("GM_setValue", [id, key]);
      } else {
        a.sendMessage("GM_setValue", [id, key, value]);
      }
    }
    return id;
  }

  static _GM_setValues(a: GMApi, promise: any, values: TGMKeyValue) {
    if (!a.scriptRes) return;
    if (valChangeCounterId > 1e8) {
      // 防止 valChangeCounterId 过大导致无法正常工作
      valChangeCounterId = 0;
      valChangeRandomId = `${randNum(8e11, 2e12).toString(36)}`;
    }
    const id = `${valChangeRandomId}::${++valChangeCounterId}`;
    if (promise) {
      valueChangePromiseMap[id] = promise;
    }
    const valueStore = a.scriptRes.value;
    const keyValuePairs = [] as [string, REncoded<unknown>][];
    // Arbitrary positions stay off Array.prototype; the message payload still needs a true array.
    const valueEntries = Native.objectCreate(null) as { length: number; [index: number]: [string, unknown] };
    valueEntries.length = 0;
    const valueKeys = Native.reflectOwnKeys(values);
    for (let index = 0; index < valueKeys.length; index += 1) {
      const key = valueKeys[index];
      if (typeof key !== "string") continue;
      const descriptor = Native.objectGetOwnPropertyDescriptor(values, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) continue;
      valueEntries[valueEntries.length] = [key, descriptor.value];
      valueEntries.length += 1;
    }
    for (let index = 0; index < valueEntries.length; index += 1) {
      const [key, value] = valueEntries[index];
      let value_ = value;
      if (value_ === undefined) {
        if (Native.objectHasOwn(valueStore, key)) delete valueStore[key];
      } else {
        // 对对象或函数值进行一次转化
        if (
          typeof value_ === "function" ||
          typeof value_ === "symbol" ||
          (value_ !== null && typeof value_ === "object")
        ) {
          value_ = customClone(value_);
        }
        // customClone 可能返回 undefined
        setOwnValue(valueStore, key, value_);
      }
      // 避免undefined 等空值流失，先进行映射处理
      // Keep this a real array for transport while avoiding inherited index setters.
      Native.objectDefineProperty(keyValuePairs, keyValuePairs.length, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: [key, encodeRValue(value_)],
      });
    }
    a.sendMessage("GM_setValues", [id, keyValuePairs]);
    return id;
  }

  @GMContext.API()
  public GM_setValue(ctx: GMApi, key: string, value: any) {
    _GM_setValue(ctx, null, key, value);
  }

  @GMContext.API()
  public "GM.setValue"(ctx: GMApi, key: string, value: any): Promise<void> {
    // Asynchronous wrapper for GM_setValue to support GM.setValue
    return new Promise((resolve) => {
      _GM_setValue(ctx, resolve, key, value);
    });
  }

  @GMContext.API()
  public GM_deleteValue(ctx: GMApi, key: string): void {
    _GM_setValue(ctx, null, key, undefined);
  }

  @GMContext.API()
  public "GM.deleteValue"(ctx: GMApi, key: string): Promise<void> {
    // Asynchronous wrapper for GM_deleteValue to support GM.deleteValue
    return new Promise((resolve) => {
      _GM_setValue(ctx, resolve, key, undefined);
    });
  }

  @GMContext.API()
  public GM_listValues(ctx: GMApi): string[] {
    if (!ctx.scriptRes) return [];
    const keys = Native.objectKeys(ctx.scriptRes.value);
    return keys;
  }

  @GMContext.API()
  public "GM.listValues"(ctx: GMApi): Promise<string[]> {
    // Asynchronous wrapper for GM_listValues to support GM.listValues
    return new Promise((resolve) => {
      if (!ctx.scriptRes) return resolve([]);
      const keys = Native.objectKeys(ctx.scriptRes.value);
      resolve(keys);
    });
  }

  @GMContext.API()
  public GM_setValues(ctx: GMApi, values: TGMKeyValue) {
    if (!values || typeof values !== "object") {
      throw new Error("GM_setValues: values must be an object");
    }
    _GM_setValues(ctx, null, values);
  }

  @GMContext.API()
  public GM_getValues(ctx: GMApi, keysOrDefaults: TGMKeyValue | string[] | null | undefined) {
    if (!ctx.scriptRes) return {};
    if (!keysOrDefaults) {
      // Returns all values
      return customClone(ctx.scriptRes.value)!;
    }
    const result: TGMKeyValue = Native.objectCreate(null);
    if (Native.arrayIsArray(keysOrDefaults)) {
      // 键名数组
      // Handle array of keys (e.g., ['foo', 'bar'])
      for (let index = 0; index < keysOrDefaults.length; index++) {
        const key = keysOrDefaults[index];
        if (Native.objectHasOwn(ctx.scriptRes.value, key)) {
          // 对object的value进行一次转化
          let value = ctx.scriptRes.value[key];
          if (value && typeof value === "object") {
            value = customClone(value)!;
          }
          setOwnValue(result, key, value);
        }
      }
    } else {
      // 对象 键: 默认值
      // Handle object with default values (e.g., { foo: 1, bar: 2, baz: 3 })
      for (const key of Native.objectKeys(keysOrDefaults)) {
        const defaultValue = keysOrDefaults[key];
        setOwnValue(result, key, _GM_getValue(ctx, key, defaultValue));
      }
    }
    return result;
  }

  // Asynchronous wrapper for GM.getValues
  @GMContext.API({ depend: ["GM_getValues"] })
  public "GM.getValues"(ctx: GMApi, keysOrDefaults: TGMKeyValue | string[] | null | undefined): Promise<TGMKeyValue> {
    if (!ctx.scriptRes) return new Promise<TGMKeyValue>(() => {});
    return new Promise((resolve) => {
      const ret = GMApi.prototype.GM_getValues(ctx, keysOrDefaults);
      resolve(ret);
    });
  }

  @GMContext.API()
  public "GM.setValues"(ctx: GMApi, values: { [key: string]: any }): Promise<void> {
    if (!ctx.scriptRes) return new Promise<void>(() => {});
    return new Promise((resolve) => {
      if (!values || typeof values !== "object") {
        throw new Error("GM.setValues: values must be an object");
      }
      _GM_setValues(ctx, resolve, values);
    });
  }

  @GMContext.API()
  public GM_deleteValues(ctx: GMApi, keys: string[]) {
    if (!ctx.scriptRes) return;
    if (!Native.arrayIsArray(keys)) {
      console.warn("GM_deleteValues: keys must be string[]");
      return;
    }
    const req = {} as Record<string, undefined>;
    for (const key of keys) {
      req[key] = undefined;
    }
    _GM_setValues(ctx, null, req);
  }

  // Asynchronous wrapper for GM.deleteValues
  @GMContext.API()
  public "GM.deleteValues"(ctx: GMApi, keys: string[]): Promise<void> {
    if (!ctx.scriptRes) return new Promise<void>(() => {});
    return new Promise((resolve) => {
      if (!Native.arrayIsArray(keys)) {
        throw new Error("GM.deleteValues: keys must be string[]");
      } else {
        const req = {} as Record<string, undefined>;
        for (const key of keys) {
          req[key] = undefined;
        }
        _GM_setValues(ctx, resolve, req);
      }
    });
  }

  @GMContext.API()
  public GM_addValueChangeListener(ctx: GMApi, name: string, listener: GMTypes.ValueChangeListener): number {
    if (!ctx.valueChangeListener) return 0;
    return ctx.valueChangeListener.add(name, listener);
  }

  @GMContext.API({ depend: ["GM_addValueChangeListener"] })
  public "GM.addValueChangeListener"(ctx: GMApi, name: string, listener: GMTypes.ValueChangeListener): Promise<number> {
    return new Promise<number>((resolve) => {
      const ret = GMApi.prototype.GM_addValueChangeListener(ctx, name, listener);
      resolve(ret);
    });
  }

  @GMContext.API()
  public GM_removeValueChangeListener(ctx: GMApi, listenerId: number): void {
    if (!ctx.valueChangeListener) return;
    ctx.valueChangeListener.remove(listenerId);
  }

  @GMContext.API({ depend: ["GM_removeValueChangeListener"] })
  public "GM.removeValueChangeListener"(ctx: GMApi, listenerId: number): Promise<void> {
    return new Promise<void>((resolve) => {
      GMApi.prototype.GM_removeValueChangeListener(ctx, listenerId);
      resolve();
    });
  }

  @GMContext.API()
  public GM_log(
    ctx: GMApi,
    message: string,
    level: GMTypes.LoggerLevel = "info",
    ...labels: GMTypes.LoggerLabel[]
  ): void {
    if (ctx.isInvalidContext()) return;
    if (typeof message !== "string") {
      message = Native.jsonStringify(message);
    }
    ctx.sendMessage("GM_log", [`${message}`, `${level}`, labels]);
  }

  @GMContext.API({ depend: ["GM_log"] })
  public "GM.log"(
    ctx: GMApi,
    message: string,
    level: GMTypes.LoggerLevel = "info",
    ...labels: GMTypes.LoggerLabel[]
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      GMApi.prototype.GM_log(ctx, message, level, ...labels);
      resolve();
    });
  }

  @GMContext.API()
  public CAT_createBlobUrl(ctx: GMApi, blob: Blob): Promise<string> {
    return Promise.resolve(toBlobURL(ctx, blob));
  }

  // 辅助GM_xml获取blob数据
  @GMContext.API()
  public CAT_fetchBlob(ctx: GMApi, url: string): Promise<Blob> {
    return ctx.sendMessage("CAT_fetchBlob", [`${url}`]);
  }

  @GMContext.API()
  public async CAT_fetchDocument(ctx: GMApi, url: string): Promise<Document | undefined> {
    // 上下文已失效时直接返回，避免访问已释放的 message 造成异常
    if (ctx.isInvalidContext()) return undefined;

    const isContentEnv = ctx.scriptRes?.executionEnvTag === ScriptEnvTag.content;
    if (isContentEnv) {
      // USER_SCRIPT 可直接在 content realm 创建 Document；跨到 scripting 只会丢失节点引用。
      return new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.responseType = "document";
        xhr.open("GET", url);
        xhr.onloadend = () => resolve((xhr.response as Document | null) || undefined);
        xhr.onerror = () => resolve(undefined);
        xhr.send();
      });
    }

    return parseSerializedDocumentResponse(await ctx.sendMessage("CAT_fetchDocument", [`${url}`, isContentEnv]));
  }

  static _GM_cookie(
    a: IGM_Base,
    action: string,
    details: GMTypes.CookieDetails,
    done: (cookie: GMTypes.Cookie[] | any, error: any | undefined) => void
  ) {
    // 防止错误参数类型传送
    if (
      typeof (details || false) !== "object" ||
      typeof (details.domain ?? "") !== "string" ||
      typeof (details.expirationDate ?? 0) !== "number" ||
      typeof (details.httpOnly ?? false) !== "boolean" ||
      typeof (details.name ?? "") !== "string" ||
      typeof (details.partitionKey ?? null) !== "object" ||
      typeof (details.path ?? "") !== "string" ||
      typeof (details.secure ?? false) !== "boolean" ||
      typeof (details.session ?? false) !== "boolean" ||
      typeof (details.url ?? "") !== "string" ||
      typeof (details.value ?? "") !== "string"
    ) {
      done(undefined, new Error("Invalid Argument Type"));
      return;
    }
    // 确保物件参数可以传送
    a.sendMessage("GM_cookie", [`${action}`, customClone(details)])
      .then((resp: any) => {
        done && done(resp, undefined);
      })
      .catch((err) => {
        done && done(undefined, err);
      });
  }

  @GMContext.API()
  public "GM.cookie"(ctx: GMApi, action: string, details: GMTypes.CookieDetails) {
    return new Promise((resolve, reject) => {
      _GM_cookie(ctx, action, details, (cookie, error) => {
        error ? reject(error) : resolve(cookie);
      });
    });
  }

  @GMContext.API({ follow: "GM.cookie" })
  public "GM.cookie.set"(ctx: GMApi, details: GMTypes.CookieDetails) {
    return new Promise((resolve, reject) => {
      _GM_cookie(ctx, "set", details, (cookie, error) => {
        error ? reject(error) : resolve(cookie);
      });
    });
  }

  @GMContext.API({ follow: "GM.cookie" })
  public "GM.cookie.list"(ctx: GMApi, details: GMTypes.CookieDetails) {
    return new Promise((resolve, reject) => {
      _GM_cookie(ctx, "list", details, (cookie, error) => {
        error ? reject(error) : resolve(cookie);
      });
    });
  }

  @GMContext.API({ follow: "GM.cookie" })
  public "GM.cookie.delete"(ctx: GMApi, details: GMTypes.CookieDetails) {
    return new Promise((resolve, reject) => {
      _GM_cookie(ctx, "delete", details, (cookie, error) => {
        error ? reject(error) : resolve(cookie);
      });
    });
  }

  @GMContext.API({ follow: "GM_cookie" })
  public "GM_cookie.set"(
    ctx: GMApi,
    details: GMTypes.CookieDetails,
    done: (cookie: GMTypes.Cookie[] | any, error: any | undefined) => void
  ) {
    _GM_cookie(ctx, "set", details, done);
  }

  @GMContext.API({ follow: "GM_cookie" })
  public "GM_cookie.list"(
    ctx: GMApi,
    details: GMTypes.CookieDetails,
    done: (cookie: GMTypes.Cookie[] | any, error: any | undefined) => void
  ) {
    _GM_cookie(ctx, "list", details, done);
  }

  @GMContext.API({ follow: "GM_cookie" })
  public "GM_cookie.delete"(
    ctx: GMApi,
    details: GMTypes.CookieDetails,
    done: (cookie: GMTypes.Cookie[] | any, error: any | undefined) => void
  ) {
    _GM_cookie(ctx, "delete", details, done);
  }

  @GMContext.API()
  public GM_cookie(
    ctx: GMApi,
    action: string,
    details: GMTypes.CookieDetails,
    done: (cookie: GMTypes.Cookie[] | any, error: any | undefined) => void
  ) {
    _GM_cookie(ctx, action, details, done);
  }

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

  @GMContext.API()
  public GM_registerMenuCommand(
    ctx: GMApi,
    name: string,
    listener?: (inputValue?: any) => void,
    options_or_accessKey?: ScriptMenuItemOption | string
  ): TScriptMenuItemID {
    if (!ctx.EE) return -1;
    execEnvInit(ctx);
    ctx.regMenuCounter! += 1;
    // 兼容 GM_registerMenuCommand(name, options_or_accessKey)
    if (!options_or_accessKey && typeof listener === "object") {
      options_or_accessKey = listener;
      listener = undefined;
    }
    // 浅拷贝避免修改/共用参数
    const optionObject = typeof options_or_accessKey === "object" && options_or_accessKey !== null;
    let options: SWScriptMenuItemOption;
    let optionId: string | number | undefined;
    let optionIndividual: boolean | undefined;
    if (typeof options_or_accessKey === "string") {
      options = { accessKey: options_or_accessKey };
    } else if (optionObject) {
      const safeOptions = copyOwnEnumerableDataProperties(options_or_accessKey as object);
      optionId = safeOptions.id as string | number | undefined;
      optionIndividual = safeOptions.individual as boolean | undefined;
      // id不直接储存在options (id 影响 groupKey 操作)
      safeOptions.id = undefined;
      safeOptions.individual = undefined;
      options = safeOptions as SWScriptMenuItemOption;
    } else {
      options = {};
    }
    const isSeparator = !listener && !name;
    let isIndividual = optionObject ? optionIndividual : undefined;
    if (isIndividual === undefined && isSeparator) {
      isIndividual = true;
    }
    options.mIndividualKey = isIndividual ? ctx.regMenuCounter : 0;
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
    let providedId: string | number | undefined = optionObject ? optionId : undefined;
    if (providedId === undefined) providedId = ctx.menuIdCounter! += 1; // 如无指定，使用累计器id
    const ret = providedId! as TScriptMenuItemID;
    providedId = `t${providedId!}`; // 见 TScriptMenuItemID 注释
    providedId = `${ctx.contentEnvKey!}.${providedId}` as TScriptMenuItemKey; // 区分 subframe mainframe，见 TScriptMenuItemKey 注释
    const menuKey = providedId; // menuKey为唯一键：{环境识别符}.t{注册ID}
    // 检查之前有否注册
    if (menuKey && ctx.menuKeyRegistered!.has(menuKey)) {
      // 有注册过，先移除 listeners
      ctx.EE.removeAllListeners("menuClick:" + menuKey);
    } else {
      // 没注册过，先记录一下
      ctx.menuKeyRegistered!.add(menuKey);
    }
    if (listener) {
      // GM_registerMenuCommand("hi", undefined, {accessKey:"h"}) 时TM不会报错
      ctx.EE.addListener("menuClick:" + menuKey, listener);
    }
    // 发送至 service worker 处理（唯一键，显示名字，不包括id的其他设定）
    ctx.sendMessage("GM_registerMenuCommand", [menuKey, `${name}`, options] as GMRegisterMenuCommandParam);
    return ret;
  }

  @GMContext.API({ depend: ["GM_registerMenuCommand"] })
  public "GM.registerMenuCommand"(
    ctx: GMApi,
    name: string,
    listener?: (inputValue?: any) => void,
    options_or_accessKey?: ScriptMenuItemOption | string
  ): Promise<TScriptMenuItemID> {
    return new Promise((resolve) => {
      const ret = GMApi.prototype.GM_registerMenuCommand(ctx, name, listener, options_or_accessKey);
      resolve(ret);
    });
  }

  @GMContext.API({ depend: ["GM_registerMenuCommand"] })
  public CAT_registerMenuInput(
    ctx: GMApi,
    ...args: [name: string, listener?: (inputValue?: any) => void, options_or_accessKey?: ScriptMenuItemOption | string]
  ): TScriptMenuItemID {
    return GMApi.prototype.GM_registerMenuCommand(ctx, ...args);
  }

  @GMContext.API()
  public GM_addStyle(ctx: GMApi, css: string): Element | undefined {
    if (!ctx.message || !ctx.scriptRes) return;
    if (typeof css !== "string") throw new Error("The parameter 'css' of GM_addStyle shall be a string.");
    // 与content页的消息通讯实际是同步,此方法不需要经过background
    // 这里直接使用同步的方式去处理, 不要有promise
    const resp = (<CustomEventMessage>ctx.contentMsg).syncSendMessage({
      action: `content/runtime/addElement`,
      data: {
        params: [
          null,
          "style",
          {
            textContent: css,
          },
        ],
      },
    });
    if (resp.code) {
      throw new Error(resp.message);
    }
    return (<CustomEventMessage>ctx.contentMsg).getAndDelRelatedTarget(resp.data) as Element;
  }

  @GMContext.API({ depend: ["GM_addStyle"] })
  public "GM.addStyle"(ctx: GMApi, css: string): Promise<Element | undefined> {
    return new Promise((resolve) => {
      const ret = GMApi.prototype.GM_addStyle(ctx, css);
      resolve(ret);
    });
  }

  @GMContext.API()
  public GM_addElement(
    ctx: GMApi,
    parentNode: Node | string,
    tagName: string | Record<string, string | number | boolean>,
    attrs: Record<string, string | number | boolean> | null = {}
  ): Element | undefined {
    if (!ctx.message || !ctx.scriptRes) return;
    // 与content页的消息通讯实际是同步, 此方法不需要经过background
    // 这里直接使用同步的方式去处理, 不要有promise
    // 在content脚本执行的话，与直接 DOM 无异
    // TrustedTypes 限制了对 DOM 的 innerHTML/outerHTML 的操作 (TrustedHTML)
    // TrustedTypes 限制了对 script 的 innerHTML/outerHTML/textContent/innerText 的操作 (TrustedScript)
    // CSP 限制了对 appendChild/insertChild/replaceChild/insertAdjacentElement ... 等DOM插入移除操作

    let parentNodeId: number | null;
    if (typeof parentNode !== "string") {
      const id = (<CustomEventMessage>ctx.contentMsg).sendRelatedTarget(parentNode);
      parentNodeId = id;
    } else {
      parentNodeId = null;
      attrs = (tagName || {}) as Record<string, string | number | boolean>;
      tagName = parentNode as string;
    }

    if (typeof tagName !== "string") throw new Error("The parameter 'tagName' of GM_addElement shall be a string.");
    if (attrs !== null && typeof attrs !== "object") {
      throw new Error("The parameter 'attrs' of GM_addElement shall be an object.");
    }

    // 控制传送参数，避免参数出现 non-json-selizable
    const attrsCT = Native.objectCreate(null) as Record<string, string | number>;
    const setAttr = Native.objectCreate(null) as Record<string, any>;
    if (attrs !== null) {
      const keys = Native.reflectOwnKeys(attrs);
      for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (typeof key !== "string") continue;
        const descriptor = Native.objectGetOwnPropertyDescriptor(attrs, key);
        if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) continue;
        const value = descriptor.value;
        if (typeof value === "string" || typeof value === "number") {
          // 数字不是标准的 attribute value type, 但常见于实际使用
          attrsCT[key] = value;
        } else {
          // property setter for non attribute (e.g. Function, Symbol, boolean, etc)
          // Function, Symbol 无法跨环境传递
          setAttr[key] = value;
        }
      }
    }

    // 使用contentMsg同步发送消息到content脚本，由content脚本创建元素并返回
    // 不使用message，因为message是在scripting环境处理的，会因为扩展的 CSP 而无法操作 DOM
    const resp = (<CustomEventMessage>ctx.contentMsg).syncSendMessage({
      action: `content/runtime/addElement`,
      data: {
        params: [parentNodeId, tagName, attrsCT],
      },
    });
    if (resp.code) {
      throw new Error(resp.message);
    }

    const el = (<CustomEventMessage>ctx.contentMsg).getAndDelRelatedTarget(resp.data) as Element;
    // 设置属性
    for (const [key, value] of Object.entries(setAttr)) {
      (el as any)[key] = value;
    }

    // 回传元素
    return el;
  }

  @GMContext.API({ depend: ["GM_addElement"] })
  public "GM.addElement"(
    ctx: GMApi,
    parentNode: Node | string,
    tagName: string | Record<string, string | number | boolean>,
    attrs: Record<string, string | number | boolean> | null = {}
  ): Promise<Element | undefined> {
    return new Promise<Element | undefined>((resolve) => {
      const ret = GMApi.prototype.GM_addElement(ctx, parentNode, tagName, attrs);
      resolve(ret);
    });
  }

  @GMContext.API()
  public GM_unregisterMenuCommand(ctx: GMApi, menuId: TScriptMenuItemID): void {
    if (!ctx.EE) return;
    if (!ctx.contentEnvKey) {
      return;
    }
    let menuKey = `t${menuId}`; // 见 TScriptMenuItemID 注释
    menuKey = `${ctx.contentEnvKey!}.${menuKey}` as TScriptMenuItemKey; // 区分 subframe mainframe，见 TScriptMenuItemKey 注释
    ctx.menuKeyRegistered!.delete(menuKey);
    ctx.EE.removeAllListeners("menuClick:" + menuKey);
    // 发送至 service worker 处理（唯一键）
    ctx.sendMessage("GM_unregisterMenuCommand", [menuKey] as GMUnRegisterMenuCommandParam);
  }

  @GMContext.API({ depend: ["GM_unregisterMenuCommand"] })
  public "GM.unregisterMenuCommand"(ctx: GMApi, menuId: TScriptMenuItemID): Promise<void> {
    return new Promise<void>((resolve) => {
      GMApi.prototype.GM_unregisterMenuCommand(ctx, menuId);
      resolve();
    });
  }

  @GMContext.API({
    depend: ["GM_unregisterMenuCommand"],
  })
  public CAT_unregisterMenuInput(ctx: GMApi, menuId: TScriptMenuItemID): void {
    GMApi.prototype.GM_unregisterMenuCommand(ctx, menuId);
  }

  @GMContext.API()
  public CAT_userConfig(ctx: GMApi) {
    return ctx.sendMessage("CAT_userConfig", []);
  }

  @GMContext.API({
    depend: ["CAT_fetchBlob"],
  })
  public async CAT_fileStorage(ctx: GMApi, action: "list" | "download" | "upload" | "delete" | "config", details: any) {
    if (action === "config") {
      ctx.sendMessage("CAT_fileStorage", ["config"]);
      return;
    }
    const sendDetails: CATType.CATFileStorageDetails = {
      baseDir: details.baseDir || "",
      path: details.path || "",
      filename: details.filename,
      file: details.file,
    };
    if (action === "upload") {
      const url = await toBlobURL(ctx, details.data);
      sendDetails.data = url;
    }
    ctx.sendMessage("CAT_fileStorage", [`${action}`, sendDetails]).then(async (resp: { action: string; data: any }) => {
      switch (resp.action) {
        case "onload": {
          if (action === "download") {
            // 读取blob
            const blob = await GMApi.prototype.CAT_fetchBlob(ctx, resp.data);
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
  }

  // 用于脚本跨域请求,需要@connect domain指定允许的域名
  @GMContext.API()
  public GM_xmlhttpRequest(ctx: GMApi, details: GMTypes.XHRDetails) {
    const { abort } = GM_xmlhttpRequest(ctx, details, false);
    return { abort };
  }

  @GMContext.API()
  public "GM.xmlHttpRequest"(ctx: GMApi, details: GMTypes.XHRDetails): Promise<GMTypes.XHRResponse> & GMRequestHandle {
    const { retPromise, abort } = GM_xmlhttpRequest(ctx, details, true);
    const ret = retPromise as Promise<GMTypes.XHRResponse> & GMRequestHandle;
    ret.abort = abort;
    return ret;
  }

  /**
   *
   * SC的 downloadMode 设置在API呼叫，TM 的 downloadMode 设置在扩展设定
   * native, disabled, browser
   * native: 后台xhr下载 -> 后台chrome.download API，disabled: 禁止下载，browser: 后台chrome.download API
   *
   */
  static _GM_download(a: GMApi, details: GMTypes.DownloadDetails<string | Blob | File>, requirePromise: boolean) {
    if (a.isInvalidContext()) {
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
      if (!url) {
        // TM 对空 url 会同步报错/触发 onerror，而非发起请求；
        // new URL("", base) 不会抛错而是解析为当前页面地址，因此需在此显式拦截，避免误下载当前页面。
        if (!aborted) {
          details.onerror?.(makeCallbackParam({ error: "unknown" }) as GMTypes.DownloadError);
          retPromiseReject?.(new Error("GM_download: url is empty"));
        }
        return;
      }
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
        const con = await a.connect("GM_download", [
          {
            method: details.method,
            downloadMode: "browser", // 默认使用xhr下载
            url: url as string,
            name: details.name,
            headers: details.headers,
            saveAs: details.saveAs,
            conflictAction: details.conflictAction,
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
            case "save_cancelled": // saveAs cancelled by user，TM 视为下载成功
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
            const response = res.response;
            if (!(response instanceof Blob)) return;

            // 1. 先创建 blob URL，并立即就地准备好释放函数 + 标志位。
            //    这样后续任何抛错/aborted/disconnect 路径都能复用同一处释放逻辑，
            //    避免 a.connect 失败或 aborted 短路时 URL 永远不被 revoke。
            const url = URL.createObjectURL(response); // 生命周期跟随当前 content/page 而非 offscreen
            let released = false;
            const releaseResources = () => {
              if (released) return;
              released = true;
              setTimeout(() => {
                // 释放不需要的 URL
                URL.revokeObjectURL(url);
              }, 1);
            };

            let con: MessageConnect;
            try {
              con = await a.connect("GM_download", [
                {
                  method: details.method,
                  downloadMode: "browser",
                  url: url as string,
                  name: details.name,
                  headers: details.headers,
                  saveAs: details.saveAs,
                  conflictAction: details.conflictAction,
                  timeout: details.timeout,
                  cookie: details.cookie,
                  anonymous: details.anonymous,
                } as GMTypes.DownloadDetails<string>,
              ]);
            } catch (e) {
              // 后台连接失败：释放 URL，并通过 onerror / reject 通知调用方，
              // 行为与 “onMessage 收到 onerror” 一致，保持外层 contract 不变。
              releaseResources();
              if (!aborted) {
                details.onerror?.(makeCallbackParam({ error: "unknown" }) as GMTypes.DownloadError);
                retPromiseReject?.(e instanceof Error ? e : new Error("GM_download connect ERROR"));
              }
              return;
            }

            // a.connect 期间可能已被 abort：立即释放 URL，并关闭多余的连接。
            if (aborted) {
              releaseResources();
              try {
                con.disconnect();
              } catch {
                // ignored
              }
              return;
            }

            connect = con;
            connect.onMessage((data) => {
              switch (data.action) {
                case "onload":
                  details.onload?.(makeCallbackParam({ ...data.data }));
                  retPromiseResolve?.(data.data);
                  releaseResources();
                  break;
                case "save_cancelled": // saveAs cancelled by user，TM 视为下载成功
                  details.onload?.(makeCallbackParam({ ...data.data }));
                  retPromiseResolve?.(data.data);
                  releaseResources();
                  break;
                case "ontimeout":
                  details.ontimeout?.(makeCallbackParam({}));
                  retPromiseReject?.(new Error("Timeout ERROR"));
                  releaseResources();
                  break;
                case "onerror":
                  details.onerror?.(makeCallbackParam({ error: "unknown" }) as GMTypes.DownloadError);
                  retPromiseReject?.(new Error("Unknown ERROR"));
                  releaseResources();
                  break;
                default:
                  LoggerCore.logger().warn("GM_download resp is error", {
                    data,
                  });
                  retPromiseReject?.(new Error("Unexpected Internal ERROR"));
                  releaseResources();
                  break;
              }
            });

            // 后台主动断连（例如 SW 重启、扩展更新）也释放 URL，避免长尾泄漏。
            // releaseResources 通过 released 标志位幂等，与 onMessage 内部的释放调用顺序无关。
            connect.onDisconnect(() => {
              releaseResources();
            });
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
        const { retPromise, abort } = GM_xmlhttpRequest(a, xhrParams, true, true);
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
        connect?.disconnect(true); // 断开连结(容忍已断开)
        nativeAbort?.();
      },
    };
  }

  // 用于脚本跨域请求,需要@connect domain指定允许的域名
  @GMContext.API()
  public GM_download(ctx: GMApi, arg1: GMTypes.DownloadDetails<string | Blob | File> | string, arg2?: string) {
    const details = typeof arg1 === "string" ? { url: arg1, name: arg2 } : { ...arg1 };
    const { abort } = _GM_download(ctx, details as GMTypes.DownloadDetails<string | Blob | File>, false);
    return { abort };
  }

  @GMContext.API()
  public "GM.download"(ctx: GMApi, arg1: GMTypes.DownloadDetails<string | Blob | File> | string, arg2?: string) {
    const details = typeof arg1 === "string" ? { url: arg1, name: arg2 } : { ...arg1 };
    const { retPromise, abort } = _GM_download(ctx, details as GMTypes.DownloadDetails<string | Blob | File>, true);
    const ret = retPromise as Promise<GMTypes.XHRResponse> & GMRequestHandle;
    ret.abort = abort;
    return ret;
  }

  static _GM_notification(
    gmApi: GMApi,
    detail: GMTypes.NotificationDetails | string,
    ondone?: GMTypes.NotificationOnDone | string,
    image?: string,
    onclick?: GMTypes.NotificationOnClick
  ): Promise<void> {
    if (gmApi.isInvalidContext()) return Promise.resolve();
    const notificationTagMap = getNotificationTagMap(gmApi);
    gmApi.eventId += 1;
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
      data = copyOwnEnumerableDataProperties(detail) as GMTypes.NotificationDetails;
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
    gmApi.sendMessage("GM_notification", [customClone(data), notificationId]).then((id) => {
      if (!gmApi.EE) return;
      if (create) {
        nativeApply(create, { id }, [id]);
      }
      if (typeof data.tag === "string") {
        notificationTagMap.set(data.tag, id);
      }
      let isPreventDefault = false;
      gmApi.EE.addListener("GM_notification:" + id, (resp: NotificationMessageOption) => {
        if (!gmApi.EE) return;
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
            click && nativeApply(click, { id }, [clickEvent]);
            done && nativeApply(done, { id }, []);

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
            done && nativeApply(done, { id }, [resp.params.byUser]);
            clearNotificationIdMap();
            gmApi.EE.removeAllListeners("GM_notification:" + gmApi.eventId);
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
  }

  @GMContext.API()
  public async "GM.notification"(
    ctx: GMApi,
    detail: GMTypes.NotificationDetails | string,
    ondone?: GMTypes.NotificationOnDone | string,
    image?: string,
    onclick?: GMTypes.NotificationOnClick
  ): Promise<void> {
    return _GM_notification(ctx, detail, ondone, image, onclick);
  }

  @GMContext.API()
  public GM_notification(
    ctx: GMApi,
    detail: GMTypes.NotificationDetails | string,
    ondone?: GMTypes.NotificationOnDone | string,
    image?: string,
    onclick?: GMTypes.NotificationOnClick
  ): void {
    _GM_notification(ctx, detail, ondone, image, onclick);
  }

  // ScriptCat 额外API
  @GMContext.API({ alias: "GM.closeNotification" })
  public GM_closeNotification(ctx: GMApi, id: string): void {
    ctx.sendMessage("GM_closeNotification", [`${id}`]);
  }

  // ScriptCat 额外API
  @GMContext.API({ alias: "GM.updateNotification" })
  public GM_updateNotification(ctx: GMApi, id: string, details: GMTypes.NotificationDetails): void {
    ctx.sendMessage("GM_updateNotification", [`${id}`, customClone(details)]);
  }

  @GMContext.API({ depend: ["GM_closeInTab"] })
  public GM_openInTab(ctx: GMApi, url: string, param?: GMTypes.OpenTabOptions | boolean): GMTypes.Tab | undefined {
    if (ctx.isInvalidContext()) return undefined;
    let option = {} as GMTypes.OpenTabOptions;
    if (typeof param === "boolean") {
      option.active = !param; // Greasemonkey 3.x loadInBackground
    } else if (param) {
      option = copyOwnEnumerableDataProperties(param) as GMTypes.OpenTabOptions;
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
        tabid && GMApi.prototype.GM_closeInTab(ctx, tabid);
      },
      closed: false,
      // 占位
      onclose() {},
    };

    ctx.sendMessage("GM_openInTab", [url, option as GMTypes.SWOpenTabOptions]).then((id) => {
      if (!ctx.EE) return;
      if (id) {
        tabid = id;
        ctx.EE.addListener("GM_openInTab:" + id, (resp: any) => {
          if (!ctx.EE) return;
          switch (resp.event) {
            case "oncreate":
              tabid = resp.tabId;
              break;
            case "onclose":
              ret.onclose && ret.onclose();
              ret.closed = true;
              ctx.EE.removeAllListeners("GM_openInTab:" + id);
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
  }

  @GMContext.API({ depend: ["GM_openInTab", "GM_closeInTab"] })
  public "GM.openInTab"(
    ctx: GMApi,
    url: string,
    param?: GMTypes.OpenTabOptions | boolean
  ): Promise<GMTypes.Tab | undefined> {
    return new Promise<GMTypes.Tab | undefined>((resolve) => {
      const ret = GMApi.prototype.GM_openInTab(ctx, url, param);
      resolve(ret);
    });
  }

  // ScriptCat 额外API
  @GMContext.API({ alias: "GM.closeInTab" })
  public GM_closeInTab(ctx: GMApi, tabid: string) {
    if (ctx.isInvalidContext()) return;
    return ctx.sendMessage("GM_closeInTab", [tabid]);
  }

  @GMContext.API()
  public GM_getTab(ctx: GMApi, callback: (tabData: object) => void) {
    if (ctx.isInvalidContext()) return;
    ctx.sendMessage("GM_getTab", []).then((tabData) => {
      callback(tabData ?? {});
    });
  }

  @GMContext.API({ depend: ["GM_getTab"] })
  public "GM.getTab"(ctx: GMApi): Promise<object> {
    return new Promise<object>((resolve) => {
      GMApi.prototype.GM_getTab(ctx, (data) => {
        resolve(data);
      });
    });
  }

  @GMContext.API()
  public GM_saveTab(ctx: GMApi, tabData: object): void {
    if (ctx.isInvalidContext()) return;
    if (typeof tabData === "object") {
      tabData = customClone(tabData);
    }
    ctx.sendMessage("GM_saveTab", [tabData]);
  }

  @GMContext.API({ depend: ["GM_saveTab"] })
  public "GM.saveTab"(ctx: GMApi, tabData: object): Promise<void> {
    return new Promise<void>((resolve) => {
      GMApi.prototype.GM_saveTab(ctx, tabData);
      resolve();
    });
  }

  @GMContext.API()
  public GM_getTabs(ctx: GMApi, callback: (tabsData: { [key: number]: object }) => any) {
    if (ctx.isInvalidContext()) return;
    ctx.sendMessage("GM_getTabs", []).then((tabsData) => {
      callback(tabsData);
    });
  }

  @GMContext.API({ depend: ["GM_getTabs"] })
  public "GM.getTabs"(ctx: GMApi): Promise<{ [key: number]: object }> {
    return new Promise<{ [key: number]: object }>((resolve) => {
      GMApi.prototype.GM_getTabs(ctx, (tabsData) => {
        resolve(tabsData);
      });
    });
  }

  @GMContext.API()
  public GM_setClipboard(ctx: GMApi, data: string, info?: GMTypes.GMClipboardInfo, cb?: () => void) {
    if (ctx.isInvalidContext()) return;
    // 物件参数意义不明。日后再检视特殊处理
    // 未支持 TM4.19+ application/octet-stream
    // 参考： https://github.com/Tampermonkey/tampermonkey/issues/1250
    let mimetype: string | undefined;
    if (typeof info === "object" && info?.mimetype) {
      mimetype = `${info.mimetype}`;
    } else {
      mimetype = (typeof info === "string" ? info : info?.type) || "text/plain";
      if (mimetype === "text") mimetype = "text/plain";
      else if (mimetype === "html") mimetype = "text/html";
    }
    data = `${data}`; // 强制 string type
    ctx
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
  }

  @GMContext.API({ depend: ["GM_setClipboard"] })
  public "GM.setClipboard"(
    ctx: GMApi,
    data: string,
    info?: string | { type?: string; mimetype?: string }
  ): Promise<void> {
    if (ctx.isInvalidContext()) return new Promise<void>(() => {});
    return new Promise<void>((resolve) => {
      GMApi.prototype.GM_setClipboard(ctx, data, info, () => {
        resolve();
      });
    });
  }

  @GMContext.API()
  public GM_getResourceText(ctx: GMApi, name: string): string | undefined {
    const r = (ctx.scriptRes?.resourceByType?.resource ?? ctx.scriptRes?.resource)?.[name];
    if (r) {
      return r.content;
    }
    return undefined;
  }

  @GMContext.API({ depend: ["GM_getResourceText"] })
  public "GM.getResourceText"(ctx: GMApi, name: string): Promise<string | undefined> {
    // Asynchronous wrapper for GM_getResourceText to support GM.getResourceText
    return new Promise((resolve) => {
      const ret = GMApi.prototype.GM_getResourceText(ctx, name);
      resolve(ret);
    });
  }

  @GMContext.API()
  public GM_getResourceURL(ctx: GMApi, name: string, isBlobUrl?: boolean): string | undefined {
    const r = (ctx.scriptRes?.resourceByType?.resource ?? ctx.scriptRes?.resource)?.[name];
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
  }

  @GMContext.API({ depend: ["GM_getResourceURL"] })
  public "GM.getResourceURL"(ctx: GMApi, name: string, isBlobUrl?: boolean): Promise<string | undefined> {
    return new Promise((resolve) => {
      const ret = GMApi.prototype.GM_getResourceURL(ctx, name, isBlobUrl);
      resolve(ret);
    });
  }

  // GM_getResourceURL的异步版本，用来兼容GM.getResourceUrl
  @GMContext.API({ depend: ["GM_getResourceURL"] })
  public "GM.getResourceUrl"(ctx: GMApi, name: string, isBlobUrl?: boolean): Promise<string | undefined> {
    // Asynchronous wrapper for GM_getResourceURL to support GM.getResourceURL
    return new Promise((resolve) => {
      const ret = GMApi.prototype.GM_getResourceURL(ctx, name, isBlobUrl);
      resolve(ret);
    });
  }

  @GMContext.API()
  public "window.close"(ctx: GMApi) {
    return ctx.sendMessage("window.close", []);
  }

  @GMContext.API()
  public "window.focus"(ctx: GMApi) {
    return ctx.sendMessage("window.focus", []);
  }

  @GMContext.protected()
  apiLoadPromise: Promise<void> | undefined;

  @GMContext.API()
  public CAT_scriptLoaded(ctx: GMApi) {
    return ctx.loadScriptPromise;
  }
}

// 从 GM_Base 对象中解构出 createGMBase 函数并导出（可供其他模块使用）
export const { createGMBase } = GM_Base;

// 从 GMApi 对象中解构出内部函数，用于后续本地使用，不导出
const { _GM_getValue, _GM_cookie, _GM_setValue, _GM_setValues, _GM_download, _GM_notification } = GMApi;
