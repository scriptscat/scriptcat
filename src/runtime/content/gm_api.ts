/* eslint-disable camelcase */
/* eslint-disable max-classes-per-file */
import { ExtVersion } from "@App/app/const";
import LoggerCore from "@App/app/logger/core";
import { Channel, ChannelHandler } from "@App/app/message/channel";
import MessageContent from "@App/app/message/content";
import { MessageManager } from "@App/app/message/message";
import { ScriptRunResouce } from "@App/app/repo/scripts";
import {
  base64ToBlob,
  blobToBase64,
  getMetadataStr,
  getUserConfigStr,
  parseUserConfig,
} from "@App/pkg/utils/script";
import { v4 as uuidv4 } from "uuid";
import { ValueUpdateData } from "./exec_script";

interface ApiParam {
  depend?: string[];
  listener?: () => void;
}

export interface ApiValue {
  api: any;
  param: ApiParam;
}

export class GMContext {
  static apis: Map<string, ApiValue> = new Map();

  public static API(param: ApiParam = {}) {
    return (
      target: any,
      propertyName: string,
      descriptor: PropertyDescriptor
    ) => {
      const key = propertyName;
      if (param.listener) {
        param.listener();
      }
      if (key === "GMdotXmlHttpRequest") {
        GMContext.apis.set("GM.xmlHttpRequest", {
          api: descriptor.value,
          param,
        });
        return;
      }
      GMContext.apis.set(key, {
        api: descriptor.value,
        param,
      });
      // 兼容GM.*
      const dot = key.replace("_", ".");
      if (dot !== key) {
        // 特殊处理GM.xmlHttpRequest
        if (dot === "GM.xmlhttpRequest") {
          return;
        }
        GMContext.apis.set(dot, {
          api: descriptor.value,
          param,
        });
      }
    };
  }
}

export default class GMApi {
  scriptRes!: ScriptRunResouce;

  message!: MessageManager;

  runFlag!: string;

  valueChangeListener = new Map<
    number,
    { name: string; listener: GMTypes.ValueChangeListener }
  >();

  // 单次回调使用
  public sendMessage(api: string, params: any[]) {
    return this.message.syncSend("gmApi", {
      api,
      scriptId: this.scriptRes.id,
      params,
      runFlag: this.runFlag,
    });
  }

  // 长连接使用,connect只用于接受消息,不能发送消息
  public connect(api: string, params: any[], handler: ChannelHandler): Channel {
    const uuid = uuidv4();
    const channel = this.message.channel(uuid);
    channel.setHandler(handler);
    channel.channel("gmApiChannel", {
      api,
      scriptId: this.scriptRes.id,
      params,
      runFlag: this.runFlag,
    });
    return channel;
  }

  public valueUpdate(data: ValueUpdateData) {
    const { storagename } = this.scriptRes.metadata;
    if (
      data.value.scriptId === this.scriptRes.id ||
      (storagename &&
        data.value.storageName &&
        storagename[0] === data.value.storageName)
    ) {
      // 触发,并更新值
      if (data.value.value === undefined) {
        delete this.scriptRes.value[data.value.key];
      } else {
        this.scriptRes.value[data.value.key] = data.value;
      }
      this.valueChangeListener.forEach((item) => {
        if (item.name === data.value.key) {
          item.listener(
            data.value.key,
            data.oldValue,
            data.value.value,
            data.sender.runFlag !== this.runFlag,
            data.sender.tabId
          );
        }
      });
    }
  }

