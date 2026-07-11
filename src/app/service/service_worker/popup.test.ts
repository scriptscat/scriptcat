import { initTestEnv } from "@Tests/utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cacheInstance } from "@App/app/cache";
import { CACHE_KEY_TAB_SCRIPT } from "@App/app/cache_key";
import { PopupService } from "./popup";
import type { ScriptMenu } from "./types";
import type { RuntimeService } from "./runtime";
import {
  SCRIPT_STATUS_ENABLE,
  SCRIPT_STATUS_DISABLE,
  SCRIPT_TYPE_NORMAL,
  SCRIPT_TYPE_BACKGROUND,
  SCRIPT_RUN_STATUS_RUNNING,
  SCRIPT_RUN_STATUS_COMPLETE,
  type Script,
  type ScriptDAO,
} from "@App/app/repo/scripts";
import type { IMessageQueue } from "@Packages/message/message_queue";
import type { Group } from "@Packages/message/server";
import type { SystemConfig } from "@App/pkg/config/config";
import type { TDeleteScript, TEnableScript, TInstallScript, TScriptRunStatus } from "../queue";

initTestEnv();

// ── 公共测试辅助（跨 describe 复用） ──────────────────────────────────────────

/** 构造最小可用 ScriptMenu 对象 */
const createMenu = (uuid: string, overrides: Partial<ScriptMenu> = {}): ScriptMenu => ({
  uuid,
  name: `script-${uuid}`,
  storageName: uuid,
  enable: true,
  updatetime: 1,
  hasUserConfig: false,
  runStatus: "running",
  runNum: 1,
  runNumByIframe: 0,
  menus: [],
  isEffective: true,
  ...overrides,
});

/** 构造最小可用 Script 对象 */
const createScript = (uuid: string, overrides: Partial<Script> = {}): Script => ({
  uuid,
  name: `script-${uuid}`,
  namespace: "test-namespace",
  metadata: {},
  type: SCRIPT_TYPE_NORMAL,
  status: SCRIPT_STATUS_ENABLE,
  sort: 0,
  runStatus: "running",
  createtime: 1,
  checktime: 1,
  ...overrides,
});

/** 构造 PopupService 及其依赖的 mock，返回 service、订阅表、runtime、scriptDAO */
const createService = (overrides: { runtime?: Partial<RuntimeService>; scriptDAO?: Partial<ScriptDAO> } = {}) => {
  // 用 Map 记录所有 subscribe 调用，方便测试直接触发事件
  const subscriptions = new Map<string, Array<(message: unknown) => unknown>>();
  const mq = {
    subscribe: vi.fn((topic: string, handler: (message: unknown) => unknown) => {
      const handlers = subscriptions.get(topic) || [];
      handlers.push(handler);
      subscriptions.set(topic, handlers);
      return () => undefined;
    }),
    publish: vi.fn(),
    emit: vi.fn(),
    group: vi.fn(),
  } as unknown as IMessageQueue;
  const runtime = {
    getPopupPageScriptMatchingResultByUrl: vi.fn().mockResolvedValue(new Map()),
    isUrlBlacklist: vi.fn().mockReturnValue(false),
    emitEventToTab: vi.fn(),
    ...overrides.runtime,
  } as unknown as RuntimeService;
  const scriptDAO = {
    get: vi.fn(),
    gets: vi.fn().mockResolvedValue([]),
    ...overrides.scriptDAO,
  } as unknown as ScriptDAO;
  const systemConfig = {
    getScriptMenuDisplayType: vi.fn().mockResolvedValue("all"),
    getBadgeNumberType: vi.fn().mockResolvedValue("script_count"),
    getBadgeBackgroundColor: vi.fn().mockResolvedValue("#000000"),
    getBadgeTextColor: vi.fn().mockResolvedValue("#ffffff"),
  } as unknown as SystemConfig;
  const service = new PopupService({} as Group, mq, runtime, scriptDAO, systemConfig);
  return { service, subscriptions, runtime, scriptDAO };
};

// 等待 handler 内部 fire-and-forget 的 cacheInstance.tx 完成。
// stackAsyncTask 对同一 key 串行执行：向同一 key 入队一个尾随空事务，
// 它必然排在 handler 已入队的 tx 之后，且只在前面所有 tx 真正落库后 resolve。
// 相比 setTimeout(0) 轮转宏任务，这里精确等待实际完成，更快也更稳健（不依赖微/宏任务层数）。
const flushAsync = (tabId: number = -1) => cacheInstance.tx(`${CACHE_KEY_TAB_SCRIPT}${tabId}`, () => {});

