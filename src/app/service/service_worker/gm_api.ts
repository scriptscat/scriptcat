import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import { ScriptDAO } from "@App/app/repo/scripts";
import { SenderConnect, type IGetSender, type Group, GetSenderType } from "@Packages/message/server";
import type { ExtMessageSender, MessageSend } from "@Packages/message/types";
import { connect, sendMessage } from "@Packages/message/client";
import type { IMessageQueue } from "@Packages/message/message_queue";
import { MockMessageConnect } from "@Packages/message/mock_message";
import { type ValueService } from "@App/app/service/service_worker/value";
import type { ConfirmParam } from "./permission_verify";
import PermissionVerify, { PermissionVerifyApiGet } from "./permission_verify";
import { cacheInstance } from "@App/app/cache";
import EventEmitter from "eventemitter3";
import { type RuntimeService } from "./runtime";
import { getIcon, isFirefox, getCurrentTab, openInCurrentTab, cleanFileName } from "@App/pkg/utils/utils";
import { type SystemConfig } from "@App/pkg/config/config";
import i18next, { i18nName } from "@App/locales/locales";
import FileSystemFactory from "@Packages/filesystem/factory";
import type FileSystem from "@Packages/filesystem/filesystem";
import { isWarpTokenError } from "@Packages/filesystem/error";
import { joinPath } from "@Packages/filesystem/utils";
import type {
  EmitEventRequest,
  GMRegisterMenuCommandParam,
  GMUnRegisterMenuCommandParam,
  MessageRequest,
  NotificationMessageOption,
  GMApiRequest,
} from "./types";
import type { TScriptMenuRegister, TScriptMenuUnregister } from "../queue";
import { BrowserNoSupport, notificationsUpdate } from "./utils";
import i18n from "@App/locales/locales";
import { decodeMessage, type TEncodedMessage } from "@App/pkg/utils/message_value";
import { type TGMKeyValue } from "@App/app/repo/value";
import { createObjectURL } from "../offscreen/client";

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

