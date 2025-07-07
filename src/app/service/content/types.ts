// types

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
  depend?: string[];
}

export interface ApiValue {
  api: any;
  param: ApiParam;
}