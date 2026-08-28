import { describe, it, expect, beforeEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { initTestEnv } from "@Tests/utils";
import { ScriptService } from "./script";
import { ScriptDAO, SCRIPT_TYPE_NORMAL, SCRIPT_STATUS_ENABLE, SCRIPT_RUN_STATUS_COMPLETE } from "@App/app/repo/scripts";
import { TrashScriptDAO, type TrashScript } from "@App/app/repo/trash_script";
import type { Script } from "@App/app/repo/scripts";
import { SubscribeDAO, type Subscribe } from "@App/app/repo/subscribe";
import { MessageQueue } from "@Packages/message/message_queue";
import { MockMessage } from "@Packages/message/mock_message";
import { Server } from "@Packages/message/server";
import { SystemConfig } from "@App/pkg/config/config";
import EventEmitter from "eventemitter3";
import type { ValueService } from "./value";
import type { ResourceService } from "./resource";
import type { TDeleteScript, TInstallScript, TSortedScript } from "@App/app/service/queue";
import { CLOUD_SYNC_QUEUE_KEY } from "@App/app/service/queue";
import { createMockOPFS } from "@App/app/repo/test-helpers";
import type { Group } from "@Packages/message/server";
import type { IMessageQueue } from "@Packages/message/message_queue";
import type { MessageSend } from "@Packages/message/types";
import { ScriptClient } from "./client";
import { SELF_METADATA_ONLY_RUN_ON_URL } from "@App/app/repo/metadata";
import { BatchUpdateListActionCode } from "./types";
import { stackAsyncTask } from "@App/pkg/utils/async_queue";

initTestEnv();

beforeEach(() => createMockOPFS());

const makeScript = (overrides: Partial<Script> = {}): Script => ({
  uuid: "uuid-1",
  name: "测试脚本",
  namespace: "ns",
  type: SCRIPT_TYPE_NORMAL,
  status: SCRIPT_STATUS_ENABLE,
  sort: 0,
  runStatus: SCRIPT_RUN_STATUS_COMPLETE,
  createtime: Date.now(),
  checktime: Date.now(),
  metadata: {},
  ...overrides,
});

const makeTrashScript = (overrides: Partial<TrashScript> = {}): TrashScript => ({
  ...makeScript(),
  deleteTime: Date.now(),
  deleteBy: "user",
  ...overrides,
});

/** 构造一个依赖齐备的 ScriptService,并返回可断言的协作者 */
export const buildService = () => {
  const mq = new MessageQueue();
  const server = new Server("test", new MockMessage(new EventEmitter<string, any>()));
  const group = server.group("script");
  const systemConfig = new SystemConfig(mq);
  const scriptDAO = new ScriptDAO();
  // installScript 会调 updateResourceByTypes 下载资源;单元测试不关心资源下载,给个 no-op 即可
  const resourceService = { updateResourceByTypes: async () => {} } as unknown as ResourceService;
  const service = new ScriptService(systemConfig, group, mq, {} as ValueService, resourceService, scriptDAO);
  service.scriptCodeDAO.useCache = false;
  // 复用 service 自己持有的实例（而非各 new 一份）：ScriptService 只给这两个 DAO 开了缓存，
  // 若测试另起一份未缓存的实例，写读会各自维护一份模块内缓存，读写顺序一旦不再是先写后读就会静默错数据。
  return { service, mq, scriptDAO, systemConfig, trashDAO: service.trashScriptDAO, codeDAO: service.scriptCodeDAO };
};

const saveTrashWithCode = (dao: TrashScriptDAO, overrides: Partial<TrashScript>, code = "// trash code") =>
  dao.save(makeTrashScript(overrides), code);

const resetActiveScriptData = () => chrome.storage.local.clear();

describe("ScriptService.purgeScripts —— 彻底删除", () => {
  beforeEach(async () => {
    await resetActiveScriptData();
    // trash_enabled/trash_retention_days 不在 STORAGE_LOCAL_KEYS 里，走 chrome.storage.sync，
    // 不清会把上一个用例写入的值泄漏到这里
    await chrome.storage.sync.clear();
  });

  it("应从回收站移除脚本并删除其代码", async () => {
    const { service, trashDAO, codeDAO } = buildService();
    await trashDAO.save(makeTrashScript({ uuid: "p1" }));
    await codeDAO.save({ uuid: "p1", code: "// code" });

    await service.purgeScripts(["p1"]);

    expect(await trashDAO.get("p1")).toBeUndefined();
    expect(await codeDAO.get("p1")).toBeUndefined();
  });

  it("应广播 deleteScripts 事件,载荷含 uuid/storageName/type", async () => {
    const { service, mq, trashDAO } = buildService();
    await trashDAO.save(makeTrashScript({ uuid: "p2", type: SCRIPT_TYPE_NORMAL }));
    const received: TDeleteScript[][] = [];
    mq.subscribe<TDeleteScript[]>("deleteScripts", (d) => void received.push(d));

    await service.purgeScripts(["p2"]);

    // 注：裸 MessageQueue.publish() 在同一实例内会经由 chrome.runtime 回环 + 直接 EE.emit 双重投递给本地订阅者，
    // 这是 packages/message/message_queue.ts 既有行为（deleteScript/deleteScripts 早已如此），与 purgeScripts 无关，
    // 因此这里只断言"至少广播了一次，且载荷正确"，不绑定具体次数。
    expect(received.length).toBeGreaterThan(0);
    expect(received[0][0]).toMatchObject({ uuid: "p2", storageName: "p2", type: SCRIPT_TYPE_NORMAL });
  });

  it("回收站中不存在该脚本时应抛错", async () => {
    const { service } = buildService();
    await expect(service.purgeScripts(["nope"])).rejects.toThrow("trash scripts not found");
  });
});

describe("ScriptService.sortScript", () => {
  beforeEach(async () => {
    await resetActiveScriptData();
  });

  it("拖动排序只更新位置变化的脚本并发布排序更新时间", async () => {
    const { service, scriptDAO, mq } = buildService();
    await scriptDAO.save(makeScript({ uuid: "first", sort: 0, updatetime: 100 }));
    await scriptDAO.save(makeScript({ uuid: "second", sort: 1, updatetime: 1_000 }));
    const sorted: TSortedScript[][] = [];
    mq.subscribe<TSortedScript[]>("sortedScripts", (value) => void sorted.push(value));
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);

    try {
      await service.sortScript({ before: ["first", "second"], after: ["second", "first"] });
    } finally {
      now.mockRestore();
    }

    await expect(scriptDAO.get("first")).resolves.toMatchObject({ sort: 1, updatetime: 100 });
    await expect(scriptDAO.get("second")).resolves.toMatchObject({ sort: 0, updatetime: 1_000 });
    expect(sorted[0]).toEqual([
      { uuid: "second", sort: 0, sortUpdatetime: 1_000 },
      { uuid: "first", sort: 1, sortUpdatetime: 1_000 },
    ]);
  });

  it("拖动部分列表时不写入位置未变化的脚本", async () => {
    const { service, scriptDAO } = buildService();
    for (let index = 0; index < 4; index += 1) {
      await scriptDAO.save(makeScript({ uuid: `script-${index}`, sort: index, updatetime: 100 + index }));
    }
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);

    try {
      await service.sortScript({
        before: ["script-0", "script-1", "script-2", "script-3"],
        after: ["script-1", "script-0", "script-2", "script-3"],
      });
    } finally {
      now.mockRestore();
    }

    await expect(scriptDAO.get("script-1")).resolves.toMatchObject({ sort: 0, updatetime: 101 });
    await expect(scriptDAO.get("script-0")).resolves.toMatchObject({ sort: 1, updatetime: 100 });
    await expect(scriptDAO.get("script-2")).resolves.toMatchObject({ sort: 2, updatetime: 102 });
    await expect(scriptDAO.get("script-3")).resolves.toMatchObject({ sort: 3, updatetime: 103 });
  });

  it("全量同步进行时排序 mutation 不应穿插执行", async () => {
    const { service, scriptDAO } = buildService();
    await scriptDAO.save(makeScript({ uuid: "first", sort: 0 }));
    await scriptDAO.save(makeScript({ uuid: "second", sort: 1 }));
    const allSpy = vi.spyOn(scriptDAO, "all");
    let releaseSync!: () => void;
    const syncGate = new Promise<void>((resolve) => {
      releaseSync = resolve;
    });
    const syncPromise = stackAsyncTask(CLOUD_SYNC_QUEUE_KEY, () => syncGate);
    let sortResolved = false;
    const sortPromise = service.sortScript({ before: ["first", "second"], after: ["second", "first"] }).then(() => {
      sortResolved = true;
    });

    await Promise.resolve();
    expect(allSpy).not.toHaveBeenCalled();
    expect(sortResolved).toBe(false);

    releaseSync();
    await Promise.all([syncPromise, sortPromise]);
    expect(allSpy).toHaveBeenCalledTimes(1);
    await expect(scriptDAO.get("second")).resolves.toMatchObject({ sort: 0 });
  });
});

