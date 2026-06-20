import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { cleanup, screen, fireEvent } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { renderWithTooltip } from "@Tests/renderWithTooltip";
import type { ImportView } from "./components";
import { MobileView } from "./mobile";
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
  return { id: "s1", url: "https://example.com/a.sub.js", name: "示例订阅", op: "add", importable: true, ...p };
}

function mkView(p: Partial<ImportView> = {}): ImportView {
  return {
    phase: "ready",
    filename: "backup.zip",
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

const renderMobile = (p: Partial<ImportView>) => renderWithTooltip(<MobileView view={mkView(p)} />);

beforeAll(() => initTestLanguage("zh-CN"));
afterEach(cleanup);

describe("导入移动视图", () => {
  it("渲染脚本卡:名称、新增徽章、版本、启用开关", () => {
    renderMobile({ scripts: [mkScriptItem({ op: "add", newVersion: "3.2.1" })] });
    expect(screen.getByTestId("import-script-card")).toHaveAttribute("data-slot", "surface");
    expect(screen.getByText("示例脚本")).toBeTruthy();
    expect(screen.getByText("新增")).toBeTruthy();
    expect(screen.getByText("v3.2.1")).toBeTruthy();
    expect(screen.getByTestId("enable-switch-u1")).toBeTruthy();
  });

  it("解析失败卡显示损坏提示且无启用开关", () => {
    renderMobile({ scripts: [mkScriptItem({ id: "e1", op: "error", importable: false, enabled: false })] });
    expect(screen.getByText("文件损坏，无法导入")).toBeTruthy();
    expect(screen.queryByTestId("enable-switch-e1")).toBeNull();
  });

  it("有订阅时渲染订阅分区", () => {
    renderMobile({ scripts: [mkScriptItem()], subscribes: [mkSubItem({ name: "我的订阅" })] });
    expect(screen.getByTestId("subscribe-section")).toBeTruthy();
    expect(screen.getByTestId("import-subscribe-card")).toHaveAttribute("data-slot", "surface");
    expect(screen.getByText("我的订阅")).toBeTruthy();
  });

  it("点击导入按钮触发 onImport", () => {
    const onImport = vi.fn();
    renderMobile({ scripts: [mkScriptItem()], selectedScripts: new Set(["u1"]), onImport });
    fireEvent.click(screen.getByTestId("import-btn"));
    expect(onImport).toHaveBeenCalledTimes(1);
  });

  it("importing 阶段显示顶部进度条且行内状态取代复选框", () => {
    renderMobile({
      phase: "importing",
      scripts: [mkScriptItem({ id: "u1" })],
      selectedScripts: new Set(["u1"]),
      importStatus: { u1: "done" },
      doneCount: 1,
      totalCount: 1,
    });
    expect(screen.getByRole("progressbar")).toBeTruthy();
    expect(screen.getByTestId("status-done-u1")).toBeTruthy();
    expect(screen.queryByTestId("script-checkbox-u1")).toBeNull();
  });

  it("done 阶段显示完成屏", () => {
    renderMobile({ phase: "done", summary: { scripts: 2, subscribes: 0, values: 0 } });
    expect(screen.getByTestId("import-complete")).toBeTruthy();
  });

  it("empty 阶段显示空备份屏", () => {
    renderMobile({ phase: "empty" });
    expect(screen.getByTestId("import-empty")).toBeTruthy();
  });
});
