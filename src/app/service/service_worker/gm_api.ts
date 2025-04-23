import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import { Script, ScriptDAO } from "@App/app/repo/scripts";
import { ExtMessageSender, GetSender, Group, MessageSend } from "@Packages/message/server";
import { ValueService } from "@App/app/service/service_worker/value";
import PermissionVerify, { ConfirmParam } from "./permission_verify";
import { connect, sendMessage } from "@Packages/message/client";
import Cache, { incr } from "@App/app/cache";
import EventEmitter from "eventemitter3";
import { MessageQueue } from "@Packages/message/message_queue";
import { RuntimeService } from "./runtime";
import { getIcon, isFirefox } from "@App/pkg/utils/utils";
import { MockMessageConnect } from "@Packages/message/mock_message";
import i18next, { i18nName } from "@App/locales/locales";
import { SystemConfig } from "@App/pkg/config/config";
import FileSystemFactory from "@Packages/filesystem/factory";
import FileSystem from "@Packages/filesystem/filesystem";
import { isWarpTokenError } from "@Packages/filesystem/error";
import { joinPath } from "@Packages/filesystem/utils";

// GMApi,处理脚本的GM API调用请求

export type MessageRequest = {
  uuid: string; // 脚本id
  api: string;
  runFlag: string;
  params: any[];
};

export type Request = MessageRequest & {
  script: Script;
};

export const unsafeHeaders: { [key: string]: boolean } = {
  // 部分浏览器中并未允许
  "user-agent": true,
  // 这两个是前缀
  "proxy-": true,
  "sec-": true,
  // cookie已经特殊处理
  cookie: true,
  "accept-charset": true,
  "accept-encoding": true,
  "access-control-request-headers": true,
  "access-control-request-method": true,
  connection: true,
  "content-length": true,
  date: true,
  dnt: true,
  expect: true,
  "feature-policy": true,
  host: true,
  "keep-alive": true,
  origin: true,
  referer: true,
  te: true,
  trailer: true,
  "transfer-encoding": true,
  upgrade: true,
  via: true,
};

type NotificationData = {
  uuid: string;
  details: GMTypes.NotificationDetails;
  sender: ExtMessageSender;
};

export type Api = (request: Request, con: GetSender) => Promise<any>;

export default class GMApi {
  logger: Logger;

  scriptDAO: ScriptDAO = new ScriptDAO();

  constructor(
    private systemConfig: SystemConfig,
    private permissionVerify: PermissionVerify,
    private group: Group,
    private send: MessageSend,
    private mq: MessageQueue,
    private value: ValueService,
    private runtime: RuntimeService
  ) {
    this.logger = LoggerCore.logger().with({ service: "runtime/gm_api" });
  }

  async handlerRequest(data: MessageRequest, sender: GetSender) {
    this.logger.trace("GM API request", { api: data.api, uuid: data.uuid, param: data.params });
    const api = PermissionVerify.apis.get(data.api);
    if (!api) {
      throw new Error("gm api is not found");
    }
    const req = await this.parseRequest(data);
    try {
      await this.permissionVerify.verify(req, api);
    } catch (e) {
      this.logger.error("verify error", { api: data.api }, Logger.E(e));
      throw e;
    }
    return api.api.call(this, req, sender);
  }