describe("ScriptService.getAllScripts", () => {
  beforeEach(async () => {
    await resetActiveScriptData();
  });

  it("规范化旧排序时只登记位置变化的脚本", async () => {
    const { service, scriptDAO, mq } = buildService();
    await scriptDAO.save(makeScript({ uuid: "first", sort: -1, updatetime: 100 }));
    await scriptDAO.save(makeScript({ uuid: "second", sort: 1, updatetime: 200 }));
    const sorted: TSortedScript[][] = [];
    mq.subscribe<TSortedScript[]>("sortedScripts", (value) => void sorted.push(value));
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);

    try {
      await service.getAllScripts();
    } finally {
      now.mockRestore();
    }

    await expect(scriptDAO.get("first")).resolves.toMatchObject({ sort: 0, updatetime: 100 });
    await expect(scriptDAO.get("second")).resolves.toMatchObject({ sort: 1, updatetime: 200 });
    expect(sorted[0]).toEqual([
      { uuid: "first", sort: 0, sortUpdatetime: 1_000 },
      { uuid: "second", sort: 1 },
    ]);
  });
});

describe("ScriptService.pinToTop", () => {
  beforeEach(async () => {
    await resetActiveScriptData();
  });

  it("置顶只更新位置变化的脚本并发布同一个排序更新时间", async () => {
    const { service, scriptDAO, mq } = buildService();
    await scriptDAO.save(makeScript({ uuid: "first", sort: 0, updatetime: 100 }));
    await scriptDAO.save(makeScript({ uuid: "second", sort: 1, updatetime: 200 }));
    await scriptDAO.save(makeScript({ uuid: "third", sort: 2, updatetime: 300 }));
    const sorted: TSortedScript[][] = [];
    mq.subscribe<TSortedScript[]>("sortedScripts", (value) => void sorted.push(value));
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);

    try {
      await service.pinToTop(["second"]);
    } finally {
      now.mockRestore();
    }

    await expect(scriptDAO.get("first")).resolves.toMatchObject({ sort: 1, updatetime: 100 });
    await expect(scriptDAO.get("second")).resolves.toMatchObject({ sort: 0, updatetime: 200 });
    await expect(scriptDAO.get("third")).resolves.toMatchObject({ sort: 2, updatetime: 300 });
    expect(sorted[0]).toEqual([
      { uuid: "second", sort: 0, sortUpdatetime: 1_000 },
      { uuid: "first", sort: 1, sortUpdatetime: 1_000 },
      { uuid: "third", sort: 2 },
    ]);
  });
});

describe("ScriptService.deleteScripts —— 进回收站", () => {
  beforeEach(async () => {
    await resetActiveScriptData();
    // trash_enabled/trash_retention_days 不在 STORAGE_LOCAL_KEYS 里，走 chrome.storage.sync，
    // 不清会把上一个用例写入的值泄漏到这里
    await chrome.storage.sync.clear();
  });

  it("应把脚本搬进回收站并从活跃表移除", async () => {
    const { service, scriptDAO, trashDAO, codeDAO } = buildService();
    await scriptDAO.save(makeScript({ uuid: "t1" }));
    await codeDAO.save({ uuid: "t1", code: "// trash code" });

    await service.deleteScripts(["t1"]);

    expect(await scriptDAO.get("t1")).toBeUndefined();
    const trashed = await trashDAO.get("t1");
    expect(trashed?.uuid).toBe("t1");
    expect(trashed?.deleteBy).toBe("user");
    expect(typeof trashed?.deleteTime).toBe("number");
    expect(await trashDAO.getCode("t1")).toBe("// trash code");
    expect(await codeDAO.get("t1")).toBeUndefined();
  });

  it("应记录传入的删除来源", async () => {
    const { service, scriptDAO, trashDAO, codeDAO } = buildService();
    await scriptDAO.save(makeScript({ uuid: "t2" }));
    await codeDAO.save({ uuid: "t2", code: "// code" });

    await service.deleteScripts(["t2"], "sync");

    expect((await trashDAO.get("t2"))?.deleteBy).toBe("sync");
  });

  it("应广播 trashScripts 且绝不广播 deleteScripts", async () => {
    const { service, mq, scriptDAO, codeDAO } = buildService();
    await scriptDAO.save(makeScript({ uuid: "t3" }));
    await codeDAO.save({ uuid: "t3", code: "// code" });
    const trashEvents: TDeleteScript[][] = [];
    const deleteEvents: TDeleteScript[][] = [];
    mq.subscribe<TDeleteScript[]>("trashScripts", (d) => void trashEvents.push(d));
    mq.subscribe<TDeleteScript[]>("deleteScripts", (d) => void deleteEvents.push(d));

    await service.deleteScripts(["t3"]);

    // 注：裸 MessageQueue.publish() 在同一实例内会经由 chrome.runtime 回环 + 直接 EE.emit 双重投递给本地订阅者，
    // 这是 packages/message/message_queue.ts 既有行为，与本方法无关，因此这里只断言"至少广播了一次，且载荷正确"，
    // 不绑定具体次数（deleteScripts 绝不广播这一条是关键分界线，次数为 0 不受该 mock 行为影响，须精确断言）。
    expect(trashEvents.length).toBeGreaterThan(0);
    expect(trashEvents[0][0]).toMatchObject({ uuid: "t3", deleteBy: "user" });
    expect(deleteEvents).toHaveLength(0);
  });

  it("必须保留脚本代码,否则还原出来是空壳", async () => {
    const { service, scriptDAO, trashDAO, codeDAO } = buildService();
    await scriptDAO.save(makeScript({ uuid: "t4" }));
    await codeDAO.save({ uuid: "t4", code: "// 我必须活下来" });

    await service.deleteScripts(["t4"]);

    expect(await codeDAO.get("t4")).toBeUndefined();
    expect(await trashDAO.getCode("t4")).toBe("// 我必须活下来");
  });

  it("批量参数混入不存在的 uuid 时不得把有效脚本与错误代码下标配对", async () => {
    const { service, scriptDAO, trashDAO, codeDAO } = buildService();
    await scriptDAO.save(makeScript({ uuid: "valid" }));
    await codeDAO.save({ uuid: "valid", code: "// valid code" });

    await service.deleteScripts(["missing", "valid"]);

    expect(await trashDAO.getCode("valid")).toBe("// valid code");
  });

  it("deleteScript 单条应委托给 deleteScripts 并透传来源", async () => {
    const { service, scriptDAO, trashDAO, codeDAO } = buildService();
    await scriptDAO.save(makeScript({ uuid: "t5" }));
    await codeDAO.save({ uuid: "t5", code: "// code" });

    await service.deleteScript("t5", "subscribe");

    expect((await trashDAO.get("t5"))?.deleteBy).toBe("subscribe");
    expect(await scriptDAO.get("t5")).toBeUndefined();
  });

  it("写回收站失败时不得删除活跃表中的脚本(宁可短暂重复,不可丢数据)", async () => {
    const { service, scriptDAO, codeDAO } = buildService();
    await scriptDAO.save(makeScript({ uuid: "t6" }));
    await codeDAO.save({ uuid: "t6", code: "// code" });
    vi.spyOn(service.trashScriptDAO, "save").mockRejectedValueOnce(new Error("opfs boom"));

    await expect(service.deleteScripts(["t6"])).rejects.toThrow("opfs boom");
    expect(await scriptDAO.get("t6")).toBeDefined();
  });
});

