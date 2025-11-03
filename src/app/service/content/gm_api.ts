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
} from "../service_worker/types";
import { base64ToBlob, randNum, randomMessageFlag, strToBase64 } from "@App/pkg/utils/utils";
import LoggerCore from "@App/app/logger/core";
import EventEmitter from "eventemitter3";
import GMContext from "./gm_context";
import { type ScriptRunResource } from "@App/app/repo/scripts";
import type { ValueUpdateDataEncoded } from "./types";
import type { MessageRequest } from "../service_worker/types";
import { connect, sendMessage } from "@Packages/message/client";
import { getStorageName } from "@App/pkg/utils/utils";
import { ListenerManager } from "./listener_manager";
import { decodeMessage, encodeMessage } from "@App/pkg/utils/message_value";
import { type TGMKeyValue } from "@App/app/repo/value";
import { base64ToUint8, concatUint8 } from "@App/pkg/utils/utils_datatype";
import { stackAsyncTask } from "@App/pkg/utils/async_queue";
import { dataEncode } from "@App/pkg/utils/xhr_data";

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

type ContextType = unknown;

type GMXHRResponseType = {
  DONE: number;
  HEADERS_RECEIVED: number;
  LOADING: number;
  OPENED: number;
  UNSENT: number;
  RESPONSE_TYPE_TEXT: string;
  RESPONSE_TYPE_ARRAYBUFFER: string;
  RESPONSE_TYPE_BLOB: string;
  RESPONSE_TYPE_DOCUMENT: string;
  RESPONSE_TYPE_JSON: string;
  RESPONSE_TYPE_STREAM: string;
  context?: ContextType;
  finalUrl: string;
  readyState: 0 | 1 | 4 | 2 | 3;
  status: number;
  statusText: string;
  responseHeaders: string;
  responseType: "" | "text" | "arraybuffer" | "blob" | "json" | "document" | "stream";
  readonly response: string | ArrayBuffer | Blob | Document | ReadableStream<Uint8Array<ArrayBufferLike>> | null;
  readonly responseXML: Document | null;
  readonly responseText: string;
  toString: () => string;
  error?: string;
};

type GMXHRResponseTypeWithError = GMXHRResponseType & Required<Pick<GMXHRResponseType, "error">>;

const integrity = {}; // 仅防止非法实例化

let valChangeCounterId = 0;

let valChangeRandomId = `${randNum(8e11, 2e12).toString(36)}`;

const valueChangePromiseMap = new Map<string, any>();

const execEnvInit = (execEnv: GMApi) => {
  if (!execEnv.contentEnvKey) {
    execEnv.contentEnvKey = randomMessageFlag(); // 不重复识别字串。用于区分 mainframe subframe 等执行环境
    execEnv.menuKeyRegistered = new Set();
    execEnv.menuIdCounter = 0;
    execEnv.regMenuCounter = 0;
  }
};

const toBlobURL = (a: GMApi, blob: Blob): Promise<string> | string => {
  // content_GMAPI 都应该在前台的内容脚本或真实页面执行。如果没有 typeof URL.createObjectURL 才使用信息传递交给后台
  if (typeof URL.createObjectURL === "function") {
    return URL.createObjectURL(blob);
  } else {
    return a.sendMessage("CAT_createBlobUrl", [blob]);
  }
};

/** Convert a Blob/File to base64 data URL */
const blobToDataURL = (blob: Blob): Promise<string> => {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.onabort = reject;
    reader.readAsDataURL(blob);
  });
};

const convObjectToURL = async (object: string | URL | Blob | File | undefined | null) => {
  let url = "";
  if (typeof object === "string") {
    url = object;
  } else if (object instanceof URL) {
    url = object.href;
  } else if (object instanceof Blob) {
    // 不使用 blob URL
    // 1. service worker 不能生成 blob URL
    // 2. blob URL 有效期管理麻烦

    const blob = object;
    url = await blobToDataURL(blob);
  }
  return url;
};

const urlToDocumentInContentPage = async (a: GMApi, url: string) => {
  // url (e.g. blob url) -> XMLHttpRequest (CONTENT) -> Document (CONTENT)
  const nodeId = await a.sendMessage("CAT_fetchDocument", [url]);
  return (<CustomEventMessage>a.message).getAndDelRelatedTarget(nodeId) as Document;
};

// const urlToDocumentLocal = async (a: GMApi, url: string) => {
//   if (typeof XMLHttpRequest === "undefined") return urlToDocumentInContentPage(a, url);
//   return new Promise((resolve) => {
//     const xhr = new XMLHttpRequest();
//     xhr.responseType = "document";
//     xhr.open("GET", url);
//     xhr.onload = () => {
//       const doc = xhr.response instanceof Document ? xhr.response : null;
//       resolve(doc);
//     };
//     xhr.send();
//   });
// };

// const strToDocument = async (a: GMApi, text: string, contentType: DOMParserSupportedType) => {
//   if (typeof DOMParser === "function") {
//     // 前台环境（CONTENT/MAIN）
//     // str -> Document (CONTENT/MAIN)
//     // Document物件是在API呼叫环境产生
//     return new DOMParser().parseFromString(text, contentType);
//   } else {
//     // fallback: 以 urlToDocumentInContentPage 方式取得
//     const blob = new Blob([text], { type: contentType });
//     const blobURL = await toBlobURL(a, blob);
//     const document = await urlToDocumentInContentPage(a, blobURL);
//     return document;
//   }
// };

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
        const valueChanges = decodeMessage(entries);
        for (const [key, value, oldValue] of valueChanges) {
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
}

// GMApi 定义 外部用API函数。不使用@protected
export default class GMApi extends GM_Base {
  /**
   * <tag, notificationId>
   */
  notificationTagMap?: Map<string, string>;

