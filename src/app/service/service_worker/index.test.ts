import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { initTestLanguage } from "@Tests/initTestLanguage";
import type { ExternalAccessWriteNotice } from "./external_access/bridge";
import type * as ServiceWorkerUtils from "./utils";

// db 在模块顶层实例化 Dexie，而 Dexie 的 propagate-locally 会在 vmThreads 环境下裸调 addEventListener 而抛错，
// 因此本文件只在测试环境替换掉这个 DAO（同 log.test.ts）。
vi.mock("@App/app/repo/logger", () => ({ LoggerDAO: class {} }));

vi.mock("./utils", async (importOriginal) => {
  const actual = await importOriginal<typeof ServiceWorkerUtils>();
  return { ...actual, InfoNotification: vi.fn() };
});

import { notifyExternalAccessWrite, openChangelogAndNotify } from "./index";
import { InfoNotification } from "./utils";
import type RuntimeLogger from "@App/app/logger/logger";

describe("外部接入「直接允许」写策略下的系统通知", () => {
  beforeAll(() => initTestLanguage("zh-CN"));

  const bodyOf = (notice: ExternalAccessWriteNotice): string => {
    vi.mocked(InfoNotification).mockClear();
    notifyExternalAccessWrite(notice);
    return vi.mocked(InfoNotification).mock.calls[0][1];
  };

  it("kind=update（外部客户端编辑了脚本源码）应说明脚本被编辑", () => {
    expect(bodyOf({ kind: "update", name: "签到助手" })).toBe("已编辑脚本「签到助手」");
  });

  it("没有专属文案的写操作仍落到泛化文案", () => {
    expect(bodyOf({ kind: "source_disclosure", name: "签到助手" })).toBe("已对「签到助手」执行变更");
  });
});

describe("扩展更新后的更新日志页面与系统通知", () => {
  const url = "https://docs.scriptcat.org/docs/change/#1.5.0";
  const makeLogger = () => ({ error: vi.fn() }) as unknown as RuntimeLogger;

  beforeAll(() => initTestLanguage("zh-CN"));
  beforeEach(() => vi.mocked(InfoNotification).mockClear());

  // #1769：通知必须带上自动打开的标签页，点击时才能激活它而不是再开一个同样的页面
  it("自动打开更新日志时，通知应记录该标签页", async () => {
    let created: chrome.tabs.CreateProperties | undefined;
    const onCreate = (props: chrome.tabs.CreateProperties) => {
      created = props;
    };
    (chrome.tabs as any).hook.on("create", onCreate);
    try {
      await openChangelogAndNotify(url, true, makeLogger());
    } finally {
      (chrome.tabs as any).hook.removeListener("create", onCreate);
    }

    expect(created?.url).toBe(url);
    // chrome-extension-mock 的 tabs.create 固定回传 id 为 1 的标签
    expect(vi.mocked(InfoNotification).mock.calls[0][2]).toEqual({ url, tabId: 1 });
  });

  it("不自动打开更新日志时，只发通知且不记录标签页", async () => {
    const onCreate = vi.fn();
    (chrome.tabs as any).hook.on("create", onCreate);
    try {
      await openChangelogAndNotify(url, false, makeLogger());
    } finally {
      (chrome.tabs as any).hook.removeListener("create", onCreate);
    }

    expect(onCreate).not.toHaveBeenCalled();
    expect(vi.mocked(InfoNotification).mock.calls[0][2]).toEqual({ url, tabId: undefined });
  });

  it("打开更新日志失败时仍应发出通知，点击后再新开页面", async () => {
    const originalChrome = globalThis.chrome;
    const error = new Error("tabs.create failed");
    vi.stubGlobal("chrome", {
      ...originalChrome,
      tabs: { ...originalChrome.tabs, create: vi.fn().mockRejectedValue(error) },
    });
    const logger = makeLogger();
    try {
      await openChangelogAndNotify(url, true, logger);
    } finally {
      vi.stubGlobal("chrome", originalChrome);
    }

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(vi.mocked(InfoNotification).mock.calls[0][2]).toEqual({ url, tabId: undefined });
  });
});
