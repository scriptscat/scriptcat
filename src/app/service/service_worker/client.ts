import type { Script, ScriptCode, ScriptRunResource, TClientPageLoadInfo } from "@App/app/repo/scripts";
import { type Resource } from "@App/app/repo/resource";
import { type Subscribe } from "@App/app/repo/subscribe";
import { type Permission } from "@App/app/repo/permission";
import type { InstallSource, ScriptMenu, ScriptMenuItem, TBatchUpdateListAction } from "./types";
import { Client } from "@Packages/message/client";
import type { MessageSend } from "@Packages/message/types";
import type PermissionVerify from "./permission_verify";
import { type UserConfirm } from "./permission_verify";
import { type FileSystemType } from "@Packages/filesystem/factory";
import { type ResourceBackup } from "@App/pkg/backup/struct";
import { type VSCodeConnect } from "../offscreen/vscode-connect";
import { type ScriptInfo } from "@App/pkg/utils/scriptInstall";
import type {
  ScriptService,
  TCheckScriptUpdateOption,
  TOpenBatchUpdatePageOption,
  TScriptInstallParam,
  TScriptInstallReturn,
} from "./script";
import { encodeRValue, type TKeyValuePair } from "@App/pkg/utils/message_value";
import { type TSetValuesParams } from "./value";

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
    return this.do<[boolean, ScriptInfo, { byWebRequest?: boolean }]>("getInstallInfo", uuid);
  }

  install(params: TScriptInstallParam): Promise<TScriptInstallReturn> {
    if (!params.upsertBy) params.upsertBy = "user";
    return this.doThrow("install", { ...params } satisfies TScriptInstallParam);
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

  getFilterResult(req: { value: string }): Promise<ScriptCode | undefined> {
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

  sortScript(data: { before: string[]; after: string[] }) {
    return this.do("sortScript", data);
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

  setScriptValue({ uuid, key, value, ts }: { uuid: string; key: string; value: any; ts?: number }) {
    const keyValuePairs = [[key, encodeRValue(value)]] as TKeyValuePair[];
    return this.do("setScriptValues", { uuid, keyValuePairs, ts } as TSetValuesParams);
  }

  setScriptValues(params: TSetValuesParams) {
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

  pageLoad(): Promise<TClientPageLoadInfo> {
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
}
