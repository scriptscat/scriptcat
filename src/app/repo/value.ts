import Dexie from "dexie";
import { DAO, db } from "./dao";

export interface Value {
  id: number;
  scriptId: number;
  storageName?: string;
  key: string;
  value: any;
  createtime: number;
  updatetime: number;
}

export class ValueDAO extends DAO<Value> {
  public tableName = "value";

  constructor(table?: Dexie.Table<Value, number>) {
    super();
    if (table) {
      this.table = table;
    } else {
      this.table = db.table(this.tableName);
    }
  }
}
