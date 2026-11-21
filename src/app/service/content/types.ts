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

export type ValueUpdateData = {
  id?: string;
  entries: ValueUpdateDataEntry[];
  uuid: string;
  storageName: string; // 储存name
  sender: ValueUpdateSender;
};

export type ValueUpdateDataEncoded = {
  id?: string;
  entries: ValueUpdateDataREntry[];
  uuid: string;
  storageName: string; // 储存name
  sender: ValueUpdateSender;
  valueUpdated: boolean;
  revision?: number; // 这次操作之后该存储的版本
};

// 一个 frame 对一个 storageName 的订阅：带上已知版本和运行中的脚本，SW 发现版本不一致时按脚本下发快照
export type ValueSubscription = {
  storageName: string;
  revision: number;
  uuids: string[];
};

// 重订阅补齐时下发给脚本世界：uuid → 该脚本当前的全部值
export type ValueSyncData = {
  storageName: string;
  values: Record<string, Record<string, unknown>>;
};

export type ValueSubscriptionAck = {
  storageName: string;
  revision: number;
  values?: Record<string, Record<string, unknown>>; // uuid → 该脚本当前的全部值
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
  userLanguage: typeof GM_info.userLanguage;
}
