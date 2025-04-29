import { Repo } from "./repo";

export interface Value {
  uuid: string;
  storageName?: string;
  data: { [key: string]: any };
  createtime: number;
  updatetime: number;
}

export class ValueDAO extends Repo<Value> {
  constructor() {
    super("value");
  }

  save(key: string, value: Value) {
    return super._save(key, value);
  }
}