  constructor(
    public prefix: string,
    public message: Message | undefined,
    public scriptRes: ScriptRunResource | undefined
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
        notificationTagMap: new Map(),
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
    const ret = a.scriptRes.value[key];
    if (ret !== undefined) {
      return ret;
    }
    return defaultValue;
  }

  // 获取脚本的值,可以通过@storageName让多个脚本共享一个储存空间
  @GMContext.API()
  public GM_getValue(key: string, defaultValue?: any) {
    return _GM_getValue(this, key, defaultValue);
  }

  @GMContext.API()
  public ["GM.getValue"](key: string, defaultValue?: any): Promise<any> {
    // 兼容GM.getValue
    return new Promise((resolve) => {
      const ret = _GM_getValue(this, key, defaultValue);
      resolve(ret);
    });
  }

  static _GM_setValue(a: GMApi, promise: any, key: string, value: any) {
    if (!a.scriptRes) return;
    if (valChangeCounterId > 1e8) {
      // 防止 valChangeCounterId 过大导致无法正常工作
      valChangeCounterId = 0;
      valChangeRandomId = `${randNum(8e11, 2e12).toString(36)}`;
    }
    const id = `${valChangeRandomId}::${++valChangeCounterId}`;
    if (promise) {
      valueChangePromiseMap.set(id, promise);
    }
    // 对object的value进行一次转化
    if (value && typeof value === "object") {
      value = JSON.parse(JSON.stringify(value));
    }
    if (value === undefined) {
      delete a.scriptRes.value[key];
      a.sendMessage("GM_setValue", [id, key]);
    } else {
      a.scriptRes.value[key] = value;
      a.sendMessage("GM_setValue", [id, key, value]);
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
      valueChangePromiseMap.set(id, promise);
    }
    const valueStore = a.scriptRes.value;
    for (const [key, value] of Object.entries(values)) {
      let value_ = value;
      // 对object的value进行一次转化
      if (value_ && typeof value_ === "object") {
        value_ = JSON.parse(JSON.stringify(value_));
      }
      if (value_ === undefined) {
        if (valueStore[key]) delete valueStore[key];
      } else {
        valueStore[key] = value_;
      }
    }
    // 避免undefined 等空值流失，先进行映射处理
    const valuesNew = encodeMessage(values);
    a.sendMessage("GM_setValues", [id, valuesNew]);
    return id;
  }

  @GMContext.API()
  public GM_setValue(key: string, value: any) {
    _GM_setValue(this, null, key, value);
  }

  @GMContext.API()
  public ["GM.setValue"](key: string, value: any): Promise<void> {
    // Asynchronous wrapper for GM_setValue to support GM.setValue
    return new Promise((resolve) => {
      _GM_setValue(this, resolve, key, value);
    });
  }

  @GMContext.API()
  public GM_deleteValue(key: string): void {
    _GM_setValue(this, null, key, undefined);
  }

  @GMContext.API()
  public ["GM.deleteValue"](key: string): Promise<void> {
    // Asynchronous wrapper for GM_deleteValue to support GM.deleteValue
    return new Promise((resolve) => {
      _GM_setValue(this, resolve, key, undefined);
    });
  }

  @GMContext.API()
  public GM_listValues(): string[] {
    if (!this.scriptRes) return [];
    const keys = Object.keys(this.scriptRes.value);
    return keys;
  }

  @GMContext.API()
  public ["GM.listValues"](): Promise<string[]> {
    // Asynchronous wrapper for GM_listValues to support GM.listValues
    return new Promise((resolve) => {
      if (!this.scriptRes) return resolve([]);
      const keys = Object.keys(this.scriptRes.value);
      resolve(keys);
    });
  }

  @GMContext.API()
  public GM_setValues(values: TGMKeyValue) {
    if (!values || typeof values !== "object") {
      throw new Error("GM_setValues: values must be an object");
    }
    _GM_setValues(this, null, values);
  }

  @GMContext.API()
  public GM_getValues(keysOrDefaults: TGMKeyValue | string[] | null | undefined) {
    if (!this.scriptRes) return {};
    if (!keysOrDefaults) {
      // Returns all values
      return this.scriptRes.value;
    }
    const result: TGMKeyValue = {};
    if (Array.isArray(keysOrDefaults)) {
      // 键名数组
      // Handle array of keys (e.g., ['foo', 'bar'])
      for (let index = 0; index < keysOrDefaults.length; index++) {
        const key = keysOrDefaults[index];
        if (key in this.scriptRes.value) {
          result[key] = this.scriptRes.value[key];
        }
      }
    } else {
      // 对象 键: 默认值
      // Handle object with default values (e.g., { foo: 1, bar: 2, baz: 3 })
      for (const key of Object.keys(keysOrDefaults)) {
        const defaultValue = keysOrDefaults[key];
        result[key] = _GM_getValue(this, key, defaultValue);
      }
    }
    return result;
  }

  // Asynchronous wrapper for GM.getValues
  @GMContext.API({ depend: ["GM_getValues"] })
  public ["GM.getValues"](keysOrDefaults: TGMKeyValue | string[] | null | undefined): Promise<TGMKeyValue> {
    if (!this.scriptRes) return new Promise<TGMKeyValue>(() => {});
    return new Promise((resolve) => {
      const ret = this.GM_getValues(keysOrDefaults);
      resolve(ret);
    });
  }

  @GMContext.API({ depend: ["GM_setValues"] })
  public ["GM.setValues"](values: { [key: string]: any }): Promise<void> {
    if (!this.scriptRes) return new Promise<void>(() => {});
    return new Promise((resolve) => {
      if (!values || typeof values !== "object") {
        throw new Error("GM.setValues: values must be an object");
      }
      _GM_setValues(this, resolve, values);
    });
  }

