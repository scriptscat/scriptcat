import type { Script, ScriptCode, ScriptRunResource } from "@App/app/repo/scripts";
import { type Resource } from "@App/app/repo/resource";
import { type Subscribe } from "@App/app/repo/subscribe";
import { type Permission } from "@App/app/repo/permission";
import type {
  InstallSource,
  ScriptLoadInfo,
  ScriptMenu,
  ScriptMenuItem,
  SearchType,
  TBatchUpdateListAction,
} from "./types";
import { Client } from "@Packages/message/client";
import type { MessageSend } from "@Packages/message/types";
import type PermissionVerify from "./permission_verify";
import { type UserConfirm } from "./permission_verify";
import { type FileSystemType } from "@Packages/filesystem/factory";
import { v4 as uuidv4 } from "uuid";
import { cacheInstance } from "@App/app/cache";
import { CACHE_KEY_IMPORT_FILE } from "@App/app/cache_key";
import { type ResourceBackup } from "@App/pkg/backup/struct";
import { type VSCodeConnect } from "../offscreen/vscode-connect";
import type { GMInfoEnv } from "../content/types";
import { type SystemService } from "./system";
import { type ScriptInfo } from "@App/pkg/utils/scriptInstall";
import type { ScriptService, TCheckScriptUpdateOption, TOpenBatchUpdatePageOption } from "./script";
import { type TKeyValuePair } from "@App/pkg/utils/message_value";

export class ServiceWorkerClient extends Client {
  constructor(msgSender: MessageSend) {
    super(msgSender, "serviceWorker");
  }

  preparationOffscreen() {
    return this.do("preparationOffscreen");
  }
}

export class ScriptClient extends Client {
  constructor(msgSender: MessageSend) {
    super(msgSender, "serviceWorker/script");
  }

  // 脚本数据量大的时候，options页要读取全部的数据，可能会导致options页卡顿，直接调用serviceWorker的接口从内存中读取数据
  getAllScripts(): Promise<Script[]> {
    return this.doThrow("getAllScripts");
  }

  // 获取安装信息
  getInstallInfo(uuid: string) {
    return this.do<[boolean, ScriptInfo]>("getInstallInfo", uuid);
  }

  install(script: Script, code: string, upsertBy: InstallSource = "user"): Promise<{ update: boolean }> {
    return this.doThrow("install", { script, code, upsertBy });
  }

  // delete(uuid: string) {
  //   return this.do("delete", uuid);
  // }

  deletes(uuids: string[]) {
    return this.do("deletes", uuids);
  }

  enable(uuid: string, enable: boolean) {
    return this.do("enable", { uuid, enable });
  }

  enables(uuids: string[], enable: boolean) {
    return this.do("enables", { uuids, enable });
  }

  info(uuid: string): Promise<Script> {
    return this.doThrow("fetchInfo", uuid);
  }

  getFilterResult(req: { type: SearchType; value: string }): Promise<ScriptCode | undefined> {
    return this.do("getFilterResult", req);
  }

  getScriptRunResourceByUUID(uuid: string): Promise<ScriptRunResource> {
    return this.doThrow("getScriptRunResourceByUUID", uuid);
  }

  excludeUrl(uuid: string, excludePattern: string, remove: boolean) {
    return this.do("excludeUrl", { uuid, excludePattern, remove });
  }

  // 重置匹配项
  resetMatch(uuid: string, match: string[] | undefined) {
    return this.do("resetMatch", { uuid, match });
  }

  // 重置排除项
  resetExclude(uuid: string, exclude: string[] | undefined) {
    return this.do("resetExclude", { uuid, exclude });
  }

  requestCheckUpdate(uuid: string) {
    return this.do("requestCheckUpdate", uuid);
  }

  sortScript(active: string, over: string) {
    return this.do("sortScript", { active, over });
  }

  pinToTop(uuids: string[]) {
    return this.do("pinToTop", uuids);
  }

  importByUrl(url: string): ReturnType<ScriptService["importByUrl"]> {
    return this.doThrow("importByUrl", url);
  }

  installByCode(uuid: string, code: string, upsertBy: InstallSource = "user") {
    return this.do("installByCode", { uuid, code, upsertBy });
  }

