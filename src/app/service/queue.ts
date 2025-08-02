import type { Script, SCRIPT_RUN_STATUS } from "../repo/scripts";
import type { InstallSource, ScriptMenuItem } from "./service_worker/types";
import type { Subscribe } from "../repo/subscribe";

export type TInstallScript = { script: Script; update: boolean; upsertBy?: InstallSource };

export type TDeleteScript = { uuid: string; script: Script };

export type TSortScript = Script[];

export type TInstallSubscribe = { subscribe: Subscribe };

export type TEnableScript = { uuid: string; enable: boolean };

export type TScriptRunStatus = { uuid: string; runStatus: SCRIPT_RUN_STATUS };

export type TScriptMenuRegister = {
  uuid: string;
  id: number;
  name: string;
  options?: ScriptMenuItem["options"];
  tabId: number;
  frameId?: number;
  documentId?: string;
};

export type TScriptMenuUnregister = {
  id: number;
  uuid: string;
  tabId: number;
  frameId?: number;
};
