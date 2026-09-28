import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { initTestEnv } from "@Tests/utils";
import { SubscribeService } from "./subscribe";
import type { ScriptService } from "./script";
import { ScriptDAO, SCRIPT_TYPE_NORMAL, SCRIPT_STATUS_ENABLE, SCRIPT_RUN_STATUS_COMPLETE } from "@App/app/repo/scripts";
import type { Script } from "@App/app/repo/scripts";
import { SubscribeDAO, SubscribeStatusType } from "@App/app/repo/subscribe";
import type { Subscribe } from "@App/app/repo/subscribe";
import type { TInstallSubscribe } from "../queue";
import { MessageQueue } from "@Packages/message/message_queue";
import { MockMessage } from "@Packages/message/mock_message";
import { Server } from "@Packages/message/server";
import { SubscribeClient } from "./client";
import { createMockOPFS } from "@App/app/repo/test-helpers";
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
  return { service, scriptService, mq };
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

// 订阅列表页只在挂载时拉取一次数据，列表要跟上后台变化，只能靠脚本同步完成后的广播
describe("SubscribeService —— 订阅列表同步广播", () => {
  beforeEach(async () => {
    await chrome.storage.local.clear();
  });

  it("订阅脚本同步完成后应广播含最新脚本关联的订阅", async () => {
    await new SubscribeDAO().save(makeSubscribe({ scripts: {} }));
    const { service, mq } = buildService();
    const published = new Promise<TInstallSubscribe>((resolve) => mq.subscribe("upsertSubscribe", resolve));

    await service.upsertScript(SUB_URL);

    const { subscribe } = await published;
    expect(subscribe.url).toBe(SUB_URL);
    expect(subscribe.scripts[SCRIPT_URL]).toEqual({ url: SCRIPT_URL, uuid: "sub-script-1" });
  });

  it("较旧的脚本同步完成较晚时保留较新的订阅", async () => {
    await new SubscribeDAO().save(
      makeSubscribe({
        scripts: {},
        metadata: { usersubscribe: [], scripturl: [SCRIPT_URL], version: ["0.3.4"] },
      })
    );
    const { service, scriptService, mq } = buildService();
    let finishScriptInstall!: (script: Script) => void;
    const scriptInstallPending = new Promise<Script>((resolve) => {
      finishScriptInstall = resolve;
    });
    vi.spyOn(scriptService, "installByUrl").mockImplementation(() => scriptInstallPending);
    const save = vi.spyOn(service.subscribeDAO, "save");
    const olderSync = service.upsertScript(SUB_URL);

    await vi.waitFor(() => expect(scriptService.installByUrl).toHaveBeenCalledOnce());

    const newerInstall = service.install({
      subscribe: makeSubscribe({
        scripts: {},
        metadata: { usersubscribe: [], scripturl: [], version: ["0.3.5"] },
      }),
    });
    const newerInstallComplete = newerInstall.then(() => undefined);
    const savedWhileOlderSyncPending = save.mock.calls.length > 0;
    if (savedWhileOlderSyncPending) await newerInstallComplete;

    finishScriptInstall(makeScript());
    await Promise.all([olderSync, newerInstall]);
    const latestBroadcast = new Promise<TInstallSubscribe>((resolve) => mq.subscribe("upsertSubscribe", resolve));
    await service.upsertScript(SUB_URL);

    const saved = await new SubscribeDAO().get(SUB_URL);
    expect(savedWhileOlderSyncPending).toBe(false);
    expect(saved?.metadata.version).toEqual(["0.3.5"]);
    expect(saved?.scripts).toEqual({});
    await expect(latestBroadcast).resolves.toMatchObject({
      subscribe: { metadata: { version: ["0.3.5"] }, scripts: {} },
    });
  });

  it("脚本同步期间不启动同一订阅的更新检查", async () => {
    await new SubscribeDAO().save(
      makeSubscribe({
        scripts: {},
        metadata: { usersubscribe: [], scripturl: [SCRIPT_URL], version: ["0.3.4"] },
      })
    );
    const { service, scriptService } = buildService();
    let finishScriptInstall!: (script: Script) => void;
    const scriptInstallPending = new Promise<Script>((resolve) => {
      finishScriptInstall = resolve;
    });
    vi.spyOn(scriptService, "installByUrl").mockImplementation(() => scriptInstallPending);
    const get = vi.spyOn(service.subscribeDAO, "get");
    const syncing = service.upsertScript(SUB_URL);

    await vi.waitFor(() => expect(scriptService.installByUrl).toHaveBeenCalledOnce());

    const checkAvailable = vi.spyOn(service, "_checkUpdateAvailable").mockResolvedValue(false);
    const checking = service.checkUpdate(SUB_URL, "user");
    const checkStartedBeforeSyncFinished = get.mock.calls.length > 1;

    finishScriptInstall(makeScript());
    await Promise.all([syncing, checking]);

    expect(checkStartedBeforeSyncFinished).toBe(false);
    expect(checkAvailable).toHaveBeenCalledOnce();
  });
});

const subscribeCode = (version: string, connect: string[] = []) =>
  [
    "// ==UserSubscribe==",
    "// @name 测试订阅",
    "// @namespace ns",
    `// @version ${version}`,
    ...connect.map((c) => `// @connect ${c}`),
    "// ==/UserSubscribe==",
    "",
  ].join("\n");