  // 解析请求
  async parseRequest(data: MessageRequest): Promise<Request> {
    const script = await this.scriptDAO.get(data.uuid);
    if (!script) {
      throw new Error("script is not found");
    }
    const req: Request = <Request>data;
    req.script = script;
    return req;
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
        return Promise.reject(new Error("hostname must be in the definition of connect"));
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
  async GM_cookie(request: Request, sender: GetSender) {
    const param = request.params;
    if (param.length !== 2) {
      throw new Error("there must be two parameters");
    }
    const detail = <GMTypes.CookieDetails>request.params[1];
    // url或者域名不能为空
    if (detail.url) {
      detail.url = detail.url.trim();
    }
    if (detail.domain) {
      detail.domain = detail.domain.trim();
    }
    if (!detail.url && !detail.domain) {
      throw new Error("there must be one of url or domain");
    }
    // 处理tab的storeid
    let tabId = sender.getExtMessageSender().tabId;
    let storeId: string | undefined;
    if (tabId !== -1) {
      const stores = await chrome.cookies.getAllCookieStores();
      const store = stores.find((val) => val.tabIds.includes(tabId));
      if (store) {
        storeId = store.id;
      }
    }
    switch (param[0]) {
      case "list": {
        return chrome.cookies.getAll({
          domain: detail.domain,
          name: detail.name,
          path: detail.path,
          secure: detail.secure,
          session: detail.session,
          url: detail.url,
          storeId: storeId,
        });
      }
      case "delete": {
        if (!detail.url || !detail.name) {
          throw new Error("delete operation must have url and name");
        }
        await chrome.cookies.remove({
          name: detail.name,
          url: detail.url,
          storeId: storeId,
        });
        break;
      }
      case "set": {
        if (!detail.url || !detail.name) {
          throw new Error("set operation must have name and value");
        }
        await chrome.cookies.set({
          url: detail.url,
          name: detail.name,
          domain: detail.domain,
          value: detail.value,
          expirationDate: detail.expirationDate,
          path: detail.path,
          httpOnly: detail.httpOnly,
          secure: detail.secure,
          storeId: storeId,
        });
        break;
      }
      default: {
        throw new Error("action can only be: get, set, delete, store");
      }
    }
  }

  @PermissionVerify.API()
  GM_log(request: Request): Promise<boolean> {
    const message = request.params[0];
    const level = request.params[1] || "info";
    const labels = request.params[2] || {};
    LoggerCore.logger(labels).log(level, message, {
      uuid: request.uuid,
      name: request.script.name,
      component: "GM_log",
    });
    return Promise.resolve(true);
  }

  @PermissionVerify.API()
  async GM_setValue(request: Request, sender: GetSender) {
    if (!request.params || request.params.length !== 2) {
      throw new Error("param is failed");
    }
    const [key, value] = request.params;
    await this.value.setValue(request.script.uuid, key, value, {
      runFlag: request.runFlag,
      tabId: sender.getSender().tab?.id,
    });
  }

  @PermissionVerify.API()
  CAT_userConfig(request: Request) {
    chrome.tabs.create({
      url: `/src/options.html#/?userConfig=${request.uuid}`,
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
  })
  async CAT_fileStorage(request: Request, sender: GetSender): Promise<{ action: string; data: any } | boolean> {
    const [action, details] = request.params;
    if (action === "config") {
      chrome.tabs.create({
        url: `/src/options.html#/setting`,
        active: true,
      });
      return true;
    }
    const fsConfig = await this.systemConfig.getCatFileStorage();
    if (fsConfig.status === "unset") {
      return { action: "error", data: { code: 1, error: "file storage is unset" } };
    }
    if (fsConfig.status === "error") {
      return { action: "error", data: { code: 2, error: "file storage is error" } };
    }
    let fs: FileSystem;
    const baseDir = `ScriptCat/app/${details.baseDir ? details.baseDir : request.script.uuid}`;
    try {
      fs = await FileSystemFactory.create(fsConfig.filesystem, fsConfig.params[fsConfig.filesystem]);
      await FileSystemFactory.mkdirAll(fs, baseDir);
      fs = await fs.openDir(baseDir);
    } catch (e: any) {
      if (isWarpTokenError(e)) {
        fsConfig.status = "error";
        this.systemConfig.setCatFileStorage(fsConfig);
        return { action: "error", data: { code: 2, error: e.error.message } };
      }
      return { action: "error", data: { code: 8, error: e.message } };
    }
    switch (action) {
      case "list":
        try {
          const list = await fs.list();
          list.forEach((file) => {
            (<any>file).absPath = file.path;
            file.path = joinPath(file.path.substring(file.path.indexOf(baseDir) + baseDir.length));
          });
          return { action: "onload", data: list };
        } catch (e: any) {
          return { action: "error", data: { code: 3, error: e.message } };
        }
      case "upload":
        try {
          const w = await fs.create(details.path);
          await w.write(await (await fetch(<string>details.data)).blob());
          return { action: "onload", data: true };
        } catch (e: any) {
          return { action: "error", data: { code: 4, error: e.message } };
        }
      case "download":
        try {
          const info = <CATType.FileStorageFileInfo>details.file;
          fs = await fs.openDir(`${info.path}`);
          const r = await fs.open({
            fsid: (<any>info).fsid,
            name: info.name,
            path: info.absPath,
            size: info.size,
            digest: info.digest,
            createtime: info.createtime,
            updatetime: info.updatetime,
          });
          const blob = await r.read("blob");
          const url = URL.createObjectURL(blob);
          setTimeout(() => {
            URL.revokeObjectURL(url);
          }, 30 * 1000);
          return { action: "onload", data: url };
        } catch (e: any) {
          return { action: "error", data: { code: 5, error: e.message } };
        }
        break;
      case "delete":
        try {
          await fs.delete(`${details.path}`);
          return { action: "onload", data: true };
        } catch (e: any) {
          return { action: "error", data: { code: 6, error: e.message } };
        }
      default:
        throw new Error("action is not supported");
    }
  }

  // 根据header生成dnr规则
  async buildDNRRule(reqeustId: number, params: GMSend.XHRDetails): Promise<{ [key: string]: string }> {
    // 检查是否有unsafe header,有则生成dnr规则
    const headers = params.headers;
    if (!headers) {
      return {};
    }
    const requestHeaders = [
      {
        header: "X-Scriptcat-GM-XHR-Request-Id",
        operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE,
      },
    ] as chrome.declarativeNetRequest.ModifyHeaderInfo[];
    Object.keys(headers).forEach((key) => {
      const lowKey = key.toLowerCase();
      if (headers[key]) {
        if (unsafeHeaders[lowKey] || lowKey.startsWith("sec-") || lowKey.startsWith("proxy-")) {
          if (headers[key]) {
            requestHeaders.push({
              header: key,
              operation: chrome.declarativeNetRequest.HeaderOperation.SET,
              value: headers[key],
            });
          }
          delete headers[key];
        }
      } else {
        requestHeaders.push({
          header: key,
          operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE,
        });
        delete headers[key];
      }
    });
    // 判断是否是anonymous
    if (params.anonymous) {
      // 如果是anonymous，并且有cookie，则设置为自定义的cookie
      if (params.cookie) {
        requestHeaders.push({
          header: "cookie",
          operation: chrome.declarativeNetRequest.HeaderOperation.SET,
          value: params.cookie,
        });
      } else {
        // 否则删除cookie
        requestHeaders.push({
          header: "cookie",
          operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE,
        });
      }
    } else if (params.cookie) {
      // 否则正常携带cookie header
      headers["cookie"] = params.cookie;
    }
    const ruleId = reqeustId;
    const rule = {} as chrome.declarativeNetRequest.Rule;
    rule.id = ruleId;
    rule.action = {
      type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
      requestHeaders: requestHeaders,
    };
    rule.priority = 1;
    const tabs = await chrome.tabs.query({});
    const excludedTabIds: number[] = [];
    tabs.forEach((tab) => {
      if (tab.id) {
        excludedTabIds.push(tab.id);
      }
    });
    rule.condition = {
      resourceTypes: [chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST],
      urlFilter: params.url,
      requestMethods: [(params.method || "GET").toLowerCase() as chrome.declarativeNetRequest.RequestMethod],
      excludedTabIds: excludedTabIds,
    };
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [ruleId],
      addRules: [rule],
    });
    return headers;
  }

