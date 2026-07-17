import { describe, it, expect, beforeEach } from "vitest";
import { initTestEnv } from "@Tests/utils";
import { ScriptService } from "./script";
import { ValueService } from "./value";
import { ScriptDAO, SCRIPT_TYPE_NORMAL, SCRIPT_STATUS_ENABLE, SCRIPT_RUN_STATUS_COMPLETE } from "@App/app/repo/scripts";
import type { Script } from "@App/app/repo/scripts";
import { ValueDAO, type Value } from "@App/app/repo/value";
import { MessageQueue } from "@Packages/message/message_queue";
import { MockMessage } from "@Packages/message/mock_message";
import { Server } from "@Packages/message/server";
import { SystemConfig } from "@App/pkg/config/config";
import EventEmitter from "eventemitter3";
import type { ResourceService } from "./resource";
import { createMockOPFS } from "@App/app/repo/test-helpers";
import type { RuntimeService } from "./runtime";
import type { PopupService } from "./popup";

initTestEnv();

beforeEach(() => createMockOPFS());

const makeScript = (overrides: Partial<Script> = {}): Script => ({
  uuid: "uuid-f1",
  name: "冻结测试脚本",
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

// value.ts 的 deleteScripts 清理是 fire-and-forget(未 await),故「value 是否被删」是最终一致的。
// 两个用例必须共用同一个 flush 等待窗口:用例②证明该窗口足以让清理链路跑完并观察到删除,
// 从而标定用例①——若只给②加长等待,①的否定断言会在清理根本没跑到时假绿,护栏失效。
const flush = () => new Promise((r) => setTimeout(r, 0));

const makeValue = (uuid: string): Value => ({
  uuid,
  storageName: uuid,
  data: { k: "v" },
  createtime: Date.now(),
  updatetime: Date.now(),
});

describe("回收站期间的数据冻结", () => {
  let mq: MessageQueue;
  let service: ScriptService;
  let scriptDAO: ScriptDAO;
  let valueDAO: ValueDAO;

  beforeEach(async () => {
    await chrome.storage.local.clear();
    mq = new MessageQueue();
    const server = new Server("test", new MockMessage(new EventEmitter<string, any>()));
    const systemConfig = new SystemConfig(mq);
    scriptDAO = new ScriptDAO();
    valueDAO = new ValueDAO();
    // 真实挂载 ValueService,使其订阅 deleteScripts
    const valueService = new ValueService(server.group("value"), mq);
    valueService.init({} as RuntimeService, {} as PopupService);
    service = new ScriptService(
      systemConfig,
      server.group("script"),
      mq,
      valueService,
      {} as ResourceService,
      scriptDAO
    );
  });

  it("进回收站后 value 必须完好(未触发 deleteScripts 的清理链路)", async () => {
    await scriptDAO.save(makeScript({ uuid: "f1" }));
    await service.scriptCodeDAO.save({ uuid: "f1", code: "// code" });
    await valueDAO.save("f1", makeValue("f1"));

    await service.deleteScripts(["f1"]);
    await flush();

    expect(await valueDAO.get("f1")).toBeDefined();
  });

  it("彻底删除后 value 才被清理", async () => {
    await scriptDAO.save(makeScript({ uuid: "f2" }));
    await service.scriptCodeDAO.save({ uuid: "f2", code: "// code" });
    await valueDAO.save("f2", makeValue("f2"));

    await service.deleteScripts(["f2"]);
    await flush();
    expect(await valueDAO.get("f2")).toBeDefined();

    await service.purgeScripts(["f2"]);
    await flush();
    expect(await valueDAO.get("f2")).toBeUndefined();
  });
});
