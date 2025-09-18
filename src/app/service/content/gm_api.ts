import type { Message, MessageConnect } from "@Packages/message/types";
import type { CustomEventMessage } from "@Packages/message/custom_event_message";
import type { NotificationMessageOption, ScriptMenuItem } from "../service_worker/types";
import { base64ToBlob, strToBase64 } from "@App/pkg/utils/utils";
import LoggerCore from "@App/app/logger/core";
import EventEmitter from "eventemitter3";
import GMContext from "./gm_context";
import { type ScriptRunResource } from "@App/app/repo/scripts";
import type { ValueUpdateData } from "./types";
import type { MessageRequest } from "../service_worker/types";
import { connect, sendMessage } from "@Packages/message/client";
import { getStorageName } from "@App/pkg/utils/utils";

// 内部函数呼叫定义
export interface IGM_Base {
  sendMessage(api: string, params: any[]): Promise<any>;
  connect(api: string, params: any[]): Promise<any>;
  valueUpdate(data: ValueUpdateData): void;
  emitEvent(event: string, eventId: string, data: any): void;
}

const integrity = {}; // 僅防止非法实例化

// GM_Base 定义内部用变量和函数。均使用@protected
// 暂不考虑 Object.getOwnPropertyNames(GM_Base.prototype) 和 ts-morph 脚本生成
class GM_Base implements IGM_Base {
  @GMContext.protected()
  protected runFlag!: string;

  @GMContext.protected()
  protected prefix!: string;

  @GMContext.protected()
  protected message!: Message;

  @GMContext.protected()
  protected scriptRes!: ScriptRunResource;

  @GMContext.protected()
  protected valueChangeListener!: Map<number, { name: string; listener: GMTypes.ValueChangeListener }>;

  @GMContext.protected()
  protected EE!: EventEmitter;

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

  // 单次回调使用
  @GMContext.protected()
  public async sendMessage(api: string, params: any[]) {
    if (this.loadScriptPromise) {
      await this.loadScriptPromise;
    }
    return sendMessage(this.message, `${this.prefix}/runtime/gmApi`, {
      uuid: this.scriptRes.uuid,
      api,
      params,
      runFlag: this.runFlag,
    } as MessageRequest);
  }

  // 长连接使用,connect只用于接受消息,不发送消息
  @GMContext.protected()
  public connect(api: string, params: any[]) {
    return connect(this.message, `${this.prefix}/runtime/gmApi`, {
      uuid: this.scriptRes.uuid,
      api,
      params,
      runFlag: this.runFlag,
    } as MessageRequest);
  }

  @GMContext.protected()
  public valueUpdate(data: ValueUpdateData) {
    if (data.uuid === this.scriptRes.uuid || data.storageName === getStorageName(this.scriptRes)) {
      // 触发,并更新值
      if (data.value === undefined) {
        if (this.scriptRes.value[data.key] !== undefined) {
          delete this.scriptRes.value[data.key];
        }
      } else {
        this.scriptRes.value[data.key] = data.value;
      }
      this.valueChangeListener.forEach((item) => {
        if (item.name === data.key) {
          item.listener(data.key, data.oldValue, data.value, data.sender.runFlag !== this.runFlag, data.sender.tabId);
        }
      });
    }
  }

  @GMContext.protected()
  emitEvent(event: string, eventId: string, data: any) {
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
    public message: Message,
    public scriptRes: ScriptRunResource
  ) {
    // testing only 仅供测试用
    const valueChangeListener = new Map<number, { name: string; listener: GMTypes.ValueChangeListener }>();
    const EE = new EventEmitter<string, any>();
    super(
      {
        prefix,
        message,
        scriptRes,
        valueChangeListener,
        EE,
        notificationTagMap: new Map(),
        eventId: 0,
      },
      integrity
    );
  }

