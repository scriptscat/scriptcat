import type { REncoded } from "@App/pkg/utils/message_value";

export type ScriptFunc = (named: { [key: string]: any } | undefined, scriptName: string) => any;

// exec_script.ts

export type ValueUpdateSender = {
  runFlag: string;
  tabId?: number;
};

/**
 * key, value, oldValue
 */
export type ValueUpdateDataEntry = [string, any, any];
export type ValueUpdateDataREntry = [string, REncoded, REncoded];

export type ValueUpdateDataEncoded = {
  id?: string;
  valueChanges: ValueUpdateDataREntry[];
  uuid: string;
  storageName: string; // 储存name
  sender: ValueUpdateSender;
  updatetime: number;
};

export type ValueUpdateSendData = {
  storageName: string;
  storageChanges: Record<string, ValueUpdateDataEncoded[]>;
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
  sandboxMode: typeof GM_info.sandboxMode; // 目前固定为 "raw"，预留
  isIncognito: typeof GM_info.isIncognito;
}