  gmXhrHeadersReceived: EventEmitter = new EventEmitter();

  dealFetch(config: GMSend.XHRDetails, response: Response, readyState: 0 | 1 | 2 | 3 | 4) {
    let respHeader = "";
    response.headers.forEach((value, key) => {
      respHeader += `${key}: ${value}\n`;
    });
    const respond: GMTypes.XHRResponse = {
      finalUrl: response.url || config.url,
      readyState,
      status: response.status,
      statusText: response.statusText,
      responseHeaders: respHeader,
      responseType: config.responseType,
    };
    return respond;
  }

  CAT_fetch(config: GMSend.XHRDetails, con: GetSender, resultParam: { requestId: number; responseHeader: string }) {
    const { url } = config;
    let connect = con.getConnect();
    return fetch(url, {
      method: config.method || "GET",
      body: <any>config.data,
      headers: config.headers,
    }).then((resp) => {
      const send = this.dealFetch(config, resp, 1);
      const reader = resp.body?.getReader();
      if (!reader) {
        throw new Error("read is not found");
      }
      const _this = this;
      reader.read().then(function read({ done, value }) {
        if (done) {
          const data = _this.dealFetch(config, resp, 4);
          data.responseHeaders = resultParam.responseHeader || data.responseHeaders;
          connect.sendMessage({
            action: "onreadystatechange",
            data: data,
          });
          connect.sendMessage({
            action: "onload",
            data: data,
          });
          connect.sendMessage({
            action: "onloadend",
            data: data,
          });
        } else {
          connect.sendMessage({
            action: "onstream",
            data: Array.from(value),
          });
          reader.read().then(read);
        }
      });
      send.responseHeaders = resultParam.responseHeader || send.responseHeaders;
      connect.sendMessage({
        action: "onloadstart",
        data: send,
      });
      send.readyState = 2;
      connect.sendMessage({
        action: "onreadystatechange",
        data: send,
      });
    });
  }

