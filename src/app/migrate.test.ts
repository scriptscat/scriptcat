import Dexie from "dexie";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type migrateType from "./migrate";

// 0.16.x（MV2）留在 IndexedDB「ScriptCat」库里的最终表结构，各表取 0.16.15 中最后一次声明的定义。
// 0.16.7 起 0.16 自己声明了 db.version(18)（防降级，见 faae3b83），此后的用户库已是 18。
const MV2_STORES = {
  scripts:
    "++id,&uuid,name,namespace,author,originDomain,subscribeUrl,type,sort,status,runStatus,createtime,updatetime,checktime",
  logger: "++id,level,createtime",
  permission: "++id,scriptId,[scriptId+permission+permissionValue],createtime,updatetime",
  value: "++id,[scriptId+key],[storageName+key]",
  resource: "++id,&url,content,type,createtime,updatetime",
  resourceLink: "++id,url,scriptId,createtime",
  export: "++id,&scriptId",
  subscribe: "++id,&url,createtime,updatetime,checktime",
  sync: "++id,&key,[user+device+type],createtime",
};

const MV2_UUID = "0f6b5f3e-2a4b-4c1d-9e8f-1a2b3c4d5e6f";

async function seedMV2Database(version: number) {
  const legacy = new Dexie("ScriptCat");
  legacy.version(version).stores(MV2_STORES);
  await legacy.open();
  const scriptId = await legacy.table("scripts").add({
    uuid: MV2_UUID,
    name: "mv2 script",
    namespace: "mv2",
    origin: "https://greasyfork.org/scripts/1-mv2.user.js",
    originDomain: "greasyfork.org",
    type: 1,
    status: 1,
    sort: 0,
    runStatus: "complete",
    metadata: { match: ["https://example.com/*"] },
    code: "// ==UserScript==\n// @name mv2 script\n// ==/UserScript==\nconsole.log(1);",
    createtime: 1,
    updatetime: 1,
    checktime: 1,
  });
  await legacy.table("value").add({ scriptId, storageName: "", key: "count", value: 3, createtime: 1 });
  legacy.close();
}

// 模拟扩展一次启动：与 src/service_worker.ts 相同的调用顺序
async function startExtension() {
  const mod = await import("./migrate.js");
  const migrate = mod.default as unknown as typeof migrateType;
  migrate();
  await mod.migrateChromeStorage();
}

async function readMigrated() {
  const { ScriptDAO, ScriptCodeDAO } = await import("./repo/scripts.js");
  const { ValueDAO } = await import("./repo/value.js");
  const scripts = await new ScriptDAO().all();
  const code = await new ScriptCodeDAO().get(MV2_UUID);
  const value = await new ValueDAO().get(MV2_UUID);
  return {
    names: scripts.map((s) => s.name),
    origin: scripts[0]?.origin,
    code: code?.code,
    values: value?.data,
  };
}

beforeEach(async () => {
  // 每个用例一个全新的 IndexedDB 与模块实例（dao.ts 的 Dexie 单例、Repo 缓存都在模块级）。
  // dexie 是外部依赖，不随 resetModules 重新求值，其 IndexedDB 来源要直接替换。
  Dexie.dependencies.indexedDB = new IDBFactory();
  Dexie.dependencies.IDBKeyRange = IDBKeyRange;
  vi.resetModules();
  await chrome.storage.local.clear();
  // 迁移成功后会重载扩展，mock 中没有 runtime.reload
  chrome.runtime.reload = vi.fn();
});

describe("0.16（MV2 IndexedDB）数据迁移到 chrome.storage", () => {
  it("0.16.7+ 留下的 v18 库：首次启动即迁移脚本、代码与 GM 值", async () => {
    await seedMV2Database(18);

    await startExtension();

    expect(await readMigrated()).toEqual({
      names: ["mv2 script"],
      origin: "https://greasyfork.org/scripts/1-mv2.user.js",
      code: expect.stringContaining("console.log(1);"),
      values: { count: 3 },
    });
  });

  it("0.16.6 及更早的 v17 库同样迁移，且只迁移一份", async () => {
    await seedMV2Database(17);

    await startExtension();

    expect(await readMigrated()).toEqual({
      names: ["mv2 script"],
      origin: "https://greasyfork.org/scripts/1-mv2.user.js",
      code: expect.stringContaining("console.log(1);"),
      values: { count: 3 },
    });
  });

  it("chrome.storage 已有脚本（早已迁移过的用户）时不用 IndexedDB 里的旧副本覆盖", async () => {
    await seedMV2Database(18);
    const { ScriptDAO } = await import("./repo/scripts.js");
    await new ScriptDAO().save({
      uuid: "c1a2b3c4-d5e6-4f70-8a9b-0c1d2e3f4a5b",
      name: "current script",
      namespace: "current",
      type: 1,
      status: 1,
      sort: 0,
      runStatus: "complete",
      metadata: {},
      createtime: 2,
      checktime: 2,
    });

    await startExtension();

    expect((await readMigrated()).names).toEqual(["current script"]);
  });
});
