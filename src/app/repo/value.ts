import { Repo } from "./repo";

export interface Value {
  uuid: string;
  storageName?: string;
  data: { [key: string]: any };
  createtime: number;
  updatetime: number;
  /** Persisted per-storageName ordering. Old records implicitly start at revision zero. */
  revision?: number;
  /** Changes when a storageName record is deleted and recreated. */
  epoch?: string;
}

export class ValueDAO extends Repo<Value> {
  constructor() {
    super("value");
  }

  save(key: string, value: Value) {
    return super._save(key, value);
  }
}

export type TGMKeyValue = Record<string, any>;