  static _GM_getValue(a: GMApi, key: string, defaultValue?: any) {
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

  static _GM_setValue(a: GMApi, key: string, value: any) {
    // 对object的value进行一次转化
    if (typeof value === "object") {
      value = JSON.parse(JSON.stringify(value));
    }
    if (value === undefined) {
      delete a.scriptRes.value[key];
      a.sendMessage("GM_setValue", [key]);
    } else {
      a.scriptRes.value[key] = value;
      a.sendMessage("GM_setValue", [key, value]);
    }
  }

  @GMContext.API()
  public GM_setValue(key: string, value: any) {
    _GM_setValue(this, key, value);
  }

  @GMContext.API()
  public ["GM.setValue"](key: string, value: any): Promise<void> {
    // Asynchronous wrapper for GM_setValue to support GM.setValue
    return new Promise((resolve) => {
      _GM_setValue(this, key, value);
      resolve();
    });
  }

  @GMContext.API()
  public GM_deleteValue(name: string): void {
    _GM_setValue(this, name, undefined);
  }

  @GMContext.API()
  public ["GM.deleteValue"](name: string): Promise<void> {
    // Asynchronous wrapper for GM_deleteValue to support GM.deleteValue
    return new Promise((resolve) => {
      _GM_setValue(this, name, undefined);
      resolve();
    });
  }

  @GMContext.API()
  public GM_listValues(): string[] {
    return Object.keys(this.scriptRes.value);
  }

  @GMContext.API()
  public ["GM.listValues"](): Promise<string[]> {
    // Asynchronous wrapper for GM_listValues to support GM.listValues
    return new Promise((resolve) => {
      const ret = Object.keys(this.scriptRes.value);
      resolve(ret);
    });
  }

  @GMContext.API()
  public GM_setValues(values: { [key: string]: any }) {
    if (values == null) {
      throw new Error("GM_setValues: values must not be null or undefined");
    }
    if (typeof values !== "object") {
      throw new Error("GM_setValues: values must be an object");
    }
    for (const key of Object.keys(values)) {
      const value = values[key];
      _GM_setValue(this, key, value);
    }
  }

  @GMContext.API()
  public GM_getValues(keysOrDefaults: { [key: string]: any } | string[] | null | undefined) {
    if (keysOrDefaults == null) {
      // Returns all values
      return this.scriptRes.value;
    }
    const result: { [key: string]: any } = {};
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
  public ["GM.getValues"](
    keysOrDefaults: { [key: string]: any } | string[] | null | undefined
  ): Promise<{ [key: string]: any }> {
    return new Promise((resolve) => {
      const ret = this.GM_getValues(keysOrDefaults);
      resolve(ret);
    });
  }

  @GMContext.API({ depend: ["GM_setValues"] })
  public ["GM.setValues"](values: { [key: string]: any }): Promise<void> {
    return new Promise((resolve) => {
      this.GM_setValues(values);
      resolve();
    });
  }

  @GMContext.API()
  public GM_deleteValues(keys: string[]) {
    if (!Array.isArray(keys)) {
      console.warn("GM_deleteValues: keys must be string[]");
      return;
    }
    for (const key of keys) {
      _GM_setValue(this, key, undefined);
    }
  }

  // Asynchronous wrapper for GM.deleteValues
  @GMContext.API({ depend: ["GM_deleteValues"] })
  public ["GM.deleteValues"](keys: string[]): Promise<void> {
    return new Promise((resolve) => {
      this.GM_deleteValues(keys);
      resolve();
    });
  }

  @GMContext.API({ alias: "GM.addValueChangeListener" })
  public GM_addValueChangeListener(name: string, listener: GMTypes.ValueChangeListener): number {
    this.eventId += 1;
    this.valueChangeListener.set(this.eventId, { name, listener });
    return this.eventId;
  }

  @GMContext.API({ alias: "GM.removeValueChangeListener" })
  public GM_removeValueChangeListener(listenerId: number): void {
    this.valueChangeListener.delete(listenerId);
  }

  @GMContext.API({ alias: "GM.log" })
  GM_log(message: string, level: GMTypes.LoggerLevel = "info", ...labels: GMTypes.LoggerLabel[]) {
    if (typeof message !== "string") {
      message = JSON.stringify(message);
    }
    const requestParams: any[] = [message, level];
    if (labels.length > 0) {
      requestParams.push(labels);
    }
    this.sendMessage("GM_log", requestParams);
  }

  @GMContext.API()
  public CAT_createBlobUrl(blob: Blob): Promise<string> {
    return this.sendMessage("CAT_createBlobUrl", [blob]);
  }

  // 辅助GM_xml获取blob数据
  @GMContext.API()
  public CAT_fetchBlob(url: string): Promise<Blob> {
    return this.sendMessage("CAT_fetchBlob", [url]);
  }

  @GMContext.API()
  public async CAT_fetchDocument(url: string): Promise<Document | undefined> {
    const nodeId = await this.sendMessage("CAT_fetchDocument", [url]);
    return (<CustomEventMessage>this.message).getAndDelRelatedTarget(nodeId) as Document;
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

  menuMap: Map<number, string> | undefined;

  @GMContext.API({ alias: "GM.registerMenuCommand" })
  GM_registerMenuCommand(
    name: string,
    listener: (inputValue?: any) => void,
    options_or_accessKey?: ScriptMenuItem["options"] | string
  ): number {
    if (!this.menuMap) {
      this.menuMap = new Map();
    }
    if (typeof options_or_accessKey === "object") {
      const option: ScriptMenuItem["options"] = options_or_accessKey;
      // 如果是对象，并且有id属性,则直接使用id
      if (option.id && this.menuMap.has(option.id)) {
        // 如果id存在,则直接使用
        this.EE.removeAllListeners("menuClick:" + option.id);
        this.EE.addListener("menuClick:" + option.id, listener);
        this.sendMessage("GM_registerMenuCommand", [option.id, name, option]);
        return option.id;
      }
    } else {
      options_or_accessKey = { accessKey: options_or_accessKey };
      let flag = 0;
      this.menuMap.forEach((val, menuId) => {
        if (val === name) {
          flag = menuId;
        }
      });
      if (flag) {
        return flag;
      }
    }
    this.eventId += 1;
    const id = this.eventId;
    options_or_accessKey.id = id;
    this.menuMap.set(id, name);
    this.EE.addListener("menuClick:" + id, listener);
    this.sendMessage("GM_registerMenuCommand", [id, name, options_or_accessKey]);
    return id;
  }

  @GMContext.API({
    depend: ["GM_registerMenuCommand"],
  })
  CAT_registerMenuInput(...args: Parameters<GMApi["GM_registerMenuCommand"]>): number {
    return this.GM_registerMenuCommand(...args);
  }

  @GMContext.API({ alias: "GM.addStyle" })
  GM_addStyle(css: string) {
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
  GM_addElement(parentNode: EventTarget | string, tagName: any, attrs?: any) {
    // 与content页的消息通讯实际是同步,此方法不需要经过background
    // 这里直接使用同步的方式去处理, 不要有promise
    let parentNodeId: any = parentNode;
    if (typeof parentNodeId !== "string") {
      const id = (<CustomEventMessage>this.message).sendRelatedTarget(parentNodeId);
      parentNodeId = id;
    } else {
      parentNodeId = null;
    }
    const resp = (<CustomEventMessage>this.message).syncSendMessage({
      action: `${this.prefix}/runtime/gmApi`,
      data: {
        uuid: this.scriptRes.uuid,
        api: "GM_addElement",
        params: [
          parentNodeId,
          typeof parentNode === "string" ? parentNode : tagName,
          typeof parentNode === "string" ? tagName : attrs,
        ],
      },
    });
    if (resp.code) {
      throw new Error(resp.message);
    }
    return (<CustomEventMessage>this.message).getAndDelRelatedTarget(resp.data);
  }

  @GMContext.API({ alias: "GM.unregisterMenuCommand" })
  GM_unregisterMenuCommand(id: number): void {
    if (!this.menuMap) {
      this.menuMap = new Map();
    }
    this.menuMap.delete(id);
    this.EE.removeAllListeners("menuClick:" + id);
    this.sendMessage("GM_unregisterMenuCommand", [id]);
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
    const sendDetails: { [key: string]: string } = {
      baseDir: details.baseDir || "",
      path: details.path || "",
      filename: details.filename,
      file: details.file,
    };
    if (action === "upload") {
      const url = await this.CAT_createBlobUrl(details.data);
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

  static _GM_xmlhttpRequest(a: GMApi, details: GMTypes.XHRDetails) {
    const u = new URL(details.url, window.location.href);
    const headers = details.headers;
    if (headers) {
      for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === "cookie") {
          details.cookie = headers[key];
          delete headers[key];
        }
      }
    }

    const param: GMSend.XHRDetails = {
      method: details.method,
      timeout: details.timeout,
      url: u.href,
      headers: details.headers,
      cookie: details.cookie,
      context: details.context,
      responseType: details.responseType,
      overrideMimeType: details.overrideMimeType,
      anonymous: details.anonymous,
      user: details.user,
      password: details.password,
      redirect: details.redirect,
    };
    if (!param.headers) {
      param.headers = {};
    }
    if (details.nocache) {
      param.headers["Cache-Control"] = "no-cache";
    }
    let connect: MessageConnect;
    const handler = async () => {
      // 处理数据
      if (details.data instanceof FormData) {
        // 处理FormData
        param.dataType = "FormData";
        const keys: { [key: string]: boolean } = {};
        details.data.forEach((val, key) => {
          keys[key] = true;
        });
        // 处理FormData中的数据
        const data = (await Promise.all(
          Object.keys(keys).flatMap((key) =>
            (<FormData>details.data).getAll(key).map((val) =>
              val instanceof File
                ? a.CAT_createBlobUrl(val).then(
                    (url) =>
                      ({
                        key,
                        type: "file",
                        val: url,
                        filename: val.name,
                      }) as GMSend.XHRFormData
                  )
                : ({
                    key,
                    type: "text",
                    val,
                  } as GMSend.XHRFormData)
            )
          )
        )) as GMSend.XHRFormData[];
        param.data = data;
      } else if (details.data instanceof Blob) {
        // 处理blob
        param.dataType = "Blob";
        param.data = await a.CAT_createBlobUrl(details.data);
      } else {
        param.data = details.data;
      }

      // 处理返回数据
      let readerStream: ReadableStream<Uint8Array> | undefined;
      let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
      // 如果返回类型是arraybuffer或者blob的情况下,需要将返回的数据转化为blob
      // 在background通过URL.createObjectURL转化为url,然后在content页读取url获取blob对象
      const responseType = details.responseType?.toLocaleLowerCase();
      const warpResponse = (old: (xhr: GMTypes.XHRResponse) => void) => {
        if (responseType === "stream") {
          readerStream = new ReadableStream<Uint8Array>({
            start(ctrl) {
              controller = ctrl;
            },
          });
        }
        return async (xhr: GMTypes.XHRResponse) => {
          if (xhr.response) {
            if (responseType === "document") {
              xhr.response = await a.CAT_fetchDocument(<string>xhr.response);
              xhr.responseXML = xhr.response;
              xhr.responseType = "document";
            } else {
              const resp = await a.CAT_fetchBlob(<string>xhr.response);
              if (responseType === "arraybuffer") {
                xhr.response = await resp.arrayBuffer();
              } else {
                xhr.response = resp;
              }
            }
          }
          if (responseType === "stream") {
            xhr.response = readerStream;
          }
          old(xhr);
        };
      };
      if (
        responseType === "arraybuffer" ||
        responseType === "blob" ||
        responseType === "document" ||
        responseType === "stream"
      ) {
        if (details.onload) {
          details.onload = warpResponse(details.onload);
        }
        if (details.onreadystatechange) {
          details.onreadystatechange = warpResponse(details.onreadystatechange);
        }
        if (details.onloadend) {
          details.onloadend = warpResponse(details.onloadend);
        }
        // document类型读取blob,然后在content页转化为document对象
        if (responseType === "document") {
          param.responseType = "blob";
        }
        if (responseType === "stream") {
          if (details.onloadstart) {
            details.onloadstart = warpResponse(details.onloadstart);
          }
        }
      }

      // 发送信息
      a.connect("GM_xmlhttpRequest", [param]).then((con) => {
        connect = con;
        con.onMessage((data) => {
          if (data.code === -1) {
            // 处理错误
            LoggerCore.logger().error("GM_xmlhttpRequest error", {
              code: data.code,
              message: data.message,
            });
            if (details.onerror) {
              details.onerror({
                readyState: 4,
                error: data.message || "unknown",
              });
            }
            return;
          }
          // 处理返回
          switch (data.action) {
            case "onload":
              details.onload?.(data.data);
              break;
            case "onloadend":
              details.onloadend?.(data.data);
              break;
            case "onloadstart":
              details.onloadstart?.(data.data);
              break;
            case "onprogress":
              details.onprogress?.(data.data);
              break;
            case "onreadystatechange":
              details.onreadystatechange && details.onreadystatechange(data.data);
              break;
            case "ontimeout":
              details.ontimeout?.();
              break;
            case "onerror":
              details.onerror?.(data.data);
              break;
            case "onabort":
              details.onabort?.();
              break;
            case "onstream":
              controller?.enqueue(new Uint8Array(data.data));
              break;
            default:
              LoggerCore.logger().warn("GM_xmlhttpRequest resp is error", {
                data,
              });
              break;
          }
        });
      });
    };
    // 由于需要同步返回一个abort，但是一些操作是异步的，所以需要在这里处理
    handler();
    return {
      abort: () => {
        if (connect) {
          connect.disconnect();
        }
      },
    };
  }

  // 用于脚本跨域请求,需要@connect domain指定允许的域名
  @GMContext.API({
    depend: ["CAT_fetchBlob", "CAT_createBlobUrl", "CAT_fetchDocument"],
  })
  public GM_xmlhttpRequest(details: GMTypes.XHRDetails) {
    return _GM_xmlhttpRequest(this, details);
  }

  @GMContext.API({ depend: ["CAT_fetchBlob", "CAT_createBlobUrl", "CAT_fetchDocument"] })
  public ["GM.xmlHttpRequest"](details: GMTypes.XHRDetails): Promise<GMTypes.XHRResponse> {
    let abort: { abort: () => void };
    const ret = new Promise<GMTypes.XHRResponse>((resolve, reject) => {
      const oldOnload = details.onload;
      details.onloadend = (xhr: GMTypes.XHRResponse) => {
        oldOnload && oldOnload(xhr);
        resolve(xhr);
      };
      const oldOnerror = details.onerror;
      details.onerror = (error: any) => {
        oldOnerror && oldOnerror(error);
        reject(error);
      };
      abort = _GM_xmlhttpRequest(this, details);
    });
    //@ts-ignore
    ret.abort = () => {
      abort && abort.abort && abort.abort();
    };
    return ret;
  }

  @GMContext.API({ alias: "GM.download" })
  GM_download(url: GMTypes.DownloadDetails | string, filename?: string): GMTypes.AbortHandle<void> {
    let details: GMTypes.DownloadDetails;
    if (typeof url === "string") {
      details = {
        name: filename || "",
        url,
      };
    } else {
      details = url;
    }
    let connect: MessageConnect;
    this.connect("GM_download", [
      {
        method: details.method,
        downloadMode: details.downloadMode || "native", // 默认使用xhr下载
        url: details.url,
        name: details.name,
        headers: details.headers,
        saveAs: details.saveAs,
        timeout: details.timeout,
        cookie: details.cookie,
        anonymous: details.anonymous,
      },
    ]).then((con) => {
      connect = con;
      connect.onMessage((data) => {
        switch (data.action) {
          case "onload":
            details.onload && details.onload(data.data);
            break;
          case "onprogress":
            details.onprogress && details.onprogress(<GMTypes.XHRProgress>data.data);
            break;
          case "ontimeout":
            details.ontimeout && details.ontimeout();
            break;
          case "onerror":
            details.onerror &&
              details.onerror({
                error: "unknown",
              });
            break;
          default:
            LoggerCore.logger().warn("GM_download resp is error", {
              data,
            });
            break;
        }
      });
    });

    return {
      abort: () => {
        connect?.disconnect();
      },
    };
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
      if (create) {
        create.apply({ id }, [id]);
      }
      if (typeof data.tag === "string") {
        notificationTagMap.set(data.tag, id);
      }
      let isPreventDefault = false;
      this.EE.addListener("GM_notification:" + id, (resp: NotificationMessageOption) => {
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
  public GM_openInTab(url: string, options?: GMTypes.OpenTabOptions | boolean): GMTypes.Tab {
    let option: GMTypes.OpenTabOptions = {};
    if (arguments.length === 1) {
      option.active = true;
    } else if (typeof options === "boolean") {
      option.active = !options;
    } else {
      option = <GMTypes.OpenTabOptions>options;
    }
    if (option.active === undefined) {
      option.active = true;
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

    this.sendMessage("GM_openInTab", [url, option]).then((id) => {
      if (id) {
        tabid = id;
        this.EE.addListener("GM_openInTab:" + id, (resp: any) => {
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
    return this.sendMessage("GM_closeInTab", [tabid]);
  }

  @GMContext.API()
  GM_getTab(callback: (data: any) => void) {
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
    if (typeof obj === "object") {
      obj = JSON.parse(JSON.stringify(obj));
    }
    this.sendMessage("GM_saveTab", [obj]);
  }

  @GMContext.API()
  GM_getTabs(callback: (objs: { [key: string | number]: object }) => any) {
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
  GM_setClipboard(data: string, info?: string | { type?: string; minetype?: string }, cb?: () => void) {
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
  ["GM.setClipboard"](data: string, info?: string | { type?: string; minetype?: string }) {
    return this.sendMessage("GM_setClipboard", [data, info]);
  }

  @GMContext.API()
  GM_getResourceText(name: string): string | undefined {
    if (!this.scriptRes.resource) {
      return undefined;
    }
    const r = this.scriptRes.resource[name];
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
    if (!this.scriptRes.resource) {
      return undefined;
    }
    const r = this.scriptRes.resource[name];
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

// 從 GM_Base 對象中解構出 createGMBase 函数並導出（可供其他模塊使用）
export const { createGMBase } = GM_Base;

// 從 GMApi 對象中解構出內部函數，用於後續本地使用，不導出
const { _GM_getValue, _GM_cookie, _GM_setValue, _GM_xmlhttpRequest } = GMApi;
