import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { notify } from "@App/pages/components/ui/toast";
import { t } from "@App/locales/locales";
import { initTestLanguage } from "@Tests/initTestLanguage";

const popupInitialData = vi.hoisted(() => ({
  tabId: 7,
  url: "https://example.com/page",
  isEnableScript: true,
  checkUpdate: { notice: "", version: "1.0.0", isRead: false },
  menuExpandNum: 5,
  scriptListExpandNum: 5,
  popupCompactLayout: false,
  popupSiteScopeActions: false,
  defaultScriptProvider: "scriptcat" as const,
  isBlacklist: false,
  scriptList: [
    {
      uuid: "script-1",
      name: "Preloaded script",
      enable: true,
      menus: [],
      runNum: 0,
      updatetime: 0,
    },
  ],
  backScriptList: [] as unknown[],
}));

vi.mock("./preload", () => ({
  usePopupDataQuery: () => ({ data: popupInitialData, isError: false }),
}));

// 仅替换 openInCurrentTab / getCurrentTab，其余实导出保留（getCurrentTab 置空以避免触及 chrome.tabs）
vi.mock("@App/pkg/utils/utils", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, openInCurrentTab: vi.fn(async () => undefined), getCurrentTab: vi.fn(async () => undefined) };
});

// toast 反馈打桩：仅验证「成功才调用 notify.success」的反馈逻辑
const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  loading: vi.fn(),
  promise: vi.fn(),
  dismiss: vi.fn(),
}));

vi.mock("@App/pages/components/ui/toast", () => ({ notify: toastMocks }));

// 站点范围快捷操作走真实 ScriptClient 实例，仅替换 onlyRunOnUrl，其余实导出与方法保留
const mockOnlyRunOnUrl = vi.hoisted(() => vi.fn(async () => true));

vi.mock("../store/features/script", async (importOriginal) => {
  const actual = await importOriginal<typeof ScriptStore>();
  return {
    ...actual,
    scriptClient: Object.assign(Object.create(actual.scriptClient), { onlyRunOnUrl: mockOnlyRunOnUrl }),
  };
});

import { openInCurrentTab } from "@App/pkg/utils/utils";
import { getMoreScriptUrl, usePopupData } from "./usePopupData";
import type * as ScriptStore from "../store/features/script";

// usePopupData 内部使用 useTranslation()，需先初始化 i18n 才能正确渲染与取本地化文案
beforeAll(() => initTestLanguage("zh-CN"));

describe("getMoreScriptUrl 获取更多脚本链接", () => {
  it("ScriptCat：有 host 时带 domain 参数", () => {
    expect(getMoreScriptUrl("https://www.bilibili.com/video/1", "scriptcat")).toBe(
      "https://scriptcat.org/search?domain=www.bilibili.com"
    );
  });

  it("ScriptCat：无 host 时回退到搜索首页", () => {
    expect(getMoreScriptUrl("", "scriptcat")).toBe("https://scriptcat.org/search");
  });

  it("GreasyFork：去掉子域名只保留主域名", () => {
    expect(getMoreScriptUrl("https://www.google.com/", "greasyfork")).toBe(
      "https://greasyfork.org/scripts/by-site/google.com"
    );
  });

  it("GreasyFork：非 http 页面（无 host）回退到脚本列表页", () => {
    expect(getMoreScriptUrl("chrome://extensions", "greasyfork")).toBe("https://greasyfork.org/scripts/");
  });

  it("OpenUserJS：有 host 时带查询参数", () => {
    expect(getMoreScriptUrl("https://example.com", "openuserjs")).toBe("https://openuserjs.org/?q=example.com");
  });

  it("OpenUserJS：无 host 时回退到首页", () => {
    expect(getMoreScriptUrl("about:blank", "openuserjs")).toBe("https://openuserjs.org/");
  });
});

describe("usePopupData 打开编辑器/用户配置", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "close").mockImplementation(() => {});
  });

  it("handleOpenEditor 应经由 openInCurrentTab 打开（兼容 Edge Android #686）", async () => {
    const { result } = renderHook(() => usePopupData());
    await act(async () => {
      await result.current.handleOpenEditor("uuid-1");
    });
    expect(openInCurrentTab).toHaveBeenCalledWith("/src/options.html#/script/editor/uuid-1");
  });

  it("handleOpenUserConfig 应经由 openInCurrentTab 打开（兼容 Edge Android #686）", async () => {
    const { result } = renderHook(() => usePopupData());
    await act(async () => {
      await result.current.handleOpenUserConfig("uuid-2");
    });
    expect(openInCurrentTab).toHaveBeenCalledWith("/src/options.html#/?userConfig=uuid-2");
  });

  it("handleOpenScriptSettings 应直达该脚本的设置页", async () => {
    const { result } = renderHook(() => usePopupData());
    await act(async () => {
      await result.current.handleOpenScriptSettings("uuid-3");
    });
    expect(openInCurrentTab).toHaveBeenCalledWith("/src/options.html#/script/editor/uuid-3?view=setting");
  });
});

