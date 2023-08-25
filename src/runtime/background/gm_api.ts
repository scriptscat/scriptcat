/* eslint-disable camelcase */
import Cache from "@App/app/cache";
import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import { Channel } from "@App/app/message/channel";
import { MessageHander, MessageSender } from "@App/app/message/message";
import { Script, ScriptDAO } from "@App/app/repo/scripts";
import ValueManager from "@App/app/service/value/manager";
import CacheKey from "@App/pkg/utils/cache_key";
import { v4 as uuidv4 } from "uuid";
import { base64ToBlob } from "@App/pkg/utils/script";
import { isFirefox } from "@App/pkg/utils/utils";
import Hook from "@App/app/service/hook";
import IoC from "@App/app/ioc";
import { SystemConfig } from "@App/pkg/config/config";
import FileSystemFactory from "@Pkg/filesystem/factory";
import FileSystem from "@Pkg/filesystem/filesystem";
import { joinPath } from "@Pkg/filesystem/utils";
import i18next from "i18next";
import { i18nName } from "@App/locales/locales";
import { isWarpTokenError } from "@Pkg/filesystem/error";
import PermissionVerify, {
  ConfirmParam,
  IPermissionVerify,
} from "./permission_verify";
import {
  dealFetch,
  dealXhr,
  getFetchHeader,
  getIcon,
  listenerWebRequest,
  setXhrHeader,
} from "./utils";

// GMApi,处理脚本的GM API调用请求

export type MessageRequest = {
  scriptId: number; // 脚本id
  api: string;
  runFlag: string;
  params: any[];
};

export type Request = MessageRequest & {
  script: Script;
  sender: MessageSender;
};

export type Api = (request: Request, connect?: Channel) => Promise<any>;

export default class GMApi {
  message: MessageHander;

  script: ScriptDAO;

  permissionVerify: IPermissionVerify;

  valueManager: ValueManager;

  logger: Logger = LoggerCore.getLogger({ component: "GMApi" });

  static hook: Hook<"registerMenu" | "unregisterMenu"> = new Hook();

  systemConfig: SystemConfig;

  constructor(message: MessageHander, permissionVerify: IPermissionVerify) {
    this.message = message;
    this.script = new ScriptDAO();
    this.permissionVerify = permissionVerify;
    this.systemConfig = IoC.instance(SystemConfig) as SystemConfig;
    // 证明是后台运行的,生成一个随机的headerFlag
    if (permissionVerify instanceof PermissionVerify) {
      this.systemConfig.scriptCatFlag = `x-cat-${uuidv4()}`;
    }
    this.valueManager = IoC.instance(ValueManager);
  }

