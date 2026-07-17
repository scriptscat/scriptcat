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
import type { TDeleteScript, TInstallScript } from "@App/app/service/queue";
import { createMockOPFS } from "@App/app/repo/test-helpers";
import type { Group } from "@Packages/message/server";
import type { IMessageQueue } from "@Packages/message/message_queue";

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

    scriptService = new ScriptService(
      {} as SystemConfig,
      mockGroup,
      mockMessageQueue,
      {} as ValueService,
      {} as ResourceService,
      mockScriptDAO
    );
  });

  describe("excludeUrl - popup 排除/取消排除", () => {
    it("取消最后一条排除后应保存空覆盖，而不是回落脚本自带的 exclude", async () => {
      const script = createMockScript();
      vi.mocked(mockScriptDAO.get).mockResolvedValue(script);

      await scriptService.excludeUrl({ uuid: script.uuid, excludePattern: "*://ads.script.com/*", remove: true });

      expect(savedSelfMetadata()).toEqual({ exclude: [] });
    });

    it("取消排除后仍有其他规则时应保存剩余规则", async () => {
      const script = createMockScript({
        selfMetadata: { exclude: ["*://ads.script.com/*", "*://user.com/*"] },
      });
      vi.mocked(mockScriptDAO.get).mockResolvedValue(script);

      await scriptService.excludeUrl({ uuid: script.uuid, excludePattern: "*://user.com/*", remove: true });

      expect(savedSelfMetadata()).toEqual({ exclude: ["*://ads.script.com/*"] });
    });

    it("排除新网站时应追加到覆盖中", async () => {
      const script = createMockScript();
      vi.mocked(mockScriptDAO.get).mockResolvedValue(script);

      await scriptService.excludeUrl({ uuid: script.uuid, excludePattern: "*://user.com/*", remove: false });

      expect(savedSelfMetadata()).toEqual({ exclude: ["*://ads.script.com/*", "*://user.com/*"] });
    });
  });

  describe("includeUrl - popup 加入 opt-in 白名单", () => {
    it("应追加当前网址到用户自定义 site-access 覆盖中", async () => {
      const script = createMockScript({
        metadata: { match: ["*://script.com/*"], "site-access": ["opt-in", "+*://default.com/*"] },
        selfMetadata: { "site-access": ["+*://existing.com/*"] },
      });
      vi.mocked(mockScriptDAO.get).mockResolvedValue(script);

      await scriptService.includeUrl({ uuid: script.uuid, includePattern: "*://user.com/*" });

      expect(savedSelfMetadata()).toEqual({ "site-access": ["+*://existing.com/*", "+*://user.com/*"] });
      expect(mockMessageQueue.publish).toHaveBeenCalled();
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
  });
});