  @GMContext.API()
  public GM_deleteValues(keys: string[]) {
    if (!this.scriptRes) return;
    if (!Array.isArray(keys)) {
      console.warn("GM_deleteValues: keys must be string[]");
      return;
    }
    const req = {} as Record<string, undefined>;
    for (const key of keys) {
      req[key] = undefined;
    }
    _GM_setValues(this, null, req);
  }

  // Asynchronous wrapper for GM.deleteValues
  @GMContext.API({ depend: ["GM_deleteValues"] })
  public ["GM.deleteValues"](keys: string[]): Promise<void> {
    if (!this.scriptRes) return new Promise<void>(() => {});
    return new Promise((resolve) => {
      if (!Array.isArray(keys)) {
        throw new Error("GM.deleteValues: keys must be string[]");
      } else {
        const req = {} as Record<string, undefined>;
        for (const key of keys) {
          req[key] = undefined;
        }
        _GM_setValues(this, resolve, req);
      }
    });
  }

  @GMContext.API({ alias: "GM.addValueChangeListener" })
  public GM_addValueChangeListener(name: string, listener: GMTypes.ValueChangeListener): number {
    if (!this.valueChangeListener) return 0;
    return this.valueChangeListener.add(name, listener);
  }

  @GMContext.API({ alias: "GM.removeValueChangeListener" })
  public GM_removeValueChangeListener(listenerId: number): void {
    if (!this.valueChangeListener) return;
    this.valueChangeListener.remove(listenerId);
  }

  @GMContext.API({ alias: "GM.log" })
  GM_log(message: string, level: GMTypes.LoggerLevel = "info", ...labels: GMTypes.LoggerLabel[]) {
    if (this.isInvalidContext()) return;
    if (typeof message !== "string") {
      message = JSON.stringify(message);
    }
    this.sendMessage("GM_log", [message, level, labels]);
  }

  @GMContext.API()
  public CAT_createBlobUrl(blob: Blob): Promise<string> {
    return Promise.resolve(toBlobURL(this, blob));
  }

  // 辅助GM_xml获取blob数据
  @GMContext.API()
  public CAT_fetchBlob(url: string): Promise<Blob> {
    return this.sendMessage("CAT_fetchBlob", [url]);
  }

  @GMContext.API()
  public async CAT_fetchDocument(url: string): Promise<Document | undefined> {
    return urlToDocumentInContentPage(this, url);
  }

  static _GM_cookie(
    a: IGM_Base,
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
    a.sendMessage("GM_cookie", [action, details])
      .then((resp: any) => {
        done && done(resp, undefined);
      })
      .catch((err) => {
        done && done(undefined, err);
      });
  }

  @GMContext.API({ follow: "GM.cookie" })
  ["GM.cookie"](action: string, details: GMTypes.CookieDetails) {
    return new Promise((resolve, reject) => {
      _GM_cookie(this, action, details, (cookie, error) => {
        error ? reject(error) : resolve(cookie);
      });
    });
  }

  @GMContext.API({ follow: "GM.cookie" })
  ["GM.cookie.set"](details: GMTypes.CookieDetails) {
    return new Promise((resolve, reject) => {
      _GM_cookie(this, "set", details, (cookie, error) => {
        error ? reject(error) : resolve(cookie);
      });
    });
  }

  @GMContext.API({ follow: "GM.cookie" })
  ["GM.cookie.list"](details: GMTypes.CookieDetails) {
    return new Promise((resolve, reject) => {
      _GM_cookie(this, "list", details, (cookie, error) => {
        error ? reject(error) : resolve(cookie);
      });
    });
  }

  @GMContext.API({ follow: "GM.cookie" })
  ["GM.cookie.delete"](details: GMTypes.CookieDetails) {
    return new Promise((resolve, reject) => {
      _GM_cookie(this, "delete", details, (cookie, error) => {
        error ? reject(error) : resolve(cookie);
      });
    });
  }

  @GMContext.API({ follow: "GM_cookie" })
  ["GM_cookie.set"](
    details: GMTypes.CookieDetails,
    done: (cookie: GMTypes.Cookie[] | any, error: any | undefined) => void
  ) {
    _GM_cookie(this, "set", details, done);
  }

  @GMContext.API({ follow: "GM_cookie" })
  ["GM_cookie.list"](
    details: GMTypes.CookieDetails,
    done: (cookie: GMTypes.Cookie[] | any, error: any | undefined) => void
  ) {
    _GM_cookie(this, "list", details, done);
  }

  @GMContext.API({ follow: "GM_cookie" })
  ["GM_cookie.delete"](
    details: GMTypes.CookieDetails,
    done: (cookie: GMTypes.Cookie[] | any, error: any | undefined) => void
  ) {
    _GM_cookie(this, "delete", details, done);
  }