describe("ScriptService.restoreScripts —— 还原", () => {
  beforeEach(async () => {
    await resetActiveScriptData();
    // trash_enabled/trash_retention_days 不在 STORAGE_LOCAL_KEYS 里，走 chrome.storage.sync，
    // 不清会把上一个用例写入的值泄漏到这里
    await chrome.storage.sync.clear();
  });

  it("应把脚本搬回活跃表并从回收站移除", async () => {
    const { service, scriptDAO, trashDAO, codeDAO } = buildService();
    await saveTrashWithCode(trashDAO, { uuid: "r1", name: "还我" }, "// restored code");

    const ret = await service.restoreScripts(["r1"]);

    expect(ret.restored).toEqual(["r1"]);
    expect(ret.conflicts).toEqual([]);
    expect((await scriptDAO.get("r1"))?.name).toBe("还我");
    expect(await trashDAO.get("r1")).toBeUndefined();
    expect(await codeDAO.get("r1")).toEqual({ uuid: "r1", code: "// restored code" });
  });

  it("还原后的脚本不得残留删除元数据", async () => {
    const { service, scriptDAO, trashDAO } = buildService();
    await saveTrashWithCode(trashDAO, { uuid: "r2" });

    await service.restoreScripts(["r2"]);

    const restored = await scriptDAO.get("r2");
    expect(restored).toBeDefined();
    expect(restored).not.toHaveProperty("deleteTime");
    expect(restored).not.toHaveProperty("deleteBy");
  });

  it("回收站代码缺失时不得恢复空壳脚本或删除 OPFS 原件", async () => {
    const { service, scriptDAO, trashDAO } = buildService();
    await trashDAO.save(makeTrashScript({ uuid: "missing-code" }));

    await expect(service.restoreScripts(["missing-code"])).rejects.toThrow("trash script code not found");

    expect(await scriptDAO.get("missing-code")).toBeUndefined();
    expect(await trashDAO.get("missing-code")).toBeDefined();
  });

  it("恢复元数据失败时应回滚已写入 local storage 的代码并保留 OPFS 原件", async () => {
    const { service, scriptDAO, trashDAO, codeDAO } = buildService();
    await saveTrashWithCode(trashDAO, { uuid: "restore-failed" }, "// original code");
    vi.spyOn(scriptDAO, "save").mockRejectedValueOnce(new Error("metadata save failed"));

    await expect(service.restoreScripts(["restore-failed"])).rejects.toThrow("metadata save failed");

    expect(await scriptDAO.get("restore-failed")).toBeUndefined();
    expect(await codeDAO.get("restore-failed")).toBeUndefined();
    expect(await trashDAO.getCode("restore-failed")).toBe("// original code");
  });

  it("应广播 installScript 以重新注册脚本并上传云端", async () => {
    const { service, mq, trashDAO } = buildService();
    await saveTrashWithCode(trashDAO, { uuid: "r3" });
    const events: TInstallScript[] = [];
    mq.subscribe<TInstallScript>("installScript", (d) => void events.push(d));

    await service.restoreScripts(["r3"]);

    // 注：MessageQueue.publish() 在测试环境会双投递给同实例本地订阅者（chrome-extension-mock 回环 + 直接 EE.emit，
    // 实测恒为 2 次），是既有 mock 假象而非业务行为，故只断言"至少投递一次 + 载荷正确"，不绑定次数。
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].script.uuid).toBe("r3");
    expect(events[0].update).toBe(false);
  });

  it("已存在同 name+namespace 的活跃脚本时应拒绝还原,且回收站条目保留", async () => {
    const { service, scriptDAO, trashDAO } = buildService();
    await scriptDAO.save(makeScript({ uuid: "alive", name: "撞名", namespace: "ns" }));
    await trashDAO.save(makeTrashScript({ uuid: "r4", name: "撞名", namespace: "ns" }));

    const ret = await service.restoreScripts(["r4"]);

    expect(ret.restored).toEqual([]);
    expect(ret.conflicts).toEqual([{ uuid: "r4", name: "撞名" }]);
    expect(await scriptDAO.get("r4")).toBeUndefined();
    expect(await trashDAO.get("r4")).toBeDefined();
  });

  it("订阅已不存在时应清空 subscribeUrl,避免还原后被订阅更新再次删除", async () => {
    const { service, scriptDAO, trashDAO } = buildService();
    await saveTrashWithCode(trashDAO, { uuid: "r5", subscribeUrl: "https://gone.example/s.json" });

    await service.restoreScripts(["r5"]);

    expect((await scriptDAO.get("r5"))?.subscribeUrl).toBeUndefined();
  });

  it("订阅仍存在时应保留 subscribeUrl", async () => {
    const { service, scriptDAO, trashDAO } = buildService();
    const url = "https://live.example/s.json";
    await new SubscribeDAO().save({
      url,
      name: "订阅",
      code: "",
      author: "",
      scripts: {},
      metadata: {},
      status: 1,
      createtime: Date.now(),
      updatetime: Date.now(),
      checktime: Date.now(),
    } satisfies Subscribe);
    await saveTrashWithCode(trashDAO, { uuid: "r6", subscribeUrl: url });

    await service.restoreScripts(["r6"]);

    expect((await scriptDAO.get("r6"))?.subscribeUrl).toBe(url);
  });

  it("部分冲突时应还原其余脚本", async () => {
    const { service, scriptDAO, trashDAO } = buildService();
    await scriptDAO.save(makeScript({ uuid: "alive2", name: "占位", namespace: "ns" }));
    await trashDAO.save(makeTrashScript({ uuid: "r7", name: "占位", namespace: "ns" }));
    await saveTrashWithCode(trashDAO, { uuid: "r8", name: "没占位", namespace: "ns" });

    const ret = await service.restoreScripts(["r7", "r8"]);

    expect(ret.restored).toEqual(["r8"]);
    expect(ret.conflicts).toEqual([{ uuid: "r7", name: "占位" }]);
  });
});

