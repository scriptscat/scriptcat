import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { initTestEnv } from "@Tests/utils";
import { SubscribeService } from "./subscribe";
import type { ScriptService } from "./script";
import { ScriptDAO, SCRIPT_TYPE_NORMAL, SCRIPT_STATUS_ENABLE, SCRIPT_RUN_STATUS_COMPLETE } from "@App/app/repo/scripts";
import type { Script } from "@App/app/repo/scripts";
import { SubscribeDAO, SubscribeStatusType } from "@App/app/repo/subscribe";
import type { Subscribe } from "@App/app/repo/subscribe";
import { MessageQueue } from "@Packages/message/message_queue";
import { MockMessage } from "@Packages/message/mock_message";
import { Server } from "@Packages/message/server";
import { SubscribeClient } from "./client";
import EventEmitter from "eventemitter3";

initTestEnv();

const SUB_URL = "https://example.com/list.user.sub.js";
const SCRIPT_URL = "https://example.com/a.user.js";

const makeScript = (overrides: Partial<Script> = {}): Script => ({
  uuid: "sub-script-1",
  name: "订阅脚本",
  namespace: "ns",
  type: SCRIPT_TYPE_NORMAL,
  status: SCRIPT_STATUS_ENABLE,
  sort: 0,
  runStatus: SCRIPT_RUN_STATUS_COMPLETE,
  createtime: Date.now(),
  checktime: Date.now(),
  metadata: {},
  subscribeUrl: SUB_URL,
  ...overrides,
});

const makeSubscribe = (overrides: Partial<Subscribe> = {}): Subscribe => ({
  url: SUB_URL,
  name: "测试订阅",
  code: "",
  author: "",
  scripts: { [SCRIPT_URL]: { url: SCRIPT_URL, uuid: "sub-script-1" } },
  metadata: { usersubscribe: [], scripturl: [SCRIPT_URL] },
  status: SubscribeStatusType.enable,
  createtime: Date.now(),
  checktime: Date.now(),
  ...overrides,
});

/** 只关心 deleteScript 的调用方式，其余协作者用不到 */
const buildService = () => {
  const mq = new MessageQueue();
  const server = new Server("test", new MockMessage(new EventEmitter<string, any>()));
  const group = server.group("subscribe");
  const scriptService = {
    deleteScript: vi.fn(async () => true),
    installByUrl: vi.fn(async () => makeScript()),
  } as unknown as ScriptService;
  const service = new SubscribeService(group, mq, scriptService);
  return { service, scriptService };
};

// 回收站按 deleteBy 提供「订阅」来源筛选；订阅链路删除脚本时若不标记来源，
// 这些条目会被记成「本机删除」，筛选器永远筛不出订阅删除的脚本。
describe("SubscribeService —— 删除脚本的来源标记", () => {
  beforeEach(async () => {
    await chrome.storage.local.clear();
  });

  it("取消订阅时应以 subscribe 来源删除关联脚本", async () => {
    await new SubscribeDAO().save(makeSubscribe());
    await new ScriptDAO().save(makeScript());
    const { service, scriptService } = buildService();

    await service.delete({ url: SUB_URL });

    expect(scriptService.deleteScript).toHaveBeenCalledWith("sub-script-1", "subscribe");
  });

  it("订阅更新移除脚本时应以 subscribe 来源删除", async () => {
    // 订阅列表已不含该脚本 URL，但 scripts 里仍关联着 → 走移除分支
    await new SubscribeDAO().save(makeSubscribe({ metadata: { usersubscribe: [], scripturl: [] } }));
    await new ScriptDAO().save(makeScript());
    const { service, scriptService } = buildService();

    await service.upsertScript(SUB_URL);

    expect(scriptService.deleteScript).toHaveBeenCalledWith("sub-script-1", "subscribe");
  });
});

// options 页经 SubscribeClient 以 { url } 发送检查更新；SW 端若按字符串接收，
// 会以 "[object Object]" 查订阅而查不到，手动检查永远显示「已是最新」且不发请求。
describe("SubscribeService —— 手动检查更新", () => {
  beforeEach(async () => {
    await chrome.storage.local.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("经 SubscribeClient 检查更新时应拉取订阅并发现新版本", async () => {
    await new SubscribeDAO().save(makeSubscribe({ scripts: {}, metadata: { usersubscribe: [], version: ["0.3.3"] } }));
    const fetchMock = vi.fn(
      async () =>
        new Response(
          "// ==UserSubscribe==\n// @name 测试订阅\n// @namespace ns\n// @version 0.3.4\n// ==/UserSubscribe==\n",
          { status: 200 }
        )
    );
    vi.stubGlobal("fetch", fetchMock);
    // chrome.alarms 在 chrome-extension-mock 中没有实现，init() 会调用 clear
    vi.stubGlobal("chrome", { ...chrome, alarms: { clear: vi.fn() } });
    const mockMessage = new MockMessage(new EventEmitter<string, any>());
    const server = new Server("serviceWorker", mockMessage);
    const service = new SubscribeService(server.group("subscribe"), new MessageQueue(), {} as ScriptService);
    service.init();

    const res = await new SubscribeClient(mockMessage).checkUpdate(SUB_URL);

    expect(fetchMock).toHaveBeenCalledWith(SUB_URL, expect.anything());
    expect(res).toBe(true);
  });
});