// options 页经 SubscribeClient 以 { url } 发送检查更新；SW 端若按字符串接收，
// 会以 "[object Object]" 查订阅而查不到，手动检查永远显示「已是最新」且不发请求。
describe("SubscribeService —— 手动检查更新", () => {
  beforeEach(async () => {
    await chrome.storage.local.clear();
    // 需用户确认时更新代码暂存于 OPFS，再打开安装页
    createMockOPFS();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const setup = async (remoteCode: string) => {
    await new SubscribeDAO().save(makeSubscribe({ scripts: {}, metadata: { usersubscribe: [], version: ["0.3.3"] } }));
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response(remoteCode, { status: 200 }));
    const tabsCreate = vi.spyOn(chrome.tabs, "create");
    // chrome.alarms 在 chrome-extension-mock 中没有实现，init() 会调用 clear
    Object.assign(chrome, { alarms: { clear: vi.fn() } });
    const mockMessage = new MockMessage(new EventEmitter<string, any>());
    const server = new Server("serviceWorker", mockMessage);
    const mq = new MessageQueue();
    const service = new SubscribeService(server.group("subscribe"), mq, {} as ScriptService);
    service.init();
    return { client: new SubscribeClient(mockMessage), fetchMock, tabsCreate, mq, service };
  };

  it("远端版本更高且无需确认时应静默更新并返回 updated", async () => {
    const { client, fetchMock, tabsCreate, mq } = await setup(subscribeCode("0.3.4"));
    const synced = new Promise<TInstallSubscribe>((resolve) => mq.subscribe("upsertSubscribe", resolve));

    const res = await client.checkUpdate(SUB_URL);

    expect(fetchMock).toHaveBeenCalledWith(SUB_URL, expect.anything());
    expect(res).toBe("updated");
    expect((await synced).subscribe.metadata.version).toEqual(["0.3.4"]);
    expect(tabsCreate).not.toHaveBeenCalled();
  });

  it("静默更新保存完成后才返回 updated", async () => {
    const { client, service, mq } = await setup(subscribeCode("0.3.4"));
    let finishSave!: (subscribe: Subscribe) => void;
    const savePending = new Promise<Subscribe>((resolve) => {
      finishSave = resolve;
    });
    const save = vi.spyOn(service.subscribeDAO, "save").mockReturnValue(savePending);
    const installed = new Promise<TInstallSubscribe>((resolve) => mq.subscribe("installSubscribe", resolve));
    let settled = false;
    const result = client.checkUpdate(SUB_URL).then((value) => {
      settled = true;
      return value;
    });

    try {
      await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());
      expect(settled).toBe(false);
    } finally {
      finishSave(makeSubscribe({ metadata: { usersubscribe: [], version: ["0.3.4"] } }));
    }

    await expect(result).resolves.toBe("updated");
    await expect(installed).resolves.toMatchObject({ subscribe: { metadata: { version: ["0.3.4"] } } });
  });

  it("静默更新保存失败时返回 false", async () => {
    const { client, service, tabsCreate } = await setup(subscribeCode("0.3.4"));
    const failedInstall = Promise.reject(new Error("storage unavailable"));
    void failedInstall.catch(() => {});
    vi.spyOn(service.subscribeDAO, "save").mockReturnValue(failedInstall);

    await expect(client.checkUpdate(SUB_URL)).resolves.toBe(false);
    expect(tabsCreate).not.toHaveBeenCalled();
  });

  it("远端新增 @connect 域时应打开安装页并返回 confirm", async () => {
    const { client, tabsCreate } = await setup(subscribeCode("0.3.4", ["new.example.com"]));

    const res = await client.checkUpdate(SUB_URL);

    expect(res).toBe("confirm");
    expect(tabsCreate).toHaveBeenCalledWith({ url: expect.stringContaining("/src/install.html?uuid=") });
  });

  it("安装确认页创建完成后才返回 confirm", async () => {
    const { client, tabsCreate } = await setup(subscribeCode("0.3.4", ["new.example.com"]));
    let finishCreate!: (tab: chrome.tabs.Tab) => void;
    const createPending = new Promise<chrome.tabs.Tab>((resolve) => {
      finishCreate = resolve;
    });
    tabsCreate.mockImplementation(() => createPending);
    let settled = false;
    const result = client.checkUpdate(SUB_URL).then((value) => {
      settled = true;
      return value;
    });

    await vi.waitFor(() => expect(tabsCreate).toHaveBeenCalledOnce());
    expect(settled).toBe(false);
    finishCreate({} as chrome.tabs.Tab);

    await expect(result).resolves.toBe("confirm");
  });

  it("安装确认页创建失败时不返回 confirm", async () => {
    const { client, tabsCreate } = await setup(subscribeCode("0.3.4", ["new.example.com"]));
    let failCreate!: (error: Error) => void;
    const createPending = new Promise<chrome.tabs.Tab>((_, reject) => {
      failCreate = reject;
    });
    void createPending.catch(() => {});
    tabsCreate.mockImplementation(() => createPending);

    const result = client.checkUpdate(SUB_URL);
    await vi.waitFor(() => expect(tabsCreate).toHaveBeenCalledOnce());
    failCreate(new Error("tab creation failed"));

    await expect(result).resolves.toBe(false);
  });

  it("远端版本未升高时返回 false", async () => {
    const { client, tabsCreate } = await setup(subscribeCode("0.3.3"));

    const res = await client.checkUpdate(SUB_URL);

    expect(res).toBe(false);
    expect(tabsCreate).not.toHaveBeenCalled();
  });
});
