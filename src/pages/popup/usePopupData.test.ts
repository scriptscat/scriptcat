// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// 仅替换 openInCurrentTab / getCurrentTab，其余实导出保留（getCurrentTab 置空以避免触及 chrome.tabs）
vi.mock("@App/pkg/utils/utils", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, openInCurrentTab: vi.fn(async () => undefined), getCurrentTab: vi.fn(async () => undefined) };
});

import { openInCurrentTab } from "@App/pkg/utils/utils";
import { getMoreScriptUrl, usePopupData } from "./usePopupData";

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
});
