import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import { ScriptDAO } from "@App/app/repo/scripts";
import { type IGetSender, type Group, GetSenderType } from "@Packages/message/server";
import type { ExtMessageSender, MessageSend, TMessageCommAction } from "@Packages/message/types";
import { connect, sendMessage } from "@Packages/message/client";
import type { IMessageQueue } from "@Packages/message/message_queue";
import { type ValueService } from "@App/app/service/service_worker/value";
import type { ConfirmParam } from "../permission_verify";
import PermissionVerify, { PermissionVerifyApiGet } from "../permission_verify";
import { cacheInstance } from "@App/app/cache";
import { type RuntimeService } from "../runtime";
import { getIcon, isFirefox, getCurrentTab, openInCurrentTab, cleanFileName, makeBlobURL } from "@App/pkg/utils/utils";
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
} from "../types";
import type { TScriptMenuRegister, TScriptMenuUnregister } from "../../queue";
import { BrowserNoSupport, notificationsUpdate } from "../utils";
import i18n from "@App/locales/locales";
import { encodeRValue, type TKeyValuePair } from "@App/pkg/utils/message_value";
import { createObjectURL } from "../../offscreen/client";
import type { GMXhrStrategy } from "./gm_xhr";
import {
  GMXhrFetchStrategy,
  GMXhrXhrStrategy,
  nwErrorResultPromises,
  nwErrorResults,
  redirectedUrls,
  scXhrRequests,
  SWRequestResultParams,
} from "./gm_xhr";
import { headerModifierMap, headersReceivedMap } from "./gm_xhr";
import { BgGMXhr } from "@App/pkg/utils/xhr/bg_gm_xhr";
import { mightPrepareSetClipboard, setClipboard } from "../clipboard";
import { nativePageWindowOpen } from "../../offscreen/gm_api";

let generatedUniqueMarkerIDs = "";
let generatedUniqueMarkerIDWhen = "";
// 用来生成绝不重复的 MarkerID
const generateUniqueMarkerID = () => {
  const u1 = Math.floor(Date.now()).toString(36);
  let u2 = `_${Math.floor(Math.random() * 2514670967279938 + 1045564536402193).toString(36)}`;
  if (u1 !== generatedUniqueMarkerIDWhen) {
    generatedUniqueMarkerIDWhen = u1;
    generatedUniqueMarkerIDs = u2;
  } else {
    // 实际上 u2 的重复可能性非常低
    while (generatedUniqueMarkerIDs.indexOf(u2) >= 0) {
      u2 = `_${Math.floor(Math.random() * 2514670967279938 + 1045564536402193).toString(36)}`;
    }
    generatedUniqueMarkerIDs += u2;
  }
  return `MARKER::${u1}${u2}`;
};

const enum xhrExtraCode {
  INVALID_URL = 0x20,
  DOMAIN_NOT_INCLUDED = 0x30,
  DOMAIN_IN_BLACKLIST = 0x40,
}

type OnBeforeSendHeadersOptions = `${chrome.webRequest.OnBeforeSendHeadersOptions}`;
type OnHeadersReceivedOptions = `${chrome.webRequest.OnHeadersReceivedOptions}`;