describe("installScript —— 回收站 uuid 不变量", () => {
  beforeEach(async () => {
    await resetActiveScriptData();
    // trash_enabled/trash_retention_days 不在 STORAGE_LOCAL_KEYS 里，走 chrome.storage.sync，
    // 不清会把上一个用例写入的值泄漏到这里
    await chrome.storage.sync.clear();
  });

  it("安装同 uuid 的脚本时应清除回收站中的旧条目,两张表不得共存", async () => {
    const { service, scriptDAO, trashDAO } = buildService();
    const uuid = "inv-1";
    await trashDAO.save(makeTrashScript({ uuid, name: "复活脚本", deleteBy: "sync" }));

    await service.installScript({
      script: makeScript({ uuid, name: "复活脚本" }),
      code: "// code",
      upsertBy: "sync",
    });

    expect(await scriptDAO.get(uuid)).toBeDefined();
    expect(await trashDAO.get(uuid)).toBeUndefined();
  });

  it("安装恢复时原订阅已不存在应清除 subscribeUrl", async () => {
    const { service, scriptDAO, trashDAO } = buildService();
    const uuid = "revive-gone-subscribe";
    const subscribeUrl = "https://gone.example/sub.json";
    await trashDAO.save(makeTrashScript({ uuid, subscribeUrl }), "// old code");

    await service.installScript({
      script: makeScript({ uuid, subscribeUrl }),
      code: "// new code",
      upsertBy: "user",
    });

    expect((await scriptDAO.get(uuid))?.subscribeUrl).toBeUndefined();
  });

  it("安装恢复时原订阅仍存在应保留 subscribeUrl", async () => {
    const { service, scriptDAO, trashDAO } = buildService();
    const uuid = "revive-live-subscribe";
    const subscribeUrl = "https://live.example/sub.json";
    await new SubscribeDAO().save({
      url: subscribeUrl,
      name: "订阅",
      code: "",
      author: "",
      scripts: {},
      metadata: {},
      status: 1,
      createtime: Date.now(),
      updatetime: Date.now(),
      checktime: Date.now(),
    } satisfies Subscribe);
    await trashDAO.save(makeTrashScript({ uuid, subscribeUrl }), "// old code");

    await service.installScript({
      script: makeScript({ uuid, subscribeUrl }),
      code: "// new code",
      upsertBy: "user",
    });

    expect((await scriptDAO.get(uuid))?.subscribeUrl).toBe(subscribeUrl);
  });

  it("复活脚本保存失败时应保留 OPFS 回收站原件和代码", async () => {
    const { service, scriptDAO, trashDAO } = buildService();
    const uuid = "revive-failed";
    await trashDAO.save(makeTrashScript({ uuid }), "// old trash code");
    vi.spyOn(scriptDAO, "save").mockRejectedValueOnce(new Error("save failed"));

    await expect(
      service.installScript({ script: makeScript({ uuid }), code: "// new code", upsertBy: "user" })
    ).rejects.toThrow("save failed");

    expect(await trashDAO.get(uuid)).toBeDefined();
    expect(await trashDAO.getCode(uuid)).toBe("// old trash code");
  });

  it("安装无关脚本时不得动回收站中的其他条目", async () => {
    const { service, trashDAO } = buildService();
    await trashDAO.save(makeTrashScript({ uuid: "keep-me" }));

    await service.installScript({
      script: makeScript({ uuid: "other" }),
      code: "// code",
      upsertBy: "user",
    });

    expect(await trashDAO.get("keep-me")).toBeDefined();
  });
});

describe("ScriptService.cleanupExpiredTrash —— 到期自动清理", () => {
  const DAY = 24 * 60 * 60 * 1000;

  beforeEach(async () => {
    await resetActiveScriptData();
    // trash_enabled/trash_retention_days 不在 STORAGE_LOCAL_KEYS 里，走 chrome.storage.sync，
    // 不清会把上一个用例写入的值泄漏到这里
    await chrome.storage.sync.clear();
  });

  it("应清理超过保留天数的条目,保留未到期的", async () => {
    const { service, trashDAO, systemConfig } = buildService();
    systemConfig.setTrashRetentionDays(30);
    await trashDAO.save(makeTrashScript({ uuid: "old", deleteTime: Date.now() - 31 * DAY }));
    await trashDAO.save(makeTrashScript({ uuid: "fresh", deleteTime: Date.now() - 3 * DAY }));

    const cleaned = await service.cleanupExpiredTrash();

    expect(cleaned).toBe(1);
    expect(await trashDAO.get("old")).toBeUndefined();
    expect(await trashDAO.get("fresh")).toBeDefined();
  });

  it("到期条目在清理期间已被手动清空时应视为成功", async () => {
    const { service, trashDAO, systemConfig } = buildService();
    systemConfig.setTrashRetentionDays(30);
    await trashDAO.save(makeTrashScript({ uuid: "expired-race", deleteTime: Date.now() - 31 * DAY }));
    const purge = vi.spyOn(service, "purgeScripts").mockRejectedValueOnce(new Error("trash scripts not found"));

    await expect(service.cleanupExpiredTrash()).resolves.toBe(0);
    expect(purge).toHaveBeenCalledWith(["expired-race"]);
  });

  it("清理应走彻底删除链路并广播 deleteScripts", async () => {
    const { service, mq, trashDAO, systemConfig } = buildService();
    systemConfig.setTrashRetentionDays(30);
    await trashDAO.save(makeTrashScript({ uuid: "old2", deleteTime: Date.now() - 40 * DAY }));
    const events: TDeleteScript[][] = [];
    mq.subscribe<TDeleteScript[]>("deleteScripts", (d) => void events.push(d));

    await service.cleanupExpiredTrash();

    // 注：MessageQueue.publish() 在测试环境会双投递给同实例本地订阅者（chrome-extension-mock 回环 + 直接 EE.emit，
    // 实测恒为 2 次），是既有 mock 假象而非业务行为，故只断言"至少投递一次 + 载荷正确"，不绑定次数。
    expect(events.length).toBeGreaterThan(0);
    expect(events[0][0].uuid).toBe("old2");
  });

  it("保留时间设为永不(0)时一个都不清", async () => {
    const { service, trashDAO, systemConfig } = buildService();
    systemConfig.setTrashRetentionDays(0);
    await trashDAO.save(makeTrashScript({ uuid: "ancient", deleteTime: Date.now() - 999 * DAY }));

    expect(await service.cleanupExpiredTrash()).toBe(0);
    expect(await trashDAO.get("ancient")).toBeDefined();
  });

  it("回收站为空时应安全返回 0", async () => {
    const { service, systemConfig } = buildService();
    systemConfig.setTrashRetentionDays(30);
    expect(await service.cleanupExpiredTrash()).toBe(0);
  });

  it("回收站关闭时不清理任何残留条目", async () => {
    const { service, trashDAO, systemConfig } = buildService();
    systemConfig.setTrashEnabled(false);
    systemConfig.setTrashRetentionDays(30);
    await trashDAO.save(makeTrashScript({ uuid: "leftover", deleteTime: Date.now() - 99 * DAY }));

    expect(await service.cleanupExpiredTrash()).toBe(0);
    expect(await trashDAO.get("leftover")).toBeDefined();
  });

  it("回收站关闭后残留条目仍可还原", async () => {
    const { service, scriptDAO, trashDAO, systemConfig } = buildService();
    systemConfig.setTrashEnabled(false);
    await saveTrashWithCode(trashDAO, { uuid: "leftover2" });

    const ret = await service.restoreScripts(["leftover2"]);

    expect(ret.restored).toEqual(["leftover2"]);
    expect(await scriptDAO.get("leftover2")).toBeDefined();
    expect(await trashDAO.get("leftover2")).toBeUndefined();
  });
});

describe("ScriptService —— 回收站 DAO 缓存", () => {
  it("构造后回收站 DAO 应启用缓存,避免重复枚举 OPFS 目录", () => {
    const { service } = buildService();

    expect(service.trashScriptDAO.useCache).toBe(true);
  });

  // TrashScriptDAO 自身不能默认开缓存：它也会在安装页/编辑器/导入页等页面上下文里被 new 出来
  // （见 pkg/utils/script.ts），若缓存下放到构造函数，这些页面会把整个回收站常驻加载进内存。
  // 缓存只应由 ScriptService 构造时按需 enableCache()。
  it("TrashScriptDAO 自身不应默认开缓存,否则会在页面上下文里把整个回收站常驻内存", () => {
    expect(new TrashScriptDAO().useCache).toBe(false);
  });
});