  @PermissionVerify.API({
    confirm: async (request: Request) => {
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
  })
  async GM_xmlhttpRequest(request: Request, sender: GetSender) {
    if (request.params.length === 0) {
      throw new Error("param is failed");
    }
    const params = request.params[0] as GMSend.XHRDetails;
    // 先处理unsafe hearder
    // 关联自己生成的请求id与chrome.webRequest的请求id
    const requestId = 10000 + (await incr(Cache.getInstance(), "gmXhrRequestId", 1));
    // 添加请求header
    if (!params.headers) {
      params.headers = {};
    }
    params.headers["X-Scriptcat-GM-XHR-Request-Id"] = requestId.toString();
    params.headers = await this.buildDNRRule(requestId, request.params[0]);
    let resultParam = {
      requestId,
      responseHeader: "",
    };
    // 等待response
    this.gmXhrHeadersReceived.addListener(
      "headersReceived:" + requestId,
      (details: chrome.webRequest.WebResponseHeadersDetails) => {
        details.responseHeaders?.forEach((header) => {
          resultParam.responseHeader += header.name + ": " + header.value + "\n";
        });
        this.gmXhrHeadersReceived.removeAllListeners("headersReceived:" + requestId);
      }
    );
    if (params.responseType === "stream" || params.fetch || params.redirect) {
      // 只有fetch支持ReadableStream、redirect这些，直接使用fetch
      return this.CAT_fetch(params, sender, resultParam);
    }
    // 再发送到offscreen, 处理请求
    const offscreenCon = await connect(this.send, "offscreen/gmApi/xmlHttpRequest", request.params[0]);
    offscreenCon.onMessage((msg: { action: string; data: any }) => {
      // 发送到content
      // 替换msg.data.responseHeaders
      msg.data.responseHeaders = resultParam.responseHeader || msg.data.responseHeaders;
      sender.getConnect().sendMessage(msg);
    });
    sender.getConnect().onDisconnect(() => {
      // 关闭连接
      offscreenCon.disconnect();
    });
  }

  @PermissionVerify.API()
  GM_registerMenuCommand(request: Request, sender: GetSender) {
    const [id, name, accessKey] = request.params;
    // 触发菜单注册, 在popup中处理
    this.mq.emit("registerMenuCommand", {
      uuid: request.script.uuid,
      id: id,
      name: name,
      accessKey: accessKey,
      tabId: sender.getSender().tab?.id || -1,
      frameId: sender.getSender().frameId,
      documentId: sender.getSender().documentId,
    });
  }

  @PermissionVerify.API()
  GM_unregisterMenuCommand(request: Request, sender: GetSender) {
    const [id] = request.params;
    // 触发菜单取消注册, 在popup中处理
    this.mq.emit("unregisterMenuCommand", {
      uuid: request.script.uuid,
      id: id,
      tabId: sender.getSender().tab?.id || -1,
      frameId: sender.getSender().frameId,
    });
  }

  @PermissionVerify.API({})
  async GM_openInTab(request: Request, sender: GetSender) {
    const url = request.params[0];
    const options = request.params[1] || {};
    if (options.useOpen === true) {
      // 发送给offscreen页面处理
      const ok = await sendMessage(this.send, "offscreen/gmApi/openInTab", { url });
      if (ok) {
        // 由于window.open强制在前台打开标签，因此获取状态为{ active:true }的标签即为新标签
        const [tab] = await chrome.tabs.query({ active: true });
        await Cache.getInstance().set(`GM_openInTab:${tab.id}`, {
          uuid: request.uuid,
          sender: sender.getExtMessageSender(),
        });
        return tab.id;
      } else {
        // 当新tab被浏览器阻止时window.open()会返回null 视为已经关闭
        // 似乎在Firefox中禁止在background页面使用window.open()，强制返回null
        return false;
      }
    } else {
      const tab = await chrome.tabs.create({ url, active: options.active });
      await Cache.getInstance().set(`GM_openInTab:${tab.id}`, {
        uuid: request.uuid,
        sender: sender.getExtMessageSender(),
      });
      return tab.id;
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

  @PermissionVerify.API({})
  GM_getTab(request: Request, sender: GetSender) {
    return Cache.getInstance()
      .tx(`GM_getTab:${request.uuid}`, async (tabData: { [key: number]: any }) => {
        return tabData || {};
      })
      .then((data) => {
        return data[sender.getExtMessageSender().tabId];
      });
  }

  @PermissionVerify.API()
  GM_saveTab(request: Request, sender: GetSender) {
    const data = request.params[0];
    const tabId = sender.getExtMessageSender().tabId;
    return Cache.getInstance()
      .tx(`GM_getTab:${request.uuid}`, (tabData: { [key: number]: any }) => {
        tabData = tabData || {};
        tabData[tabId] = data;
        return Promise.resolve(tabData);
      })
      .then(() => true);
  }

  @PermissionVerify.API()
  GM_getTabs(request: Request) {
    return Cache.getInstance().tx(`GM_getTab:${request.uuid}`, async (tabData: { [key: number]: any }) => {
      return tabData || {};
    });
  }

  @PermissionVerify.API({})
  GM_notification(request: Request, sender: GetSender) {
    if (request.params.length === 0) {
      throw new Error("param is failed");
    }
    const details: GMTypes.NotificationDetails = request.params[0];
    const options: chrome.notifications.NotificationOptions<true> = {
      title: details.title || "ScriptCat",
      message: details.text || "无消息内容",
      iconUrl: details.image || getIcon(request.script) || chrome.runtime.getURL("assets/logo.png"),
      type: isFirefox() || details.progress === undefined ? "basic" : "progress",
    };
    if (!isFirefox()) {
      options.silent = details.silent;
      options.buttons = details.buttons;
    }
    options.progress = options.progress && parseInt(details.progress as any, 10);

    return new Promise((resolve) => {
      chrome.notifications.create(options, (notificationId) => {
        Cache.getInstance().set(`GM_notification:${notificationId}`, {
          uuid: request.script.uuid,
          details: details,
          sender: sender.getExtMessageSender(),
        });
        if (details.timeout) {
          setTimeout(() => {
            chrome.notifications.clear(notificationId);
            Cache.getInstance().del(`GM_notification:${notificationId}`);
          }, details.timeout);
        }
        resolve(notificationId);
      });
    });
  }

  @PermissionVerify.API({
    link: "GM_notification",
  })
  GM_closeNotification(request: Request) {
    if (request.params.length === 0) {
      throw new Error("param is failed");
    }
    const [notificationId] = request.params;
    Cache.getInstance().del(`GM_notification:${notificationId}`);
    chrome.notifications.clear(notificationId);
  }

  @PermissionVerify.API({
    link: "GM_notification",
  })
  GM_updateNotification(request: Request) {
    if (isFirefox()) {
      throw new Error("firefox does not support this method");
    }
    const id = request.params[0];
    const details: GMTypes.NotificationDetails = request.params[1];
    const options: chrome.notifications.NotificationOptions = {
      title: details.title,
      message: details.text,
      iconUrl: details.image,
      type: details.progress === undefined ? "basic" : "progress",
      silent: details.silent,
      progress: details.progress && parseInt(details.progress as any, 10),
    };
    chrome.notifications.update(<string>id, options);
  }

  @PermissionVerify.API()
  async GM_download(request: Request, sender: GetSender) {
    const params = <GMTypes.DownloadDetails>request.params[0];
    // blob本地文件直接下载
    if (params.url.startsWith("blob:")) {
      chrome.downloads.download(
        {
          url: params.url,
          saveAs: params.saveAs,
          filename: params.name,
        },
        () => {
          sender.getConnect().sendMessage({ event: "onload" });
        }
      );
      return;
    }
    // 使用xhr下载blob,再使用download api创建下载
    const EE = new EventEmitter();
    const mockConnect = new MockMessageConnect(EE);
    EE.addListener("message", (data: any) => {
      const xhr = data.data;
      const respond: any = {
        finalUrl: xhr.url,
        readyState: xhr.readyState,
        status: xhr.status,
        statusText: xhr.statusText,
        responseHeaders: xhr.responseHeaders,
      };
      switch (data.action) {
        case "onload":
          sender.getConnect().sendMessage({
            action: "onload",
            data: respond,
          });
          chrome.downloads.download({
            url: xhr.response,
            saveAs: params.saveAs,
            filename: params.name,
          });
          break;
        case "onerror":
          sender.getConnect().sendMessage({
            action: "onerror",
            data: respond,
          });
          break;
        case "onprogress":
          respond.done = xhr.DONE;
          respond.lengthComputable = xhr.lengthComputable;
          respond.loaded = xhr.loaded;
          respond.total = xhr.total;
          respond.totalSize = xhr.total;
          sender.getConnect().sendMessage({
            action: "onprogress",
            data: respond,
          });
          break;
        case "ontimeout":
          sender.getConnect().sendMessage({
            action: "ontimeout",
          });
          break;
      }
    });
    // 处理参数问题
    request.params[0] = {
      method: params.method || "GET",
      url: params.url,
      headers: params.headers,
      timeout: params.timeout,
      cookie: params.cookie,
      anonymous: params.anonymous,
      responseType: "blob",
    } as GMSend.XHRDetails;
    return this.GM_xmlhttpRequest(request, new GetSender(mockConnect));
  }

  @PermissionVerify.API()
  async GM_setClipboard(request: Request) {
    let [data, type] = request.params;
    type = type || "text/plain";
    await sendMessage(this.send, "offscreen/gmApi/setClipboard", { data, type });
  }

  handlerNotification() {
    const send = async (event: string, notificationId: string, params?: any) => {
      const ret = (await Cache.getInstance().get(`GM_notification:${notificationId}`)) as NotificationData;
      if (ret) {
        this.runtime.emitEventToTab(ret.sender, {
          event: "GM_notification",
          eventId: notificationId,
          uuid: ret.uuid,
          data: {
            event,
            params,
          },
        });
      }
    };
    chrome.notifications.onClosed.addListener((notificationId, byUser) => {
      send("close", notificationId, {
        byUser,
      });
      Cache.getInstance().del(`GM_notification:${notificationId}`);
    });
    chrome.notifications.onClicked.addListener((notificationId) => {
      send("click", notificationId);
    });
    chrome.notifications.onButtonClicked.addListener((notificationId, index) => {
      send("buttonClick", notificationId, {
        index: index,
      });
    });
  }

  // 处理GM_xmlhttpRequest请求
  handlerGmXhr() {
    chrome.webRequest.onBeforeSendHeaders.addListener(
      (details) => {
        if (details.tabId === -1) {
          // 判断是否存在X-Scriptcat-GM-XHR-Request-Id
          // 讲请求id与chrome.webRequest的请求id关联
          if (details.requestHeaders) {
            const requestId = details.requestHeaders.find((header) => header.name === "X-Scriptcat-GM-XHR-Request-Id");
            if (requestId) {
              Cache.getInstance().set("gmXhrRequest:" + details.requestId, requestId.value);
            }
          }
        }
      },
      {
        urls: ["<all_urls>"],
        types: ["xmlhttprequest"],
      },
      ["requestHeaders", "extraHeaders"]
    );
    chrome.webRequest.onHeadersReceived.addListener(
      (details) => {
        if (details.tabId === -1) {
          // 判断请求是否与gmXhrRequest关联
          Cache.getInstance()
            .get("gmXhrRequest:" + details.requestId)
            .then((requestId) => {
              if (requestId) {
                this.gmXhrHeadersReceived.emit("headersReceived:" + requestId, details);
                // 删除关联与DNR
                Cache.getInstance().del("gmXhrRequest:" + details.requestId);
                chrome.declarativeNetRequest.updateSessionRules({
                  removeRuleIds: [parseInt(requestId)],
                });
              }
            });
        }
      },
      {
        urls: ["<all_urls>"],
        types: ["xmlhttprequest"],
      },
      ["responseHeaders", "extraHeaders"]
    );
  }

  start() {
    this.group.on("gmApi", this.handlerRequest.bind(this));
    this.handlerGmXhr();
    this.handlerNotification();

    chrome.tabs.onRemoved.addListener(async (tabId) => {
      // 处理GM_openInTab关闭事件
      const sender = (await Cache.getInstance().get(`GM_openInTab:${tabId}`)) as {
        uuid: string;
        sender: ExtMessageSender;
      };
      if (sender) {
        this.runtime.emitEventToTab(sender.sender, {
          event: "GM_openInTab",
          eventId: tabId.toString(),
          uuid: sender.uuid,
          data: {
            event: "onclose",
            tabId: tabId,
          },
        });
        Cache.getInstance().del(`GM_openInTab:${tabId}`);
      }
    });
  }
}
