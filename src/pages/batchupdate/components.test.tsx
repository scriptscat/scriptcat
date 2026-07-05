import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { cleanup, screen, within, fireEvent } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { renderWithTooltip } from "@Tests/renderWithTooltip";
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
    siteMatch: false,
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

const renderDesktop = (p: Partial<BatchUpdateViewProps>) => renderWithTooltip(<DesktopView view={mkView(p)} />);

const renderMobile = (p: Partial<BatchUpdateViewProps>) => renderWithTooltip(<MobileView view={mkView(p)} />);

beforeAll(() => initTestLanguage("zh-CN"));
afterEach(cleanup);

describe("批量更新桌面视图 检查中反馈", () => {
  it("检查中时显示顶部进度条", () => {
    renderDesktop({ checking: true });
    expect(document.querySelector('[role="progressbar"]')).toBeTruthy();
  });

  it("未检查时不显示顶部进度条", () => {
    renderDesktop({ checking: false });
    expect(document.querySelector('[role="progressbar"]')).toBeNull();
  });

  it("列表为空且检查中时显示骨架而非空状态", () => {
    renderDesktop({ checking: true, updates: [], ignored: [] });
    expect(screen.getByTestId("update-skeleton")).toHaveAttribute("data-slot", "data-panel");
    expect(screen.queryByTestId("update-empty")).toBeNull();
  });

  it("列表为空且未检查时显示空状态", () => {
    renderDesktop({ checking: false, updates: [], ignored: [] });
    expect(screen.getByTestId("update-empty")).toBeTruthy();
    expect(screen.queryByTestId("update-skeleton")).toBeNull();
  });

  it("已有结果且检查中时保留列表不被骨架替换", () => {
    const { container } = renderDesktop({ checking: true, updates: [mkItem({ name: "保留的脚本" })] });
    expect(container.querySelector('[data-slot="data-panel"]')).toBeInTheDocument();
    expect(screen.getByText("保留的脚本")).toBeTruthy();
    expect(screen.queryByTestId("update-skeleton")).toBeNull();
  });
});

describe("批量更新移动视图 检查中反馈", () => {
  it("检查中时显示顶部进度条", () => {
    renderMobile({ checking: true });
    expect(document.querySelector('[role="progressbar"]')).toBeTruthy();
  });

  it("列表为空且检查中时显示骨架而非空状态", () => {
    renderMobile({ checking: true, updates: [], ignored: [] });
    expect(screen.getByTestId("update-skeleton")).toBeTruthy();
    expect(screen.queryByTestId("update-empty")).toBeNull();
  });

  it("待更新移动卡片复用 Surface 承载面", () => {
    renderMobile({ updates: [mkItem({ name: "移动脚本" })] });
    const card = screen.getByTestId("update-card");
    expect(card).toHaveAttribute("data-slot", "surface");
    expect(card).toHaveTextContent("移动脚本");
  });
});

describe("批量更新空状态 重新检查按钮", () => {
  it("桌面空状态展示重新检查按钮并可触发检查", () => {
    const onCheckNow = vi.fn();
    renderDesktop({ updates: [], ignored: [], onCheckNow });
    const btn = within(screen.getByTestId("update-empty")).getByTestId("empty-recheck");
    fireEvent.click(btn);
    expect(onCheckNow).toHaveBeenCalledTimes(1);
  });

  it("移动空状态展示重新检查按钮并可触发检查", () => {
    const onCheckNow = vi.fn();
    renderMobile({ updates: [], ignored: [], onCheckNow });
    const btn = within(screen.getByTestId("update-empty")).getByTestId("empty-recheck");
    fireEvent.click(btn);
    expect(onCheckNow).toHaveBeenCalledTimes(1);
  });
});

describe("批量更新移动视图 已忽略分组折叠态", () => {
  it("折叠时仅显示展开提示而不显示全部恢复按钮", () => {
    renderMobile({ updates: [mkItem()], ignored: [mkItem({ uuid: "i1", ignored: true })] });
    expect(screen.getByTestId("ignored-expand-hint")).toBeTruthy();
    expect(screen.queryByTestId("ignored-restore-all")).toBeNull();
  });

  it("展开后显示全部恢复按钮且可触发恢复", () => {
    const onRestoreAll = vi.fn();
    renderMobile({
      updates: [mkItem()],
      ignored: [mkItem({ uuid: "i1", ignored: true })],
      onRestoreAll,
    });
    fireEvent.click(screen.getByTestId("ignored-toggle"));
    const restore = screen.getByTestId("ignored-restore-all");
    fireEvent.click(restore);
    expect(onRestoreAll).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("ignored-expand-hint")).toBeNull();
  });
});
