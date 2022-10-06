/* eslint-disable camelcase */
export type SyncType = "script" | "subscribe";

export type SyncAction = "update" | "delete";

export interface SyncScript {
  name: string;
  uuid: string;
  code: string;
  meta_json: string;
  self_meta: string;
  origin: string;
  sort: number;
  subscribe_url?: string;
  type: number;
  createtime: number;
  updatetime?: number;
}

export interface SycnSubscribe {
  name: string;
  url: string;
  code: string;
  meta_json: string;
  scripts: string;
  createtime: number;
  updatetime?: number;
}

export interface SyncData {
  action: SyncAction;
  actiontime: number;
  uuid?: string;
  url?: string;
  msg?: string;
  script?: SyncScript;
  subscribe?: SycnSubscribe;
}

export interface Sync {
  id: number;
  key: string;
  user: number;
  device: number;
  type: SyncType;
  data: SyncData;
  createtime: number;
}
