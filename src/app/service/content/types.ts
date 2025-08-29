import type { ScriptLoadInfo } from "../service_worker/types";

export type ScriptFunc = (named: { [key: string]: any } | undefined, scriptName: string) => any;

export type PreScriptFunc = { scriptInfo: ScriptLoadInfo; func: ScriptFunc };

// exec_script.ts

export type ValueUpdateSender = {
  runFlag: string;
  tabId?: number;
};

export type ValueUpdateData = {
  oldValue: any;
  value: any;
  key: string; // 值key
  uuid: string;
  storageName: string; // 储存name
  sender: ValueUpdateSender;
};

// gm_api.ts

export interface ApiParam {
  follow?: string;
  depend?: string[];
  alias?: string;
}

export interface ApiValue {
  fnKey: string;
  api: any;
  param: ApiParam;
}

export interface GMInfoEnv {
  userAgentData: typeof GM_info.userAgentData;
  sandboxMode: typeof GM_info.sandboxMode;
  isIncognito: typeof GM_info.isIncognito;
}
