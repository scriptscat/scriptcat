import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import { initLanguage } from "@App/locales/locales";
import { TooltipProvider } from "@App/pages/components/ui/tooltip";
import { DesktopView, type ImportView } from "./components";
import type { ScriptImportItem, SubscribeImportItem } from "./logic";

function mkScriptItem(p: Partial<ScriptImportItem> = {}): ScriptImportItem {
  return {
    id: "u1",
    uuid: "u1",
    name: "示例脚本",
    author: "CodFrm",
    iconUrl: "",
    op: "add",
    oldVersion: "",
    newVersion: "1.2.0",
    source: { kind: "url", host: "example.com", full: "https://example.com/a.user.js" },
    valueCount: 0,
    hasResources: false,
    enabled: true,
    importable: true,
    ...p,
  };
}

function mkSubItem(p: Partial<SubscribeImportItem> = {}): SubscribeImportItem {
  return {
    id: "s1",
    url: "https://example.com/a.sub.js",
    name: "示例订阅",
    op: "add",
    importable: true,
    ...p,
  };
}

function mkView(p: Partial<ImportView> = {}): ImportView {
  return {
    phase: "ready",
    filename: "backup-20260617.zip",
    errorMessage: "",
    scripts: [],
    subscribes: [],
    selectedScripts: new Set(),
    selectedSubscribes: new Set(),
    importStatus: {},
    doneCount: 0,
    totalCount: 0,
    summary: { scripts: 0, subscribes: 0, values: 0 },
    onToggleScript: () => {},
    onToggleAllScripts: () => {},
    onToggleSubscribe: () => {},
    onToggleAllSubscribes: () => {},
    onSetEnabled: () => {},
    onImport: () => {},
    onCancel: () => {},
    onClose: () => {},
    onRetry: () => {},
    onOpenScriptList: () => {},
    ...p,
  };
}

const renderDesktop = (p: Partial<ImportView>) =>
  render(
    <TooltipProvider>
      <DesktopView view={mkView(p)} />
    </TooltipProvider>
  );

beforeEach(() => initLanguage("zh-CN"));
afterEach(cleanup);

describe("导入桌面视图 脚本表格", () => {
  it("新增脚本显示「新增」徽章与单版本", () => {
    renderDesktop({ scripts: [mkScriptItem({ op: "add", newVersion: "3.2.1" })] });
    expect(screen.getByText("示例脚本")).toBeTruthy();
    expect(screen.getByText("新增")).toBeTruthy();
    expect(screen.getByText("v3.2.1")).toBeTruthy();
  });

  it("更新脚本显示「更新」徽章与旧→新版本", () => {
    renderDesktop({ scripts: [mkScriptItem({ op: "update", oldVersion: "1.0.0", newVersion: "2.0.0" })] });
    expect(screen.getByText("更新")).toBeTruthy();
    expect(screen.getByText("v1.0.0")).toBeTruthy();
    expect(screen.getByText("v2.0.0")).toBeTruthy();
  });

  it("解析失败脚本显示「解析失败」徽章、复选框禁用、无启用开关", () => {
    renderDesktop({
      scripts: [mkScriptItem({ id: "e1", op: "error", importable: false, enabled: false, error: "boom" })],
    });
    expect(screen.getByText("解析失败")).toBeTruthy();
    expect(screen.queryByTestId("enable-switch-e1")).toBeNull();
    const cb = screen.getByTestId("script-checkbox-e1") as HTMLButtonElement;
    expect(cb.getAttribute("disabled") !== null || cb.getAttribute("data-disabled") !== null).toBe(true);
  });

  it("含 values 的脚本数据列显示条数", () => {
    renderDesktop({ scripts: [mkScriptItem({ valueCount: 3 })] });
    expect(screen.getByText("3 项")).toBeTruthy();
  });

  it("本地创建脚本来源显示「本地创建」", () => {
    renderDesktop({ scripts: [mkScriptItem({ source: { kind: "local" } })] });
    expect(screen.getByText("本地创建")).toBeTruthy();
  });
});

describe("导入桌面视图 订阅分区", () => {
  it("无订阅时不渲染订阅分区", () => {
    renderDesktop({ scripts: [mkScriptItem()] });
    expect(screen.queryByTestId("subscribe-section")).toBeNull();
  });

  it("有订阅时渲染订阅分区与订阅行", () => {
    renderDesktop({ scripts: [mkScriptItem()], subscribes: [mkSubItem({ name: "我的订阅" })] });
    expect(screen.getByTestId("subscribe-section")).toBeTruthy();
    expect(screen.getByText("我的订阅")).toBeTruthy();
  });
});

