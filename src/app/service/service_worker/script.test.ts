import { describe, it, expect, beforeEach, vi } from "vitest";
import { initTestEnv } from "@Tests/utils";
import { ScriptService } from "./script";
import {
  ScriptDAO,
  ScriptCodeDAO,
  SCRIPT_TYPE_NORMAL,
  SCRIPT_STATUS_ENABLE,
  SCRIPT_RUN_STATUS_COMPLETE,
} from "@App/app/repo/scripts";
import { TrashScriptDAO, type TrashScript } from "@App/app/repo/trash_script";
import type { Script } from "@App/app/repo/scripts";
import { MessageQueue } from "@Packages/message/message_queue";
import { MockMessage } from "@Packages/message/mock_message";
import { Server } from "@Packages/message/server";
import { SystemConfig } from "@App/pkg/config/config";
import EventEmitter from "eventemitter3";
import type { ValueService } from "./value";
import type { ResourceService } from "./resource";
import type { TDeleteScript } from "@App/app/service/queue";

initTestEnv();

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
  const service = new ScriptService(systemConfig, group, mq, {} as ValueService, {} as ResourceService, scriptDAO);
  return { service, mq, scriptDAO, systemConfig, trashDAO: new TrashScriptDAO(), codeDAO: new ScriptCodeDAO() };
};

describe("ScriptService.purgeScripts —— 彻底删除", () => {
  beforeEach(async () => {
    await chrome.storage.local.clear();
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
    await chrome.storage.local.clear();
  });

  it("应把脚本搬进回收站并从活跃表移除", async () => {
    const { service, scriptDAO, trashDAO } = buildService();
    await scriptDAO.save(makeScript({ uuid: "t1" }));

    await service.deleteScripts(["t1"]);

    expect(await scriptDAO.get("t1")).toBeUndefined();
    const trashed = await trashDAO.get("t1");
    expect(trashed?.uuid).toBe("t1");
    expect(trashed?.deleteBy).toBe("user");
    expect(typeof trashed?.deleteTime).toBe("number");
  });

  it("应记录传入的删除来源", async () => {
    const { service, scriptDAO, trashDAO } = buildService();
    await scriptDAO.save(makeScript({ uuid: "t2" }));

    await service.deleteScripts(["t2"], "sync");

    expect((await trashDAO.get("t2"))?.deleteBy).toBe("sync");
  });

  it("应广播 trashScripts 且绝不广播 deleteScripts", async () => {
    const { service, mq, scriptDAO } = buildService();
    await scriptDAO.save(makeScript({ uuid: "t3" }));
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
    const { service, scriptDAO, codeDAO } = buildService();
    await scriptDAO.save(makeScript({ uuid: "t4" }));
    await codeDAO.save({ uuid: "t4", code: "// 我必须活下来" });

    await service.deleteScripts(["t4"]);

    expect((await codeDAO.get("t4"))?.code).toBe("// 我必须活下来");
  });

  it("deleteScript 单条应委托给 deleteScripts 并透传来源", async () => {
    const { service, scriptDAO, trashDAO } = buildService();
    await scriptDAO.save(makeScript({ uuid: "t5" }));

    await service.deleteScript("t5", "subscribe");

    expect((await trashDAO.get("t5"))?.deleteBy).toBe("subscribe");
    expect(await scriptDAO.get("t5")).toBeUndefined();
  });

  it("写回收站失败时不得删除活跃表中的脚本(宁可短暂重复,不可丢数据)", async () => {
    const { service, scriptDAO } = buildService();
    await scriptDAO.save(makeScript({ uuid: "t6" }));
    vi.spyOn(service.trashScriptDAO, "save").mockRejectedValueOnce(new Error("storage boom"));

    await expect(service.deleteScripts(["t6"])).rejects.toThrow("storage boom");
    expect(await scriptDAO.get("t6")).toBeDefined();
  });
});
