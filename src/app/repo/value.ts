import { Repo } from "./repo";

export interface Value {
  uuid: string;
  storageName?: string;
  data: { [key: string]: any };
  createtime: number;
  updatetime: number;
  // 每次保存递增，见 ValueService.setValues；页面据此判断重订阅时是否漏收了更新。旧记录没有此字段，按 0 处理
  revision?: number;
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