  async formatUrl(url: string) {
    try {
      const newUrl = new URL(url.replace(/\/$/, ""));
      const { hostname, pathname } = newUrl;
      // 判断是否为脚本猫脚本页
      if (hostname === "scriptcat.org" && /script-show-page\/\d+$/.test(pathname)) {
        const scriptId = pathname.match(/\d+$/)![0];
        // 请求脚本信息
        const scriptInfo = await fetch(`https://scriptcat.org/api/v2/scripts/${scriptId}`)
          .then((res) => {
            return res.json();
          })
          .then((json) => {
            return json;
          });
        const { code, data, msg } = scriptInfo;
        if (code !== 0) {
          // 无脚本访问权限
          return { success: false, msg };
        } else {
          // 返回脚本实际安装地址
          const scriptName = data.name;
          return `https://scriptcat.org/scripts/code/${scriptId}/${scriptName}.user.js`;
        }
      } else {
        return url;
      }
    } catch {
      return url;
    }
  }

  async importByUrls(urls: string[]) {
    if (urls.length == 0) {
      return;
    }
    const results = (await Promise.allSettled(
      urls.map(async (url) => {
        const formattedResult = await this.formatUrl(url);
        if (formattedResult instanceof Object) {
          return await Promise.resolve(formattedResult);
        } else {
          return await this.do("importByUrl", formattedResult);
        }
      })
      // this.do 只会resolve 不会reject
    )) as PromiseFulfilledResult<{ success: boolean; msg: string }>[];
    const stat = { success: 0, fail: 0, msg: [] as string[] };
    results.forEach(({ value }, index) => {
      if (value.success) {
        stat.success++;
      } else {
        stat.fail++;
        stat.msg.push(`#${index + 1}: ${value.msg}`);
      }
    });
    return stat;
  }

  setCheckUpdateUrl(uuid: string, checkUpdate: boolean, checkUpdateUrl?: string) {
    return this.do("setCheckUpdateUrl", { uuid, checkUpdate, checkUpdateUrl });
  }

  updateMetadata(uuid: string, key: string, value: string[]) {
    return this.do("updateMetadata", { uuid, key, value });
  }
  async getBatchUpdateRecordLite(i: number) {
    return this.do<any>("getBatchUpdateRecordLite", i);
  }

  async fetchCheckUpdateStatus() {
    return this.do<void>("fetchCheckUpdateStatus");
  }

  async sendUpdatePageOpened() {
    return this.do<void>("sendUpdatePageOpened");
  }

  async batchUpdateListAction(action: TBatchUpdateListAction): Promise<any> {
    return this.do<any>("batchUpdateListAction", action);
  }

  async openUpdatePageByUUID(uuid: string) {
    return this.do<void>("openUpdatePageByUUID", uuid);
  }

  async openBatchUpdatePage(opts: TOpenBatchUpdatePageOption) {
    return this.do<boolean>("openBatchUpdatePage", opts);
  }

  async checkScriptUpdate(opts: TCheckScriptUpdateOption) {
    return this.do<void>("checkScriptUpdate", opts);
  }
}

export class ResourceClient extends Client {
  constructor(msgSender: MessageSend) {
    super(msgSender, "serviceWorker/resource");
  }

  getScriptResources(script: Script): Promise<{ [key: string]: Resource }> {
    return this.doThrow("getScriptResources", script);
  }

  deleteResource(url: string) {
    return this.do("deleteResource", url);
  }
}

export class ValueClient extends Client {
  constructor(msgSender: MessageSend) {
    super(msgSender, "serviceWorker/value");
  }

  getScriptValue(script: Script): Promise<{ [key: string]: any }> {
    return this.doThrow("getScriptValue", script);
  }

  setScriptValue(params: { uuid: string; key: string; value: any }) {
    return this.do("setScriptValue", params);
  }

  setScriptValues(params: { uuid: string; keyValuePairs: TKeyValuePair[] }) {
    return this.do("setScriptValues", params);
  }
}

export class RuntimeClient extends Client {
  constructor(msgSender: MessageSend) {
    super(msgSender, "serviceWorker/runtime");
  }

  runScript(uuid: string) {
    return this.do("runScript", uuid);
  }

  stopScript(uuid: string) {
    return this.do("stopScript", uuid);
  }

  pageLoad(): Promise<{ scripts: ScriptLoadInfo[]; envInfo: GMInfoEnv }> {
    return this.doThrow("pageLoad");
  }

