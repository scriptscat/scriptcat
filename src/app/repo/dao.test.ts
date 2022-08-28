import Dexie from "dexie";
import { indexedDB, IDBKeyRange } from "fake-indexeddb";
import { DAO } from "./dao";
const db = new Dexie("Test", {
  indexedDB: indexedDB,
  IDBKeyRange: IDBKeyRange,
});

interface Test {
  id: number;
  data: string;
}

db.version(1).stores({ test: "++id,data" });

class testDAO extends DAO<Test> {
  public tableName = "test";

  constructor() {
    super();
    this.table = db.table(this.tableName);
  }
}

describe("dao", () => {
  const dao = new testDAO();
  test("测试save", async () => {
    expect(await dao.save({ id: 0, data: "ok1" })).toEqual(1);

    expect(await dao.save({ id: 0, data: "ok" })).toEqual(2);

    expect(await dao.save({ id: 2, data: "ok2" })).toEqual(2);
  });

  test("测试find", async () => {
    expect(await dao.findOne({ id: 1 })).toEqual({ id: 1, data: "ok1" });
    expect(await dao.findById(2)).toEqual({ id: 2, data: "ok2" });
  });

  test("测试list", async () => {
    expect(await dao.list({ id: 1 })).toEqual([{ id: 1, data: "ok1" }]);
  });

  test("测试delete", async () => {
    expect(await dao.delete({ id: 1 })).toEqual(1);
    expect(await dao.findById(1)).toEqual(undefined);
  });
});
