import { initTestEnv } from "@Tests/utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cacheInstance } from "@App/app/cache";
import { CACHE_KEY_TAB_SCRIPT } from "@App/app/cache_key";
import { PopupService } from "./popup";
import type { ScriptMenu } from "./types";
import type { RuntimeService } from "./runtime";
import { SCRIPT_STATUS_ENABLE, SCRIPT_TYPE_NORMAL, type Script, type ScriptDAO } from "@App/app/repo/scripts";
import type { IMessageQueue } from "@Packages/message/message_queue";
import type { Group } from "@Packages/message/server";
import type { SystemConfig } from "@App/pkg/config/config";
import type { TDeleteScript } from "../queue";

initTestEnv();

describe("PopupService stale script menu cleanup", () => {
  const createMenu = (uuid: string): ScriptMenu => ({
    uuid,
    name: `script-${uuid}`,
    storageName: `script-${uuid}`,
    enable: true,
    updatetime: 1,
    hasUserConfig: false,
    runStatus: "running",
    runNum: 1,
    runNumByIframe: 0,
    menus: [],
    isEffective: true,
  });

  const createScript = (uuid: string): Script => ({
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
  });

  const createService = (overrides: { runtime?: Partial<RuntimeService>; scriptDAO?: Partial<ScriptDAO> } = {}) => {
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

  beforeEach(async () => {
    await cacheInstance.clear();
  });

  it("filters deleted scripts from stale tabScript run records when reading Popup data", async () => {
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

  it("ignores late menu register commands for deleted scripts", async () => {
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
      1
    );

    await expect(service.getScriptMenu(1)).resolves.toEqual([]);
    expect(scriptDAO.gets).toHaveBeenCalledWith([deletedUuid]);
  });

  it("removes deleted scripts from all Popup menu caches and pending menu commands", async () => {
    const deletedUuid = "deleted-script";
    const liveUuid = "live-script";
    await cacheInstance.set(`${CACHE_KEY_TAB_SCRIPT}${1}`, [createMenu(deletedUuid), createMenu(liveUuid)]);
    await cacheInstance.set(`${CACHE_KEY_TAB_SCRIPT}${2}`, [createMenu(deletedUuid)]);
    await cacheInstance.set(`${CACHE_KEY_TAB_SCRIPT}${-1}`, [createMenu(deletedUuid)]);

    const { service, subscriptions } = createService();
    service.updateMenuCommands.set(1, [
      {
        uuid: deletedUuid,
        key: "deleted-menu",
        name: "Deleted menu",
        options: {},
        tabId: 1,
        registerType: 1,
      },
      {
        uuid: liveUuid,
        key: "live-menu",
        name: "Live menu",
        options: {},
        tabId: 1,
        registerType: 1,
      },
    ] as never);
    service.updateMenuCommands.set(2, [
      {
        uuid: deletedUuid,
        key: "deleted-menu",
        name: "Deleted menu",
        options: {},
        tabId: 2,
        registerType: 1,
      },
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
