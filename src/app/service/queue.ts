import type { Script, SCRIPT_RUN_STATUS, SCRIPT_STATUS, SCRIPT_TYPE } from "../repo/scripts";
import type {
  InstallSource,
  SWScriptMenuItemOption,
  TScriptMenuItemKey,
  TScriptMenuItemName,
} from "./service_worker/types";
import type { Subscribe } from "../repo/subscribe";

export type TInstallScriptParams = {
  uuid: string; // 脚本uuid,通过脚本uuid识别唯一脚本
  type: SCRIPT_TYPE; // 脚本类型 1:普通脚本 2:定时脚本 3:后台脚本
  status: SCRIPT_STATUS; // 脚本状态 1:启用 2:禁用 3:错误 4:初始化
  name: string; // 脚本名称
  namespace: string; // 脚本命名空间
  origin?: string; // 脚本来源
  checkUpdateUrl?: string; // 检查更新URL
  downloadUrl?: string; // 脚本下载URL
};

export type TInstallScript = { script: TInstallScriptParams; update: boolean; upsertBy?: InstallSource };

export type TDeleteScript = { uuid: string; storageName: string; type: SCRIPT_TYPE; deleteBy?: InstallSource };

export type TSortedScript = { uuid: string; sort: number };

export type TInstallSubscribe = { subscribe: Subscribe };

export type TEnableScript = { uuid: string; enable: boolean };

export type TScriptRunStatus = { uuid: string; runStatus: SCRIPT_RUN_STATUS };

export type TScriptValueUpdate = { script: Script; valueUpdated: boolean };

export type TScriptMenuRegister = {
  uuid: string;
  key: TScriptMenuItemKey;
  name: TScriptMenuItemName;
  options: SWScriptMenuItemOption;
  tabId: number;
  frameId?: number;
  documentId?: string;
};

export type TScriptMenuUnregister = {
  key: TScriptMenuItemKey;
  uuid: string;
  tabId: number;
  frameId?: number;
  documentId?: string;
};
