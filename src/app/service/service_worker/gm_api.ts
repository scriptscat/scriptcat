import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import { ScriptDAO } from "@App/app/repo/scripts";
import { GetSender, type Group } from "@Packages/message/server";
import type { ExtMessageSender, MessageSend } from "@Packages/message/types";
import { connect, sendMessage } from "@Packages/message/client";
import { type MessageQueue } from "@Packages/message/message_queue";
import { MockMessageConnect } from "@Packages/message/mock_message";
import { type ValueService } from "@App/app/service/service_worker/value";
import type { ConfirmParam } from "./permission_verify";
import PermissionVerify, { PermissionVerifyApiGet } from "./permission_verify";
import Cache, { incr } from "@App/app/cache";
import EventEmitter from "eventemitter3";
import { type RuntimeService } from "./runtime";
import { getIcon, isFirefox } from "@App/pkg/utils/utils";
import { type SystemConfig } from "@App/pkg/config/config";
import i18next, { i18nName } from "@App/locales/locales";
import FileSystemFactory from "@Packages/filesystem/factory";
import type FileSystem from "@Packages/filesystem/filesystem";
import { isWarpTokenError } from "@Packages/filesystem/error";
import { joinPath } from "@Packages/filesystem/utils";
import type { EmitEventRequest, MessageRequest, NotificationMessageOption, Request } from "./types";

// GMApi,处理脚本的GM API调用请求

type RequestResultParams = {
  requestId: number;
  statusCode: number;
  responseHeader: string;
};

type OnBeforeSendHeadersOptions = `${chrome.webRequest.OnBeforeSendHeadersOptions}`;
type OnHeadersReceivedOptions = `${chrome.webRequest.OnHeadersReceivedOptions}`;

// GMExternalDependencies接口定义
// 为了支持外部依赖注入，方便测试和扩展
interface IGMExternalDependencies {
  emitEventToTab(to: ExtMessageSender, req: EmitEventRequest): void;
}

/**
 * 这里的值如果末尾是-结尾，将会判断使用.startsWith()判断，否则使用.includes()
 *
 * @link https://developer.mozilla.org/zh-CN/docs/Glossary/Forbidden_request_header
 */