describe("导入桌面视图 交互", () => {
  it("点击导入按钮触发 onImport", () => {
    const onImport = vi.fn();
    renderDesktop({ scripts: [mkScriptItem()], selectedScripts: new Set(["u1"]), onImport });
    fireEvent.click(screen.getByTestId("import-btn"));
    expect(onImport).toHaveBeenCalledTimes(1);
  });

  it("无勾选项时导入按钮禁用", () => {
    renderDesktop({ scripts: [mkScriptItem()], selectedScripts: new Set() });
    expect((screen.getByTestId("import-btn") as HTMLButtonElement).disabled).toBe(true);
  });

  it("点击全选触发 onToggleAllScripts", () => {
    const onToggleAllScripts = vi.fn();
    renderDesktop({ scripts: [mkScriptItem()], onToggleAllScripts });
    fireEvent.click(screen.getByTestId("toggle-all-scripts"));
    expect(onToggleAllScripts).toHaveBeenCalledTimes(1);
  });

  it("点击行复选框触发 onToggleScript", () => {
    const onToggleScript = vi.fn();
    renderDesktop({ scripts: [mkScriptItem({ id: "u9", uuid: "u9" })], onToggleScript });
    fireEvent.click(screen.getByTestId("script-checkbox-u9"));
    expect(onToggleScript).toHaveBeenCalledWith("u9");
  });

  it("切换启用开关触发 onSetEnabled", () => {
    const onSetEnabled = vi.fn();
    renderDesktop({ scripts: [mkScriptItem({ id: "u1", enabled: true })], onSetEnabled });
    fireEvent.click(screen.getByTestId("enable-switch-u1"));
    expect(onSetEnabled).toHaveBeenCalledWith("u1", false);
  });
});

describe("导入桌面视图 状态屏", () => {
  it("loading 阶段显示解析中标题", () => {
    renderDesktop({ phase: "loading" });
    expect(screen.getByTestId("import-loading")).toBeTruthy();
    expect(screen.getByText("正在解析备份文件")).toBeTruthy();
  });

  it("error 阶段显示错误标题与信息,点击重试触发 onRetry", () => {
    const onRetry = vi.fn();
    renderDesktop({ phase: "error", errorMessage: "Error: failed to parse zip", onRetry });
    expect(screen.getByTestId("import-error")).toBeTruthy();
    expect(screen.getByText("Error: failed to parse zip")).toBeTruthy();
    fireEvent.click(screen.getByTestId("retry-btn"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("invalid 阶段显示错误屏且无重试按钮", () => {
    renderDesktop({ phase: "invalid" });
    expect(screen.getByTestId("import-error")).toBeTruthy();
    expect(screen.queryByTestId("retry-btn")).toBeNull();
  });

  it("empty 阶段显示空备份屏", () => {
    renderDesktop({ phase: "empty" });
    expect(screen.getByTestId("import-empty")).toBeTruthy();
  });

  it("importing 阶段显示顶部进度条与 N/M 进度,行内状态取代复选框", () => {
    renderDesktop({
      phase: "importing",
      scripts: [mkScriptItem({ id: "u1" })],
      selectedScripts: new Set(["u1"]),
      importStatus: { u1: "done" },
      doneCount: 1,
      totalCount: 2,
    });
    expect(screen.getByRole("progressbar")).toBeTruthy();
    expect(screen.getByTestId("status-done-u1")).toBeTruthy();
    expect(screen.queryByTestId("script-checkbox-u1")).toBeNull();
  });

  it("done 阶段显示完成屏与统计,点击查看脚本列表触发 onOpenScriptList", () => {
    const onOpenScriptList = vi.fn();
    renderDesktop({
      phase: "done",
      summary: { scripts: 4, subscribes: 1, values: 12 },
      onOpenScriptList,
    });
    const complete = screen.getByTestId("import-complete");
    expect(within(complete).getByText("导入完成")).toBeTruthy();
    fireEvent.click(screen.getByTestId("view-scripts-btn"));
    expect(onOpenScriptList).toHaveBeenCalledTimes(1);
  });
});