describe("ScriptService.deleteScripts —— 回收站关闭时直接销毁", () => {
  beforeEach(async () => {
    await resetActiveScriptData();
    // trash_enabled/trash_retention_days 不在 STORAGE_LOCAL_KEYS 里，走 chrome.storage.sync，
    // 不清会把上一个用例写入的值泄漏到这里
    await chrome.storage.sync.clear();
  });

  it("未设置 trash_enabled 时默认仍走回收站,脚本代码保存在 OPFS", async () => {
    const { service, scriptDAO, trashDAO, codeDAO } = buildService();
    await scriptDAO.save(makeScript({ uuid: "d1" }));
    await codeDAO.save({ uuid: "d1", code: "// code" });

    await service.deleteScripts(["d1"]);

    expect(await trashDAO.get("d1")).toBeDefined();
    expect(await trashDAO.getCode("d1")).toBe("// code");
    expect(await codeDAO.get("d1")).toBeUndefined();
  });

  it("关闭回收站后删除不写回收站表,并一并销毁脚本代码", async () => {
    const { service, scriptDAO, trashDAO, codeDAO, systemConfig } = buildService();
    systemConfig.setTrashEnabled(false);
    await scriptDAO.save(makeScript({ uuid: "d2" }));
    await codeDAO.save({ uuid: "d2", code: "// code" });

    await service.deleteScripts(["d2"]);

    expect(await scriptDAO.get("d2")).toBeUndefined();
    expect(await trashDAO.get("d2")).toBeUndefined();
    expect(await codeDAO.get("d2")).toBeUndefined();
  });

  it("关闭回收站后删除必须同时广播 trashScripts(停用)与 deleteScripts(销毁)", async () => {
    const { service, mq, scriptDAO, systemConfig } = buildService();
    systemConfig.setTrashEnabled(false);
    await scriptDAO.save(makeScript({ uuid: "d3" }));
    const trashEvents: TDeleteScript[][] = [];
    const deleteEvents: TDeleteScript[][] = [];
    mq.subscribe<TDeleteScript[]>("trashScripts", (d) => void trashEvents.push(d));
    mq.subscribe<TDeleteScript[]>("deleteScripts", (d) => void deleteEvents.push(d));

    await service.deleteScripts(["d3"]);

    // 漏发 trashScripts 的后果:runtime 不注销、cron 不停、云端不删 —— 脚本删了却还在跑。
    // 次数不断言:MessageQueue.publish() 在测试环境会双投递(见 cleanupExpiredTrash 测试的注释)。
    expect(trashEvents.length).toBeGreaterThan(0);
    expect(deleteEvents.length).toBeGreaterThan(0);
    expect(trashEvents[0][0].uuid).toBe("d3");
    expect(deleteEvents[0][0].uuid).toBe("d3");
  });
});

/**
 * selfMetadata 是「用户对脚本自带 @metadata 的覆盖」。
 * undefined 表示撤销覆盖(生效值回落脚本自带 metadata)，空数组表示用户显式清空，两者语义不同。
 */
describe("ScriptClient 站点范围消息", () => {
  it("排除已匹配站点时应发送对应操作与站点规则", async () => {
    const sendMessage = vi.fn().mockResolvedValue({ data: true });
    const client = new ScriptClient({ sendMessage } as unknown as MessageSend);

    await client.excludeFromMatch("script-uuid", "current.example", "https://current.example/page");

    expect(sendMessage).toHaveBeenCalledWith({
      action: "serviceWorker/script/excludeFromMatch",
      data: { uuid: "script-uuid", host: "current.example", url: "https://current.example/page" },
    });
  });
});