  // 获取脚本信息和管理器信息
  static GM_info(script: ScriptRunResouce) {
    const metadataStr = getMetadataStr(script.sourceCode);
    const userConfigStr = getUserConfigStr(script.sourceCode) || "";
    const options = {
      description:
        (script.metadata.description && script.metadata.description[0]) || null,
      matches: script.metadata.match || [],
      includes: script.metadata.include || [],
      "run-at":
        (script.metadata["run-at"] && script.metadata["run-at"][0]) ||
        "document-idle",
      icon: (script.metadata.icon && script.metadata.icon[0]) || null,
      icon64: (script.metadata.icon64 && script.metadata.icon64[0]) || null,
      header: metadataStr,
      grant: script.metadata.grant || [],
      connects: script.metadata.connect || [],
    };

    return {
      // downloadMode
      // isIncognito
      scriptWillUpdate: true,
      scriptHandler: "ScriptCat",
      scriptUpdateURL: script.downloadUrl,
      scriptMetaStr: metadataStr,
      userConfig: parseUserConfig(userConfigStr),
      userConfigStr,
      // scriptSource: script.sourceCode,
      version: ExtVersion,
      script: {
        // TODO: 更多完整的信息(为了兼容Tampermonkey,后续待定)
        name: script.name,
        namespace: script.namespace,
        version: script.metadata.version && script.metadata.version[0],
        author: script.author,
        ...options,
      },
    };
  }

  // 获取脚本的值,可以通过@storageName让多个脚本共享一个储存空间
  @GMContext.API()
  public GM_getValue(key: string, defaultValue?: any) {
    const ret = this.scriptRes.value[key];
    if (ret) {
      return ret.value;
    }
    return defaultValue;
  }

  @GMContext.API()
  public GM_setValue(key: string, value: any) {
    // 对object的value进行一次转化
    if (typeof value === "object") {
      value = JSON.parse(JSON.stringify(value));
    }
    let ret = this.scriptRes.value[key];
    if (ret) {
      ret.value = value;
    } else {
      ret = {
        id: 0,
        scriptId: this.scriptRes.id,
        storageName:
          (this.scriptRes.metadata.storagename &&
            this.scriptRes.metadata.storagename[0]) ||
          "",
        key,
        value,
        createtime: new Date().getTime(),
        updatetime: 0,
      };
    }
    if (value === undefined) {
      delete this.scriptRes.value[key];
    } else {
      this.scriptRes.value[key] = ret;
    }
    return this.sendMessage("GM_setValue", [key, value]);
  }

  @GMContext.API({ depend: ["GM_setValue"] })
  public GM_deleteValue(name: string): void {
    this.GM_setValue(name, undefined);
  }

  @GMContext.API()
  public GM_listValues(): string[] {
    return Object.keys(this.scriptRes.value);
  }

  @GMContext.API()
  public GM_addValueChangeListener(
    name: string,
    listener: GMTypes.ValueChangeListener
  ): number {
    const id = Math.random() * 10000000;
    this.valueChangeListener.set(id, { name, listener });
    return id;
  }

  @GMContext.API()
  public GM_removeValueChangeListener(listenerId: number): void {
    this.valueChangeListener.delete(listenerId);
  }

  // 辅助GM_xml获取blob数据
  @GMContext.API()
  public CAT_fetchBlob(url: string): Promise<Blob> {
    return this.message.syncSend("CAT_fetchBlob", url);
  }

  @GMContext.API()
  public CAT_fetchDocument(url: string): Promise<Document | undefined> {
    return new Promise((resolve) => {
      let el: Document | undefined;
      (<MessageContent>this.message).sendCallback(
        "CAT_fetchDocument",
        url,
        (resp) => {
          el = <Document>(
            (<unknown>(
              (<MessageContent>this.message).getAndDelRelatedTarget(
                resp.relatedTarget
              )
            ))
          );
          resolve(el);
        }
      );
    });
  }

  // 辅助GM_xml发送blob数据
  @GMContext.API()
  public CAT_createBlobUrl(blob: Blob): Promise<string> {
    return this.message.syncSend("CAT_createBlobUrl", blob);
  }

  // 用于脚本跨域请求,需要@connect domain指定允许的域名
  @GMContext.API({
    depend: [
      "CAT_fetchBlob",
      "CAT_createBlobUrl",
      "CAT_fetchDocument",
      "GM_xmlhttpRequest",
    ],
  })
  GMdotXmlHttpRequest(details: GMTypes.XHRDetails) {
    let abort: any;
    const ret = new Promise((resolve, reject) => {
      const oldOnload = details.onload;
      details.onload = (data) => {
        resolve(data);
        oldOnload && oldOnload(data);
      };
      const oldOnerror = details.onerror;
      details.onerror = (data) => {
        reject(data);
        oldOnerror && oldOnerror(data);
      };
      // @ts-ignore
      abort = this.GM_xmlhttpRequest(details);
    });
    if (abort && abort.abort) {
      // @ts-ignore
      ret.abort = abort.abort;
    }
    return ret;
  }