// ─────────────────────────────────────────────────────────────────────────────

describe("PopupService 删除脚本后 Popup 菜单残留清理", () => {
  beforeEach(async () => {
    await cacheInstance.clear();
  });

  it("getPopupData 读取 Popup 数据时，应过滤掉 runScripts 缓存里已删除脚本的残留记录", async () => {
    const deletedUuid = "deleted-script";
    const liveUuid = "live-script";
    await cacheInstance.set(`${CACHE_KEY_TAB_SCRIPT}${1}`, [createMenu(deletedUuid), createMenu(liveUuid)]);

    const { service, scriptDAO } = createService({
      scriptDAO: {
        gets: vi.fn(async (uuids: string[]) =>
          uuids.map((uuid) => (uuid === liveUuid ? createScript(uuid) : undefined))
        ),
      },
    });

    const result = await service.getPopupData({ tabId: 1, url: "https://example.com/" });

    expect(result.scriptList.map((script) => script.uuid)).toEqual([liveUuid]);
    expect(scriptDAO.gets).toHaveBeenCalledWith([deletedUuid, liveUuid]);
  });

  it("updateRegisterMenuCommand 应忽略已删除脚本发来的迟到 GM_registerMenuCommand", async () => {
    const deletedUuid = "deleted-script";
    const { service, scriptDAO } = createService({
      scriptDAO: {
        gets: vi.fn(async () => [undefined]),
      },
    });

    await (service as any).updateRegisterMenuCommand(
      {
        uuid: deletedUuid,
        key: "late-menu",
        name: "Late menu",
        options: {},
        tabId: 1,
      },
      1 // ScriptMenuRegisterType.REGISTER
    );

    await expect(service.getScriptMenu(1)).resolves.toEqual([]);
    expect(scriptDAO.gets).toHaveBeenCalledWith([deletedUuid]);
  });

  it("deleteScripts 事件应从所有标签页缓存（包含后台 -1）清除已删脚本，并清理待处理菜单命令", async () => {
    const deletedUuid = "deleted-script";
    const liveUuid = "live-script";
    await cacheInstance.set(`${CACHE_KEY_TAB_SCRIPT}${1}`, [createMenu(deletedUuid), createMenu(liveUuid)]);
    await cacheInstance.set(`${CACHE_KEY_TAB_SCRIPT}${2}`, [createMenu(deletedUuid)]);
    await cacheInstance.set(`${CACHE_KEY_TAB_SCRIPT}${-1}`, [createMenu(deletedUuid)]);

    const { service, subscriptions } = createService();
    service.updateMenuCommands.set(1, [
      { uuid: deletedUuid, key: "deleted-menu", name: "Deleted menu", options: {}, tabId: 1, registerType: 1 },
      { uuid: liveUuid, key: "live-menu", name: "Live menu", options: {}, tabId: 1, registerType: 1 },
    ] as never);
    service.updateMenuCommands.set(2, [
      { uuid: deletedUuid, key: "deleted-menu", name: "Deleted menu", options: {}, tabId: 2, registerType: 1 },
    ] as never);
    service.dealBackgroundScriptInstall();

    const [deleteHandler] = subscriptions.get("deleteScripts") || [];
    expect(deleteHandler).toBeDefined();
    await deleteHandler!([
      { uuid: deletedUuid, storageName: "deleted-script", type: SCRIPT_TYPE_NORMAL },
    ] satisfies TDeleteScript[]);

    await expect(service.getScriptMenu(1)).resolves.toEqual([createMenu(liveUuid)]);
    await expect(service.getScriptMenu(2)).resolves.toEqual([]);
    await expect(service.getScriptMenu(-1)).resolves.toEqual([]);
    expect(service.updateMenuCommands.get(1)?.map((command) => command.uuid)).toEqual([liveUuid]);
    expect(service.updateMenuCommands.has(2)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("PopupService addScriptRunNumber 页面脚本执行计数", () => {
  beforeEach(async () => {
    await cacheInstance.clear();
  });

  it("frameId 为 0 时视为页面重新加载，重置旧缓存后写入新脚本，runNum 初始为 1", async () => {
    const oldUuid = "uuid-old";
    const newUuid = "uuid-new";
    // 模拟上一次页面残留的旧缓存
    await cacheInstance.set(`${CACHE_KEY_TAB_SCRIPT}${1}`, [createMenu(oldUuid, { runNum: 5 })]);

    const { service } = createService();
    await service.addScriptRunNumber({
      tabId: 1,
      frameId: 0,
      scriptmenus: [createMenu(newUuid, { runNum: 0 })],
    });

    const menu = await service.getScriptMenu(1);
    expect(menu).toHaveLength(1);
    expect(menu[0].uuid).toBe(newUuid);
    expect(menu[0].runNum).toBe(1);
  });

  it("frameId 非 0（subframe）时应累加已有脚本的 runNum，并额外计入 runNumByIframe", async () => {
    const uuid = "uuid-test";
    await cacheInstance.set(`${CACHE_KEY_TAB_SCRIPT}${1}`, [createMenu(uuid, { runNum: 2, runNumByIframe: 0 })]);

    const { service } = createService();
    await service.addScriptRunNumber({
      tabId: 1,
      frameId: 10, // subframe id
      scriptmenus: [createMenu(uuid, { runNum: 0 })],
    });

    const menu = await service.getScriptMenu(1);
    expect(menu[0].runNum).toBe(3); // 2 + 1
    expect(menu[0].runNumByIframe).toBe(1);
  });

  it("缓存中不存在的脚本应新增记录，runNum 初始为 1，isEffective 为 true", async () => {
    const uuid = "uuid-brand-new";
    const { service } = createService();

    await service.addScriptRunNumber({
      tabId: 1,
      frameId: 0,
      scriptmenus: [createMenu(uuid, { runNum: 0, isEffective: true })],
    });

    const menu = await service.getScriptMenu(1);
    expect(menu).toHaveLength(1);
    expect(menu[0].uuid).toBe(uuid);
    expect(menu[0].runNum).toBe(1);
    expect(menu[0].isEffective).toBe(true);
  });

  it("scriptmenus 为空且缓存也为空时，不应写入 session 缓存（避免无谓的 storage 写入）", async () => {
    const { service } = createService();

    await service.addScriptRunNumber({ tabId: 1, frameId: 0, scriptmenus: [] });

    // 不应产生任何缓存记录
    await expect(service.getScriptMenu(1)).resolves.toEqual([]);
  });

  it("subframe 加载时多个脚本应分别独立累加各自的 runNum（frameId 非 0 不重置缓存）", async () => {
    const uuidA = "uuid-a";
    const uuidB = "uuid-b";
    // frameId 非 0 时不会重置 data，旧缓存保留并叠加
    await cacheInstance.set(`${CACHE_KEY_TAB_SCRIPT}${1}`, [
      createMenu(uuidA, { runNum: 1 }),
      createMenu(uuidB, { runNum: 3 }),
    ]);

    const { service } = createService();
    await service.addScriptRunNumber({
      tabId: 1,
      frameId: 5, // subframe，非 0 → 保留旧缓存叠加
      scriptmenus: [createMenu(uuidA, { runNum: 0 }), createMenu(uuidB, { runNum: 0 })],
    });

    const menu = await service.getScriptMenu(1);
    const mA = menu.find((m) => m.uuid === uuidA);
    const mB = menu.find((m) => m.uuid === uuidB);
    expect(mA?.runNum).toBe(2);
    expect(mB?.runNum).toBe(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("PopupService getPopupData Popup 数据获取与合并", () => {
  beforeEach(async () => {
    await cacheInstance.clear();
  });

  it("URL 匹配的脚本（无运行缓存）应出现在 scriptList，isEffective 与 enable 按脚本状态设置", async () => {
    const uuid = "match-uuid";
    const matchMap = new Map([[uuid, { uuid, effective: true }]]);

    const { service } = createService({
      runtime: {
        getPopupPageScriptMatchingResultByUrl: vi.fn().mockResolvedValue(matchMap),
        isUrlBlacklist: vi.fn().mockReturnValue(false),
      },
      scriptDAO: {
        gets: vi.fn().mockResolvedValue([createScript(uuid)]),
      },
    });

    const result = await service.getPopupData({ tabId: 1, url: "https://example.com/" });

    expect(result.scriptList).toHaveLength(1);
    expect(result.scriptList[0].uuid).toBe(uuid);
    expect(result.scriptList[0].isEffective).toBe(true);
    expect(result.scriptList[0].enable).toBe(true);
    expect(result.isBlacklist).toBe(false);
  });

  it("脚本同时在匹配结果与运行缓存中，应复用缓存记录（保留 runNum）并更新 enable/isEffective/hasUserConfig", async () => {
    const uuid = "run-uuid";
    const matchMap = new Map([[uuid, { uuid, effective: false }]]);
    // 运行缓存中存有旧记录（模拟脚本已在页面运行过）
    await cacheInstance.set(`${CACHE_KEY_TAB_SCRIPT}${1}`, [createMenu(uuid, { runNum: 7, enable: false })]);

    const { service } = createService({
      runtime: {
        getPopupPageScriptMatchingResultByUrl: vi.fn().mockResolvedValue(matchMap),
        isUrlBlacklist: vi.fn().mockReturnValue(false),
      },
      scriptDAO: {
        // 返回有 config 的脚本，使 hasUserConfig 为 true
        gets: vi.fn().mockResolvedValue([createScript(uuid, { config: { fields: {} } as any })]),
      },
    });

    const result = await service.getPopupData({ tabId: 1, url: "https://example.com/" });

    expect(result.scriptList[0].runNum).toBe(7); // 保留缓存中的执行次数
    expect(result.scriptList[0].enable).toBe(true); // 按脚本 status 更新
    expect(result.scriptList[0].isEffective).toBe(false); // 来自匹配结果
    expect(result.scriptList[0].hasUserConfig).toBe(true); // script.config 存在
  });

  it("URL 无任何匹配脚本时，scriptList 为空；后台脚本应出现在 backScriptList", async () => {
    const bgUuid = "bg-uuid";
    // 预置后台菜单缓存（tabId = -1）
    await cacheInstance.set(`${CACHE_KEY_TAB_SCRIPT}${-1}`, [createMenu(bgUuid)]);

    const { service } = createService({
      runtime: {
        getPopupPageScriptMatchingResultByUrl: vi.fn().mockResolvedValue(new Map()),
        isUrlBlacklist: vi.fn().mockReturnValue(false),
      },
    });

    const result = await service.getPopupData({ tabId: 1, url: "https://example.com/" });

    expect(result.scriptList).toHaveLength(0);
    expect(result.backScriptList).toHaveLength(1);
    expect(result.backScriptList[0].uuid).toBe(bgUuid);
  });

  it("isBlacklist 由 runtime.isUrlBlacklist 决定，黑名单 URL 应返回 true", async () => {
    const { service } = createService({
      runtime: {
        getPopupPageScriptMatchingResultByUrl: vi.fn().mockResolvedValue(new Map()),
        isUrlBlacklist: vi.fn().mockReturnValue(true),
      },
    });

    const result = await service.getPopupData({ tabId: 1, url: "https://blocked.com/" });

    expect(result.isBlacklist).toBe(true);
  });

  it("未匹配当前 URL 但仍在运行的脚本，若脚本在 DAO 中已被删除，不应出现在 scriptList", async () => {
    const deletedUuid = "deleted-running";
    // 在运行缓存中有记录（模拟脚本曾经运行），但 DAO 返回 undefined（脚本已被删除）
    await cacheInstance.set(`${CACHE_KEY_TAB_SCRIPT}${1}`, [createMenu(deletedUuid)]);

    const { service } = createService({
      runtime: {
        getPopupPageScriptMatchingResultByUrl: vi.fn().mockResolvedValue(new Map()),
        isUrlBlacklist: vi.fn().mockReturnValue(false),
      },
      scriptDAO: {
        gets: vi.fn().mockResolvedValue([undefined]), // 脚本已删除
      },
    });

    const result = await service.getPopupData({ tabId: 1, url: "https://example.com/" });

    expect(result.scriptList.map((s) => s.uuid)).not.toContain(deletedUuid);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("PopupService dealBackgroundScriptInstall 后台脚本菜单生命周期", () => {
  beforeEach(async () => {
    await cacheInstance.clear();
  });

  // ── installScript ──────────────────────────────────────────────────────────

  it("installScript：已启用的后台脚本（BACKGROUND 类型）应被加入 tabId=-1 缓存", async () => {
    const uuid = "bg-enabled";
    const { service, subscriptions } = createService({
      scriptDAO: {
        get: vi.fn().mockResolvedValue(createScript(uuid, { type: SCRIPT_TYPE_BACKGROUND })),
        gets: vi.fn().mockResolvedValue([]),
      },
    });
    service.dealBackgroundScriptInstall();

    const [handler] = subscriptions.get("installScript") || [];
    await handler!({
      script: {
        uuid,
        type: SCRIPT_TYPE_BACKGROUND,
        status: SCRIPT_STATUS_ENABLE,
        name: `script-${uuid}`,
        namespace: "ns",
      },
      update: false,
    } as TInstallScript);

    const menu = await service.getScriptMenu(-1);
    expect(menu.map((m) => m.uuid)).toContain(uuid);
  });

  it("installScript：普通页面脚本（SCRIPT_TYPE_NORMAL）不应进入后台菜单缓存", async () => {
    const uuid = "normal-install";
    const { service, subscriptions } = createService({
      scriptDAO: {
        get: vi.fn().mockResolvedValue(createScript(uuid, { type: SCRIPT_TYPE_NORMAL })),
        gets: vi.fn().mockResolvedValue([]),
      },
    });
    service.dealBackgroundScriptInstall();

    const [handler] = subscriptions.get("installScript") || [];
    await handler!({
      script: { uuid, type: SCRIPT_TYPE_NORMAL, status: SCRIPT_STATUS_ENABLE, name: `script-${uuid}`, namespace: "ns" },
      update: false,
    } as TInstallScript);

    const menu = await service.getScriptMenu(-1);
    expect(menu).toHaveLength(0);
  });

  it("installScript：禁用状态的后台脚本不应进入后台菜单缓存", async () => {
    const uuid = "bg-disabled";
    const { service, subscriptions } = createService({
      scriptDAO: {
        get: vi
          .fn()
          .mockResolvedValue(createScript(uuid, { type: SCRIPT_TYPE_BACKGROUND, status: SCRIPT_STATUS_DISABLE })),
        gets: vi.fn().mockResolvedValue([]),
      },
    });
    service.dealBackgroundScriptInstall();

    const [handler] = subscriptions.get("installScript") || [];
    await handler!({
      script: {
        uuid,
        type: SCRIPT_TYPE_BACKGROUND,
        status: SCRIPT_STATUS_DISABLE,
        name: `script-${uuid}`,
        namespace: "ns",
      },
      update: false,
    } as TInstallScript);

    const menu = await service.getScriptMenu(-1);
    expect(menu).toHaveLength(0);
  });

  it("installScript：已存在于 -1 缓存的后台脚本不应重复加入", async () => {
    const uuid = "bg-dup";
    await cacheInstance.set(`${CACHE_KEY_TAB_SCRIPT}${-1}`, [createMenu(uuid)]);

    const { service, subscriptions } = createService({
      scriptDAO: {
        get: vi.fn().mockResolvedValue(createScript(uuid, { type: SCRIPT_TYPE_BACKGROUND })),
        gets: vi.fn().mockResolvedValue([]),
      },
    });
    service.dealBackgroundScriptInstall();

    const [handler] = subscriptions.get("installScript") || [];
    await handler!({
      script: {
        uuid,
        type: SCRIPT_TYPE_BACKGROUND,
        status: SCRIPT_STATUS_ENABLE,
        name: `script-${uuid}`,
        namespace: "ns",
      },
      update: false,
    } as TInstallScript);

    const menu = await service.getScriptMenu(-1);
    expect(menu).toHaveLength(1); // 无重复
  });

  // ── enableScripts ──────────────────────────────────────────────────────────

  it("enableScripts：启用后台脚本时应将其加入 tabId=-1 缓存", async () => {
    const uuid = "bg-enable";
    const { service, subscriptions } = createService({
      scriptDAO: {
        get: vi.fn(),
        gets: vi
          .fn()
          .mockResolvedValue([createScript(uuid, { type: SCRIPT_TYPE_BACKGROUND, status: SCRIPT_STATUS_ENABLE })]),
      },
    });
    service.dealBackgroundScriptInstall();

    const handlers = subscriptions.get("enableScripts") || [];
    await handlers[0]!([{ uuid, enable: true }] satisfies TEnableScript[]);
    // enableScripts handler 内部的 cacheInstance.tx 未被 await，需刷新微任务队列。
    await flushAsync();

    const menu = await service.getScriptMenu(-1);
    expect(menu.map((m) => m.uuid)).toContain(uuid);
  });

  it("enableScripts：禁用后台脚本时应将其从 tabId=-1 缓存中移除", async () => {
    const uuid = "bg-disable";
    await cacheInstance.set(`${CACHE_KEY_TAB_SCRIPT}${-1}`, [createMenu(uuid)]);

    const { service, subscriptions } = createService({
      scriptDAO: {
        get: vi.fn(),
        gets: vi
          .fn()
          .mockResolvedValue([createScript(uuid, { type: SCRIPT_TYPE_BACKGROUND, status: SCRIPT_STATUS_DISABLE })]),
      },
    });
    service.dealBackgroundScriptInstall();

    const handlers = subscriptions.get("enableScripts") || [];
    await handlers[0]!([{ uuid, enable: false }] satisfies TEnableScript[]);
    await flushAsync();

    const menu = await service.getScriptMenu(-1);
    expect(menu.map((m) => m.uuid)).not.toContain(uuid);
  });

  // ── scriptRunStatus ────────────────────────────────────────────────────────

  it("scriptRunStatus：脚本开始运行时，应更新 -1 缓存的 runStatus 为 running，runNum 置 1", async () => {
    const uuid = "bg-running";
    await cacheInstance.set(`${CACHE_KEY_TAB_SCRIPT}${-1}`, [
      createMenu(uuid, { runStatus: SCRIPT_RUN_STATUS_COMPLETE, runNum: 0 }),
    ]);

    const { service, subscriptions } = createService();
    service.dealBackgroundScriptInstall();

    const handlers = subscriptions.get("scriptRunStatus") || [];
    handlers[0]!({ uuid, runStatus: SCRIPT_RUN_STATUS_RUNNING } satisfies TScriptRunStatus);
    // scriptRunStatus handler 内的 cacheInstance.tx 未 await，需刷新微任务队列。
    await flushAsync();

    const menu = await service.getScriptMenu(-1);
    expect(menu[0].runStatus).toBe(SCRIPT_RUN_STATUS_RUNNING);
    expect(menu[0].runNum).toBe(1);
  });

  it("scriptRunStatus：脚本执行完毕时，runStatus 更新为 complete，runNum 归零", async () => {
    const uuid = "bg-complete";
    await cacheInstance.set(`${CACHE_KEY_TAB_SCRIPT}${-1}`, [
      createMenu(uuid, { runStatus: SCRIPT_RUN_STATUS_RUNNING, runNum: 1 }),
    ]);

    const { service, subscriptions } = createService();
    service.dealBackgroundScriptInstall();

    const handlers = subscriptions.get("scriptRunStatus") || [];
    handlers[0]!({ uuid, runStatus: SCRIPT_RUN_STATUS_COMPLETE } satisfies TScriptRunStatus);
    await flushAsync();

    const menu = await service.getScriptMenu(-1);
    expect(menu[0].runStatus).toBe(SCRIPT_RUN_STATUS_COMPLETE);
    expect(menu[0].runNum).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("PopupService removeDeletedScriptsFromPendingMenuCommands 待处理命令队列清理", () => {
  it("应过滤掉属于已删除脚本的待处理菜单命令，保留其他脚本的命令", () => {
    const deletedUuid = "uuid-deleted";
    const liveUuid = "uuid-live";
    const { service } = createService();

    service.updateMenuCommands.set(1, [
      { uuid: deletedUuid, key: "k1", name: "n1", options: {}, tabId: 1, registerType: 1 },
      { uuid: liveUuid, key: "k2", name: "n2", options: {}, tabId: 1, registerType: 1 },
    ] as never);

    (service as any).removeDeletedScriptsFromPendingMenuCommands(new Set([deletedUuid]));

    const remaining = service.updateMenuCommands.get(1);
    expect(remaining?.map((c) => c.uuid)).toEqual([liveUuid]);
  });

  it("当一个 tabId 的所有命令都属于已删除脚本时，应从 updateMenuCommands 中完全移除该条目", () => {
    const deletedUuid = "uuid-all-gone";
    const { service } = createService();

    service.updateMenuCommands.set(2, [
      { uuid: deletedUuid, key: "k1", name: "n1", options: {}, tabId: 2, registerType: 1 },
    ] as never);

    (service as any).removeDeletedScriptsFromPendingMenuCommands(new Set([deletedUuid]));

    expect(service.updateMenuCommands.has(2)).toBe(false);
  });

  it("当无命令需要删除时，不应替换 updateMenuCommands 中的数组引用（保持原对象不变）", () => {
    const liveUuid = "uuid-unchanged";
    const { service } = createService();
    const originalCommands = [
      { uuid: liveUuid, key: "k1", name: "n1", options: {}, tabId: 3, registerType: 1 },
    ] as never[];
    service.updateMenuCommands.set(3, originalCommands);

    (service as any).removeDeletedScriptsFromPendingMenuCommands(new Set(["uuid-not-in-list"]));

    // 数组引用不变，说明没有进行无谓的替换
    expect(service.updateMenuCommands.get(3)).toBe(originalCommands);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("PopupService removeDeletedScriptsFromPopupCaches 缓存清理边界情况", () => {
  beforeEach(async () => {
    await cacheInstance.clear();
  });

  it("uuids 为空数组时直接返回 false，不执行任何 cache 扫描", async () => {
    const { service } = createService();

    const result = await (service as any).removeDeletedScriptsFromPopupCaches([]);

    expect(result).toBe(false);
  });

  it("缓存中没有目标 uuid 时返回 false，不修改任何缓存", async () => {
    const { service } = createService();
    await cacheInstance.set(`${CACHE_KEY_TAB_SCRIPT}${1}`, [createMenu("other-uuid")]);

    const result = await (service as any).removeDeletedScriptsFromPopupCaches(["uuid-not-present"]);

    expect(result).toBe(false);
    // 原缓存内容不受影响
    await expect(service.getScriptMenu(1)).resolves.toHaveLength(1);
  });

  it("清理后缓存条目为空时应删除该 cache key（调用 tx.del），getScriptMenu 返回空数组", async () => {
    const uuid = "sole-entry";
    await cacheInstance.set(`${CACHE_KEY_TAB_SCRIPT}${5}`, [createMenu(uuid)]);

    const { service } = createService();
    const result = await (service as any).removeDeletedScriptsFromPopupCaches([uuid]);

    expect(result).toBe(true);
    await expect(service.getScriptMenu(5)).resolves.toEqual([]);
  });

  it("清理后缓存仍有剩余项时应更新缓存（调用 tx.set），保留未删除的脚本", async () => {
    const deletedUuid = "to-delete";
    const keepUuid = "to-keep";
    await cacheInstance.set(`${CACHE_KEY_TAB_SCRIPT}${6}`, [createMenu(deletedUuid), createMenu(keepUuid)]);

    const { service } = createService();
    const result = await (service as any).removeDeletedScriptsFromPopupCaches([deletedUuid]);

    expect(result).toBe(true);
    const menu = await service.getScriptMenu(6);
    expect(menu.map((m) => m.uuid)).toEqual([keepUuid]);
  });

  it("应同时扫描多个标签页的缓存，每个含目标 uuid 的 tab 都会被清理", async () => {
    const deletedUuid = "multi-tab-deleted";
    const keepUuid = "survivor";
    await cacheInstance.set(`${CACHE_KEY_TAB_SCRIPT}${10}`, [createMenu(deletedUuid), createMenu(keepUuid)]);
    await cacheInstance.set(`${CACHE_KEY_TAB_SCRIPT}${11}`, [createMenu(deletedUuid)]);
    await cacheInstance.set(`${CACHE_KEY_TAB_SCRIPT}${-1}`, [createMenu(deletedUuid)]);

    const { service } = createService();
    const result = await (service as any).removeDeletedScriptsFromPopupCaches([deletedUuid]);

    expect(result).toBe(true);
    await expect(service.getScriptMenu(10)).resolves.toHaveLength(1);
    await expect(service.getScriptMenu(11)).resolves.toHaveLength(0);
    await expect(service.getScriptMenu(-1)).resolves.toHaveLength(0);
  });
});