describe("ScriptService selfMetadata 用户覆盖", () => {
  let scriptService: ScriptService;
  let mockScriptDAO: ScriptDAO;
  let mockGroup: Group;
  let mockMessageQueue: IMessageQueue;

  const createMockScript = (overrides: Partial<Script> = {}): Script => ({
    uuid: randomUUID(),
    name: "test-script",
    namespace: "test-namespace",
    type: SCRIPT_TYPE_NORMAL,
    status: SCRIPT_STATUS_ENABLE,
    sort: 0,
    runStatus: "running" as const,
    createtime: Date.now(),
    checktime: Date.now(),
    metadata: {
      name: ["test-script"],
      match: ["*://script.com/*"],
      exclude: ["*://ads.script.com/*"],
      tag: ["script-tag"],
    },
    ...overrides,
  });

  const savedSelfMetadata = () => vi.mocked(mockScriptDAO.update).mock.calls[0][1].selfMetadata;

  beforeEach(() => {
    const eventEmitter = new EventEmitter<string, any>();
    const server = new Server("test", new MockMessage(eventEmitter));
    mockGroup = server.group("script");
    mockMessageQueue = new MessageQueue();
    mockMessageQueue.publish = vi.fn();

    mockScriptDAO = {
      get: vi.fn(),
      update: vi.fn().mockResolvedValue(true),
    } as any;

    const mockSystemConfig = {
      getCheckScriptUpdateCycle: vi.fn().mockResolvedValue(0),
      addListener: vi.fn(),
    } as unknown as SystemConfig;

    scriptService = new ScriptService(
      mockSystemConfig,
      mockGroup,
      mockMessageQueue,
      {} as ValueService,
      {} as ResourceService,
      mockScriptDAO
    );
  });

  describe("popup 站点范围快捷操作", () => {
    const host = "current.example";
    const url = "https://current.example/page";

    it("初始化时应注册排除已匹配站点操作", async () => {
      const alarmsDescriptor = Object.getOwnPropertyDescriptor(chrome, "alarms");
      Object.defineProperty(chrome, "alarms", {
        configurable: true,
        value: { clear: vi.fn().mockResolvedValue(false) },
      });
      const on = vi.spyOn(mockGroup, "on");
      vi.spyOn(scriptService, "listenerScriptInstall").mockImplementation(() => {});

      try {
        scriptService.init();
        await vi.waitFor(() => expect(chrome.alarms.clear).toHaveBeenCalledWith("checkScriptUpdate"));

        expect(on).toHaveBeenCalledWith("excludeFromMatch", expect.any(Function));
      } finally {
        if (alarmsDescriptor) {
          Object.defineProperty(chrome, "alarms", alarmsDescriptor);
        } else {
          Reflect.deleteProperty(chrome, "alarms");
        }
      }
    });

    it("仅在当前站点执行应以当前站点替换匹配列表并清空作者 include", async () => {
      const script = createMockScript({
        metadata: { include: ["*://included.example/*"] },
        selfMetadata: { match: ["*://old.example/*"] },
      });
      vi.mocked(mockScriptDAO.get).mockResolvedValue(script);

      await scriptService.onlyRunOnUrl({ uuid: script.uuid, matchPattern: "*://current.example/*" });

      expect(savedSelfMetadata()).toEqual({
        match: ["*://current.example/*"],
        include: [],
        [SELF_METADATA_ONLY_RUN_ON_URL]: ["*://current.example/*"],
      });
    });

    it("并发站点范围操作应保留两个操作的覆盖变更", async () => {
      let stored = createMockScript();
      let signalFirstUpdate!: () => void;
      let releaseFirstUpdate!: () => void;
      const firstUpdateStarted = new Promise<void>((resolve) => {
        signalFirstUpdate = resolve;
      });
      const firstUpdateRelease = new Promise<void>((resolve) => {
        releaseFirstUpdate = resolve;
      });
      let updateCount = 0;
      vi.mocked(mockScriptDAO.get).mockImplementation(async () => stored);
      vi.mocked(mockScriptDAO.update).mockImplementation(async (_uuid, next) => {
        updateCount += 1;
        if (updateCount === 1) {
          signalFirstUpdate();
          await firstUpdateRelease;
        }
        stored = { ...stored, ...next };
        return stored;
      });

      const onlyRun = scriptService.onlyRunOnUrl({ uuid: stored.uuid, matchPattern: "*://current.example/*" });
      await firstUpdateStarted;
      const exclude = scriptService.excludeFromMatch({ uuid: stored.uuid, host, url });
      await Promise.resolve();
      await Promise.resolve();
      releaseFirstUpdate();
      await Promise.all([onlyRun, exclude]);

      // 串行执行才能让 excludeFromMatch 看到 onlyRunOnUrl 写入的匹配覆盖并把它移出
      expect(stored.selfMetadata).toEqual({ match: [], include: [] });
    });

    it("并发 onlyRunOnUrl 与 resetMatch 应串行执行并保留两次读改写", async () => {
      let stored = createMockScript();
      let signalFirstUpdate!: () => void;
      let releaseFirstUpdate!: () => void;
      const firstUpdateStarted = new Promise<void>((resolve) => {
        signalFirstUpdate = resolve;
      });
      const firstUpdateRelease = new Promise<void>((resolve) => {
        releaseFirstUpdate = resolve;
      });
      let updateCount = 0;
      vi.mocked(mockScriptDAO.get).mockImplementation(async () => stored);
      vi.mocked(mockScriptDAO.update).mockImplementation(async (_uuid, next) => {
        updateCount += 1;
        if (updateCount === 1) {
          signalFirstUpdate();
          await firstUpdateRelease;
        }
        stored = { ...stored, ...next };
        return stored;
      });

      const onlyRun = scriptService.onlyRunOnUrl({ uuid: stored.uuid, matchPattern: "*://current.example/*" });
      await firstUpdateStarted;
      const reset = scriptService.resetMatch({ uuid: stored.uuid, match: ["*://edited.example/*"] });
      await Promise.resolve();
      await Promise.resolve();
      releaseFirstUpdate();
      await Promise.all([onlyRun, reset]);

      // popup 的 onlyRunOnUrl 与设置页的 resetMatch 并发读改写须串行：resetMatch 后写，其
      // match 覆盖生效，同时不覆盖 onlyRunOnUrl 写入的 include 覆盖
      expect(stored.selfMetadata).toEqual({ match: ["*://edited.example/*"], include: [] });
    });

    it("自定义匹配未覆盖当前站点时应把当前站点加入允许列表", async () => {
      const script = createMockScript({
        selfMetadata: { match: ["*://allowed.example/*"], exclude: ["*://current.example/*"] },
      });
      vi.mocked(mockScriptDAO.get).mockResolvedValue(script);

      await scriptService.allowUrl({
        uuid: script.uuid,
        matchPattern: "*://current.example/*",
        excludePattern: "*://current.example/*",
      });

      // 作者 @exclude（ads.script.com）并入用户覆盖，避免移除当前项时丢作者规则
      expect(savedSelfMetadata()).toEqual({
        match: ["*://allowed.example/*", "*://current.example/*"],
        exclude: ["*://ads.script.com/*"],
      });
    });

    it("因排除规则不生效时应移除当前站点排除而不创建匹配覆盖", async () => {
      const script = createMockScript({ selfMetadata: { exclude: ["*://current.example/*"] } });
      vi.mocked(mockScriptDAO.get).mockResolvedValue(script);

      await scriptService.allowUrl({
        uuid: script.uuid,
        matchPattern: "*://current.example/*",
        excludePattern: "*://current.example/*",
      });

      // 移除当前站点时并入作者 @exclude，避免用户覆盖整体替换丢作者规则
      expect(savedSelfMetadata()).toEqual({ exclude: ["*://ads.script.com/*"] });
    });

    it("只有匹配覆盖而没有排除覆盖时应保留作者排除", async () => {
      const script = createMockScript({
        metadata: { exclude: ["*://current.example/*"] },
        selfMetadata: { match: ["*://allowed.example/*"] },
      });
      vi.mocked(mockScriptDAO.get).mockResolvedValue(script);

      await scriptService.allowUrl({
        uuid: script.uuid,
        matchPattern: "*://current.example/*",
        excludePattern: "*://current.example/*",
      });

      expect(savedSelfMetadata()).toEqual({
        match: ["*://allowed.example/*", "*://current.example/*"],
      });
    });

    it("已有用户排除覆盖时 allowUrl 移除当前站点应保留作者与用户排除规则", async () => {
      const script = createMockScript({
        metadata: { exclude: ["*://author-blocked.example/*"] },
        selfMetadata: { exclude: ["*://current.example/*", "*://user-blocked.example/*"] },
      });
      vi.mocked(mockScriptDAO.get).mockResolvedValue(script);

      await scriptService.allowUrl({
        uuid: script.uuid,
        matchPattern: "*://current.example/*",
        excludePattern: "*://current.example/*",
      });

      // 用户覆盖整体替换作者规则，allowUrl 移除当前项时须并入作者 @exclude，避免丢作者规则
      expect(savedSelfMetadata()).toEqual({
        exclude: ["*://author-blocked.example/*", "*://user-blocked.example/*"],
      });
    });

    it("匹配中有当前站点的专属规则时应只移出匹配，不写入排除", async () => {
      const script = createMockScript({
        metadata: { match: ["*://current.example/*", "*://other.example/*"] },
        selfMetadata: { exclude: ["*://blocked.example/*"] },
      });
      vi.mocked(mockScriptDAO.get).mockResolvedValue(script);

      await scriptService.excludeFromMatch({ uuid: script.uuid, host, url });

      // 移出匹配后脚本已不在本站生效，无需再写排除，用户的排除列表保持原样
      expect(savedSelfMetadata()).toEqual({
        match: ["*://other.example/*"],
        exclude: ["*://blocked.example/*"],
      });
    });

    it("同一站点的多条路径匹配应一并移出", async () => {
      const script = createMockScript({
        metadata: { match: ["https://current.example/a*", "http://current.example/b*", "*://other.example/*"] },
      });
      vi.mocked(mockScriptDAO.get).mockResolvedValue(script);

      await scriptService.excludeFromMatch({ uuid: script.uuid, host, url });

      expect(savedSelfMetadata()).toEqual({ match: ["*://other.example/*"] });
    });

    it("移出的是最后一条匹配时应保留显式空匹配覆盖", async () => {
      const script = createMockScript({ metadata: { match: ["*://current.example/*"] } });
      vi.mocked(mockScriptDAO.get).mockResolvedValue(script);

      await scriptService.excludeFromMatch({ uuid: script.uuid, host, url });

      expect(savedSelfMetadata()).toEqual({ match: [] });
    });

    it("通配匹配移不掉当前站点时应回退为写入排除", async () => {
      const script = createMockScript({ metadata: { match: ["*://*/*"] } });
      vi.mocked(mockScriptDAO.get).mockResolvedValue(script);

      await scriptService.excludeFromMatch({ uuid: script.uuid, host, url });

      // 通配匹配删不掉单一站点，只有排除能真正关掉；同时不该创建匹配覆盖
      expect(savedSelfMetadata()).toEqual({ exclude: ["*://current.example/*"] });
    });

    it("不应移除通配子域匹配，改以排除关掉当前子域", async () => {
      const script = createMockScript({ metadata: { match: ["*://*.example.com/*"] } });
      vi.mocked(mockScriptDAO.get).mockResolvedValue(script);

      // 移除 *://*.example.com/* 会连兄弟子域一起关掉，超出「不在 www.example.com 执行」的范围
      await scriptService.excludeFromMatch({
        uuid: script.uuid,
        host: "www.example.com",
        url: "https://www.example.com/page",
      });

      expect(savedSelfMetadata()).toEqual({ exclude: ["*://www.example.com/*"] });
    });

    it("@include 仍命中当前站点时应在移出匹配后补写排除", async () => {
      const script = createMockScript({
        metadata: { match: ["*://current.example/*"], include: ["*://current.example/*"] },
      });
      vi.mocked(mockScriptDAO.get).mockResolvedValue(script);

      await scriptService.excludeFromMatch({ uuid: script.uuid, host, url });

      expect(savedSelfMetadata()).toEqual({
        match: [],
        exclude: ["*://current.example/*"],
      });
    });

    it("仅在当前站点执行后再关掉当前站点应清空匹配并撤销来源标记", async () => {
      const script = createMockScript({
        selfMetadata: {
          match: ["*://current.example/*"],
          include: [],
          [SELF_METADATA_ONLY_RUN_ON_URL]: ["*://current.example/*"],
        },
      });
      vi.mocked(mockScriptDAO.get).mockResolvedValue(script);

      await scriptService.excludeFromMatch({ uuid: script.uuid, host, url });

      expect(savedSelfMetadata()).toEqual({ match: [], include: [] });
    });

    it("写入排除时应同时保留作者与用户已有的排除规则", async () => {
      const script = createMockScript({
        metadata: { match: ["*://*/*"], exclude: ["*://author-blocked.example/*"] },
        selfMetadata: { exclude: ["*://user-blocked.example/*"] },
      });
      vi.mocked(mockScriptDAO.get).mockResolvedValue(script);

      await scriptService.excludeFromMatch({ uuid: script.uuid, host, url });

      // 用户覆盖整体替换作者规则，因此写排除时须并入作者 @exclude，避免丢作者规则
      expect(savedSelfMetadata()).toEqual({
        exclude: ["*://author-blocked.example/*", "*://user-blocked.example/*", "*://current.example/*"],
      });
    });

    it("当前站点本就不在匹配范围内时不应写入任何覆盖", async () => {
      const script = createMockScript({ metadata: { match: ["*://other.example/*"] } });
      vi.mocked(mockScriptDAO.get).mockResolvedValue(script);

      await scriptService.excludeFromMatch({ uuid: script.uuid, host, url });

      expect(mockScriptDAO.update).not.toHaveBeenCalled();
    });
  });

  describe("resetMatch / resetExclude - 编辑器匹配列表", () => {
    it("传入 undefined(重置)应删除用户覆盖", async () => {
      const script = createMockScript({ selfMetadata: { match: ["*://user.com/*"] } });
      vi.mocked(mockScriptDAO.get).mockResolvedValue(script);

      await scriptService.resetMatch({ uuid: script.uuid, match: undefined });

      expect(savedSelfMetadata()).toBeUndefined();
    });

    it("传入空数组(删除最后一项)应保存空覆盖", async () => {
      const script = createMockScript({ selfMetadata: { match: ["*://user.com/*"] } });
      vi.mocked(mockScriptDAO.get).mockResolvedValue(script);

      await scriptService.resetMatch({ uuid: script.uuid, match: [] });

      expect(savedSelfMetadata()).toEqual({ match: [] });
    });

    it("重置时应同时撤销 onlyRunOnUrl 写入的 include 覆盖，恢复作者 include", async () => {
      const script = createMockScript({
        metadata: { include: ["*://included.example/*"] },
        selfMetadata: {
          match: ["*://current.example/*"],
          include: [],
          [SELF_METADATA_ONLY_RUN_ON_URL]: ["*://current.example/*"],
        },
      });
      vi.mocked(mockScriptDAO.get).mockResolvedValue(script);

      await scriptService.resetMatch({ uuid: script.uuid, match: undefined });

      // match 与 include 覆盖是 onlyRunOnUrl 一并写入的 URL 范围单元，重置须一并撤销
      expect(savedSelfMetadata()).toBeUndefined();
    });

    it("重置 match 时应保留独立的 include 覆盖", async () => {
      const script = createMockScript({ selfMetadata: { include: ["*://user.example/*"] } });
      vi.mocked(mockScriptDAO.get).mockResolvedValue(script);

      await scriptService.resetMatch({ uuid: script.uuid, match: undefined });

      expect(savedSelfMetadata()).toEqual({ include: ["*://user.example/*"] });
    });

    it("传入空数组(删除最后一项)时应保留 include 覆盖", async () => {
      const script = createMockScript({
        selfMetadata: { match: ["*://current.example/*"], include: [] },
      });
      vi.mocked(mockScriptDAO.get).mockResolvedValue(script);

      await scriptService.resetMatch({ uuid: script.uuid, match: [] });

      expect(savedSelfMetadata()).toEqual({ match: [], include: [] });
    });

    it("resetExclude 传入 undefined(重置)应删除用户覆盖", async () => {
      const script = createMockScript({ selfMetadata: { exclude: ["*://user.com/*"] } });
      vi.mocked(mockScriptDAO.get).mockResolvedValue(script);

      await scriptService.resetExclude({ uuid: script.uuid, exclude: undefined });

      expect(savedSelfMetadata()).toBeUndefined();
    });

    it("resetExclude 传入空数组(删除最后一项)应保存空覆盖", async () => {
      const script = createMockScript({ selfMetadata: { exclude: ["*://user.com/*"] } });
      vi.mocked(mockScriptDAO.get).mockResolvedValue(script);

      await scriptService.resetExclude({ uuid: script.uuid, exclude: [] });

      expect(savedSelfMetadata()).toEqual({ exclude: [] });
    });
  });

  describe("updateMetadata - 标签与运行环境", () => {
    it("删除最后一个标签时应保存空覆盖，而不是回落脚本自带的 tag", async () => {
      const script = createMockScript({ selfMetadata: { tag: ["user-tag"] } });
      vi.mocked(mockScriptDAO.get).mockResolvedValue(script);

      await scriptService.updateMetadata({ uuid: script.uuid, key: "tag", value: [] });

      expect(savedSelfMetadata()).toEqual({ tag: [] });
    });

    it("传入 undefined 应删除用户覆盖(run-in 选择「默认」即跟随脚本)", async () => {
      const script = createMockScript({ selfMetadata: { "run-in": ["content-script"] } });
      vi.mocked(mockScriptDAO.get).mockResolvedValue(script);

      await scriptService.updateMetadata({ uuid: script.uuid, key: "run-in", value: undefined });

      expect(savedSelfMetadata()).toBeUndefined();
    });

    it("通用 metadata 更新可保存 include 覆盖并清除 onlyRunOnUrl provenance", async () => {
      const script = createMockScript({
        selfMetadata: {
          match: ["*://current.example/*"],
          include: [],
          [SELF_METADATA_ONLY_RUN_ON_URL]: ["*://current.example/*"],
        },
      });
      vi.mocked(mockScriptDAO.get).mockResolvedValue(script);

      await scriptService.updateMetadata({ uuid: script.uuid, key: "include", value: ["*://user.example/*"] });

      expect(savedSelfMetadata()).toEqual({
        match: ["*://current.example/*"],
        include: ["*://user.example/*"],
      });
    });
  });
});

