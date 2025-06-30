import { Script, ScriptCode, ScriptRunResouce } from "@App/app/repo/scripts";
import { Client } from "@Packages/message/client";
import { InstallSource } from ".";
import { Resource } from "@App/app/repo/resource";
import { MessageSend } from "@Packages/message/server";
import { ScriptMenu, ScriptMenuItem } from "./popup";
import PermissionVerify, { ConfirmParam, UserConfirm } from "./permission_verify";
import { FileSystemType } from "@Packages/filesystem/factory";
import { v4 as uuidv4 } from "uuid";
import Cache from "@App/app/cache";
import CacheKey from "@App/app/cache_key";
import { Subscribe } from "@App/app/repo/subscribe";
import { Permission } from "@App/app/repo/permission";
import { ResourceBackup } from "@App/pkg/backup/struct";
import { VSCodeConnect } from "../offscreen/vscode-connect";

export class ServiceWorkerClient extends Client {
  constructor(msg: MessageSend) {
    super(msg, "serviceWorker");
  }

  preparationOffscreen() {
    return this.do("preparationOffscreen");
  }
}

export class ScriptClient extends Client {
  constructor(msg: MessageSend) {
    super(msg, "serviceWorker/script");
  }

  // 脚本数据量大的时候，options页要读取全部的数据，可能会导致options页卡顿，直接调用serviceWorker的接口从内存中读取数据
  getAllScripts(): Promise<Script[]> {
    return this.do("getAllScripts");
  }

  // 获取安装信息
  getInstallInfo(uuid: string) {
    return this.do("getInstallInfo", uuid);
  }

  install(script: Script, code: string, upsertBy: InstallSource = "user"): Promise<{ update: boolean }> {
    return this.do("install", { script, code, upsertBy });
  }

  delete(uuid: string) {
    return this.do("delete", uuid);
  }

  enable(uuid: string, enable: boolean) {
    return this.do("enable", { uuid, enable });
  }

  info(uuid: string): Promise<Script> {
    return this.do("fetchInfo", uuid);
  }

  getCode(uuid: string): Promise<ScriptCode | undefined> {
    return this.do("getCode", uuid);
  }

  getScriptRunResource(script: Script): Promise<ScriptRunResouce> {
    return this.do("getScriptRunResource", script);
  }

  excludeUrl(uuid: string, url: string, remove: boolean) {
    return this.do("excludeUrl", { uuid, url, remove });
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

  importByUrl(url: string) {
    return this.do("importByUrl", url);
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
        if (code != 0) {
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
    const results = await Promise.allSettled(
      urls.map(async (url) => {
        const formattedResult = await this.formatUrl(url);
        if (formattedResult instanceof Object) {
          return await Promise.resolve(formattedResult);
        } else {
          return await this.do("importByUrl", formattedResult);
        }
      })
      // this.do 只会resolve 不会reject
    ) as PromiseFulfilledResult<{ success: boolean; msg: string }>[];
    const stat = results.reduce(
      (obj, result, index) => {
        if (result.value.success) {
          obj.success++;
        } else {
          obj.fail++;
          obj.msg.push(`#${index + 1}: ${result.value.msg}`);
        }
        return obj;
      },
      { success: 0, fail: 0, msg: [] as string[] }
    );
    return stat;
  }
}

export class ResourceClient extends Client {
  constructor(msg: MessageSend) {
    super(msg, "serviceWorker/resource");
  }

  getScriptResources(script: Script): Promise<{ [key: string]: Resource }> {
    return this.do("getScriptResources", script);
  }

  deleteResource(url: string) {
    return this.do("deleteResource", url);
  }
}

export class ValueClient extends Client {
  constructor(msg: MessageSend) {
    super(msg, "serviceWorker/value");
  }

  getScriptValue(script: Script): Promise<{ [key: string]: any }> {
    return this.do("getScriptValue", script);
  }

  setScriptValue(uuid: string, key: string, value: any) {
    return this.do("setScriptValue", { uuid, key, value });
  }

  setScriptValues(uuid: string, values: { [key: string]: any }) {
    return this.do("setScriptValues", { uuid, values });
  }
}

export class RuntimeClient extends Client {
  constructor(msg: MessageSend) {
    super(msg, "serviceWorker/runtime");
  }

  runScript(uuid: string) {
    return this.do("runScript", uuid);
  }

  stopScript(uuid: string) {
    return this.do("stopScript", uuid);
  }

  pageLoad(): Promise<{ flag: string; scripts: ScriptRunResouce[] }> {
    return this.do("pageLoad");
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

export class PopupClient extends Client {
  constructor(msg: MessageSend) {
    super(msg, "serviceWorker/popup");
  }

  getPopupData(data: GetPopupDataReq): Promise<GetPopupDataRes> {
    return this.do("getPopupData", data);
  }

  menuClick(uuid: string, data: ScriptMenuItem, inputValue?: any) {
    return this.do("menuClick", {
      uuid,
      id: data.id,
      inputValue,
      sender: {
        tabId: data.tabId,
        frameId: data.frameId,
        documentId: data.documentId,
      },
    });
  }
}

export class PermissionClient extends Client {
  constructor(msg: MessageSend) {
    super(msg, "serviceWorker/runtime/permission");
  }

  confirm(uuid: string, userConfirm: UserConfirm): Promise<void> {
    return this.do("confirm", { uuid, userConfirm });
  }

  getPermissionInfo(uuid: string): ReturnType<PermissionVerify["getInfo"]> {
    return this.do("getInfo", uuid);
  }

  deletePermission(uuid: string, permission: string, permissionValue: string) {
    return this.do("deletePermission", { uuid, permission, permissionValue });
  }

  getScriptPermissions(uuid: string): ReturnType<PermissionVerify["getScriptPermissions"]> {
    return this.do("getScriptPermissions", uuid);
  }

  addPermission(permission: Permission) {
    return this.do("addPermission", permission);
  }

  resetPermission(uuid: string) {
    return this.do("resetPermission", uuid);
  }
}

export class SynchronizeClient extends Client {
  constructor(msg: MessageSend) {
    super(msg, "serviceWorker/synchronize");
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
    await Cache.getInstance().set(CacheKey.importFile(uuid), {
      filename: filename,
      url: url,
    });
    // 打开导入窗口，用cache实现数据交互
    chrome.tabs.create({
      url: `/src/import.html?uuid=${uuid}`,
    });
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
  constructor(msg: MessageSend) {
    super(msg, "serviceWorker/subscribe");
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
  constructor(msg: MessageSend) {
    super(msg, "serviceWorker/system");
  }

  connectVSCode(params: Parameters<VSCodeConnect["connect"]>[0]): ReturnType<VSCodeConnect["connect"]> {
    return this.do("connectVSCode", params);
  }

  loadFavicon(icon: string): Promise<string> {
    return this.do("loadFavicon", icon);
  }
}