export const isConnectMatched = (metadataConnect: string[] | undefined, reqURL: URL, sender: IGetSender) => {
  if (metadataConnect?.length) {
    for (let i = 0, l = metadataConnect.length; i < l; i += 1) {
      const lowerMetaConnect = metadataConnect[i].toLowerCase();
      if (lowerMetaConnect === "self") {
        const senderURL = sender.getSender()?.url;
        if (senderURL) {
          let senderURLObject;
          try {
            senderURLObject = new URL(senderURL);
          } catch {
            // ignore
          }
          if (senderURLObject) {
            if (reqURL.hostname === senderURLObject.hostname) return true;
          }
        }
      } else if (lowerMetaConnect === "*" || `.${reqURL.hostname}`.endsWith(`.${lowerMetaConnect}`)) {
        return true;
      }
    }
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
    private msgSender: MessageSend,
    private mq: IMessageQueue,
    private value: ValueService,
    private gmExternalDependencies: IGMExternalDependencies
  ) {
    this.logger = LoggerCore.logger().with({ service: "runtime/gm_api" });
  }

  // PermissionVerify.API
  // sendMessage from Content Script, etc
  async handlerRequest(data: MessageRequest, sender: IGetSender) {
    this.logger.trace("GM API request", { api: data.api, uuid: data.uuid, param: data.params });
    const api = PermissionVerifyApiGet(data.api);
    if (!api) {
      throw new Error("gm api is not found");
    }
    const req = await this.parseRequest(data);
    try {
      await this.permissionVerify.verify(req, api, sender);
    } catch (e) {
      this.logger.error("verify error", { api: data.api }, Logger.E(e));
      throw e;
    }
    return api.api.call(this, req, sender);
  }

  // 解析请求
  async parseRequest<T>(data: MessageRequest<T>): Promise<GMApiRequest<T>> {
    const script = await this.scriptDAO.get(data.uuid);
    if (!script) {
      throw new Error("script is not found");
    }
    return { ...data, script } as GMApiRequest<T>;
  }

  @PermissionVerify.API({
    confirm: async (request: GMApiRequest<[string, GMTypes.CookieDetails]>, sender: IGetSender) => {
      if (request.params[0] === "store") {
        return true;
      }
      const detail = request.params[1];
      if (!detail.url && !detail.domain) {
        throw new Error("there must be one of url or domain");
      }
      let url: URL = <URL>{};
      if (detail.url) {
        url = new URL(detail.url);
      } else {
        url.host = detail.domain || "";
        url.hostname = detail.domain || "";
      }
      if (!isConnectMatched(request.script.metadata.connect, url, sender)) {
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
  async GM_cookie(request: GMApiRequest<[string, GMTypes.CookieDetails]>, sender: IGetSender) {
    const param = request.params;
    if (param.length !== 2) {
      throw new Error("there must be two parameters");
    }
    const detail: GMTypes.CookieDetails = request.params[1];
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
  async GM_log(
    request: GMApiRequest<[string, GMTypes.LoggerLevel, GMTypes.LoggerLabel[]?]>,
    _sender: IGetSender
  ): Promise<boolean> {
    const message = request.params[0];
    const level = request.params[1] || "info";
    const labels = request.params[2] || [];
    LoggerCore.logger(...labels).log(level, message, {
      uuid: request.uuid,
      name: request.script.name,
      component: "GM_log",
    });
    return true;
  }

  @PermissionVerify.API({ link: ["GM_deleteValue"] })
  async GM_setValue(request: GMApiRequest<[string, string, any?]>, sender: IGetSender) {
    if (!request.params || request.params.length < 2) {
      throw new Error("param is failed");
    }
    const [id, key, value] = request.params as [string, string, any];
    await this.value.setValue(request.script.uuid, id, key, value, {
      runFlag: request.runFlag,
      tabId: sender.getSender()?.tab?.id || -1,
    });
  }

  @PermissionVerify.API({ link: ["GM_deleteValues"] })
  async GM_setValues(request: GMApiRequest<[string, TEncodedMessage<TGMKeyValue>]>, sender: IGetSender) {
    if (!request.params || request.params.length !== 2) {
      throw new Error("param is failed");
    }
    const [id, valuesNew] = request.params;
    const values = decodeMessage(valuesNew);
    const valueSender = {
      runFlag: request.runFlag,
      tabId: sender.getSender()?.tab?.id || -1,
    };
    await this.value.setValues(request.script.uuid, id, values, valueSender, false);
  }

  @PermissionVerify.API()
  CAT_userConfig(request: GMApiRequest<void>, sender: IGetSender): void {
    const { tabId } = sender.getExtMessageSender();
    openInCurrentTab(`/src/options.html#/?userConfig=${request.uuid}`, tabId === -1 ? undefined : tabId);
  }

  @PermissionVerify.API({
    confirm: async (request: GMApiRequest<[string, CATType.CATFileStorageDetails]>, _sender: IGetSender) => {
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
  async CAT_fileStorage(
    request: GMApiRequest<["config"] | ["list" | "download" | "upload" | "delete", CATType.CATFileStorageDetails]>,
    sender: IGetSender
  ): Promise<{ action: string; data: any } | boolean> {
    const [action, details] = request.params;
    if (action === "config") {
      const { tabId, windowId } = sender.getExtMessageSender();
      chrome.tabs.create({
        url: `/src/options.html#/setting`,
        openerTabId: tabId === -1 ? undefined : tabId,
        windowId: windowId === -1 ? undefined : windowId,
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
          for (const file of list) {
            (<any>file).absPath = file.path;
            file.path = joinPath(file.path.substring(file.path.indexOf(baseDir) + baseDir.length));
          }
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
          const info: CATType.FileStorageFileInfo = details.file;
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
          const url = await createObjectURL(this.msgSender, blob, false);
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

  chromeSupportMethod = new Set<string>(["connect", "delete", "get", "head", "options", "patch", "post", "put"]);

  // 根据header生成dnr规则
  async buildDNRRule(
    reqeustId: number,
    params: GMSend.XHRDetails,
    sender: IGetSender
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

    for (const key of Object.keys(headers)) {
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
    }

    const rule = {} as chrome.declarativeNetRequest.Rule;
    rule.id = reqeustId;
    rule.action = {
      type: "modifyHeaders",
      requestHeaders: requestHeaders,
    };
    rule.priority = 1;
    const tabs = await chrome.tabs.query({});
    const excludedTabIds: number[] = [];
    for (const tab of tabs) {
      if (tab.id) {
        excludedTabIds.push(tab.id);
      }
    }
    let requestMethod = (params.method || "GET").toLowerCase() as chrome.declarativeNetRequest.RequestMethod;
    if (!this.chromeSupportMethod.has(requestMethod)) {
      requestMethod = "other" as chrome.declarativeNetRequest.RequestMethod;
    }
    rule.condition = {
      resourceTypes: ["xmlhttprequest"],
      urlFilter: params.url,
      requestMethods: [requestMethod],
      excludedTabIds: excludedTabIds,
    };
    this.cache.set("dnrRule:" + reqeustId.toString(), rule);
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [reqeustId],
      addRules: [rule],
    });
    return headers;
  }

  gmXhrHeadersReceived = new EventEmitter<string, any>();

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

  CAT_fetch(config: GMSend.XHRDetails, con: IGetSender, resultParam: RequestResultParams) {
    const { url } = config;
    const msgConn = con.getConnect();
    if (!msgConn) {
      throw new Error("CAT_fetch ERROR: msgConn is undefinded");
    }
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
          msgConn.sendMessage({
            action: "onloadstart",
            data: send,
          });
          send = this.dealFetch(config, resp, 2, resultParam);
          msgConn.sendMessage({
            action: "onreadystatechange",
            data: send,
          });
          send.readyState = 4;
          msgConn.sendMessage({
            action: "onreadystatechange",
            data: send,
          });
          msgConn.sendMessage({
            action: "onload",
            data: send,
          });
          msgConn.sendMessage({
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
          msgConn.sendMessage({
            action: "onreadystatechange",
            data: data,
          });
          msgConn.sendMessage({
            action: "onload",
            data: data,
          });
          msgConn.sendMessage({
            action: "onloadend",
            data: data,
          });
        } else {
          msgConn.sendMessage({
            action: "onstream",
            data: Array.from(value!),
          });
          reader.read().then(readData);
        }
      };
      reader.read().then(readData);
      send.responseHeaders = resultParam.responseHeader || send.responseHeaders;
      msgConn.sendMessage({
        action: "onloadstart",
        data: send,
      });
      send.readyState = 2;
      msgConn.sendMessage({
        action: "onreadystatechange",
        data: send,
      });
    });
  }

  @PermissionVerify.API({
    confirm: async (request: GMApiRequest<[GMSend.XHRDetails]>, sender: IGetSender) => {
      const config = <GMSend.XHRDetails>request.params[0];
      const url = new URL(config.url);
      if (isConnectMatched(request.script.metadata.connect, url, sender)) {
        return true;
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
  async GM_xmlhttpRequest(request: GMApiRequest<[GMSend.XHRDetails?]>, sender: IGetSender) {
    const param1 = request.params[0];
    if (!param1) {
      throw new Error("param is failed");
    }
    // 先处理unsafe hearder
    // 关联自己生成的请求id与chrome.webRequest的请求id
    const requestId = 10000 + (await cacheInstance.incr("gmXhrRequestId", 1));
    // 添加请求header
    if (!param1.headers) {
      param1.headers = {};
    }

    // 处理cookiePartition
    if (typeof param1.cookiePartition !== "object" || param1.cookiePartition == null) {
      param1.cookiePartition = {};
    }
    if (typeof param1.cookiePartition.topLevelSite !== "string") {
      // string | undefined
      param1.cookiePartition.topLevelSite = undefined;
    }

    param1.headers["X-Scriptcat-GM-XHR-Request-Id"] = requestId.toString();
    param1.headers = await this.buildDNRRule(requestId, param1, sender);
    const resultParam: RequestResultParams = {
      requestId,
      statusCode: 0,
      responseHeader: "",
    };
    let finalUrl = "";
    // 等待response
    this.cache.set("gmXhrRequest:params:" + requestId, {
      redirect: param1.redirect,
    });
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
    if (param1.responseType === "stream" || param1.fetch || param1.redirect) {
      // 只有fetch支持ReadableStream、redirect这些，直接使用fetch
      return this.CAT_fetch(param1, sender, resultParam);
    }
    if (!sender.isType(GetSenderType.CONNECT)) {
      throw new Error("GM_xmlhttpRequest ERROR: sender is not MessageConnect");
    }
    const msgConn = sender.getConnect();
    if (!msgConn) {
      throw new Error("GM_xmlhttpRequest ERROR: msgConn is undefined");
    }
    // 再发送到offscreen, 处理请求
    const offscreenCon = await connect(this.msgSender, "offscreen/gmApi/xmlHttpRequest", param1);
    offscreenCon.onMessage((msg) => {
      // 发送到content
      // 替换msg.data.responseHeaders
      msg.data.responseHeaders = resultParam.responseHeader || msg.data.responseHeaders;
      // 替换finalUrl
      if (finalUrl) {
        msg.data.finalUrl = finalUrl;
      }
      msgConn.sendMessage(msg);
    });
    msgConn.onDisconnect(() => {
      // 关闭连接
      offscreenCon.disconnect();
    });
  }

  @PermissionVerify.API({ alias: ["CAT_registerMenuInput"] })
  GM_registerMenuCommand(request: GMApiRequest<GMRegisterMenuCommandParam>, sender: IGetSender) {
    const [key, name, options] = request.params;
    // 触发菜单注册, 在popup中处理
    this.mq.emit<TScriptMenuRegister>("registerMenuCommand", {
      uuid: request.script.uuid,
      key,
      name,
      options,
      tabId: sender.getSender()?.tab?.id || -1,
      frameId: sender.getSender()?.frameId,
      documentId: sender.getSender()?.documentId,
    });
  }

  @PermissionVerify.API({ alias: ["CAT_unregisterMenuInput"] })
  GM_unregisterMenuCommand(request: GMApiRequest<GMUnRegisterMenuCommandParam>, sender: IGetSender) {
    const [key] = request.params;
    // 触发菜单取消注册, 在popup中处理
    this.mq.emit<TScriptMenuUnregister>("unregisterMenuCommand", {
      uuid: request.script.uuid,
      key,
      tabId: sender.getSender()?.tab?.id || -1,
      frameId: sender.getSender()?.frameId,
      documentId: sender.getSender()?.documentId,
    });
  }

  @PermissionVerify.API({})
  async GM_openInTab(request: GMApiRequest<[string, GMTypes.SWOpenTabOptions]>, sender: IGetSender) {
    const url = request.params[0];
    const options = request.params[1];
    const getNewTabId = async () => {
      if (options.useOpen === true) {
        // 发送给offscreen页面处理 （使用window.open）
        const ok = await sendMessage(this.msgSender, "offscreen/gmApi/openInTab", { url });
        if (ok) {
          // 由于window.open强制在前台打开标签，因此获取状态为{ active:true }的标签即为新标签
          const tab = await getCurrentTab();
          return tab.id;
        } else {
          // 当新tab被浏览器阻止时window.open()会返回null 视为已经关闭
          // 似乎在Firefox中禁止在background页面使用window.open()，强制返回null
          return false;
        }
      } else {
        const { tabId, windowId } = sender.getExtMessageSender();
        const active = options.active;
        const currentTab = await chrome.tabs.get(tabId);
        let newTabIndex = -1;
        if (options.incognito && !currentTab.incognito) {
          // incognito: "split" 在 normal 里不会看到 incognito
          // 只能创建新 incognito window
          // pinned 无效
          // insert 不重要
          await chrome.windows.create({
            url,
            incognito: true,
            focused: active,
          });
          return 0;
        }
        if ((typeof options.insert === "number" || options.insert === true) && currentTab && currentTab.index >= 0) {
          // insert 为 boolean 时，插入至当前Tab下一格 (TM行为)
          // insert 为 number 时，插入至相对位置 （SC独自）
          const insert = +options.insert;
          newTabIndex = currentTab.index + insert;
          if (newTabIndex < 0) newTabIndex = 0;
        }
        const createProperties = {
          url,
          active: active,
        } as chrome.tabs.CreateProperties;
        if (options.setParent) {
          // SC 预设 setParent: true 以避免不可预计的问题
          createProperties.openerTabId = tabId === -1 ? undefined : tabId;
          createProperties.windowId = windowId === -1 ? undefined : windowId;
        }
        if (options.pinned) {
          // VM/FM行为
          createProperties.pinned = true;
        } else if (newTabIndex >= 0) {
          // insert option; pinned 情况下无效
          createProperties.index = newTabIndex;
        }
        const tab = await chrome.tabs.create(createProperties);
        return tab.id;
      }
    };
    const tabId = await getNewTabId();
    if (tabId) {
      // 有 tab 创建的话
      await cacheInstance.set(`GM_openInTab:${tabId}`, {
        uuid: request.uuid,
        sender: sender.getExtMessageSender(),
      });
      return tabId;
    }
    // 创建失败时返回 0
    return 0;
  }

  @PermissionVerify.API({
    link: ["GM_openInTab"],
  })
  async GM_closeInTab(request: GMApiRequest<[number]>, _sender: IGetSender): Promise<boolean> {
    try {
      await chrome.tabs.remove(request.params[0]);
    } catch (e) {
      this.logger.error("GM_closeInTab", Logger.E(e));
    }
    return true;
  }

  @PermissionVerify.API({})
  GM_getTab(request: GMApiRequest<void>, sender: IGetSender) {
    return cacheInstance.tx(`GM_getTab:${request.uuid}`, (tabData: { [key: number]: any } | undefined) => {
      const ret = tabData?.[sender.getExtMessageSender().tabId];
      return ret;
    });
  }

  @PermissionVerify.API()
  async GM_saveTab(request: GMApiRequest<[object]>, sender: IGetSender) {
    const data = request.params[0];
    const tabId = sender.getExtMessageSender().tabId;
    await cacheInstance.tx(`GM_getTab:${request.uuid}`, (tabData: { [key: number]: any } | undefined, tx) => {
      tabData = tabData || {};
      tabData[tabId] = data;
      tx.set(tabData);
    });
    return true;
  }

  @PermissionVerify.API()
  GM_getTabs(request: GMApiRequest<void>, _sender: IGetSender) {
    return cacheInstance.tx(`GM_getTab:${request.uuid}`, (tabData: { [key: number]: any } | undefined, tx) => {
      if (!tabData) tx.set((tabData = {}));
      return tabData;
    });
  }

  @PermissionVerify.API({})
  async GM_notification(request: GMApiRequest<[GMTypes.NotificationDetails, string | undefined]>, sender: IGetSender) {
    const details: GMTypes.NotificationDetails = request.params[0];
    const notificationId: string | undefined = request.params[1];
    if (!details || typeof (notificationId ?? "") !== "string") {
      throw new Error("param is failed");
    }
    const options: chrome.notifications.NotificationCreateOptions = {
      title: details.title || "ScriptCat",
      message: details.text || i18n.t("no_message_content"),
      iconUrl: details.image || getIcon(request.script) || chrome.runtime.getURL("assets/logo.png"),
      type: isFirefox() || details.progress === undefined ? "basic" : "progress",
    };
    if (!isFirefox()) {
      options.silent = details.silent;
      options.buttons = details.buttons;
    }
    options.progress = options.progress && parseInt(details.progress as any, 10);

    if (typeof notificationId === "string") {
      let res = await notificationsUpdate(notificationId, options);
      if (!res.ok && res.apiError === BrowserNoSupport) {
        // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/notifications/update#browser_compatibility
        this.logger.error("Your browser does not support GM_updateNotification");
      } else if (!res.ok && res.apiError) {
        if (res.apiError.message.includes("images")) {
          // 如果更新失败，删除图标再次尝试
          options.iconUrl = chrome.runtime.getURL("assets/logo.png");
          res = await notificationsUpdate(notificationId, options);
        }
        // 仍然失败，输出 error log
        if (!res.ok && res.apiError) {
          this.logger.error("GM_notification update", Logger.E(res.apiError));
        }
      }
      if (!res?.ok) {
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
      await cacheInstance.set(`GM_notification:${notificationId}`, {
        uuid: request.script.uuid,
        details: details,
        sender: sender.getExtMessageSender(),
      });
      if (details.timeout) {
        setTimeout(async () => {
          chrome.notifications.clear(notificationId);
          const sender = await cacheInstance.get<NotificationData>(`GM_notification:${notificationId}`);
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
          cacheInstance.del(`GM_notification:${notificationId}`);
        }, details.timeout);
      }
      return notificationId;
    }
  }

  @PermissionVerify.API({
    link: ["GM_notification"],
  })
  GM_closeNotification(request: GMApiRequest<[string]>, _sender: IGetSender) {
    const notificationId = request.params[0];
    if (!notificationId) {
      throw new Error("param is failed");
    }
    cacheInstance.del(`GM_notification:${notificationId}`);
    chrome.notifications.clear(notificationId);
  }

  @PermissionVerify.API({
    link: ["GM_notification"],
  })
  GM_updateNotification(request: GMApiRequest<[string, GMTypes.NotificationDetails]>, _sender: IGetSender) {
    if (typeof chrome.notifications?.update !== "function") {
      // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/notifications/update#browser_compatibility
      throw new Error("Your browser does not support GM_updateNotification");
    }
    const id = request.params[0];
    const details = request.params[1];
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
  async GM_download(request: GMApiRequest<[GMTypes.DownloadDetails]>, sender: IGetSender) {
    if (!sender.isType(GetSenderType.CONNECT)) {
      throw new Error("GM_download ERROR: sender is not MessageConnect");
    }
    const msgConn = sender.getConnect();
    if (!msgConn) {
      throw new Error("GM_download ERROR: msgConn is undefined");
    }
    const params = request.params[0];
    // 替换掉windows下文件名的非法字符为 -
    const fileName = cleanFileName(params.name);
    // blob本地文件或显示指定downloadMode为"browser"则直接下载
    if (params.url.startsWith("blob:") || params.downloadMode === "browser") {
      chrome.downloads.download(
        {
          url: params.url,
          saveAs: params.saveAs,
          filename: fileName,
        },
        () => {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            console.error("chrome.runtime.lastError in chrome.downloads.download:", lastError);
            // 下载API出现问题但继续执行
          }
          msgConn.sendMessage({ action: "onload" });
        }
      );
      return;
    }
    // 使用xhr下载blob,再使用download api创建下载
    const EE = new EventEmitter<string, any>();
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
          msgConn.sendMessage({
            action: "onload",
            data: respond,
          });
          chrome.downloads.download({
            url: xhr.response,
            saveAs: params.saveAs,
            filename: fileName,
          });
          break;
        case "onerror":
          msgConn.sendMessage({
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
          msgConn.sendMessage({
            action: "onprogress",
            data: respond,
          });
          break;
        case "ontimeout":
          msgConn.sendMessage({
            action: "ontimeout",
          });
          break;
      }
    });
    return this.GM_xmlhttpRequest(
      {
        ...request,
        params: [
          // 处理参数问题
          {
            method: params.method || "GET",
            url: params.url,
            headers: params.headers,
            timeout: params.timeout,
            cookie: params.cookie,
            anonymous: params.anonymous,
            responseType: "blob",
          } as GMSend.XHRDetails,
        ],
      },
      new SenderConnect(mockConnect)
    );
  }

  @PermissionVerify.API()
  async GM_setClipboard(request: GMApiRequest<[string, GMTypes.GMClipboardInfo?]>, _sender: IGetSender) {
    const [data, type] = request.params;
    const clipboardType = type || "text/plain";
    await sendMessage(this.msgSender, "offscreen/gmApi/setClipboard", { data, type: clipboardType });
  }

  @PermissionVerify.API()
  async ["window.close"](request: GMApiRequest<void>, sender: IGetSender) {
    /*
     * Note: for security reasons it is not allowed to close the last tab of a window.
     * https://www.tampermonkey.net/documentation.php#api:window.close
     * 暂不清楚安全原因具体指什么
     * 原生window.close也可能关闭最后一个标签，暂不做限制
     */
    const tabId = sender.getSender()?.tab?.id;
    if (Number.isFinite(tabId)) {
      await chrome.tabs.remove(tabId as number);
    }
  }

  @PermissionVerify.API()
  async ["window.focus"](request: GMApiRequest<void>, sender: IGetSender) {
    const tabId = sender.getSender()?.tab?.id;
    if (Number.isFinite(tabId)) {
      await chrome.tabs.update(tabId as number, {
        active: true,
      });
    }
  }

  handlerNotification() {
    const send = async (
      event: NotificationMessageOption["event"],
      notificationId: string,
      params: NotificationMessageOption["params"] = {}
    ) => {
      const sender = await cacheInstance.get<NotificationData>(`GM_notification:${notificationId}`);
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
      cacheInstance.del(`GM_notification:${notificationId}`);
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
                if (header.value) {
                  try {
                    // https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Location
                    // <url> May be relative to the request URL or an absolute URL.
                    const url = new URL(header.value, details.url);
                    if (url.href) {
                      location = url.href;
                    }
                  } catch {
                    // ignore
                  }
                }
              }
            });
            const params = this.cache.get("gmXhrRequest:params:" + requestId) as GMSend.XHRDetails;
            // 如果是重定向，并且不是manual模式，则需要重新设置dnr规则
            if (location && params.redirect !== "manual") {
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
            this.cache.delete("gmXhrRequest:params:" + requestId);
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
      const sender = await cacheInstance.get<{
        uuid: string;
        sender: ExtMessageSender;
      }>(`GM_openInTab:${tabId}`);
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
        cacheInstance.del(`GM_openInTab:${tabId}`);
      }
    });
  }
}