describe("ScriptService.batchUpdateListAction —— 更新动作的执行结果", () => {
  const userscript = (version: string) =>
    [
      "// ==UserScript==",
      "// @name        批量更新目标",
      "// @namespace   scriptcat-test",
      `// @version     ${version}`,
      "// ==/UserScript==",
      "console.log(1);",
    ].join("\n");

  /** 构造一条「有更新」的检查记录并写进 ScriptUpdateCheck 的内存缓存 */
  const primeCache = (service: ScriptService, entries: { uuid: string; newCode?: string }[]) => {
    const list = entries.map(({ uuid, newCode }) => ({
      uuid,
      checkUpdate: true as const,
      oldCode: userscript("1.0.0"),
      newCode: newCode as string,
      newMeta: { version: ["2.0.0"], connect: [] },
      script: makeScript({ uuid, name: "批量更新目标", namespace: "scriptcat-test" }),
      codeSimilarity: 0.9,
      sites: [],
      withNewConnect: false,
    }));
    service["scriptUpdateCheck"].setCacheFull({ checktime: Date.now(), list });
  };

  it("Service Worker 检查结果缓存丢失时应返回明确的失败原因而非静默 undefined", async () => {
    const { service } = buildService();

    const res = await service.batchUpdateListAction({
      actionCode: BatchUpdateListActionCode.UPDATE,
      actionPayload: [{ uuid: "gone" }],
    });

    expect(res).toEqual({ ok: false, reason: "record_expired", items: [] });
  });

  it("安装成功时应逐条返回 success 并把该条目移出缓存", async () => {
    const { service, scriptDAO, codeDAO } = buildService();
    await scriptDAO.save(makeScript({ uuid: "u-ok", name: "批量更新目标", namespace: "scriptcat-test" }));
    await codeDAO.save({ uuid: "u-ok", code: userscript("1.0.0") });
    primeCache(service, [{ uuid: "u-ok", newCode: userscript("2.0.0") }]);

    const res = await service.batchUpdateListAction({
      actionCode: BatchUpdateListActionCode.UPDATE,
      actionPayload: [{ uuid: "u-ok" }],
    });

    expect(res).toEqual({ ok: true, items: [{ uuid: "u-ok", success: true }] });
    expect(service["scriptUpdateCheck"].cacheFull?.list?.some((e) => e.uuid === "u-ok")).toBe(false);
  });

  it("安装抛错时应把失败原因透传给调用方而不是吞掉", async () => {
    const { service, scriptDAO } = buildService();
    await scriptDAO.save(makeScript({ uuid: "u-bad", name: "批量更新目标", namespace: "scriptcat-test" }));
    primeCache(service, [{ uuid: "u-bad", newCode: userscript("2.0.0") }]);
    vi.spyOn(service, "installByCode").mockRejectedValue(new Error("下载新版本失败"));

    const res = await service.batchUpdateListAction({
      actionCode: BatchUpdateListActionCode.UPDATE,
      actionPayload: [{ uuid: "u-bad" }],
    });

    expect(res).toEqual({ ok: true, items: [{ uuid: "u-bad", success: false, error: "下载新版本失败" }] });
    expect(service["scriptUpdateCheck"].cacheFull?.list?.some((e) => e.uuid === "u-bad")).toBe(true);
  });

  it("缓存仍在但请求的脚本记录已不存在时应视为缓存过期", async () => {
    const { service } = buildService();
    primeCache(service, [{ uuid: "cached", newCode: userscript("2.0.0") }]);

    const res = await service.batchUpdateListAction({
      actionCode: BatchUpdateListActionCode.UPDATE,
      actionPayload: [{ uuid: "missing" }],
    });

    expect(res).toEqual({ ok: false, reason: "record_expired", items: [] });
  });

  it("当前脚本版本高于缓存版本时应拒绝更新而不发生降级", async () => {
    const { service, scriptDAO, codeDAO } = buildService();
    await scriptDAO.save(
      makeScript({
        uuid: "u-stale",
        name: "批量更新目标",
        namespace: "scriptcat-test",
        metadata: { name: ["批量更新目标"], namespace: ["scriptcat-test"], version: ["3.0.0"] },
      })
    );
    await codeDAO.save({ uuid: "u-stale", code: userscript("3.0.0") });
    service["scriptUpdateCheck"].setCacheFull({
      checktime: Date.now(),
      list: [
        {
          uuid: "u-stale",
          checkUpdate: true,
          oldCode: userscript("1.0.0"),
          newCode: userscript("2.0.0"),
          newMeta: { version: ["2.0.0"], connect: [] },
          script: makeScript({
            uuid: "u-stale",
            name: "批量更新目标",
            namespace: "scriptcat-test",
            metadata: { name: ["批量更新目标"], namespace: ["scriptcat-test"], version: ["1.0.0"] },
          }),
          codeSimilarity: 0.9,
          sites: [],
          withNewConnect: false,
        },
      ],
    });

    const res = await service.batchUpdateListAction({
      actionCode: BatchUpdateListActionCode.UPDATE,
      actionPayload: [{ uuid: "u-stale" }],
    });

    expect(res).toEqual({ ok: false, reason: "record_expired", items: [] });
    expect((await scriptDAO.get("u-stale"))?.metadata.version).toEqual(["3.0.0"]);
  });
});

