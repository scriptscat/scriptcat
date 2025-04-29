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

  menuClick(uuid: string, data: ScriptMenuItem) {
    return this.do("menuClick", {
      uuid,
      id: data.id,
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
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 60 * 1000);
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