export const unsafeHeaders: {
  [key: string]: boolean;
} = {
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

/**
 * 检测是否存在不安全的请求头（xhr不允许自定义的的请求头）
 * @returns
 * + true 存在
 * + false 不存在
 */
export const checkHasUnsafeHeaders = (key: string) => {
  key = key.toLowerCase();
  if (unsafeHeaders[key]) {
    return true;
  }
  // ends with "-"
  const specialHeaderKeys = ["proxy-", "sec-"];
  if (specialHeaderKeys.some((specialHeaderKey) => key.startsWith(specialHeaderKey))) {
    return true;
  }
  return false;
};

type NotificationData = {
  uuid: string;
  details: GMTypes.NotificationDetails;
  sender: ExtMessageSender;
};

// GMExternalDependencies接口定义
// 为了支持外部依赖注入，方便测试和扩展

export class GMExternalDependencies implements IGMExternalDependencies {
  constructor(private runtimeService: RuntimeService) {}

  emitEventToTab(to: ExtMessageSender, req: EmitEventRequest): void {
    this.runtimeService.emitEventToTab(to, req);
  }
}

export class MockGMExternalDependencies implements IGMExternalDependencies {
  emitEventToTab(to: ExtMessageSender, req: EmitEventRequest): void {
    // Mock implementation for testing
    console.log("Mock emitEventToTab called", { to, req });
  }
}

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
    private gmExternalDependencies: IGMExternalDependencies
  ) {
    this.logger = LoggerCore.logger().with({ service: "runtime/gm_api" });
  }

  async handlerRequest(data: MessageRequest, sender: GetSender) {
    this.logger.trace("GM API request", { api: data.api, uuid: data.uuid, param: data.params });
    const api = PermissionVerifyApiGet(data.api);
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
    confirm: async (request: Request) => {
      if (request.params[0] === "store") {
        return true;
      }
      const detail = <GMTypes.CookieDetails>request.params[1];
      if (!detail.url) {
        throw new Error("there must be one of url");
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
        flag =
          connect.includes("*") ||
          connect.findIndex((connectHostName) => url.hostname.endsWith(connectHostName)) !== -1;
      }
      if (!flag) {
        throw new Error("hostname must be in the definition of connect");
      }
      const metadata: { [key: string]: string } = {};
      metadata[i18next.t("script_name")] = i18nName(request.script);
      metadata[i18next.t("request_domain")] = url.host;
      return {
        permission: "cookie",
        permissionValue: url.host,
        title: i18next.t("access_cookie_content")!,
        metadata,
        describe: i18next.t("confirm_script_operation")!,
        permissionContent: i18next.t("cookie_domain")!,
        uuid: "",
      };
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
    if (!detail.url) {
      throw new Error("there must be one of url");
    }
    if (typeof detail.partitionKey !== "object" || detail.partitionKey == null) {
      detail.partitionKey = {};
    }
    if (typeof detail.partitionKey.topLevelSite !== "string") {
      // string | undefined
      detail.partitionKey.topLevelSite = undefined;
    }
    // 处理tab的storeid
    const tabId = sender.getExtMessageSender().tabId;
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
        const cookies = await chrome.cookies.getAll({
          domain: detail.domain,
          name: detail.name,
          path: detail.path,
          secure: detail.secure,
          session: detail.session,
          url: detail.url,
          storeId: storeId,
          partitionKey: detail.partitionKey,
        });
        return cookies;
      }
      case "delete": {
        if (!detail.url || !detail.name) {
          throw new Error("delete operation must have url and name");
        }
        await chrome.cookies.remove({
          name: detail.name,
          url: detail.url,
          storeId: storeId,
          partitionKey: detail.partitionKey,
        });
        break;
      }
      case "set": {
        if (!detail.url || !detail.name || !detail.value) {
          throw new Error("set operation must have url, name and value");
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
          partitionKey: detail.partitionKey,
        });
        break;
      }
      default: {
        throw new Error("action can only be: get, set, delete, store");
      }
    }
  }

  @PermissionVerify.API()
  async GM_log(request: Request): Promise<boolean> {
    const message = request.params[0];
    const level = request.params[1] || "info";
    const labels = request.params[2] || {};
    LoggerCore.logger(labels).log(level, message, {
      uuid: request.uuid,
      name: request.script.name,
      component: "GM_log",
    });
    return true;
  }

  @PermissionVerify.API({ link: ["GM_deleteValue", "GM_setValues", "GM_deleteValues"] })
  async GM_setValue(request: Request, sender: GetSender) {
    if (!request.params || request.params.length < 1) {
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
    confirm: async (request: Request) => {
      const [action, details] = request.params;
      if (action === "config") {
        return true;
      }
      const dir = details.baseDir ? details.baseDir : request.script.uuid;
      const metadata: { [key: string]: string } = {};
      metadata[i18next.t("script_name")] = i18nName(request.script);
      return {
        permission: "file_storage",
        permissionValue: dir,
        title: i18next.t("script_operation_title"),
        metadata,
        describe: i18next.t("script_operation_description", { dir }),
        wildcard: false,
        permissionContent: i18next.t("script_permission_content"),
      } as ConfirmParam;
    },
  })
  async CAT_fileStorage(request: Request): Promise<{ action: string; data: any } | boolean> {
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

  // 有一些操作需要同步，就用Map作为缓存
  cache = new Map<string, any>();

  // 根据header生成dnr规则
  async buildDNRRule(
    reqeustId: number,
    params: GMSend.XHRDetails,
    sender: GetSender
  ): Promise<{ [key: string]: string }> {
    const headers = params.headers || {};
    // 如果header中没有origin就设置为空字符串，如果有origin就不做处理，注意处理大小写
    if (!("Origin" in headers) && !("origin" in headers)) {
      headers["Origin"] = "";
    }

    const requestHeaders = [
      {
        header: "X-Scriptcat-GM-XHR-Request-Id",
        operation: "remove",
      },
    ] as chrome.declarativeNetRequest.ModifyHeaderInfo[];
    // 判断是否是anonymous
    if (params.anonymous) {
      // 如果是anonymous，并且有cookie，则设置为自定义的cookie
      if (params.cookie) {
        requestHeaders.push({
          header: "cookie",
          operation: "set",
          value: params.cookie,
        });
      } else {
        // 否则删除cookie
        requestHeaders.push({
          header: "cookie",
          operation: "remove",
        });
      }
    } else {
      if (params.cookie) {
        // 否则正常携带cookie header
        headers["cookie"] = params.cookie;
      }

      // 追加该网站本身存储的cookie
      const tabId = sender.getExtMessageSender().tabId;
      let storeId: string | undefined;
      if (tabId !== -1) {
        const stores = await chrome.cookies.getAllCookieStores();
        const store = stores.find((val) => val.tabIds.includes(tabId));
        if (store) {
          storeId = store.id;
        }
      }

      const cookies = await chrome.cookies.getAll({
        domain: undefined,
        name: undefined,
        path: undefined,
        secure: undefined,
        session: undefined,
        url: params.url,
        storeId: storeId,
        partitionKey: params.cookiePartition,
      });
      // 追加cookie
      if (cookies.length) {
        const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
        if (!("cookie" in headers)) {
          headers.cookie = "";
        }
        headers["cookie"] = headers["cookie"].trim();
        if (headers["cookie"] === "") {
          // 空的
          headers["cookie"] = cookieStr;
        } else {
          // 非空
          if (!headers["cookie"].endsWith(";")) {
            headers["cookie"] = headers["cookie"] + "; ";
          }
          headers["cookie"] = headers["cookie"] + cookieStr;
        }
      }
    }

    Object.keys(headers).forEach((key) => {
      /** 请求的header的值 */
      const headerValue = headers[key];
      let deleteHeader = false;
      if (headerValue) {
        if (checkHasUnsafeHeaders(key)) {
          requestHeaders.push({
            header: key,
            operation: "set",
            value: headerValue.toString(),
          });
          deleteHeader = true;
        }
      } else {
        requestHeaders.push({
          header: key,
          operation: "remove",
        });
        deleteHeader = true;
      }
      deleteHeader && delete headers[key];
    });

    const rule = {} as chrome.declarativeNetRequest.Rule;
    rule.id = reqeustId;
    rule.action = {
      type: "modifyHeaders",
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
      resourceTypes: ["xmlhttprequest"],
      urlFilter: params.url,
      requestMethods: [(params.method || "GET").toLowerCase() as chrome.declarativeNetRequest.RequestMethod],
      excludedTabIds: excludedTabIds,
    };
    this.cache.set("dnrRule:" + reqeustId.toString(), rule);
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [reqeustId],
      addRules: [rule],
    });
    return headers;
  }

  gmXhrHeadersReceived: EventEmitter = new EventEmitter();

  dealFetch(
    config: GMSend.XHRDetails,
    response: Response,
    readyState: 0 | 1 | 2 | 3 | 4,
    resultParam?: RequestResultParams
  ) {
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
    if (resultParam) {
      respond.status = respond.status || resultParam.statusCode;
      respond.responseHeaders = resultParam.responseHeader || respond.responseHeaders;
    }
    return respond;
  }

  CAT_fetch(config: GMSend.XHRDetails, con: GetSender, resultParam: RequestResultParams) {
    const { url } = config;
    const connect = con.getConnect();
    return fetch(url, {
      method: config.method || "GET",
      body: <any>config.data,
      headers: config.headers,
      redirect: config.redirect,
      signal: config.timeout ? AbortSignal.timeout(config.timeout) : undefined,
    }).then((resp) => {
      let send = this.dealFetch(config, resp, 1);
      switch (resp.type) {
        case "opaqueredirect":
          // 处理manual重定向
          connect.sendMessage({
            action: "onloadstart",
            data: send,
          });
          send = this.dealFetch(config, resp, 2, resultParam);
          connect.sendMessage({
            action: "onreadystatechange",
            data: send,
          });
          send.readyState = 4;
          connect.sendMessage({
            action: "onreadystatechange",
            data: send,
          });
          connect.sendMessage({
            action: "onload",
            data: send,
          });
          connect.sendMessage({
            action: "onloadend",
            data: send,
          });
          return;
      }
      const reader = resp.body?.getReader();
      if (!reader) {
        throw new Error("read is not found");
      }
      const readData = ({ done, value }: { done: boolean; value?: Uint8Array }) => {
        if (done) {
          const data = this.dealFetch(config, resp, 4, resultParam);
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
            data: Array.from(value!),
          });
          reader.read().then(readData);
        }
      };
      reader.read().then(readData);
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
            return true;
          }
        }
      }
      const metadata: { [key: string]: string } = {};
      metadata[i18next.t("script_name")] = i18nName(request.script);
      metadata[i18next.t("request_domain")] = url.hostname;
      metadata[i18next.t("request_url")] = config.url;

      return {
        permission: "cors",
        permissionValue: url.hostname,
        title: i18next.t("script_accessing_cross_origin_resource"),
        metadata,
        describe: i18next.t("confirm_operation_description"),
        wildcard: true,
        permissionContent: i18next.t("domain"),
      } as ConfirmParam;
    },
    alias: ["GM.xmlHttpRequest"],
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

    // 处理cookiePartition
    if (typeof params.cookiePartition !== "object" || params.cookiePartition == null) {
      params.cookiePartition = {};
    }
    if (typeof params.cookiePartition.topLevelSite !== "string") {
      // string | undefined
      params.cookiePartition.topLevelSite = undefined;
    }

    params.headers["X-Scriptcat-GM-XHR-Request-Id"] = requestId.toString();
    params.headers = await this.buildDNRRule(requestId, request.params[0], sender);
    const resultParam: RequestResultParams = {
      requestId,
      statusCode: 0,
      responseHeader: "",
    };
    let finalUrl = "";
    // 等待response
    this.gmXhrHeadersReceived.addListener(
      "headersReceived:" + requestId,
      (details: chrome.webRequest.OnHeadersReceivedDetails) => {
        details.responseHeaders?.forEach((header) => {
          resultParam.responseHeader += header.name + ": " + header.value + "\n";
        });
        resultParam.statusCode = details.statusCode;
        finalUrl = this.cache.get("gmXhrRequest:finalUrl:" + requestId);
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
      // 替换finalUrl
      if (finalUrl) {
        msg.data.finalUrl = finalUrl;
      }
      sender.getConnect().sendMessage(msg);
    });
    sender.getConnect().onDisconnect(() => {
      // 关闭连接
      offscreenCon.disconnect();
    });
  }

  @PermissionVerify.API({ alias: ["CAT_registerMenuInput"] })
  GM_registerMenuCommand(request: Request, sender: GetSender) {
    const [id, name, options] = request.params;
    // 触发菜单注册, 在popup中处理
    this.mq.emit("registerMenuCommand", {
      uuid: request.script.uuid,
      id,
      name,
      options,
      tabId: sender.getSender().tab?.id || -1,
      frameId: sender.getSender().frameId,
      documentId: sender.getSender().documentId,
    });
  }

  @PermissionVerify.API({ alias: ["CAT_unregisterMenuInput"] })
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
    link: ["GM_openInTab"],
  })
  async GM_closeInTab(request: Request): Promise<boolean> {
    try {
      await chrome.tabs.remove(<number>request.params[0]);
    } catch (e) {
      this.logger.error("GM_closeInTab", Logger.E(e));
    }
    return true;
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
  async GM_saveTab(request: Request, sender: GetSender) {
    const data = request.params[0];
    const tabId = sender.getExtMessageSender().tabId;
    await Cache.getInstance().tx(`GM_getTab:${request.uuid}`, async (tabData: { [key: number]: any }) => {
      tabData = tabData || {};
      tabData[tabId] = data;
      return tabData;
    });
    return true;
  }

  @PermissionVerify.API()
  GM_getTabs(request: Request) {
    return Cache.getInstance().tx(`GM_getTab:${request.uuid}`, async (tabData: { [key: number]: any }) => {
      return tabData || {};
    });
  }

  @PermissionVerify.API({})
  async GM_notification(request: Request, sender: GetSender) {
    if (request.params.length === 0) {
      throw new Error("param is failed");
    }
    const details: GMTypes.NotificationDetails = request.params[0];
    const notificationId: string | undefined = request.params[1];
    const options: chrome.notifications.NotificationCreateOptions = {
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

    if (typeof notificationId === "string") {
      let wasUpdated: boolean;
      try {
        wasUpdated = await chrome.notifications.update(notificationId, options);
      } catch (e: any) {
        this.logger.error("GM_notification update", Logger.E(e));
        if (e.message.includes("images")) {
          // 如果更新失败，删除图标再次尝试
          options.iconUrl = chrome.runtime.getURL("assets/logo.png");
          wasUpdated = await chrome.notifications.update(notificationId, options);
        } else {
          throw e;
        }
      }
      if (!wasUpdated) {
        this.logger.error("GM_notification update by tag", {
          notificationId,
          options,
        });
      }
      return notificationId;
    } else {
      let notificationId: string;
      try {
        notificationId = await chrome.notifications.create(options);
      } catch (e: any) {
        this.logger.error("GM_notification create", Logger.E(e));
        if (e.message.includes("images")) {
          // 如果创建失败，删除图标再次尝试
          options.iconUrl = chrome.runtime.getURL("assets/logo.png");
          notificationId = await chrome.notifications.create(options);
        } else {
          throw e;
        }
      }
      Cache.getInstance().set(`GM_notification:${notificationId}`, {
        uuid: request.script.uuid,
        details: details,
        sender: sender.getExtMessageSender(),
      });
      if (details.timeout) {
        setTimeout(async () => {
          chrome.notifications.clear(notificationId);
          const sender = (await Cache.getInstance().get(`GM_notification:${notificationId}`)) as
            | NotificationData
            | undefined;
          if (sender) {
            this.gmExternalDependencies.emitEventToTab(sender.sender, {
              event: "GM_notification",
              eventId: notificationId,
              uuid: sender.uuid,
              data: {
                event: "close",
                params: {
                  byUser: false,
                },
              } as NotificationMessageOption,
            });
          }
          Cache.getInstance().del(`GM_notification:${notificationId}`);
        }, details.timeout);
      }
      return notificationId;
    }
  }

  @PermissionVerify.API({
    link: ["GM_notification"],
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
    link: ["GM_notification"],
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
    // blob本地文件或显示指定downloadMode为"browser"则直接下载
    if (params.url.startsWith("blob:") || params.downloadMode === "browser") {
      chrome.downloads.download(
        {
          url: params.url,
          saveAs: params.saveAs,
          filename: params.name,
        },
        () => {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            console.error("chrome.runtime.lastError in chrome.downloads.download:", lastError);
            // 下载API出现问题但继续执行
          }
          sender.getConnect().sendMessage({ action: "onload" });
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
          respond.done = xhr.done;
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
    const [data, type] = request.params;
    const clipboardType = type || "text/plain";
    await sendMessage(this.send, "offscreen/gmApi/setClipboard", { data, type: clipboardType });
  }

  @PermissionVerify.API()
  async ["window.close"](request: Request, sender: GetSender) {
    /*
     * Note: for security reasons it is not allowed to close the last tab of a window.
     * https://www.tampermonkey.net/documentation.php#api:window.close
     * 暂不清楚安全原因具体指什么
     * 原生window.close也可能关闭最后一个标签，暂不做限制
     */
    await chrome.tabs.remove(sender.getSender().tab?.id as number);
  }

  @PermissionVerify.API()
  async ["window.focus"](request: Request, sender: GetSender) {
    await chrome.tabs.update(sender.getSender().tab?.id as number, {
      active: true,
    });
  }

  handlerNotification() {
    const send = async (
      event: NotificationMessageOption["event"],
      notificationId: string,
      params: NotificationMessageOption["params"] = {}
    ) => {
      const sender = (await Cache.getInstance().get(`GM_notification:${notificationId}`)) as
        | NotificationData
        | undefined;
      if (sender) {
        this.gmExternalDependencies.emitEventToTab(sender.sender, {
          event: "GM_notification",
          eventId: notificationId,
          uuid: sender.uuid,
          data: {
            event,
            params,
          } as NotificationMessageOption,
        });
      }
    };
    chrome.notifications.onClosed.addListener((notificationId, byUser) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.notifications.onClosed:", lastError);
        // 无视 通知API 错误
      }
      send("close", notificationId, {
        byUser,
      });
      Cache.getInstance().del(`GM_notification:${notificationId}`);
    });
    chrome.notifications.onClicked.addListener((notificationId) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.notifications.onClosed:", lastError);
        // 无视 通知API 错误
      }
      send("click", notificationId);
    });
    chrome.notifications.onButtonClicked.addListener((notificationId, index) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.notifications.onClosed:", lastError);
        // 无视 通知API 错误
      }
      send("buttonClick", notificationId, {
        index,
      });
    });
  }

  // 处理GM_xmlhttpRequest请求
  handlerGmXhr() {
    const reqOpt: OnBeforeSendHeadersOptions[] = ["requestHeaders"];
    const respOpt: OnHeadersReceivedOptions[] = ["responseHeaders"];
    if (!isFirefox()) {
      reqOpt.push("extraHeaders");
      respOpt.push("extraHeaders");
    }
    chrome.webRequest.onBeforeSendHeaders.addListener(
      (details) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          console.error("chrome.runtime.lastError in chrome.webRequest.onBeforeSendHeaders:", lastError);
          // webRequest API 出错不进行后续处理
          return undefined;
        }
        if (details.tabId === -1) {
          // 判断是否存在X-Scriptcat-GM-XHR-Request-Id
          // 讲请求id与chrome.webRequest的请求id关联
          if (details.requestHeaders) {
            const requestId = details.requestHeaders.find((header) => header.name === "X-Scriptcat-GM-XHR-Request-Id");
            if (requestId) {
              this.cache.set("gmXhrRequest:" + details.requestId, requestId.value);
            }
          }
        }
        return undefined;
      },
      {
        urls: ["<all_urls>"],
        types: ["xmlhttprequest"],
      },
      reqOpt
    );
    chrome.webRequest.onHeadersReceived.addListener(
      (details) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          console.error("chrome.runtime.lastError in chrome.webRequest.onBeforeSendHeaders:", lastError);
          // webRequest API 出错不进行后续处理
          return undefined;
        }
        if (details.tabId === -1) {
          // 判断请求是否与gmXhrRequest关联
          const requestId = this.cache.get("gmXhrRequest:" + details.requestId);
          if (requestId) {
            // 判断是否重定向
            let location = "";
            details.responseHeaders?.forEach((header) => {
              if (header.name.toLowerCase() === "location") {
                // 重定向
                location = header.value || "";
              }
            });
            if (location) {
              // 处理重定向后的unsafeHeader
              const rule = this.cache.get("dnrRule:" + requestId) as chrome.declarativeNetRequest.Rule;
              // 修改匹配链接
              rule.condition.urlFilter = location;
              // 不处理cookie
              rule.action.requestHeaders = rule.action.requestHeaders?.filter(
                (header) => header.header.toLowerCase() !== "cookie"
              );
              // 设置重定向url，获取到实际的请求地址
              this.cache.set("gmXhrRequest:finalUrl:" + requestId, location);
              chrome.declarativeNetRequest.updateSessionRules({
                removeRuleIds: [parseInt(requestId)],
                addRules: [rule],
              });
              return;
            }
            this.gmXhrHeadersReceived.emit("headersReceived:" + requestId, details);
            // 删除关联与DNR
            this.cache.delete("gmXhrRequest:" + details.requestId);
            this.cache.delete("dnrRule:" + requestId);
            this.cache.delete("gmXhrRequest:finalUrl:" + requestId);
            chrome.declarativeNetRequest.updateSessionRules({
              removeRuleIds: [parseInt(requestId)],
            });
          }
        }
        return undefined;
      },
      {
        urls: ["<all_urls>"],
        types: ["xmlhttprequest"],
      },
      respOpt
    );
  }

  start() {
    this.group.on("gmApi", this.handlerRequest.bind(this));
    this.handlerGmXhr();
    this.handlerNotification();

    chrome.tabs.onRemoved.addListener(async (tabId) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.tabs.onRemoved:", lastError);
        // chrome.tabs.onRemoved API 出错不进行后续处理
        return undefined;
      }
      // 处理GM_openInTab关闭事件
      const sender = (await Cache.getInstance().get(`GM_openInTab:${tabId}`)) as {
        uuid: string;
        sender: ExtMessageSender;
      };
      if (sender) {
        this.gmExternalDependencies.emitEventToTab(sender.sender, {
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