  @GMContext.API()
  GM_cookie(
    action: string,
    details: GMTypes.CookieDetails,
    done: (cookie: GMTypes.Cookie[] | any, error: any | undefined) => void
  ) {
    _GM_cookie(this, action, details, done);
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

  @GMContext.API({ alias: "GM.registerMenuCommand" })
  GM_registerMenuCommand(
    name: string,
    listener?: (inputValue?: any) => void,
    options_or_accessKey?: ScriptMenuItemOption | string
  ): TScriptMenuItemID {
    if (!this.EE) return -1;
    execEnvInit(this);
    this.regMenuCounter! += 1;
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
    options.mIndividualKey = isIndividual ? this.regMenuCounter : 0;
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
    if (providedId === undefined) providedId = this.menuIdCounter! += 1; // 如无指定，使用累计器id
    const ret = providedId! as TScriptMenuItemID;
    providedId = `t${providedId!}`; // 见 TScriptMenuItemID 注释
    providedId = `${this.contentEnvKey!}.${providedId}` as TScriptMenuItemKey; // 区分 subframe mainframe，见 TScriptMenuItemKey 注释
    const menuKey = providedId; // menuKey为唯一键：{环境识别符}.t{注册ID}
    // 检查之前有否注册
    if (menuKey && this.menuKeyRegistered!.has(menuKey)) {
      // 有注册过，先移除 listeners
      this.EE.removeAllListeners("menuClick:" + menuKey);
    } else {
      // 没注册过，先记录一下
      this.menuKeyRegistered!.add(menuKey);
    }
    if (listener) {
      // GM_registerMenuCommand("hi", undefined, {accessKey:"h"}) 时TM不会报错
      this.EE.addListener("menuClick:" + menuKey, listener);
    }
    // 发送至 service worker 处理（唯一键，显示名字，不包括id的其他设定）
    this.sendMessage("GM_registerMenuCommand", [menuKey, name, options] as GMRegisterMenuCommandParam);
    return ret;
  }

  @GMContext.API({
    depend: ["GM_registerMenuCommand"],
  })
  CAT_registerMenuInput(...args: Parameters<GMApi["GM_registerMenuCommand"]>): TScriptMenuItemID {
    return this.GM_registerMenuCommand(...args);
  }

  @GMContext.API({ alias: "GM.addStyle" })
  GM_addStyle(css: string) {
    if (!this.message || !this.scriptRes) return;
    if (typeof css !== "string") throw new Error("The parameter 'css' of GM_addStyle shall be a string.");
    // 与content页的消息通讯实际是同步,此方法不需要经过background
    // 这里直接使用同步的方式去处理, 不要有promise
    const resp = (<CustomEventMessage>this.message).syncSendMessage({
      action: `${this.prefix}/runtime/gmApi`,
      data: {
        uuid: this.scriptRes.uuid,
        api: "GM_addElement",
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
    return (<CustomEventMessage>this.message).getAndDelRelatedTarget(resp.data);
  }

  @GMContext.API({ alias: "GM.addElement" })
  GM_addElement(
    parentNode: EventTarget | string,
    tagName: string | Record<string, string | number | boolean>,
    attrs: Record<string, string | number | boolean> = {}
  ) {
    if (!this.message || !this.scriptRes) return;
    // 与content页的消息通讯实际是同步,此方法不需要经过background
    // 这里直接使用同步的方式去处理, 不要有promise
    let parentNodeId: number | null;
    if (typeof parentNode !== "string") {
      const id = (<CustomEventMessage>this.message).sendRelatedTarget(parentNode);
      parentNodeId = id;
    } else {
      parentNodeId = null;
      attrs = tagName as Record<string, string | number | boolean>;
      tagName = parentNode as string;
    }
    if (typeof tagName !== "string") throw new Error("The parameter 'tagName' of GM_addElement shall be a string.");
    if (typeof attrs !== "object") throw new Error("The parameter 'attrs' of GM_addElement shall be an object.");
    const resp = (<CustomEventMessage>this.message).syncSendMessage({
      action: `${this.prefix}/runtime/gmApi`,
      data: {
        uuid: this.scriptRes.uuid,
        api: "GM_addElement",
        params: [parentNodeId, tagName, attrs],
      },
    });
    if (resp.code) {
      throw new Error(resp.message);
    }
    return (<CustomEventMessage>this.message).getAndDelRelatedTarget(resp.data);
  }

  @GMContext.API({ alias: "GM.unregisterMenuCommand" })
  GM_unregisterMenuCommand(menuId: TScriptMenuItemID): void {
    if (!this.EE) return;
    if (!this.contentEnvKey) {
      return;
    }
    let menuKey = `t${menuId}`; // 见 TScriptMenuItemID 注释
    menuKey = `${this.contentEnvKey!}.${menuKey}` as TScriptMenuItemKey; // 区分 subframe mainframe，见 TScriptMenuItemKey 注释
    this.menuKeyRegistered!.delete(menuKey);
    this.EE.removeAllListeners("menuClick:" + menuKey);
    // 发送至 service worker 处理（唯一键）
    this.sendMessage("GM_unregisterMenuCommand", [menuKey] as GMUnRegisterMenuCommandParam);
  }

  @GMContext.API({
    depend: ["GM_unregisterMenuCommand"],
  })
  CAT_unregisterMenuInput(...args: Parameters<GMApi["GM_unregisterMenuCommand"]>): void {
    this.GM_unregisterMenuCommand(...args);
  }

  @GMContext.API()
  CAT_userConfig() {
    return this.sendMessage("CAT_userConfig", []);
  }

  @GMContext.API({
    depend: ["CAT_fetchBlob", "CAT_createBlobUrl"],
  })
  async CAT_fileStorage(action: "list" | "download" | "upload" | "delete" | "config", details: any) {
    if (action === "config") {
      this.sendMessage("CAT_fileStorage", ["config"]);
      return;
    }
    const sendDetails: CATType.CATFileStorageDetails = {
      baseDir: details.baseDir || "",
      path: details.path || "",
      filename: details.filename,
      file: details.file,
    };
    if (action === "upload") {
      const url = await toBlobURL(this, details.data);
      sendDetails.data = url;
    }
    this.sendMessage("CAT_fileStorage", [action, sendDetails]).then(async (resp: { action: string; data: any }) => {
      switch (resp.action) {
        case "onload": {
          if (action === "download") {
            // 读取blob
            const blob = await this.CAT_fetchBlob(resp.data);
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

  static _GM_xmlhttpRequest(
    a: GMApi,
    details: GMTypes.XHRDetails,
    requirePromise: boolean,
    byPassConnect: boolean = false
  ) {
    let reqDone = false;
    if (a.isInvalidContext()) {
      return {
        retPromise: requirePromise ? Promise.reject("GM_xmlhttpRequest: Invalid Context") : null,
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
    const dataPromise = dataEncode(details.data);
    const headers = details.headers;
    if (headers) {
      for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === "cookie") {
          details.cookie = headers[key];
          delete headers[key];
        }
      }
    }
    const contentContext = details.context;

    const param: GMSend.XHRDetails = {
      method: details.method,
      timeout: details.timeout,
      url: "",
      headers: details.headers,
      cookie: details.cookie,
      responseType: details.responseType,
      overrideMimeType: details.overrideMimeType,
      anonymous: details.anonymous,
      user: details.user,
      password: details.password,
      redirect: details.redirect,
      fetch: details.fetch,
      byPassConnect: byPassConnect,
    };
    if (!param.headers) {
      param.headers = {};
    }
    if (details.nocache) {
      param.headers["Cache-Control"] = "no-cache";
    }
    let connect: MessageConnect | null;
    const responseTypeOriginal = details.responseType?.toLocaleLowerCase() || "";
    let doAbort: any = null;
    const handler = async () => {
      const [urlResolved, dataResolved] = await Promise.all([urlPromiseLike, dataPromise]);
      const u = new URL(urlResolved, window.location.href);
      param.url = u.href;
      param.data = dataResolved;

      // 处理返回数据
      let readerStream: ReadableStream<Uint8Array> | undefined;
      let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
      // 如果返回类型是arraybuffer或者blob的情况下,需要将返回的数据转化为blob
      // 在background通过URL.createObjectURL转化为url,然后在content页读取url获取blob对象
      if (responseTypeOriginal === "stream") {
        readerStream = new ReadableStream<Uint8Array>({
          start(ctrl) {
            controller = ctrl;
          },
        });
      } else {
        // document类型读取blob,然后在content页转化为document对象
        switch (responseTypeOriginal) {
          case "arraybuffer":
          case "blob":
            param.responseType = "arraybuffer";
            break;
          case "document":
          case "json":
          case "":
          case "text":
          default:
            param.responseType = "text";
            break;
        }
      }
      const xhrType = param.responseType;
      const responseType = responseTypeOriginal; // 回传用

      // 发送信息
      a.connect("GM_xmlhttpRequest", [param]).then((con) => {
        // 注意。在此 callback 里，不应直接存取 param, 否则会影响 GC
        connect = con;
        const resultTexts = [] as string[];
        const resultBuffers = [] as Uint8Array<ArrayBuffer>[];
        let finalResultBuffers: Uint8Array<ArrayBuffer> | null = null;
        const asyncTaskId = `${Date.now}:${Math.random()}`;

        let errorOccur: string | null = null;
        let response: unknown = null;
        let responseText: string | undefined | false = "";
        let responseXML: unknown = null;
        let resultType = 0;
        if (readerStream) {
          response = readerStream;
          responseText = undefined; // 兼容
          responseXML = undefined; // 兼容
        }
        readerStream = undefined;

        const makeXHRCallbackParam = (
          res: {
            //
            finalUrl: string;
            readyState: 0 | 4 | 2 | 3 | 1;
            status: number;
            statusText: string;
            responseHeaders: string;
            error?: string;
            //
            useFetch: boolean;
            eventType: string;
            ok: boolean;
            contentType: string;
          } & Record<string, any>
        ) => {
          let resError: Record<string, any> | null = null;
          if (
            (typeof res.error === "string" &&
              (res.status === 0 || res.status >= 300 || res.status < 200) &&
              !res.statusText &&
              resultBuffers.length === 0 &&
              resultTexts.length === 0) ||
            res.error === "aborted"
          ) {
            resError = {
              error: res.error as string,
              readyState: res.readyState as 0 | 4 | 2 | 3 | 1,
              // responseType: responseType as "text" | "arraybuffer" | "blob" | "json" | "document" | "stream" | "",
              response: null,
              responseHeaders: res.responseHeaders as string,
              responseText: "",
              status: res.status as number,
              statusText: "",
            };
          }
          let retParam;
          if (resError) {
            retParam = {
              DONE: 4,
              HEADERS_RECEIVED: 2,
              LOADING: 3,
              OPENED: 1,
              UNSENT: 0,
              RESPONSE_TYPE_TEXT: "text",
              RESPONSE_TYPE_ARRAYBUFFER: "arraybuffer",
              RESPONSE_TYPE_BLOB: "blob",
              RESPONSE_TYPE_DOCUMENT: "document",
              RESPONSE_TYPE_JSON: "json",
              RESPONSE_TYPE_STREAM: "stream",
              toString: () => "[object Object]", // follow TM
              ...resError,
            } as GMXHRResponseType;
          } else {
            retParam = {
              DONE: 4,
              HEADERS_RECEIVED: 2,
              LOADING: 3,
              OPENED: 1,
              UNSENT: 0,
              RESPONSE_TYPE_TEXT: "text",
              RESPONSE_TYPE_ARRAYBUFFER: "arraybuffer",
              RESPONSE_TYPE_BLOB: "blob",
              RESPONSE_TYPE_DOCUMENT: "document",
              RESPONSE_TYPE_JSON: "json",
              RESPONSE_TYPE_STREAM: "stream",
              finalUrl: res.finalUrl as string,
              readyState: res.readyState as 0 | 4 | 2 | 3 | 1,
              status: res.status as number,
              statusText: res.statusText as string,
              responseHeaders: res.responseHeaders as string,
              responseType: responseType as "text" | "arraybuffer" | "blob" | "json" | "document" | "stream" | "",
              get response() {
                if (response === false) {
                  switch (responseTypeOriginal) {
                    case "json": {
                      const text = this.responseText;
                      let o = undefined;
                      try {
                        o = JSON.parse(text);
                      } catch {
                        // ignored
                      }
                      response = o; // TM兼容 -> o : object | undefined
                      break;
                    }
                    case "document": {
                      response = this.responseXML;
                      break;
                    }
                    case "arraybuffer": {
                      finalResultBuffers ||= concatUint8(resultBuffers);
                      const full = finalResultBuffers;
                      response = full.buffer; // ArrayBuffer
                      break;
                    }
                    case "blob": {
                      finalResultBuffers ||= concatUint8(resultBuffers);
                      const full = finalResultBuffers;
                      const type = res.contentType || "application/octet-stream";
                      response = new Blob([full], { type }); // Blob
                      break;
                    }
                    default: {
                      // text
                      response = `${this.responseText}`;
                      break;
                    }
                  }
                }
                return response as string | ArrayBuffer | Blob | Document | ReadableStream<Uint8Array> | null;
              },
              get responseXML() {
                if (responseXML === false) {
                  const text = this.responseText;
                  if (
                    ["application/xhtml+xml", "application/xml", "image/svg+xml", "text/html", "text/xml"].includes(
                      res.contentType
                    )
                  ) {
                    responseXML = new DOMParser().parseFromString(text, res.contentType as DOMParserSupportedType);
                  } else {
                    responseXML = new DOMParser().parseFromString(text, "text/xml");
                  }
                }
                return responseXML as Document | null;
              },
              get responseText() {
                if (responseTypeOriginal === "document") {
                  // console.log(resultType, resultBuffers.length, resultTexts.length);
                }
                if (responseText === false) {
                  if (resultType === 2) {
                    finalResultBuffers ||= concatUint8(resultBuffers);
                    const buf = finalResultBuffers.buffer as ArrayBuffer;
                    const decoder = new TextDecoder("utf-8");
                    const text = decoder.decode(buf);
                    responseText = text;
                  } else {
                    // resultType === 3
                    responseText = `${resultTexts.join("")}`;
                  }
                }
                return responseText as string;
              },
              toString: () => "[object Object]", // follow TM
            } as GMXHRResponseType;
            if (res.error) {
              retParam.error = res.error;
            }
            if (responseType === "json" && retParam.response === null) {
              response = undefined; // TM不使用null，使用undefined
            }
          }
          if (typeof contentContext !== "undefined") {
            retParam.context = contentContext;
          }
          return retParam;
        };
        doAbort = (data: any) => {
          if (!reqDone) {
            errorOccur = "AbortError";
            details.onabort?.(makeXHRCallbackParam(data));
            reqDone = true;
          }
        };

        con.onMessage((msgData) => {
          stackAsyncTask(asyncTaskId, async () => {
            const data = msgData.data as Record<string, any> & {
              //
              finalUrl: string;
              readyState: 0 | 4 | 2 | 3 | 1;
              status: number;
              statusText: string;
              responseHeaders: string;
              //
              useFetch: boolean;
              eventType: string;
              ok: boolean;
              contentType: string;
              error: undefined | string;
            };
            if (msgData.code === -1) {
              // 处理错误
              LoggerCore.logger().error("GM_xmlhttpRequest error", {
                code: msgData.code,
                message: msgData.message,
              });
              details.onerror?.({
                readyState: 4,
                error: msgData.message || "unknown",
              });
              return;
            }
            // 处理返回
            switch (msgData.action) {
              case "reset_chunk_arraybuffer":
              case "reset_chunk_blob":
              case "reset_chunk_buffer": {
                resultBuffers.length = 0;
                break;
              }
              case "reset_chunk_document":
              case "reset_chunk_json":
              case "reset_chunk_text": {
                resultTexts.length = 0;
                break;
              }
              case "append_chunk_stream": {
                const d = msgData.data.chunk as string;
                const u8 = base64ToUint8(d);
                resultBuffers.push(u8);
                controller?.enqueue(base64ToUint8(d));
                resultType = 1;
                break;
              }
              case "append_chunk_arraybuffer":
              case "append_chunk_blob":
              case "append_chunk_buffer": {
                const d = msgData.data.chunk as string;
                const u8 = base64ToUint8(d);
                resultBuffers.push(u8);
                resultType = 2;
                break;
              }
              case "append_chunk_document":
              case "append_chunk_json":
              case "append_chunk_text": {
                const d = msgData.data.chunk as string;
                resultTexts.push(d);
                resultType = 3;
                break;
              }
              case "onload":
                details.onload?.(makeXHRCallbackParam(data));
                break;
              case "onloadend": {
                reqDone = true;
                const xhrReponse = makeXHRCallbackParam(data);
                details.onloadend?.(xhrReponse);
                if (errorOccur === null) {
                  retPromiseResolve?.(xhrReponse);
                } else {
                  retPromiseReject?.(errorOccur);
                }
                break;
              }
              case "onloadstart":
                details.onloadstart?.(makeXHRCallbackParam(data));
                break;
              case "onprogress": {
                if (details.onprogress) {
                  if (!xhrType || xhrType === "text") {
                    responseText = false; // 设为false 表示需要更新。在 get setter 中更新
                    response = false; // 设为false 表示需要更新。在 get setter 中更新
                    responseXML = false; // 设为false 表示需要更新。在 get setter 中更新
                  }
                  const res = {
                    ...makeXHRCallbackParam(data),
                    lengthComputable: data.lengthComputable as boolean,
                    loaded: data.loaded as number,
                    total: data.total as number,
                    done: data.loaded,
                    totalSize: data.total,
                  };
                  details.onprogress?.(res);
                }
                break;
              }
              case "onreadystatechange": {
                if (data.readyState === 4 && data.ok) {
                  if (resultType === 1) {
                    // stream type
                    controller = undefined; // GC用
                  } else if (resultType === 2) {
                    // buffer type
                    responseText = false; // 设为false 表示需要更新。在 get setter 中更新
                    response = false; // 设为false 表示需要更新。在 get setter 中更新
                    responseXML = false; // 设为false 表示需要更新。在 get setter 中更新
                    /*
                    if (xhrType === "blob") {
                      const full = concatUint8(resultBuffers);
                      const type = data.data.contentType || "application/octet-stream";
                      response = new Blob([full], { type }); // Blob
                      if (responseTypeOriginal === "document") {
                        const blobURL = await toBlobURL(a, response as Blob);
                        const document = await urlToDocumentLocal(a, blobURL);
                        response = document;
                        responseXML = document;
                      }
                    } else if (xhrType === "arraybuffer") {
                      const full = concatUint8(resultBuffers);
                      response = full.buffer; // ArrayBuffer
                    }
                      */
                  } else if (resultType === 3) {
                    // string type

                    responseText = false; // 设为false 表示需要更新。在 get setter 中更新
                    response = false; // 设为false 表示需要更新。在 get setter 中更新
                    responseXML = false; // 设为false 表示需要更新。在 get setter 中更新
                    /*
                    if (xhrType === "json") {
                      const full = resultTexts.join("");
                      try {
                        response = JSON.parse(full);
                      } catch {
                        response = null;
                      }
                      responseText = full; // XHR exposes responseText even for JSON
                    } else if (xhrType === "document") {
                      // 不应该出现 document type
                      console.error("ScriptCat: Invalid Calling in GM_xmlhttpRequest");
                      responseText = "";
                      response = null;
                      responseXML = null;
                      // const full = resultTexts.join("");
                      // try {
                      //   response = strToDocument(a, full, data.data.contentType as DOMParserSupportedType);
                      // } catch {
                      //   response = null;
                      // }
                      // if (response) {
                      //   responseXML = response;
                      // }
                    } else {
                      const full = resultTexts.join("");
                      response = full;
                      responseText = full;
                    }
                      */
                  }
                }
                details.onreadystatechange?.(makeXHRCallbackParam(data));
                break;
              }
              case "ontimeout":
                if (!reqDone) {
                  errorOccur = "TimeoutError";
                  details.ontimeout?.(makeXHRCallbackParam(data));
                  reqDone = true;
                }
                break;
              case "onerror":
                if (!reqDone) {
                  data.error ||= "Unknown Error";
                  errorOccur = data.error;
                  details.onerror?.(makeXHRCallbackParam(data) as GMXHRResponseTypeWithError);
                  reqDone = true;
                }
                break;
              case "onabort":
                doAbort(data);
                break;
              // case "onstream":
              //   controller?.enqueue(new Uint8Array(data));
              //   break;
              default:
                LoggerCore.logger().warn("GM_xmlhttpRequest resp is error", {
                  data: msgData,
                });
                break;
            }
          });
        });
      });
    };
    // 由于需要同步返回一个abort，但是一些操作是异步的，所以需要在这里处理
    handler();
    return {
      retPromise,
      abort: () => {
        if (connect) {
          connect.disconnect();
          connect = null;
        }
        if (doAbort && details.onabort && !reqDone) {
          // https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/abort
          // When a request is aborted, its readyState is changed to XMLHttpRequest.UNSENT (0) and the request's status code is set to 0.
          doAbort?.({
            error: "aborted",
            responseHeaders: "",
            readyState: 0,
            status: 0,
            statusText: "",
          }) as GMXHRResponseType;
          reqDone = true;
        }
      },
    };
  }

  // 用于脚本跨域请求,需要@connect domain指定允许的域名
  @GMContext.API({
    depend: ["CAT_fetchBlob", "CAT_createBlobUrl", "CAT_fetchDocument"],
  })
  public GM_xmlhttpRequest(details: GMTypes.XHRDetails) {
    const { abort } = _GM_xmlhttpRequest(this, details, false);
    return { abort };
  }

  @GMContext.API({ depend: ["CAT_fetchBlob", "CAT_createBlobUrl", "CAT_fetchDocument"] })
  public ["GM.xmlHttpRequest"](details: GMTypes.XHRDetails): Promise<GMTypes.XHRResponse> & GMRequestHandle {
    const { retPromise, abort } = _GM_xmlhttpRequest(this, details, true);
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
  @GMContext.API({ alias: "GM.download" })
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
              details.onprogress?.(makeCallbackParam({ ...data.data }));
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
              const con = await a.connect("GM_download", [
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
            details.onprogress?.(makeCallbackParam({ ...e }));
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
        const { retPromise, abort } = _GM_xmlhttpRequest(a, xhrParams, true, true);
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
  }

  // 用于脚本跨域请求,需要@connect domain指定允许的域名
  @GMContext.API()
  public GM_download(arg1: GMTypes.DownloadDetails<string | Blob | File> | string, arg2?: string) {
    const details = typeof arg1 === "string" ? { url: arg1, name: arg2 } : { ...arg1 };
    const { abort } = _GM_download(this, details as GMTypes.DownloadDetails<string | Blob | File>, false);
    return { abort };
  }

  @GMContext.API()
  public ["GM.download"](arg1: GMTypes.DownloadDetails<string | Blob | File> | string, arg2?: string) {
    const details = typeof arg1 === "string" ? { url: arg1, name: arg2 } : { ...arg1 };
    const { retPromise, abort } = _GM_download(this, details as GMTypes.DownloadDetails<string | Blob | File>, true);
    const ret = retPromise as Promise<GMTypes.XHRResponse> & GMRequestHandle;
    ret.abort = abort;
    return ret;
  }

  @GMContext.API({
    depend: ["GM_closeNotification", "GM_updateNotification"],
    alias: "GM.notification",
  })
  public async GM_notification(
    detail: GMTypes.NotificationDetails | string,
    ondone?: GMTypes.NotificationOnDone | string,
    image?: string,
    onclick?: GMTypes.NotificationOnClick
  ) {
    if (this.isInvalidContext()) return;
    const notificationTagMap: Map<string, string> = this.notificationTagMap || (this.notificationTagMap = new Map());
    this.eventId += 1;
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
    this.sendMessage("GM_notification", [data, notificationId]).then((id) => {
      if (!this.EE) return;
      if (create) {
        create.apply({ id }, [id]);
      }
      if (typeof data.tag === "string") {
        notificationTagMap.set(data.tag, id);
      }
      let isPreventDefault = false;
      this.EE.addListener("GM_notification:" + id, (resp: NotificationMessageOption) => {
        if (!this.EE) return;
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
                LoggerCore.logger().info("GM_notification open url：" + data.url, {
                  data,
                });
              }
            }
            break;
          }
          case "close": {
            done && done.apply({ id }, [resp.params.byUser]);
            clearNotificationIdMap();
            this.EE.removeAllListeners("GM_notification:" + this.eventId);
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
  }

  @GMContext.API({ alias: "GM.closeNotification" })
  public GM_closeNotification(id: string): void {
    this.sendMessage("GM_closeNotification", [id]);
  }

  @GMContext.API({ alias: "GM.updateNotification" })
  public GM_updateNotification(id: string, details: GMTypes.NotificationDetails): void {
    this.sendMessage("GM_updateNotification", [id, details]);
  }

  @GMContext.API({ depend: ["GM_closeInTab"], alias: "GM.openInTab" })
  public GM_openInTab(url: string, param?: GMTypes.OpenTabOptions | boolean): GMTypes.Tab | undefined {
    if (this.isInvalidContext()) return undefined;
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
        tabid && this.GM_closeInTab(tabid);
      },
      closed: false,
      // 占位
      onclose() {},
    };

    this.sendMessage("GM_openInTab", [url, option as GMTypes.SWOpenTabOptions]).then((id) => {
      if (!this.EE) return;
      if (id) {
        tabid = id;
        this.EE.addListener("GM_openInTab:" + id, (resp: any) => {
          if (!this.EE) return;
          switch (resp.event) {
            case "oncreate":
              tabid = resp.tabId;
              break;
            case "onclose":
              ret.onclose && ret.onclose();
              ret.closed = true;
              this.EE.removeAllListeners("GM_openInTab:" + id);
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

  @GMContext.API({ alias: "GM.closeInTab" })
  public GM_closeInTab(tabid: string) {
    if (this.isInvalidContext()) return;
    return this.sendMessage("GM_closeInTab", [tabid]);
  }

  @GMContext.API()
  GM_getTab(callback: (data: any) => void) {
    if (this.isInvalidContext()) return;
    this.sendMessage("GM_getTab", []).then((data) => {
      callback(data ?? {});
    });
  }

  @GMContext.API({ depend: ["GM_getTab"] })
  public ["GM.getTab"](): Promise<any> {
    return new Promise<any>((resolve) => {
      this.GM_getTab((data) => {
        resolve(data);
      });
    });
  }

  @GMContext.API({ alias: "GM.saveTab" })
  GM_saveTab(obj: object) {
    if (this.isInvalidContext()) return;
    if (typeof obj === "object") {
      obj = JSON.parse(JSON.stringify(obj));
    }
    this.sendMessage("GM_saveTab", [obj]);
  }

  @GMContext.API()
  GM_getTabs(callback: (objs: { [key: string | number]: object }) => any) {
    if (this.isInvalidContext()) return;
    this.sendMessage("GM_getTabs", []).then((resp) => {
      callback(resp);
    });
  }

  @GMContext.API({ depend: ["GM_getTabs"] })
  public ["GM.getTabs"](): Promise<{ [key: string | number]: object }> {
    return new Promise<{ [key: string | number]: object }>((resolve) => {
      this.GM_getTabs((data) => {
        resolve(data);
      });
    });
  }

  @GMContext.API({})
  GM_setClipboard(data: string, info?: GMTypes.GMClipboardInfo, cb?: () => void) {
    if (this.isInvalidContext()) return;
    this.sendMessage("GM_setClipboard", [data, info])
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
  ["GM.setClipboard"](data: string, info?: string | { type?: string; mimetype?: string }): Promise<void> {
    if (this.isInvalidContext()) return new Promise<void>(() => {});
    return this.sendMessage("GM_setClipboard", [data, info]);
  }

  @GMContext.API()
  GM_getResourceText(name: string): string | undefined {
    const r = this.scriptRes?.resource?.[name];
    if (r) {
      return r.content;
    }
    return undefined;
  }

  @GMContext.API({ depend: ["GM_getResourceText"] })
  public ["GM.getResourceText"](name: string): Promise<string | undefined> {
    // Asynchronous wrapper for GM_getResourceText to support GM.getResourceText
    return new Promise((resolve) => {
      const ret = this.GM_getResourceText(name);
      resolve(ret);
    });
  }

  @GMContext.API()
  GM_getResourceURL(name: string, isBlobUrl?: boolean): string | undefined {
    const r = this.scriptRes?.resource?.[name];
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

  // GM_getResourceURL的异步版本，用来兼容GM.getResourceUrl
  @GMContext.API({ depend: ["GM_getResourceURL"] })
  public ["GM.getResourceUrl"](name: string, isBlobUrl?: boolean): Promise<string | undefined> {
    // Asynchronous wrapper for GM_getResourceURL to support GM.getResourceURL
    return new Promise((resolve) => {
      const ret = this.GM_getResourceURL(name, isBlobUrl);
      resolve(ret);
    });
  }

  @GMContext.API()
  ["window.close"]() {
    return this.sendMessage("window.close", []);
  }

  @GMContext.API()
  ["window.focus"]() {
    return this.sendMessage("window.focus", []);
  }

  @GMContext.protected()
  apiLoadPromise: Promise<void> | undefined;

  @GMContext.API()
  CAT_scriptLoaded() {
    return this.loadScriptPromise;
  }
}

// 从 GM_Base 对象中解构出 createGMBase 函数并导出（可供其他模块使用）
export const { createGMBase } = GM_Base;

// 从 GMApi 对象中解构出内部函数，用于后续本地使用，不导出
const { _GM_getValue, _GM_cookie, _GM_setValue, _GM_setValues, _GM_xmlhttpRequest, _GM_download } = GMApi;