  // 用于脚本跨域请求,需要@connect domain指定允许的域名
  @GMContext.API({
    depend: ["CAT_fetchBlob", "CAT_createBlobUrl", "CAT_fetchDocument"],
  })
  public GM_xmlhttpRequest(details: GMTypes.XHRDetails) {
    let connect: Channel;

    const u = new URL(details.url, window.location.href);
    if (details.headers) {
      Object.keys(details.headers).forEach((key) => {
        if (key.toLowerCase() === "cookie") {
          details.cookie = details.headers![key];
          delete details.headers![key];
        }
      });
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
      maxRedirects: details.maxRedirects,
    };
    if (!param.headers) {
      param.headers = {};
    }
    if (details.nocache) {
      param.headers["Cache-Control"] = "no-cache";
    }

    const handler = async () => {
      if (details.data) {
        if (details.data instanceof FormData) {
          param.dataType = "FormData";
          const data: Array<GMSend.XHRFormData> = [];
          const keys: { [key: string]: boolean } = {};
          details.data.forEach((val, key) => {
            keys[key] = true;
          });
          const asyncArr = Object.keys(keys).map((key) => {
            const values = (<FormData>details.data).getAll(key);
            const asyncArr2 = values.map((val) => {
              return new Promise<void>((resolve) => {
                if (val instanceof File) {
                  blobToBase64(val).then((base64) => {
                    data.push({
                      key,
                      type: "file",
                      val: base64 || "",
                      filename: val.name,
                    });
                    resolve();
                  });
                } else {
                  data.push({
                    key,
                    type: "text",
                    val,
                  });
                  resolve();
                }
              });
            });
            return Promise.all(asyncArr2);
          });
          await Promise.all(asyncArr);
          param.data = data;
        } else if (details.data instanceof Blob) {
          param.dataType = "Blob";
          param.data = await this.CAT_createBlobUrl(details.data);
        } else {
          param.data = details.data;
        }
      }

      let readerStream: ReadableStream<Uint8Array> | undefined;
      // eslint-disable-next-line no-undef
      let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
      // 如果返回类型是arraybuffer或者blob的情况下,需要将返回的数据转化为blob
      // 在background通过URL.createObjectURL转化为url,然后在content页读取url获取blob对象
      const responseType = details.responseType?.toLocaleLowerCase();
      const warpResponse = (old: Function) => {
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
              xhr.response = await this.CAT_fetchDocument(<string>xhr.response);
              xhr.responseXML = xhr.response;
              xhr.responseType = "document";
            } else {
              const resp = await this.CAT_fetchBlob(<string>xhr.response);
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

      connect = this.connect("GM_xmlhttpRequest", [param], (resp: any) => {
        const data = <GMTypes.XHRResponse>resp.data || {};
        switch (resp.event) {
          case "onload":
            details.onload && details.onload(data);
            break;
          case "onloadend":
            details.onloadend && details.onloadend(data);
            if (readerStream) {
              controller?.close();
            }
            break;
          case "onloadstart":
            details.onloadstart && details.onloadstart(data);
            break;
          case "onprogress":
            details.onprogress && details.onprogress(<GMTypes.XHRProgress>data);
            break;
          case "onreadystatechange":
            details.onreadystatechange && details.onreadystatechange(data);
            break;
          case "ontimeout":
            details.ontimeout && details.ontimeout();
            break;
          case "onerror":
            details.onerror && details.onerror("");
            break;
          case "onabort":
            details.onabort && details.onabort();
            break;
          case "onstream":
            controller?.enqueue(new Uint8Array(resp.data));
            break;
          default:
            LoggerCore.getLogger().warn("GM_xmlhttpRequest resp is error", {
              resp,
            });
            break;
        }
      });
      connect.setCatch((err) => {
        details.onerror && details.onerror(err);
      });
    };
    handler();

    return {
      abort: () => {
        if (connect) {
          connect.disChannel();
        }
      },
    };
  }

  @GMContext.API()
  public async GM_notification(
    detail: GMTypes.NotificationDetails | string,
    ondone?: GMTypes.NotificationOnDone | string,
    image?: string,
    onclick?: GMTypes.NotificationOnClick
  ) {
    let data: GMTypes.NotificationDetails = {};
    if (typeof detail === "string") {
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
      data = detail;
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
    this.connect("GM_notification", [data], (resp: any) => {
      switch (resp.event) {
        case "click": {
          click && click.apply({ id: resp.id }, [resp.id, resp.index]);
          break;
        }
        case "done": {
          done && done.apply({ id: resp.id }, [resp.user]);
          break;
        }
        case "create": {
          create && create.apply({ id: resp.id }, [resp.id]);
          break;
        }
        default:
          LoggerCore.getLogger().warn("GM_notification resp is error", {
            resp,
          });
          break;
      }
    });
  }

  @GMContext.API()
  public GM_closeNotification(id: string) {
    this.sendMessage("GM_closeNotification", [id]);
  }

  @GMContext.API()
  public GM_updateNotification(
    id: string,
    details: GMTypes.NotificationDetails
  ): void {
    this.sendMessage("GM_updateNotification", [id, details]);
  }

  @GMContext.API()
  GM_log(
    message: string,
    level?: GMTypes.LoggerLevel,
    labels?: GMTypes.LoggerLabel
  ) {
    if (typeof message !== "string") {
      message = JSON.stringify(message);
    }
    return this.sendMessage("GM_log", [message, level, labels]);
  }

  @GMContext.API({ depend: ["GM_closeInTab"] })
  public GM_openInTab(
    url: string,
    options?: GMTypes.OpenTabOptions | boolean
  ): GMTypes.Tab {
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
        this.GM_closeInTab(tabid);
      },
    };

    const connect = this.connect("GM_openInTab", [url, option], (data) => {
      switch (data.event) {
        case "oncreate":
          tabid = data.tabId;
          break;
        case "onclose":
          ret.onclose && ret.onclose();
          ret.closed = true;
          connect.disChannel();
          break;
        default:
          break;
      }
    });
    return ret;
  }

