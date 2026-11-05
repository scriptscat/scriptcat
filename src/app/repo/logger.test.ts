import Dexie from "dexie";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type migrateType from "../migrate";
import type { Logger, LoggerDAO as LoggerDAOType } from "./logger";

let dao: LoggerDAOType;

beforeAll(async () => {
  // dao.ts 在模块求值时创建 Dexie 单例并取走当时的 IndexedDB 来源：先换成独立的 fake-indexeddb 再重新加载
  // 模块（本文件在 isolated 项目中运行，替换不会泄漏给其它文件），并用迁移声明的真实表结构打开数据库。
  // default 导出的类型断言沿用 migrate.test.ts 的做法。
  Dexie.dependencies.indexedDB = new IDBFactory();
  Dexie.dependencies.IDBKeyRange = IDBKeyRange;
  vi.resetModules();
  const migrateModule = await import("../migrate.js");
  await (migrateModule.default as unknown as typeof migrateType)();
  const { LoggerDAO } = await import("./logger.js");
  dao = new LoggerDAO();
});

beforeEach(async () => {
  await dao.clear();
});

// 与 DBWriter 写日志的方式一致：id 为 0 时由自增主键分配，写入先后决定 id 大小。
async function seed(rows: Array<Pick<Logger, "message" | "createtime">>) {
  for (const row of rows) {
    await dao.save({ id: 0, level: "info", label: {}, ...row });
  }
}

describe("LoggerDAO.walkNewestFirst", () => {
  it("只访问 createtime ≥ since 的记录：从新到旧，同一毫秒内后写入的在前", async () => {
    await seed([
      { message: "before since", createtime: 99 },
      { message: "at since", createtime: 100 },
      { message: "same ms first", createtime: 200 },
      { message: "same ms second", createtime: 200 },
      { message: "newest", createtime: 300 },
    ]);
    const visited: string[] = [];

    await dao.walkNewestFirst(100, (row) => {
      visited.push(row.message);
      return true;
    });

    expect(visited).toEqual(["newest", "same ms second", "same ms first", "at since"]);
  });

  it("visit 返回 false 后不再访问更早的记录", async () => {
    await seed([1, 2, 3, 4].map((n) => ({ message: `row ${n}`, createtime: n })));
    const visited: string[] = [];

    await dao.walkNewestFirst(0, (row) => {
      visited.push(row.message);
      return visited.length < 2;
    });

    expect(visited).toEqual(["row 4", "row 3"]);
  });
});