describe("usePopupData 预加载数据", () => {
  it("应在首次渲染直接使用 preloadable-query 的快照", () => {
    const { result } = renderHook(() => usePopupData());

    expect(result.current.loading).toBe(false);
    expect(result.current.currentUrl).toBe("https://example.com/page");
    expect(result.current.fullScriptCount).toBe(1);
    expect(result.current.scriptList[0]?.name).toBe("Preloaded script");
  });
});

describe("usePopupData 脚本列表展开数量", () => {
  const snapshot = { scriptList: popupInitialData.scriptList, backScriptList: [], scriptListExpandNum: 5 };

  const makeScripts = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      uuid: `script-${i}`,
      name: `Script ${i}`,
      enable: true,
      menus: [],
      runNum: 0,
      updatetime: 0,
    }));

  afterEach(() => {
    Object.assign(popupInitialData, snapshot);
  });

  it("默认只展开 5 条，其余折叠为「显示更多」", () => {
    Object.assign(popupInitialData, { scriptList: makeScripts(8), scriptListExpandNum: 5 });

    const { result } = renderHook(() => usePopupData());

    expect(result.current.scriptList).toHaveLength(5);
    expect(result.current.canExpandCurrent).toBe(true);
    expect(result.current.remainingCurrentCount).toBe(3);
  });

  it("调大展开数量后应按设置展开而不是恒为 5", () => {
    Object.assign(popupInitialData, { scriptList: makeScripts(8), scriptListExpandNum: 21 });

    const { result } = renderHook(() => usePopupData());

    expect(result.current.scriptList).toHaveLength(8);
    expect(result.current.canExpandCurrent).toBe(false);
  });

  it("设为 0 表示不折叠，全部脚本直接显示", () => {
    Object.assign(popupInitialData, { scriptList: makeScripts(30), scriptListExpandNum: 0 });

    const { result } = renderHook(() => usePopupData());

    expect(result.current.scriptList).toHaveLength(30);
    expect(result.current.canExpandCurrent).toBe(false);
    expect(result.current.remainingCurrentCount).toBe(0);
    // 列表全展开时脚本可能很多，搜索框必须仍然可用
    expect(result.current.showSearch).toBe(true);
  });

  it("后台脚本分组同样按该设置截断", () => {
    Object.assign(popupInitialData, {
      scriptList: [],
      backScriptList: makeScripts(9),
      scriptListExpandNum: 7,
    });

    const { result } = renderHook(() => usePopupData());

    expect(result.current.backScriptList).toHaveLength(7);
    expect(result.current.canExpandBack).toBe(true);
    expect(result.current.remainingBackCount).toBe(2);
  });

  it("搜索框跟随该设置：脚本总数未超过展开数量时不显示", () => {
    Object.assign(popupInitialData, { scriptList: makeScripts(8), scriptListExpandNum: 10 });

    const { result } = renderHook(() => usePopupData());

    expect(result.current.showSearch).toBe(false);
  });

  it("搜索框跟随该设置：脚本总数超过展开数量时显示", () => {
    Object.assign(popupInitialData, { scriptList: makeScripts(11), scriptListExpandNum: 10 });

    const { result } = renderHook(() => usePopupData());

    expect(result.current.showSearch).toBe(true);
  });
});

describe("usePopupData 站点范围快捷操作", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnlyRunOnUrl.mockResolvedValue(true);
  });

  it("仅在 xxx 执行：成功后乐观更新本地列表并弹出成功提示", async () => {
    const { result } = renderHook(() => usePopupData());
    await act(async () => {
      await result.current.handleOnlyRunOnUrl("script-1");
    });

    expect(mockOnlyRunOnUrl).toHaveBeenCalledWith("script-1", "*://example.com/*");
    expect(result.current.scriptList[0]?.isEffective).toBe(true);
    expect(notify.success).toHaveBeenCalledTimes(1);
    expect(notify.success).toHaveBeenCalledWith(t("update_success"));
  });

  it("仅在 xxx 执行：失败时不弹成功提示，并记录错误信息", async () => {
    mockOnlyRunOnUrl.mockRejectedValue(new Error("mock failure"));
    const { result } = renderHook(() => usePopupData());
    await act(async () => {
      await result.current.handleOnlyRunOnUrl("script-1");
    });

    expect(notify.success).not.toHaveBeenCalled();
    expect(result.current.errorMessage).toBe("Error: mock failure");
  });
});