  @GMContext.API()
  public GM_closeInTab(tabid: string) {
    return this.sendMessage("GM_closeInTab", [tabid]);
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

  @GMContext.API()
  GM_getResourceURL(name: string, isBlobUrl?: boolean): string | undefined {
    if (!this.scriptRes.resource) {
      return undefined;
    }
    const r = this.scriptRes.resource[name];
    if (r) {
      if (isBlobUrl) {
        return URL.createObjectURL(base64ToBlob(r.base64));
      }
      return r.base64;
    }
    return undefined;
  }

  @GMContext.API()
  GM_addStyle(css: string) {
    let el: Element | undefined;
    // 与content页的消息通讯实际是同步,此方法不需要经过background
    // 所以可以直接在then中赋值el再返回
    (<MessageContent>this.message).sendCallback(
      "GM_addElement",
      {
        param: [
          "style",
          {
            textContent: css,
          },
        ],
      },
      (resp) => {
        el = (<MessageContent>this.message).getAndDelRelatedTarget(
          resp.relatedTarget
        );
      }
    );
    return el;
  }

  @GMContext.API()
  async GM_getTab(callback: (data: any) => void) {
    const resp = await this.sendMessage("GM_getTab", []);
    callback(resp);
  }

  @GMContext.API()
  GM_saveTab(obj: object) {
    if (typeof obj === "object") {
      obj = JSON.parse(JSON.stringify(obj));
    }
    return this.sendMessage("GM_saveTab", [obj]);
  }

  @GMContext.API()
  async GM_getTabs(
    callback: (objs: { [key: string | number]: object }) => any
  ) {
    const resp = await this.sendMessage("GM_getTabs", []);
    callback(resp);
  }

  @GMContext.API()
  GM_download(
    url: GMTypes.DownloadDetails | string,
    filename?: string
  ): GMTypes.AbortHandle<void> {
    let details: GMTypes.DownloadDetails;
    if (typeof url === "string") {
      details = {
        name: filename || "",
        url,
      };
    } else {
      details = url;
    }
    const connect = this.connect(
      "GM_download",
      [
        {
          method: details.method,
          url: details.url,
          name: details.name,
          headers: details.headers,
          saveAs: details.saveAs,
          timeout: details.timeout,
          cookie: details.cookie,
          anonymous: details.anonymous,
        },
      ],
      (resp: any) => {
        const data = <GMTypes.XHRResponse>resp.data || {};
        switch (resp.event) {
          case "onload":
            details.onload && details.onload(data);
            break;
          case "onprogress":
            details.onprogress && details.onprogress(<GMTypes.XHRProgress>data);
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
            LoggerCore.getLogger().warn("GM_download resp is error", {
              resp,
            });
            break;
        }
      }
    );

    return {
      abort: () => {
        connect.disChannel();
      },
    };
  }

  @GMContext.API()
  GM_setClipboard(
    data: string,
    info?: string | { type?: string; minetype?: string }
  ) {
    return this.sendMessage("GM_setClipboard", [data, info]);
  }

  @GMContext.API()
  GM_cookie(
    action: string,
    details: GMTypes.CookieDetails,
    done: (cookie: GMTypes.Cookie[] | any, error: any | undefined) => void
  ) {
    this.sendMessage("GM_cookie", [action, details])
      .then((resp: any) => {
        done && done(resp, undefined);
      })
      .catch((err) => {
        done && done(undefined, err);
      });
  }

  menuId: number | undefined;

  menuMap: Map<number, string> | undefined;

  @GMContext.API()
  GM_registerMenuCommand(
    name: string,
    listener: () => void,
    accessKey?: string
  ): number {
    if (!this.menuMap) {
      this.menuMap = new Map();
    }
    let flag = 0;
    this.menuMap.forEach((val, key) => {
      if (val === name) {
        flag = key;
      }
    });
    if (flag) {
      return flag;
    }
    if (!this.menuId) {
      this.menuId = 1;
    } else {
      this.menuId += 1;
    }
    const id = this.menuId;
    this.connect("GM_registerMenuCommand", [id, name, accessKey], () => {
      listener();
    });
    this.menuMap.set(id, name);
    return id;
  }

  @GMContext.API()
  GM_unregisterMenuCommand(id: number): void {
    if (!this.menuMap) {
      this.menuMap = new Map();
    }
    this.menuMap.delete(id);
    this.sendMessage("GM_unregisterMenuCommand", [id]);
  }

  @GMContext.API()
  CAT_userConfig() {
    return this.sendMessage("CAT_userConfig", []);
  }

  // 此API在content页实现
  @GMContext.API()
  GM_addElement(parentNode: Element | string, tagName: any, attrs?: any) {
    let el: Element | undefined;
    // 与content页的消息通讯实际是同步,此方法不需要经过background
    // 所以可以直接在then中赋值el再返回
    (<MessageContent>this.message).sendCallback(
      "GM_addElement",
      {
        param: [
          typeof parentNode === "string" ? parentNode : tagName,
          typeof parentNode === "string" ? tagName : attrs,
        ],
        relatedTarget: typeof parentNode === "string" ? null : parentNode,
      },
      (resp) => {
        el = (<MessageContent>this.message).getAndDelRelatedTarget(
          resp.relatedTarget
        );
      }
    );
    return el;
  }

  @GMContext.API({
    depend: ["CAT_fetchBlob", "CAT_createBlobUrl"],
  })
  async CAT_fileStorage(
    action: "list" | "download" | "upload" | "delete" | "config",
    details: any
  ) {
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
    const channel = this.connect(
      "CAT_fileStorage",
      [action, sendDetails],
      async (resp: any) => {
        if (action === "download") {
          // 读取blob
          const blob = await this.CAT_fetchBlob(resp.data);
          details.onload && details.onload(blob);
        } else {
          details.onload && details.onload(resp.data);
        }
      }
    );
    channel.setCatch((err) => {
      if (typeof err.code === "undefined") {
        details.onerror && details.onerror({ code: -1, message: err.message });
        return;
      }
      details.onerror && details.onerror(err);
    });
  }
}
