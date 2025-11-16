import type { TEncodedMessage } from "@App/pkg/utils/message_value";

export type ScriptFunc = (named: { [key: string]: any } | undefined, scriptName: string) => any;

// exec_script.ts

export type ValueUpdateSender = {
  runFlag: string;
  tabId?: number;
};

/**
 * key, value, oldValue
 */
export type ValueUpdateDateEntry = [string, any, any];

export type ValueUpdateData = {
  id?: string;
  entries: ValueUpdateDateEntry[];
  uuid: string;
  storageName: string; // 储存name
  sender: ValueUpdateSender;
};

export type ValueUpdateDataEncoded = {
  id?: string;
  entries: TEncodedMessage<ValueUpdateDateEntry[]>;
  uuid: string;
  storageName: string; // 储存name
  sender: ValueUpdateSender;
  valueUpdated: boolean;
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