  start() {
    this.message.setHandler(
      "gmApi",
      async (_action: string, data: MessageRequest, sender: MessageSender) => {
        const api = PermissionVerify.apis.get(data.api);
        if (!api) {
          return Promise.reject(new Error("api is not found"));
        }
        const req = await this.parseRequest(data, sender);
        try {
          await this.permissionVerify.verify(req, api);
        } catch (e) {
          this.logger.error("verify error", { api: data.api }, Logger.E(e));
          return Promise.reject(e);
        }
        return api.api.call(this, req);
      }
    );
    this.message.setHandlerWithChannel(
      "gmApiChannel",
      async (
        connect: Channel,
        _action: string,
        data: MessageRequest,
        sender: MessageSender
      ) => {
        const api = PermissionVerify.apis.get(data.api);
        if (!api) {
          return connect.throw("api is not found");
        }
        const req = await this.parseRequest(data, sender);
        try {
          await this.permissionVerify.verify(req, api);
        } catch (e: any) {
          this.logger.error("verify error", { api: data.api }, Logger.E(e));
          return connect.throw(e.message);
        }
        return api.api.call(this, req, connect);
      }
    );
    // 只有background页才监听web请求
    if (this.permissionVerify instanceof PermissionVerify) {
      listenerWebRequest(this.systemConfig.scriptCatFlag);
    }
    // 处理sandbox来的CAT_fetchBlob和CAT_createBlobUrl
    this.message.setHandler("CAT_createBlobUrl", (_: string, blob: Blob) => {
      const url = URL.createObjectURL(blob);
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 60 * 1000);
      return Promise.resolve(url);
    });
    this.message.setHandler("CAT_fetchBlob", (_: string, url: string) => {
      return fetch(url).then((data) => data.blob());
    });
  }

  // 解析请求
  async parseRequest(
    data: MessageRequest,
    sender: MessageSender
  ): Promise<Request> {
    const script = await Cache.getInstance().getOrSet(
      CacheKey.script(data.scriptId),
      () => {
        return this.script.findById(data.scriptId);
      }
    );
    if (!script) {
      return Promise.reject(new Error("script is not found"));
    }
    const req: Request = <Request>data;
    req.script = script;
    req.sender = sender;
    return Promise.resolve(req);
  }

  @PermissionVerify.API()
  GM_setValue(request: Request): Promise<any> {
    if (!request.params || request.params.length !== 2) {
      return Promise.reject(new Error("param is failed"));
    }
    const [key, value] = request.params;
    const sender = <MessageSender & { runFlag: string }>request.sender;
    sender.runFlag = request.runFlag;
    return this.valueManager.setValue(request.script, key, value, sender);
  }

  // 处理GM_xmlhttpRequest fetch的情况,先只处理ReadableStream的情况
  // 且不考虑复杂的情况
  CAT_fetch(request: Request, channel: Channel): Promise<any> {
    const config = <GMSend.XHRDetails>request.params[0];
    const { url } = config;
    return fetch(url, {
      method: config.method || "GET",
      body: <any>config.data,
      headers: getFetchHeader(this.systemConfig.scriptCatFlag, config),
    })
      .then((resp) => {
        const send = dealFetch(
          this.systemConfig.scriptCatFlag,
          config,
          resp,
          1
        );
        const reader = resp.body?.getReader();
        if (!reader) {
          throw new Error("read is not found");
        }
        const { scriptCatFlag } = this.systemConfig;
        reader.read().then(function read({ done, value }) {
          if (done) {
            const data = dealFetch(scriptCatFlag, config, resp, 4);
            channel.send({ event: "onreadystatechange", data });
            channel.send({ event: "onload", data });
            channel.send({ event: "onloadend", data });
            channel.disChannel();
          } else {
            channel.send({ event: "onstream", data: Array.from(value) });
            reader.read().then(read);
          }
        });
        channel.send({ event: "onloadstart", data: send });
        send.readyState = 2;
        channel.send({ event: "onreadystatechange", data: send });
      })
      .catch((e) => {
        channel.throw(e);
      });
  }

  @PermissionVerify.API({
    confirm: (request: Request) => {
      const config = <GMSend.XHRDetails>request.params[0];
      const url = new URL(config.url);
      if (request.script.metadata.connect) {
        const { connect } = request.script.metadata;
        for (let i = 0; i < connect.length; i += 1) {
          if (url.hostname.endsWith(connect[i])) {
            return Promise.resolve(true);
          }
        }
      }
      const metadata: { [key: string]: string } = {};
      metadata[i18next.t("script_name")] = i18nName(request.script);
      metadata[i18next.t("request_domain")] = url.hostname;
      metadata[i18next.t("request_url")] = config.url;

      return Promise.resolve({
        permission: "cors",
        permissionValue: url.hostname,
        title: i18next.t("script_accessing_cross_origin_resource"),
        metadata,
        describe: i18next.t("confirm_operation_description"),
        wildcard: true,
        permissionContent: i18next.t("domain"),
      } as ConfirmParam);
    },
    alias: ["GM.xmlHttpRequest"],
  })
  async GM_xmlhttpRequest(request: Request, channel: Channel): Promise<any> {
    const config = <GMSend.XHRDetails>request.params[0];
    if (config.responseType === "stream") {
      // 只有fetch支持ReadableStream
      return this.CAT_fetch(request, channel);
    }
    const xhr = new XMLHttpRequest();
    xhr.open(
      config.method || "GET",
      config.url,
      true,
      config.user || "",
      config.password || ""
    );
    if (config.overrideMimeType) {
      xhr.overrideMimeType(config.overrideMimeType);
    }
    if (config.responseType !== "json") {
      xhr.responseType = config.responseType || "";
    }

    const deal = async (event: string, data?: any) => {
      const response: any = await dealXhr(
        this.systemConfig.scriptCatFlag,
        config,
        xhr
      );
      if (data) {
        Object.keys(data).forEach((key) => {
          response[key] = data[key];
        });
      }
      channel.send({ event, data: response });
      if (event === "onload") {
        channel.disChannel();
      }
    };
    xhr.onload = () => {
      deal("onload");
    };
    xhr.onloadstart = () => {
      deal("onloadstart");
    };
    xhr.onloadend = () => {
      deal("onloadstart");
    };
    xhr.onabort = () => {
      deal("onabort");
    };
    xhr.onerror = () => {
      deal("onerror");
    };
    xhr.onprogress = (event) => {
      const respond: GMTypes.XHRProgress = {
        done: xhr.DONE,
        lengthComputable: event.lengthComputable,
        loaded: event.loaded,
        total: event.total,
        totalSize: event.total,
      };
      deal("onprogress", respond);
    };
    xhr.onreadystatechange = () => {
      deal("onreadystatechange");
    };
    xhr.ontimeout = () => {
      channel.send({ event: "ontimeout" });
    };
    setXhrHeader(this.systemConfig.scriptCatFlag, config, xhr);

    if (config.timeout) {
      xhr.timeout = config.timeout;
    }

    if (config.overrideMimeType) {
      xhr.overrideMimeType(config.overrideMimeType);
    }

    if (config.dataType === "FormData") {
      const data = new FormData();
      if (config.data && config.data instanceof Array) {
        config.data.forEach((val: GMSend.XHRFormData) => {
          if (val.type === "file") {
            data.append(val.key, base64ToBlob(val.val), val.filename);
          } else {
            data.append(val.key, val.val);
          }
        });
        xhr.send(data);
      }
    } else if (config.dataType === "Blob") {
      if (!config.data) {
        return channel.throw("data is null");
      }
      const resp = await (await fetch(<string>config.data)).blob();
      xhr.send(resp);
    } else {
      xhr.send(<string>config.data);
    }

    channel.setDisChannelHandler(() => {
      xhr.abort();
    });
    return Promise.resolve();
  }

  @PermissionVerify.API({
    listener() {
      chrome.notifications.onClosed.addListener((id, user) => {
        const ret = Cache.getInstance().get(`GM_notification:${id}`);
        if (ret) {
          const channel = <Channel>ret;
          channel.send({ event: "done", id, user });
          channel.disChannel();
          Cache.getInstance().del(`GM_notification:${id}`);
        }
      });
      chrome.notifications.onClicked.addListener((id) => {
        const ret = Cache.getInstance().get(`GM_notification:${id}`);
        if (ret) {
          const channel = <Channel>ret;
          channel.send({ event: "click", id, index: undefined });
          channel.send({ event: "done", id, user: true });
          channel.disChannel();
          Cache.getInstance().del(`GM_notification:${id}`);
        }
      });
      chrome.notifications.onButtonClicked.addListener((id, buttonIndex) => {
        const ret = Cache.getInstance().get(`GM_notification:${id}`);
        if (ret) {
          const channel = <Channel>ret;
          channel.send({ event: "click", id, index: buttonIndex });
          channel.send({ event: "done", id, user: true });
          channel.disChannel();
          Cache.getInstance().del(`GM_notification:${id}`);
        }
      });
    },
  })
  GM_notification(request: Request, channel: Channel): any {
    if (request.params.length === 0) {
      return channel.throw("param is failed");
    }
    const details: GMTypes.NotificationDetails = request.params[0];
    const options: chrome.notifications.NotificationOptions<true> = {
      title: details.title || "ScriptCat",
      message: details.text || "无消息内容",
      iconUrl:
        details.image ||
        getIcon(request.script) ||
        chrome.runtime.getURL("assets/logo.png"),
      type:
        isFirefox() || details.progress === undefined ? "basic" : "progress",
    };
    if (!isFirefox()) {
      options.silent = details.silent;
      options.buttons = details.buttons;
    }

    chrome.notifications.create(options, (notificationId) => {
      Cache.getInstance().set(`GM_notification:${notificationId}`, channel);
      channel.send({ event: "create", id: notificationId });
      if (details.timeout) {
        setTimeout(() => {
          chrome.notifications.clear(notificationId);
          channel.send({ event: "done", id: notificationId, user: false });
          channel.disChannel();
          Cache.getInstance().del(`GM_notification:${notificationId}`);
        }, details.timeout);
      }
    });

    return true;
  }

  @PermissionVerify.API()
  GM_closeNotification(request: Request): Promise<boolean> {
    chrome.notifications.clear(<string>request.params[0]);
    const ret = Cache.getInstance().get(
      `GM_notification:${<string>request.params[0]}`
    );
    if (ret) {
      const channel = <Channel>ret;
      channel.send({ event: "done", id: request.params[0], user: false });
      Cache.getInstance().del(`GM_notification:${<string>request.params[0]}`);
    }
    return Promise.resolve(true);
  }

  @PermissionVerify.API()
  GM_updateNotification(request: Request): Promise<boolean> {
    if (isFirefox()) {
      return Promise.reject(new Error("firefox does not support this method"));
    }
    const id = request.params[0];
    const details: GMTypes.NotificationDetails = request.params[1];
    const options: chrome.notifications.NotificationOptions = {
      title: details.title,
      message: details.text,
      iconUrl: details.image,
      type: details.progress === undefined ? "basic" : "progress",
      silent: details.silent,
      progress: details.progress,
    };
    chrome.notifications.update(<string>id, options);
    return Promise.resolve(true);
  }

  @PermissionVerify.API()
  GM_log(request: Request): Promise<boolean> {
    const message = request.params[0];
    const level = request.params[1] || "info";
    const labels = request.params[2] || {};
    LoggerCore.getLogger(labels).log(level, message, {
      scriptId: request.scriptId,
      component: "GM_log",
    });
    return Promise.resolve(true);
  }

  @PermissionVerify.API({
    listener: () => {
      chrome.tabs.onRemoved.addListener((tabId) => {
        const channel = <Channel>(
          Cache.getInstance().get(`GM_openInTab:${tabId}`)
        );
        if (channel) {
          channel.send({ event: "onclose" });
          channel.disChannel();
          Cache.getInstance().del(`GM_openInTab:${tabId}`);
        }
      });
    },
  })
  GM_openInTab(request: Request, channel: Channel) {
    const url = request.params[0];
    const options = request.params[1] || {};
    if (options.useOpen === true) {
      const newWindow = window.open(url);
      if (newWindow) {
        // 由于不符合同源策略无法直接监听newWindow关闭事件，因此改用CDP方法监听
        // 由于window.open强制在前台打开标签，因此获取状态为{ active:true }的标签即为新标签
        chrome.tabs.query({ active: true }, ([tab]) => {
          Cache.getInstance().set(`GM_openInTab:${tab.id}`, channel);
          channel.send({ event: "oncreate", tabId: tab.id });
        });
      } else {
        // 当新tab被浏览器阻止时window.open()会返回null 视为已经关闭
        // 似乎在Firefox中禁止在background页面使用window.open()，强制返回null
        channel.send({ event: "onclose" });
        channel.disChannel();
      }
    } else {
      chrome.tabs.create({ url, active: options.active }, (tab) => {
        Cache.getInstance().set(`GM_openInTab:${tab.id}`, channel);
        channel.send({ event: "oncreate", tabId: tab.id });
      });
    }
  }

  @PermissionVerify.API({
    link: "GM_openInTab",
  })
  async GM_closeInTab(request: Request): Promise<boolean> {
    try {
      await chrome.tabs.remove(<number>request.params[0]);
    } catch (e) {
      this.logger.error("GM_closeInTab", Logger.E(e));
    }
    return Promise.resolve(true);
  }

  static tabData = new Map<number, Map<number | string, any>>();

  @PermissionVerify.API({
    listener: () => {
      chrome.tabs.onRemoved.addListener((tabId) => {
        GMApi.tabData.forEach((value) => {
          value.forEach((v, tabIdKey) => {
            if (tabIdKey === tabId) {
              value.delete(tabIdKey);
            }
          });
        });
      });
    },
  })
  GM_getTab(request: Request) {
    return Promise.resolve(
      GMApi.tabData
        .get(request.scriptId)
        ?.get(request.sender.tabId || request.sender.targetTag)
    );
  }

  @PermissionVerify.API()
  GM_saveTab(request: Request) {
    const data = request.params[0];
    const tabId = request.sender.tabId || request.sender.targetTag;
    if (!GMApi.tabData.has(request.scriptId)) {
      GMApi.tabData.set(request.scriptId, new Map());
    }
    GMApi.tabData.get(request.scriptId)?.set(tabId, data);
    return Promise.resolve(true);
  }

  @PermissionVerify.API()
  GM_getTabs(request: Request) {
    if (!GMApi.tabData.has(request.scriptId)) {
      return Promise.resolve({});
    }
    const resp: { [key: string | number]: object } = {};
    GMApi.tabData.get(request.scriptId)?.forEach((value, key) => {
      resp[key] = value;
    });
    return Promise.resolve(resp);
  }

  @PermissionVerify.API()
  GM_download(request: Request, channel: Channel) {
    const config = <GMTypes.DownloadDetails>request.params[0];
    // blob本地文件直接下载
    if (config.url.startsWith("blob:")) {
      chrome.downloads.download(
        {
          url: config.url,
          saveAs: config.saveAs,
          filename: config.name,
        },
        () => {
          channel.send({ event: "onload" });
        }
      );
      return;
    }
    // 使用ajax下载blob,再使用download api创建下载
    const xhr = new XMLHttpRequest();
    xhr.open(config.method || "GET", config.url, true);
    xhr.responseType = "blob";
    const deal = (event: string, data?: any) => {
      const removeXCat = new RegExp(`${this.systemConfig.scriptCatFlag}-`, "g");
      const respond: any = {
        finalUrl: xhr.responseURL || config.url,
        readyState: <any>xhr.readyState,
        status: xhr.status,
        statusText: xhr.statusText,
        responseHeaders: xhr.getAllResponseHeaders().replace(removeXCat, ""),
      };
      if (data) {
        Object.keys(data).forEach((key) => {
          respond[key] = data[key];
        });
      }
      channel.send({ event, data: respond });
    };
    xhr.onload = () => {
      deal("onload");
      const url = URL.createObjectURL(xhr.response);
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 6000);
      chrome.downloads.download({
        url,
        saveAs: config.saveAs,
        filename: config.name,
      });
    };
    xhr.onerror = () => {
      deal("onerror");
    };
    xhr.onprogress = (event) => {
      const respond: GMTypes.XHRProgress = {
        done: xhr.DONE,
        lengthComputable: event.lengthComputable,
        loaded: event.loaded,
        total: event.total,
        totalSize: event.total,
      };
      deal("onprogress", respond);
    };
    xhr.ontimeout = () => {
      channel.send({ event: "ontimeout" });
    };
    setXhrHeader(this.systemConfig.scriptCatFlag, config, xhr);

    if (config.timeout) {
      xhr.timeout = config.timeout;
    }

    xhr.send();
    channel.setDisChannelHandler(() => {
      xhr.abort();
    });
  }

  static clipboardData: { type?: string; data: string } | undefined;

  @PermissionVerify.API({
    listener() {
      PermissionVerify.textarea.style.display = "none";
      document.documentElement.appendChild(PermissionVerify.textarea);
      document.addEventListener("copy", (e: ClipboardEvent) => {
        if (!GMApi.clipboardData || !e.clipboardData) {
          return;
        }
        e.preventDefault();
        const { type, data } = GMApi.clipboardData;
        e.clipboardData.setData(type || "text/plain", data);
        GMApi.clipboardData = undefined;
      });
    },
  })
  GM_setClipboard(request: Request) {
    return new Promise((resolve) => {
      GMApi.clipboardData = {
        type: request.params[1],
        data: request.params[0],
      };
      PermissionVerify.textarea.focus();
      document.execCommand("copy", false, <any>null);
      resolve(undefined);
    });
  }

  @PermissionVerify.API({
    confirm(request: Request) {
      if (request.params[0] === "store") {
        return Promise.resolve(true);
      }
      const detail = <GMTypes.CookieDetails>request.params[1];
      if (!detail.url && !detail.domain) {
        return Promise.reject(new Error("there must be one of url or domain"));
      }
      let url: URL = <URL>{};
      if (detail.url) {
        url = new URL(detail.url);
      } else {
        url.host = detail.domain || "";
        url.hostname = detail.domain || "";
      }
      let flag = false;
      if (request.script.metadata.connect) {
        const { connect } = request.script.metadata;
        for (let i = 0; i < connect.length; i += 1) {
          if (url.hostname.endsWith(connect[i])) {
            flag = true;
            break;
          }
        }
      }
      if (!flag) {
        return Promise.reject(
          new Error("hostname must be in the definition of connect")
        );
      }
      const metadata: { [key: string]: string } = {};
      metadata[i18next.t("script_name")] = i18nName(request.script);
      metadata[i18next.t("request_domain")] = url.host;
      return Promise.resolve({
        permission: "cookie",
        permissionValue: url.host,
        title: i18next.t("access_cookie_content")!,
        metadata,
        describe: i18next.t("confirm_script_operation")!,
        permissionContent: i18next.t("cookie_domain")!,
        uuid: "",
      });
    },
  })
  GM_cookie(request: Request) {
    return new Promise((resolve, reject) => {
      const param = request.params;
      if (param.length !== 2) {
        reject(new Error("there must be two parameters"));
        return;
      }
      const detail = <GMTypes.CookieDetails>request.params[1];
      if (param[0] === "store") {
        chrome.cookies.getAllCookieStores((res) => {
          const data: any[] = [];
          res.forEach((val) => {
            if (detail.tabId) {
              for (let n = 0; n < val.tabIds.length; n += 1) {
                if (val.tabIds[n] === detail.tabId) {
                  data.push({ storeId: val.id });
                  break;
                }
              }
            } else {
              data.push({ storeId: val.id });
            }
          });
          resolve(data);
        });
        return;
      }
      // url或者域名不能为空
      if (detail.url) {
        detail.url = detail.url.trim();
      }
      if (detail.domain) {
        detail.domain = detail.domain.trim();
      }
      if (!detail.url && !detail.domain) {
        reject(new Error("there must be one of url or domain"));
        return;
      }
      switch (param[0]) {
        case "list": {
          chrome.cookies.getAll(
            {
              domain: detail.domain,
              name: detail.name,
              path: detail.path,
              secure: detail.secure,
              session: detail.session,
              url: detail.url,
              storeId: detail.storeId,
            },
            (cookies) => {
              resolve(cookies);
            }
          );
          break;
        }
        case "delete": {
          if (!detail.url || !detail.name) {
            reject(new Error("delete operation must have url and name"));
            return;
          }
          chrome.cookies.remove(
            {
              name: detail.name,
              url: detail.url,
              storeId: detail.storeId,
            },
            () => {
              resolve(undefined);
            }
          );
          break;
        }
        case "set": {
          if (!detail.url || !detail.name) {
            reject(new Error("set operation must have name and value"));
            return;
          }
          chrome.cookies.set(
            {
              url: detail.url,
              name: detail.name,
              domain: detail.domain,
              value: detail.value,
              expirationDate: detail.expirationDate,
              path: detail.path,
              httpOnly: detail.httpOnly,
              secure: detail.secure,
              storeId: detail.storeId,
            },
            () => {
              resolve(undefined);
            }
          );
          break;
        }
        default: {
          reject(new Error("action can only be: get, set, delete, store"));
          break;
        }
      }
    });
  }

  @PermissionVerify.API()
  GM_registerMenuCommand(request: Request, channel: Channel) {
    GMApi.hook.trigger("registerMenu", request, channel);
    channel.setDisChannelHandler(() => {
      GMApi.hook.trigger("unregisterMenu", request.params[0], request);
    });
    return Promise.resolve();
  }

  @PermissionVerify.API()
  GM_unregisterMenuCommand(request: Request) {
    GMApi.hook.trigger("unregisterMenu", request.params[0], request);
  }

  @PermissionVerify.API()
  CAT_userConfig(request: Request) {
    chrome.tabs.create({
      url: `/src/options.html#/?userConfig=${request.scriptId}`,
      active: true,
    });
  }

  @PermissionVerify.API({
    confirm: (request: Request) => {
      const [action, details] = request.params;
      if (action === "config") {
        return Promise.resolve(true);
      }
      const dir = details.baseDir ? details.baseDir : request.script.uuid;
      const metadata: { [key: string]: string } = {};
      metadata[i18next.t("script_name")] = i18nName(request.script);
      return Promise.resolve({
        permission: "file_storage",
        permissionValue: dir,
        title: i18next.t("script_operation_title"),
        metadata,
        describe: i18next.t("script_operation_description", { dir }),
        wildcard: false,
        permissionContent: i18next.t("script_permission_content"),
      } as ConfirmParam);
    },
    alias: ["GM.xmlHttpRequest"],
  })
  // eslint-disable-next-line consistent-return
  async CAT_fileStorage(request: Request, channel: Channel) {
    const [action, details] = request.params;
    if (action === "config") {
      chrome.tabs.create({
        url: `/src/options.html#/setting`,
        active: true,
      });
      return Promise.resolve(true);
    }
    const fsConfig = this.systemConfig.catFileStorage;
    if (fsConfig.status === "unset") {
      return channel.throw({ code: 1, error: "file storage is disable" });
    }
    if (fsConfig.status === "error") {
      return channel.throw({ code: 2, error: "file storge is error" });
    }
    let fs: FileSystem;
    const baseDir = `ScriptCat/app/${
      details.baseDir ? details.baseDir : request.script.uuid
    }`;
    try {
      fs = await FileSystemFactory.create(
        fsConfig.filesystem,
        fsConfig.params[fsConfig.filesystem]
      );
      await FileSystemFactory.mkdirAll(fs, baseDir);
      fs = await fs.openDir(baseDir);
    } catch (e: any) {
      if (isWarpTokenError(e)) {
        fsConfig.status = "error";
        this.systemConfig.catFileStorage = fsConfig;
        return channel.throw({ code: 2, error: e.error.message });
      }
      return channel.throw({ code: 8, error: e.message });
    }
    switch (action) {
      case "list":
        fs.list()
          .then((list) => {
            list.forEach((file) => {
              (<any>file).absPath = file.path;
              file.path = joinPath(
                file.path.substring(file.path.indexOf(baseDir) + baseDir.length)
              );
            });
            channel.send({ action: "onload", data: list });
            channel.disChannel();
          })
          .catch((e) => {
            channel.throw({ code: 3, error: e.message });
          });
        break;
      case "upload":
        // eslint-disable-next-line no-case-declarations
        const w = await fs.create(details.path);
        w.write(await (await fetch(<string>details.data)).blob())
          .then(() => {
            channel.send({ action: "onload", data: true });
            channel.disChannel();
          })
          .catch((e) => {
            channel.throw({ code: 4, error: e.message });
          });
        break;
      case "download":
        // eslint-disable-next-line no-case-declarations, no-undef
        const info = <CATType.FileStorageFileInfo>details.file;
        fs = await fs.openDir(`${info.path}`);
        // eslint-disable-next-line no-case-declarations
        const r = await fs.open({
          fsid: (<any>info).fsid,
          name: info.name,
          path: info.absPath,
          size: info.size,
          digest: info.digest,
          createtime: info.createtime,
          updatetime: info.updatetime,
        });
        r.read("blob")
          .then((blob) => {
            const url = URL.createObjectURL(blob);
            setTimeout(() => {
              URL.revokeObjectURL(url);
            }, 6000);
            channel.send({ action: "onload", data: url });
            channel.disChannel();
          })
          .catch((e) => {
            channel.throw({ code: 5, error: e.message });
          });
        break;
      case "delete":
        fs.delete(`${details.path}`)
          .then(() => {
            channel.send({ action: "onload", data: true });
            channel.disChannel();
          })
          .catch((e) => {
            channel.throw({ code: 6, error: e.message });
          });
        break;
      default:
        channel.disChannel();
        break;
    }
  }
}