  scriptLoad(flag: string, uuid: string) {
    return this.do("scriptLoad", { flag, uuid });
  }
}

export type GetPopupDataReq = {
  tabId: number;
  url: string;
};

export type GetPopupDataRes = {
  // 在黑名单
  isBlacklist: boolean;
  scriptList: ScriptMenu[];
  backScriptList: ScriptMenu[];
};

export type MenuClickParams = {
  uuid: string;
  menus: ScriptMenuItem[];
  inputValue?: any;
};

export class PopupClient extends Client {
  constructor(msgSender: MessageSend) {
    super(msgSender, "serviceWorker/popup");
  }

  getPopupData(data: GetPopupDataReq): Promise<GetPopupDataRes> {
    return this.doThrow("getPopupData", data);
  }

  menuClick(uuid: string, menus: ScriptMenuItem[], inputValue?: any) {
    return this.do("menuClick", {
      uuid,
      menus,
      inputValue,
    } as MenuClickParams);
  }
}

export class PermissionClient extends Client {
  constructor(msgSender: MessageSend) {
    super(msgSender, "serviceWorker/runtime/permission");
  }

  confirm(uuid: string, userConfirm: UserConfirm): Promise<void> {
    return this.do("confirm", { uuid, userConfirm });
  }

  getPermissionInfo(uuid: string): ReturnType<PermissionVerify["getInfo"]> {
    return this.doThrow("getInfo", uuid);
  }

  deletePermission(uuid: string, permission: string, permissionValue: string) {
    return this.do("deletePermission", { uuid, permission, permissionValue });
  }

  getScriptPermissions(uuid: string): ReturnType<PermissionVerify["getScriptPermissions"]> {
    return this.doThrow("getScriptPermissions", uuid);
  }

  addPermission(permission: Permission) {
    return this.do("addPermission", permission);
  }

  updatePermission(permission: Permission) {
    return this.do("updatePermission", permission);
  }

  resetPermission(uuid: string) {
    return this.do("resetPermission", uuid);
  }
}

export class SynchronizeClient extends Client {
  constructor(msgSender: MessageSend) {
    super(msgSender, "serviceWorker/synchronize");
  }

  export(uuids?: string[]) {
    return this.do("export", uuids);
  }

  backupToCloud(type: FileSystemType, params: any) {
    return this.do("backupToCloud", { type, params });
  }

  async openImportWindow(filename: string, file: File | Blob) {
    // 打开导入窗口，用cache实现数据交互
    const url = URL.createObjectURL(file);
    // setTimeout(() => {
    //   URL.revokeObjectURL(url);
    // }, 60 * 1000);
    const uuid = uuidv4();
    const cacheKey = `${CACHE_KEY_IMPORT_FILE}${uuid}`;
    await cacheInstance.set(cacheKey, {
      filename: filename,
      url: url,
    });
    // 打开导入窗口，用cache实现数据交互
    window.open(chrome.runtime.getURL(`/src/import.html?uuid=${uuid}`), "_blank");
  }

  importResources(
    uuid: string | undefined,
    requires: ResourceBackup[],
    resources: ResourceBackup[],
    requiresCss: ResourceBackup[]
  ) {
    return this.do("importResources", { uuid, requires, resources, requiresCss });
  }
}

export class SubscribeClient extends Client {
  constructor(msgSender: MessageSend) {
    super(msgSender, "serviceWorker/subscribe");
  }

  install(subscribe: Subscribe) {
    return this.do("install", { subscribe });
  }

  delete(url: string) {
    return this.do("delete", { url });
  }

  checkUpdate(url: string) {
    return this.do("checkUpdate", { url });
  }

  enable(url: string, enable: boolean) {
    return this.do("enable", { url, enable });
  }
}

export class SystemClient extends Client {
  constructor(msgSender: MessageSend) {
    super(msgSender, "serviceWorker/system");
  }

  connectVSCode(params: Parameters<VSCodeConnect["connect"]>[0]): ReturnType<VSCodeConnect["connect"]> {
    return this.do("connectVSCode", params);
  }

  loadFavicon(icon: string): Promise<string> {
    return this.doThrow("loadFavicon", icon);
  }

  getFaviconFromDomain(domain: string): ReturnType<SystemService["getFaviconFromDomain"]> {
    return this.doThrow("getFaviconFromDomain", domain);
  }
}
