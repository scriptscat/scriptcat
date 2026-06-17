import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { initLanguage } from "@App/locales/locales";
import { TooltipProvider } from "@App/pages/components/ui/tooltip";
import { DesktopView } from "./components";
import type { BatchUpdateViewProps } from "./components";
import { MobileView } from "./mobile";
import type { UpdateItem } from "./logic";

function mkItem(p: Partial<UpdateItem> = {}): UpdateItem {
  return {
    uuid: "u1",
    name: "示例脚本",
    enabled: true,
    oldVersion: "1.0.0",
    newVersion: "1.1.0",
    similarity: 0.9,
    risk: "noticeable",
    withNewConnect: false,
    newConnects: [],
    source: "example.com",
    iconUrl: "",
    ignored: false,
    ...p,
  };
}

function mkView(p: Partial<BatchUpdateViewProps> = {}): BatchUpdateViewProps {
  return {
    updates: [],
    ignored: [],
    totalChecked: 0,
    checktime: 0,
    checking: false,
    loading: false,
    selected: new Set(),
    autoClose: null,
    onToggle: () => {},
    onToggleAll: () => {},
    onUpdate: () => {},
    onIgnore: () => {},
    onRestore: () => {},
    onUpdateSelected: () => {},
    onIgnoreSelected: () => {},
    onRestoreAll: () => {},
    onCheckNow: () => {},
    onOpen: () => {},
    ...p,
  };
}

const renderDesktop = (p: Partial<BatchUpdateViewProps>) =>
  render(
    <TooltipProvider>
      <DesktopView view={mkView(p)} />
    </TooltipProvider>
  );

const renderMobile = (p: Partial<BatchUpdateViewProps>) =>
  render(
    <TooltipProvider>
      <MobileView view={mkView(p)} />
    </TooltipProvider>
  );

beforeEach(() => initLanguage("zh-CN"));
afterEach(cleanup);

describe("批量更新桌面视图 检查中反馈", () => {
  it("检查中时显示顶部进度条", () => {
    renderDesktop({ checking: true });
    expect(screen.getByRole("progressbar")).toBeTruthy();
  });

  it("未检查时不显示顶部进度条", () => {
    renderDesktop({ checking: false });
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("列表为空且检查中时显示骨架而非空状态", () => {
    renderDesktop({ checking: true, updates: [], ignored: [] });
    expect(screen.getByTestId("update-skeleton")).toBeTruthy();
    expect(screen.queryByTestId("update-empty")).toBeNull();
  });

  it("列表为空且未检查时显示空状态", () => {
    renderDesktop({ checking: false, updates: [], ignored: [] });
    expect(screen.getByTestId("update-empty")).toBeTruthy();
    expect(screen.queryByTestId("update-skeleton")).toBeNull();
  });

  it("已有结果且检查中时保留列表不被骨架替换", () => {
    renderDesktop({ checking: true, updates: [mkItem({ name: "保留的脚本" })] });
    expect(screen.getByText("保留的脚本")).toBeTruthy();
    expect(screen.queryByTestId("update-skeleton")).toBeNull();
  });
});

describe("批量更新移动视图 检查中反馈", () => {
  it("检查中时显示顶部进度条", () => {
    renderMobile({ checking: true });
    expect(screen.getByRole("progressbar")).toBeTruthy();
  });

  it("列表为空且检查中时显示骨架而非空状态", () => {
    renderMobile({ checking: true, updates: [], ignored: [] });
    expect(screen.getByTestId("update-skeleton")).toBeTruthy();
    expect(screen.queryByTestId("update-empty")).toBeNull();
  });
});
