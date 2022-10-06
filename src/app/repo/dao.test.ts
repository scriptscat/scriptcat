import "fake-indexeddb/auto";
import { DAO, db } from "./dao";
import { LoggerDAO } from "./logger";
import migrate from "../migrate";

migrate();

interface Test {
  id: number;
  data: string;
}

db.version(17).stores({ test: "++id,data" });

class testDAO extends DAO<Test> {
  public tableName = "test";

  constructor() {
    super();
    this.table = db.table(this.tableName);
  }
}

describe("dao", () => {
  const dao = new testDAO();
  it("测试save", async () => {
    expect(await dao.save({ id: 0, data: "ok1" })).toEqual(1);

    expect(await dao.save({ id: 0, data: "ok" })).toEqual(2);

    expect(await dao.save({ id: 2, data: "ok2" })).toEqual(2);
  });

  it("测试find", async () => {
    expect(await dao.findOne({ id: 1 })).toEqual({ id: 1, data: "ok1" });
    expect(await dao.findById(2)).toEqual({ id: 2, data: "ok2" });
  });

  it("测试list", async () => {
    expect(await dao.list({ id: 1 })).toEqual([{ id: 1, data: "ok1" }]);
  });

  it("测试delete", async () => {
    expect(await dao.delete({ id: 1 })).toEqual(1);
    expect(await dao.findById(1)).toEqual(undefined);
  });
});

describe("model", () => {
  const logger = new LoggerDAO();
  it("save", async () => {
    expect(
      await logger.save({
        id: 0,
        level: "info",
        message: "ok",
        label: {},
        createtime: new Date().getTime(),
      })
    ).toEqual(1);
  });
});