// GMExternalDependencies接口定义
// 为了支持外部依赖注入，方便测试和扩展
interface IGMExternalDependencies {
  emitEventToTab(to: ExtMessageSender, req: EmitEventRequest): void;
  isBlacklistNetwork(url: URL): boolean;
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

export enum ConnectMatch {
  NONE = 0, // 没有匹配
  ALL = 1, // 遇到 "*" 通配符
  DOMAIN = 2, // 匹配子域
  EXACT = 3, // 完全匹配
}

export enum SelfMatch {
  NONE = 0,
  EXACT = 1,
  SUB = 2,
}

export const getConnectMatched = (
  metadataConnect: string[] | undefined,
  reqURL: URL,
  sender: IGetSender
): ConnectMatch => {
  const checkSelfDomainMatching = () => {
    const senderURL = sender.getSender()?.url;
    if (senderURL) {
      let senderURLObject;
      try {
        senderURLObject = new URL(senderURL);
      } catch {
        // ignore
      }
      if (senderURLObject) {
        if (reqURL.hostname === senderURLObject.hostname) return SelfMatch.EXACT; // 自身
        if (`.${reqURL.hostname}`.endsWith(`.${senderURLObject.hostname}`)) return SelfMatch.SUB; // 子域
      }
    }
    return SelfMatch.NONE;
  };
  const selfCheckRes = checkSelfDomainMatching();
  if (selfCheckRes === SelfMatch.EXACT) {
    // TM 行为：只要是同一个网域的Xhr都放行。目前SC未支持finalUrl改变的拒绝
    return ConnectMatch.EXACT; // 完全匹配
  }
  // 不是同一网域时，检查一下 @connect
  if (metadataConnect?.length) {
    for (let i = 0, l = metadataConnect.length; i < l; i += 1) {
      const lowerMetaConnect = metadataConnect[i].toLowerCase();
      if (lowerMetaConnect === "self") {
        // 此处包含子网域
        if (selfCheckRes === SelfMatch.SUB) return ConnectMatch.DOMAIN; // 匹配其子域
      } else if (lowerMetaConnect === "*") {
        // 不完全遵照TM。SC 只要有 @connect * 就全放行不询问
        return ConnectMatch.ALL;
      } else if (`.${reqURL.hostname}`.endsWith(`.${lowerMetaConnect}`)) {
        return ConnectMatch.DOMAIN; // 完全匹配或其子域
      }
    }
  }
  return ConnectMatch.NONE;
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
  isBlacklistNetwork(url: URL) {
    const isBlackListed =
      this.runtimeService.isUrlBlacklist(url.href) || // 黑名单中含有该网址 https://abc.com/page.html
      this.runtimeService.isUrlBlacklist(`${url.protocol}//${url.hostname}`) || // 黑名单中含有该网域 https://abc.com
      this.runtimeService.isUrlBlacklist(`${url.protocol}//${url.hostname}/`); // 黑名单中含有该网域 https://abc.com/
    return isBlackListed;
  }
}

export class MockGMExternalDependencies implements IGMExternalDependencies {
  emitEventToTab(to: ExtMessageSender, req: EmitEventRequest): void {
    // Mock implementation for testing
    console.log("Mock emitEventToTab called", { to, req });
  }
  isBlacklistNetwork(_url: URL) {
    return false;
  }
}

const supportedRequestMethods = new Set<string>([
  "connect",
  "delete",
  "get",
  "head",
  "options",
  "patch",
  "post",
  "put",
]);

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
      await this.permissionVerify.verify(req, api, sender, this);
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
      if (getConnectMatched(request.script.metadata.connect, url, sender) === ConnectMatch.NONE) {
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
    if (!detail.partitionKey || typeof detail.partitionKey !== "object") {
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

  @PermissionVerify.API({ link: ["GM_deleteValue", "GM_deleteValues"] })
  async GM_setValue(request: GMApiRequest<[string, string, any?]>, sender: IGetSender) {
    if (!request.params || request.params.length < 2) {
      throw new Error("param is failed");
    }
    const [id, key, value] = request.params as [string, string, any];
    const keyValuePairs = [[key, encodeRValue(value)]] as TKeyValuePair[];
    const valueSender = {
      runFlag: request.runFlag,
      tabId: sender.getSender()?.tab?.id || -1,
    };
    await this.value.setValues({ uuid: request.script.uuid, id, keyValuePairs, isReplace: false, valueSender });
  }

  @PermissionVerify.API({ link: ["GM_deleteValues"] })
  async GM_setValues(request: GMApiRequest<[string, TKeyValuePair[]]>, sender: IGetSender) {
    if (!request.params || request.params.length !== 2) {
      throw new Error("param is failed");
    }
    const [id, keyValuePairs] = request.params;
    const valueSender = {
      runFlag: request.runFlag,
      tabId: sender.getSender()?.tab?.id || -1,
    };
    await this.value.setValues({ uuid: request.script.uuid, id, keyValuePairs, isReplace: false, valueSender });
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
          const url = await makeBlobURL({ blob, persistence: false }, (params) =>
            createObjectURL(this.msgSender, params)
          );
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
  async buildDNRRule(markerID: string, params: GMSend.XHRDetails, sender: IGetSender): Promise<boolean> {
    // 添加请求header
    const headers = params.headers || (params.headers = {});
    const { anonymous, cookie } = params;

    // HTTP/1.1 and HTTP/2
    // https://www.rfc-editor.org/rfc/rfc7540#section-8.1.2
    // https://datatracker.ietf.org/doc/html/rfc6648
    // All header names in HTTP/2 are lower case, and CF will convert if needed.
    // All headers comparisons in HTTP/1.1 should be case insensitive.
    headers["x-sc-request-marker"] = `${markerID}`;

    // 关联 reqID 方法
    // 1) 尝试在 onBeforeRequest 进行关连
    // 2) 如果在 chrome.webRequest.onBeforeSendHeaders 执行时，modifyHeaders DNR 未被执行，则以 "x-sc-request-marker" 进行关连

    // 如果header中没有origin就设置为空字符串，如果有origin就不做处理，注意处理大小写
    if (typeof headers["Origin"] !== "string" && typeof headers["origin"] !== "string") {
      headers["Origin"] = "";
    }

    const modifyReqHeaders = [] as chrome.declarativeNetRequest.ModifyHeaderInfo[];
    // 判断是否是anonymous
    if (anonymous) {
      // 如果是anonymous，并且有cookie，则设置为自定义的cookie
      if (cookie) {
        modifyReqHeaders.push({
          header: "cookie",
          operation: "set",
          value: cookie,
        });
      } else {
        // 否则删除cookie
        modifyReqHeaders.push({
          header: "cookie",
          operation: "remove",
        });
      }
    } else {
      if (cookie) {
        // 否则正常携带cookie header
        headers["cookie"] = cookie;
      }

      // 追加该网站本身存储的cookie
      const tabId = sender.getExtMessageSender().tabId;
      let storeId: string | undefined;
      if (tabId !== -1 && typeof tabId === "number") {
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
      if (cookies?.length) {
        const v = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
        const u = `${headers["cookie"] || ""}`.trim();
        headers["cookie"] = u ? `${u}${!u.endsWith(";") ? "; " : " "}${v}` : v;
      }
    }

    /** 请求的header的值 */
    for (const [key, headerValue] of Object.entries(headers)) {
      if (!headerValue) {
        modifyReqHeaders.push({
          header: key,
          operation: "remove",
        });
        delete headers[key];
      } else if (checkHasUnsafeHeaders(key)) {
        modifyReqHeaders.push({
          header: key,
          operation: "set",
          value: `${headerValue}`,
        });
        delete headers[key];
      }
    }

    if (modifyReqHeaders.length > 0) {
      // const tabs = await chrome.tabs.query({});
      // const excludedTabIds: number[] = [];
      // for (const tab of tabs) {
      //   if (tab.id) {
      //     excludedTabIds.push(tab.id);
      //   }
      // }
      let requestMethod = (params.method || "GET").toLowerCase() as chrome.declarativeNetRequest.RequestMethod;
      if (!supportedRequestMethods.has(requestMethod)) {
        requestMethod = "other" as chrome.declarativeNetRequest.RequestMethod;
      }
      const redirectNotManual = params.redirect !== "manual";

      // 使用 cacheInstance 避免SW重启造成重复 DNR Rule ID
      const ruleId = 10000 + (await cacheInstance.incr("gmXhrRequestId", 1));
      const rule = {
        id: ruleId,
        action: {
          type: "modifyHeaders",
          requestHeaders: modifyReqHeaders,
        },
        priority: 1,
        condition: {
          resourceTypes: ["xmlhttprequest"],
          urlFilter: params.url,
          requestMethods: [requestMethod],
          // excludedTabIds: excludedTabIds,
          tabIds: [chrome.tabs.TAB_ID_NONE], // 只限于后台 service_worker / offscreen
        },
      } as chrome.declarativeNetRequest.Rule;
      headerModifierMap.set(markerID, { rule, redirectNotManual });
      await chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: [ruleId],
        addRules: [rule],
      });
    }
    return true;
  }

  @PermissionVerify.API({
    confirm: async (request: GMApiRequest<[GMSend.XHRDetails]>, sender: IGetSender, GMApiInstance: GMApi) => {
      const config = <GMSend.XHRDetails>request.params[0];
      let url;
      try {
        url = new URL(config.url);
      } catch {
        request.extraCode = xhrExtraCode.INVALID_URL;
        return false;
      }
      if (GMApiInstance.gmExternalDependencies.isBlacklistNetwork(url)) {
        request.extraCode = xhrExtraCode.DOMAIN_IN_BLACKLIST;
        return false;
      }
      const connectMatched = getConnectMatched(request.script.metadata.connect, url, sender);
      if (connectMatched === ConnectMatch.ALL) {
        // SC: 有 @connect * 就不询问
        return true;
      } else {
        // 如果 @connect 有匹配到就放行
        if (connectMatched > 0) {
          return true;
        }
        // @connect 没有匹配，但有列明 @connect 的话，则自动拒绝
        if (request.script.metadata.connect?.find((e) => !!e)) {
          request.extraCode = xhrExtraCode.DOMAIN_NOT_INCLUDED;
          return false;
        }
        // 其他情况：要询问用户
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
    if (!sender.isType(GetSenderType.CONNECT)) {
      throw new Error("GM_xmlhttpRequest ERROR: sender is not MessageConnect");
    }
    const msgConn = sender.getConnect();
    if (!msgConn) {
      throw new Error("GM_xmlhttpRequest ERROR: msgConn is undefined");
    }
    let isConnDisconnected = false;
    msgConn.onDisconnect(() => {
      isConnDisconnected = true;
    });

    // 关联自己生成的请求id与chrome.webRequest的请求id
    // 随机生成(同步)，不需要 chrome.storage 存取
    const markerID = generateUniqueMarkerID();

    const resultParam = new SWRequestResultParams(markerID);

    const throwErrorFn = (error: string) => {
      if (!isConnDisconnected) {
        msgConn.sendMessage({
          action: "onerror",
          data: {
            status: resultParam.statusCode,
            responseHeaders: resultParam.responseHeaders,
            error: `${error}`,
            readyState: 4, // ERROR. DONE.
          },
        });
      }
      return new Error(`${error}`);
    };

    const details = request.params[0];
    if (!details) {
      throw throwErrorFn("param is failed");
    }

    if (request.extraCode === xhrExtraCode.INVALID_URL) {
      const msg = `Refused to connect to "${details.url}": The url is invalid`;
      throw throwErrorFn(msg);
    }
    if (request.extraCode === xhrExtraCode.DOMAIN_NOT_INCLUDED) {
      // 'Refused to connect to "https://nonexistent-domain-abcxyz.test/": This domain is not a part of the @connect list'
      const msg = `Refused to connect to "${details.url}": This domain is not a part of the @connect list`;
      throw throwErrorFn(msg);
    }
    if (request.extraCode === xhrExtraCode.DOMAIN_IN_BLACKLIST) {
      // 'Refused to connect to "https://example.org/": URL is blacklisted'
      const msg = `Refused to connect to "${details.url}": URL is blacklisted`;
      throw throwErrorFn(msg);
    }
    try {
      /*
        There are TM-specific parameters:
          - cookie a cookie to be patched into the sent cookie set
          - cookiePartition object?, containing the partition key to be used for sent and received partitioned cookies
                topLevelSite string?, representing the top frame site for partitioned cookies
        The ScriptCat implementation for cookie, cookiePartition, cookiePartition.topLevelSite are limited.
      */

      // 处理cookiePartition
      // 详见 https://github.com/scriptscat/scriptcat/issues/392
      // https://github.com/scriptscat/scriptcat/commit/3774aa3acebeadb6b08162625a9af29a9599fa96
      // cookiePartition shall refers to the following issue:
      // https://github.com/Tampermonkey/tampermonkey/issues/2419
      if (!details.cookiePartition || typeof details.cookiePartition !== "object") {
        details.cookiePartition = {};
      }
      if (typeof details.cookiePartition.topLevelSite !== "string") {
        // string | undefined
        details.cookiePartition.topLevelSite = undefined;
      }

      // 添加请求header, 处理unsafe hearder
      await this.buildDNRRule(markerID, details, sender);
      // let finalUrl = "";
      // 等待response

      let useFetch;
      {
        const anonymous = details.anonymous ?? details.mozAnon ?? false;

        const redirect = details.redirect;

        const isFetch = details.fetch ?? false;

        const isBufferStream = details.responseType === "stream";

        useFetch = isFetch || !!redirect || anonymous || isBufferStream;
      }
      const loadendCleanUp = () => {
        redirectedUrls.delete(markerID);
        nwErrorResults.delete(markerID);
        const reqId = scXhrRequests.get(markerID);
        if (reqId) scXhrRequests.delete(reqId);
        scXhrRequests.delete(markerID);
        headersReceivedMap.delete(markerID);
        headerModifierMap.delete(markerID);
      };
      let strategy: GMXhrStrategy | undefined = undefined;
      if (useFetch) {
        strategy = new GMXhrFetchStrategy(details, resultParam);
      } else if (typeof XMLHttpRequest === "function") {
        // No offscreen in Firefox, but Firefox background script itself provides XMLHttpRequest.
        // Firefox 中没有 offscreen，但 Firefox 的"后台脚本"本身提供了 XMLHttpRequest。
        strategy = new GMXhrXhrStrategy(resultParam);
      }
      if (strategy) {
        const bgGmXhr = new BgGMXhr(details, resultParam, msgConn, strategy);
        bgGmXhr.onLoaded(loadendCleanUp);
        bgGmXhr.do();
      } else {
        // 再发送到offscreen, 处理请求
        const offscreenCon = await connect(this.msgSender, "offscreen/gmApi/xmlHttpRequest", details);
        offscreenCon.onMessage((msg) => {
          // 发送到content
          let data = msg.data;
          // 修正 statusCode 在 接收responseHeader 后会变化的问题 (例如 401 -> 200)
          if (msg.data?.status && resultParam.statusCode > 0 && resultParam.statusCode !== msg.data?.status) {
            resultParam.resultParamStatusCode = msg.data.status;
          }
          data = {
            ...data,
            finalUrl: resultParam.finalUrl, // 替换finalUrl
            responseHeaders: resultParam.responseHeaders || data.responseHeaders || "", // 替换msg.data.responseHeaders
            status: resultParam.statusCode || data.statusCode || data.status,
          };
          msg = {
            action: msg.action,
            data: data,
          } as TMessageCommAction;
          if (msg.action === "onloadend") {
            loadendCleanUp();
          }
          if (!isConnDisconnected) {
            msgConn.sendMessage(msg);
          }
        });
        msgConn.onDisconnect(() => {
          // 关闭连接
          offscreenCon.disconnect();
        });
      }
    } catch (e: any) {
      throw throwErrorFn(`GM_xmlhttpRequest ERROR: ${e?.message || e || "Unknown Error"}`);
    }
  }

  @PermissionVerify.API({ alias: ["CAT_registerMenuInput"] })
  GM_registerMenuCommand(request: GMApiRequest<GMRegisterMenuCommandParam>, sender: IGetSender): any {
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
    if (options.useOpen) {
      const prevTab = await getCurrentTab();
      // 发送给offscreen页面处理 （使用window.open）
      let ok;
      if (typeof window === "object" && typeof window?.open === "function") {
        // Firefox Background Page
        ok = nativePageWindowOpen({ url });
      } else {
        ok = await sendMessage(this.msgSender, "offscreen/gmApi/windowOpen", { url });
      }
      // 注：一般而言，特殊打开的话没有实际 tab id.
      // ------------------------------------------
      if (ok) {
        // 由于window.open强制在前台打开标签，因此获取状态为 { active:true } 的标签即为新标签
        const tab = await getCurrentTab();
        const tabId = tab?.id;
        if (tabId && tabId !== prevTab?.id) return tabId;
      }
      // 当新tab被浏览器阻止时 window.open() 会返回 null 视为已经关闭
      // 似乎在Firefox中禁止在background页面使用window.open()，强制返回null
      return false;
    }
    const getNewTabId = async () => {
      const { tabId, windowId } = sender.getExtMessageSender();
      const active = options.active;
      let currentTab: chrome.tabs.Tab | undefined;
      if (tabId !== -1) {
        currentTab = await chrome.tabs.get(tabId);
      }
      let newTabIndex = -1;
      if (options.incognito && !currentTab?.incognito) {
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
  async GM_download(request: GMApiRequest<[GMTypes.DownloadDetails<string>]>, sender: IGetSender) {
    if (!sender.isType(GetSenderType.CONNECT)) {
      throw new Error("GM_download ERROR: sender is not MessageConnect");
    }
    const msgConn = sender.getConnect();
    if (!msgConn) {
      throw new Error("GM_download ERROR: msgConn is undefined");
    }
    const params = request.params[0];
    // 如果downloadMode为native则走GM_xmlhttpRequest
    if (params.downloadMode === "native") {
      return this.GM_xmlhttpRequest(request satisfies GMApiRequest<[GMSend.XHRDetails?]>, sender);
    }
    let reqCompleteWith = "";
    let cDownloadId = 0;
    let isConnDisconnected = false;
    // 替换掉windows下文件名的非法字符为 -
    const fileName = cleanFileName(params.name);
    // blob本地文件或显示指定downloadMode为"browser"则直接下载
    const blobURL = params.url;
    const respond = null;
    const onChangedListener = (downloadDelta: chrome.downloads.DownloadDelta) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.downloads.onChanged:", lastError);
        return;
      }
      if (!cDownloadId || downloadDelta.id !== cDownloadId) return;
      if (downloadDelta.state?.current === "complete") {
        if (!isConnDisconnected && !reqCompleteWith) {
          reqCompleteWith = "ok";
          msgConn.sendMessage({
            action: "onload",
            data: respond,
          });
        }
        chrome.downloads.onChanged.removeListener(onChangedListener);
      } else if (downloadDelta.state?.current === "interrupted") {
        if (!isConnDisconnected && !reqCompleteWith) {
          reqCompleteWith = "interrupted";
          msgConn.sendMessage({
            action: "onerror",
            data: respond,
          });
        }
        chrome.downloads.onChanged.removeListener(onChangedListener);
      }
    };
    msgConn.onDisconnect(() => {
      if (isConnDisconnected) return;
      isConnDisconnected = true;
      if (cDownloadId > 0 && !reqCompleteWith) {
        reqCompleteWith = "disconnected";
        chrome.downloads.cancel(cDownloadId, () => {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            console.error("chrome.runtime.lastError in chrome.downloads.cancel:", lastError);
          }
        });
        chrome.downloads.onChanged.removeListener(onChangedListener);
      }
    });
    if (!blobURL) {
      if (!isConnDisconnected && !reqCompleteWith) {
        reqCompleteWith = "error:no_blob_url";
        msgConn.sendMessage({
          action: "onerror",
          data: respond,
        });
      }
      throw new Error("GM_download ERROR: blobURL is not provided.");
    }
    const downloadAPIOptions = {
      url: blobURL,
    } as chrome.downloads.DownloadOptions;
    if (typeof fileName === "string" && fileName) {
      downloadAPIOptions.filename = fileName;
    }
    if (typeof params.saveAs === "boolean") {
      downloadAPIOptions.saveAs = params.saveAs;
    }
    if (typeof params.conflictAction === "string") {
      downloadAPIOptions.conflictAction = params.conflictAction;
    }
    chrome.downloads.onChanged.addListener(onChangedListener);
    chrome.downloads.download(downloadAPIOptions, (downloadId: number | undefined) => {
      const lastError = chrome.runtime.lastError;
      let ok = true;
      if (lastError) {
        console.error("chrome.runtime.lastError in chrome.downloads.download:", lastError);
        // 下载API出现问题但继续执行
        ok = false;
      }
      if (downloadId === undefined) {
        console.error("GM_download ERROR: API Failure for chrome.downloads.download.");
        ok = false;
      }
      if (ok) {
        cDownloadId = downloadId as number;
      }
      if (!ok) {
        if (!isConnDisconnected && !reqCompleteWith) {
          reqCompleteWith = "error:download_api_error";
          msgConn.sendMessage({
            action: "onerror",
            data: respond,
          });
        }
        chrome.downloads.onChanged.removeListener(onChangedListener);
      }
    });
  }

  @PermissionVerify.API()
  async GM_setClipboard(request: GMApiRequest<[string, string]>, _sender: IGetSender) {
    const [data, mimetype] = request.params;
    if (typeof document === "object" && document?.documentElement) {
      // FF background script
      mightPrepareSetClipboard();
      setClipboard(data, mimetype);
    } else {
      await sendMessage(this.msgSender, "offscreen/gmApi/setClipboard", { data, mimetype });
    }
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
    chrome.webRequest.onBeforeRedirect.addListener(
      (details) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          console.error("chrome.runtime.lastError in chrome.webRequest.onBeforeRedirect:", lastError);
          // webRequest API 出错不进行后续处理
          return undefined;
        }
        if (details.tabId === -1) {
          const markerID = scXhrRequests.get(details.requestId);
          if (markerID) {
            redirectedUrls.set(markerID, details.redirectUrl);
          }
        }
      },
      {
        urls: ["<all_urls>"],
        types: ["xmlhttprequest"],
        tabId: chrome.tabs.TAB_ID_NONE, // 只限于后台 service_worker / offscreen
      }
    );
    const reqOpt: OnBeforeSendHeadersOptions[] = ["requestHeaders"];
    const respOpt: OnHeadersReceivedOptions[] = ["responseHeaders"];
    if (!isFirefox()) {
      reqOpt.push("extraHeaders");
      respOpt.push("extraHeaders");
    }

    chrome.webRequest.onErrorOccurred.addListener(
      (details) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          console.error("chrome.runtime.lastError in chrome.webRequest.onErrorOccurred:", lastError);
          // webRequest API 出错不进行后续处理
          return undefined;
        }
        if (details.tabId === -1) {
          const markerID = scXhrRequests.get(details.requestId);
          if (markerID) {
            nwErrorResults.set(markerID, details.error);
            nwErrorResultPromises.get(markerID)?.();
          }
        }
      },
      {
        urls: ["<all_urls>"],
        types: ["xmlhttprequest"],
        tabId: chrome.tabs.TAB_ID_NONE, // 只限于后台 service_worker / offscreen
      }
    );

    /*



          // 1) Network-level errors (DNS/TLS/connection/aborts)
      chrome.webRequest.onErrorOccurred.addListener((details) => {
        // Examples: net::ERR_NAME_NOT_RESOLVED, net::ERR_CONNECTION_REFUSED, net::ERR_ABORTED
        console.warn("[NET ERROR]", {
          url: details.url,
          error: details.error,
          type: details.type,           // main_frame, xmlhttprequest, fetch, etc.
          ip: details.ip,
          fromCache: details.fromCache,
          initiator: details.initiator, // who started it (tab/page/extension)
          tabId: details.tabId
        });
      }, { urls: ["<all_urls>"] });

      // 2) Inspect responses to spot CORS issues
      chrome.webRequest.onHeadersReceived.addListener((details) => {
        const headers = Object.fromEntries(
          (details.responseHeaders || []).map(h => [h.name.toLowerCase(), h.value || ""])
        );

        // If this was a cross-origin XHR/fetch, check for ACAO/ACAC headers.
        // (You can refine with details.initiator, tabId, and compare URL origins.)
        const hasACAO = "access-control-allow-origin" in headers;
        const hasACAC = "access-control-allow-credentials" in headers;

        if (!hasACAO) {
          console.info("[POSSIBLE CORS BLOCK]", {
            url: details.url,
            statusCode: details.statusCode,
            missing: "Access-Control-Allow-Origin",
            initiator: details.initiator,
            tabId: details.tabId
          });
        }
      }, { urls: ["<all_urls>"] }, ["responseHeaders"]);

    */
    chrome.webRequest.onBeforeSendHeaders.addListener(
      (details) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          console.error("chrome.runtime.lastError in chrome.webRequest.onBeforeSendHeaders:", lastError);
          // webRequest API 出错不进行后续处理
          return undefined;
        }
        if (details.tabId === -1) {
          const reqId = details.requestId;
          const requestHeaders = details.requestHeaders;
          if (requestHeaders) {
            // 如 onBeforeSendHeaders 是在 modifyHeaders 前执行，可以更新一下 reqId 和 markerID 的关联
            const markerID = requestHeaders?.find((h) => h.name.toLowerCase() === "x-sc-request-marker")?.value;
            if (markerID) scXhrRequests.set(reqId, markerID);
          }
          const markerID = scXhrRequests.get(reqId);
          if (!markerID) return undefined;
          redirectedUrls.set(markerID, details.url);
        }
        return undefined;
      },
      {
        urls: ["<all_urls>"],
        types: ["xmlhttprequest"],
        tabId: chrome.tabs.TAB_ID_NONE, // 只限于后台 service_worker / offscreen
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
          const reqId = details.requestId;

          const markerID = scXhrRequests.get(reqId);
          if (!markerID) return;
          headersReceivedMap.set(markerID, {
            responseHeaders: details.responseHeaders,
            statusCode: details.statusCode,
          });

          // 判断请求是否与gmXhrRequest关联
          const dnrRule = headerModifierMap.get(markerID);
          if (dnrRule) {
            const { rule, redirectNotManual } = dnrRule;
            // 判断是否重定向
            let location = "";
            details.responseHeaders?.forEach((header) => {
              if (header?.name?.length === 8 && header.name.toLowerCase() === "location" && header.value?.length) {
                // 重定向
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
            });

            // 如果是重定向，并且不是manual模式，则需要重新设置dnr规则
            if (location && redirectNotManual) {
              // 处理重定向后的unsafeHeader
              // 使用 object clone 避免 DNR API 新旧rule冲突
              const newRule = {
                ...rule,
                condition: {
                  ...rule.condition,
                  // 修改匹配链接
                  urlFilter: location,
                },
                action: {
                  ...rule.action,
                  // 不处理cookie
                  requestHeaders: rule.action.requestHeaders?.filter(
                    (header) => header.header.toLowerCase() !== "cookie"
                  ),
                },
              };
              headerModifierMap.set(markerID, { rule: newRule, redirectNotManual });
              chrome.declarativeNetRequest.updateSessionRules(
                {
                  removeRuleIds: [rule.id],
                  addRules: [newRule],
                },
                () => {
                  const lastError = chrome.runtime.lastError;
                  if (lastError) {
                    console.error("chrome.declarativeNetRequest.updateSessionRules:", lastError);
                  }
                }
              );
            } else {
              // 删除关联与DNR
              headerModifierMap.delete(markerID);
              chrome.declarativeNetRequest.updateSessionRules(
                {
                  removeRuleIds: [rule.id],
                },
                () => {
                  const lastError = chrome.runtime.lastError;
                  if (lastError) {
                    console.error("chrome.declarativeNetRequest.updateSessionRules:", lastError);
                  }
                }
              );
            }
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

    const ruleId = 999;
    const rule = {
      id: ruleId,
      action: {
        type: "modifyHeaders",
        requestHeaders: [
          {
            header: "x-sc-request-marker",
            operation: "remove",
          },
        ] satisfies chrome.declarativeNetRequest.ModifyHeaderInfo[],
      },
      priority: 1,
      condition: {
        resourceTypes: ["xmlhttprequest"],
        tabIds: [chrome.tabs.TAB_ID_NONE], // 只限于后台 service_worker / offscreen
      },
    } as chrome.declarativeNetRequest.Rule;
    chrome.declarativeNetRequest.updateSessionRules(
      {
        removeRuleIds: [ruleId],
        addRules: [rule],
      },
      () => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          console.error("chrome.declarativeNetRequest.updateSessionRules:", lastError);
        }
      }
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