describe("ScriptService._checkScriptUpdate —— 检查期间脚本被更新", () => {
  const userscript = (version: string) =>
    [
      "// ==UserScript==",
      "// @name        竞态目标",
      "// @namespace   scriptcat-test",
      `// @version     ${version}`,
      "// ==/UserScript==",
      "console.log(1);",
    ].join("\n");

  const URL = "https://example.test/race.user.js";

  /** 保存一个「可检查更新」的 v1.0.0 脚本 */
  const saveCheckable = async (service: ScriptService, scriptDAO: ScriptDAO) => {
    await scriptDAO.save(
      makeScript({
        uuid: "u-race",
        name: "竞态目标",
        namespace: "scriptcat-test",
        metadata: { name: ["竞态目标"], namespace: ["scriptcat-test"], version: ["1.0.0"] },
        // downloadUrl 与 checkUpdateUrl 相同：检查结果里的 code 直接复用，不发第二次网络请求
        downloadUrl: URL,
        checkUpdateUrl: URL,
        checkUpdate: true,
      })
    );
    await service.scriptCodeDAO.save({ uuid: "u-race", code: userscript("1.0.0") });
  };

  const entryOf = (service: ScriptService) =>
    service["scriptUpdateCheck"].cacheFull?.list?.find((e) => e.uuid === "u-race");

  it("检查期间该脚本已装上新版本时,检查结束不应把它重新列为待更新", async () => {
    const { service, scriptDAO } = buildService();
    await saveCheckable(service, scriptDAO);
    // 检查是个耗时过程（每条 250~1600ms 的节流延迟）。用户在这段窗口里从更新页把这条更新装上了。
    vi.spyOn(service, "checkUpdatesAvailable").mockImplementation(async () => {
      await service.installByCode({ uuid: "u-race", code: userscript("2.0.0"), upsertBy: "user" });
      return [{ updateAvailable: true as const, code: userscript("2.0.0"), metadata: { version: ["2.0.0"] } }];
    });

    await service.checkScriptUpdate({ checkType: "user" });

    expect(entryOf(service)?.checkUpdate).not.toBe(true);
  });

  it("检查期间该脚本未被改动时,仍应正常列为待更新", async () => {
    const { service, scriptDAO } = buildService();
    await saveCheckable(service, scriptDAO);
    vi.spyOn(service, "checkUpdatesAvailable").mockResolvedValue([
      { updateAvailable: true as const, code: userscript("2.0.0"), metadata: { version: ["2.0.0"] } },
    ]);

    await service.checkScriptUpdate({ checkType: "user" });

    expect(entryOf(service)?.checkUpdate).toBe(true);
    expect(entryOf(service)?.newMeta?.version).toEqual(["2.0.0"]);
  });

  it("检查期间该脚本被删除时,检查结束不应把它留在记录里", async () => {
    const { service, scriptDAO } = buildService();
    await saveCheckable(service, scriptDAO);
    vi.spyOn(service, "checkUpdatesAvailable").mockImplementation(async () => {
      await scriptDAO.delete("u-race");
      return [{ updateAvailable: true as const, code: userscript("2.0.0"), metadata: { version: ["2.0.0"] } }];
    });

    await service.checkScriptUpdate({ checkType: "user" });

    expect(entryOf(service)?.checkUpdate).not.toBe(true);
  });

  it("部分脚本在检查期间变更时,无脚本的退化记录也不应导致缓存排序崩溃", async () => {
    const { service, scriptDAO } = buildService();
    const stableUrl = "https://example.test/stable.user.js";
    await scriptDAO.save(
      makeScript({
        uuid: "u-changed",
        name: "变更目标",
        namespace: "scriptcat-test",
        sort: 0,
        metadata: { name: ["变更目标"], namespace: ["scriptcat-test"], version: ["1.0.0"] },
        downloadUrl: URL,
        checkUpdateUrl: URL,
        checkUpdate: true,
      })
    );
    await scriptDAO.save(
      makeScript({
        uuid: "u-stable",
        name: "稳定目标",
        namespace: "scriptcat-test",
        sort: 1,
        metadata: { name: ["稳定目标"], namespace: ["scriptcat-test"], version: ["1.0.0"] },
        downloadUrl: stableUrl,
        checkUpdateUrl: stableUrl,
        checkUpdate: true,
      })
    );
    await service.scriptCodeDAO.save({ uuid: "u-changed", code: userscript("1.0.0") });
    await service.scriptCodeDAO.save({ uuid: "u-stable", code: userscript("1.0.0") });
    vi.spyOn(service, "checkUpdatesAvailable").mockImplementation(async () => {
      await service.installByCode({ uuid: "u-changed", code: userscript("2.0.0"), upsertBy: "user" });
      return [
        { updateAvailable: true as const, code: userscript("2.0.0"), metadata: { version: ["2.0.0"] } },
        { updateAvailable: true as const, code: userscript("2.0.0"), metadata: { version: ["2.0.0"] } },
      ];
    });

    await expect(service.checkScriptUpdate({ checkType: "user" })).resolves.toMatchObject({ ok: true });
    expect(service["scriptUpdateCheck"].cacheFull?.list?.find((e) => e.uuid === "u-changed")?.checkUpdate).toBe(false);
    expect(service["scriptUpdateCheck"].cacheFull?.list?.find((e) => e.uuid === "u-stable")?.checkUpdate).toBe(true);
  });
});
