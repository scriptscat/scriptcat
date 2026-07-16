import { describe, it, expect, beforeEach } from "vitest";
import { initTestEnv } from "@Tests/utils";
import { TrashScriptDAO, type TrashScript } from "./trash_script";
import { SCRIPT_TYPE_NORMAL, SCRIPT_STATUS_ENABLE, SCRIPT_RUN_STATUS_COMPLETE } from "./scripts";
import { createMockOPFS } from "./test-helpers";

initTestEnv();

beforeEach(() => createMockOPFS());

const makeTrashScript = (overrides: Partial<TrashScript> = {}): TrashScript => ({
  uuid: "uuid-trash-1",
  name: "测试脚本",
  namespace: "test-namespace",
  type: SCRIPT_TYPE_NORMAL,
  status: SCRIPT_STATUS_ENABLE,
  sort: 0,
  runStatus: SCRIPT_RUN_STATUS_COMPLETE,
  createtime: Date.now(),
  checktime: Date.now(),
  metadata: {},
  deleteTime: Date.now(),
  deleteBy: "user",
  ...overrides,
});

describe("TrashScriptDAO", () => {
  let dao: TrashScriptDAO;

  beforeEach(() => {
    dao = new TrashScriptDAO();
  });

  it("应能保存回收站脚本并按 uuid 取回,且保留删除元数据", async () => {
    await dao.save(makeTrashScript({ uuid: "u1", deleteTime: 1234, deleteBy: "sync" }));
    const got = await dao.get("u1");
    expect(got?.uuid).toBe("u1");
    expect(got?.deleteTime).toBe(1234);
    expect(got?.deleteBy).toBe("sync");
  });

  it("应能按 name+namespace 查回收站脚本", async () => {
    await dao.save(makeTrashScript({ uuid: "u3", name: "查我", namespace: "ns-a" }));
    expect((await dao.findByNameAndNamespace("查我", "ns-a"))?.uuid).toBe("u3");
    expect(await dao.findByNameAndNamespace("查我", "ns-b")).toBeUndefined();
  });

  it("应能批量删除回收站脚本", async () => {
    await dao.save(makeTrashScript({ uuid: "u4" }));
    await dao.save(makeTrashScript({ uuid: "u5" }));
    await dao.deletes(["u4", "u5"]);
    expect(await dao.all()).toHaveLength(0);
  });
});
