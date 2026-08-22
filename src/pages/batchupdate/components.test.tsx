import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { cleanup, screen, within, fireEvent } from "@testing-library/react";
import { t } from "@App/locales/locales";
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
    autoCloseCancelled: false,
    rowStates: {},
    batchProgress: null,
    recordExpired: false,
    onToggle: () => {},
    onToggleAll: () => {},
    onUpdate: () => {},
    onIgnore: () => {},
    onRestore: () => {},
    onUpdateSelected: () => {},
    onIgnoreSelected: () => {},
    onRestoreAll: () => {},
    onCheckNow: () => {},
    onCancelAutoClose: () => {},
    onOpen: () => {},
    onOpenScriptList: () => {},
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

  it("展开后显示全部恢复按钮且确认后才触发恢复", () => {
    const onRestoreAll = vi.fn();
    renderMobile({
      updates: [mkItem()],
      ignored: [mkItem({ uuid: "i1", ignored: true })],
      onRestoreAll,
    });
    fireEvent.click(screen.getByTestId("ignored-toggle"));
    fireEvent.click(screen.getByTestId("ignored-restore-all"));
    fireEvent.click(screen.getByTestId("popconfirm-confirm"));
    expect(onRestoreAll).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("ignored-expand-hint")).toBeNull();
  });
});

describe("批量更新行内状态 桌面视图", () => {
  it("更新中的行显示转圈与「更新中」，并在行底给出扫光条", () => {
    renderDesktop({ updates: [mkItem()], rowStates: { u1: { phase: "working" } } });
    const status = screen.getByTestId("row-status-u1");
    expect(status).toHaveAttribute("data-phase", "working");
    expect(status).toHaveTextContent(t("install:updatepage.row_updating"));
    expect(screen.queryByText(t("install:updatepage.update"))).toBeNull();
    expect(document.querySelector(".animate-indeterminate-bar")).toBeTruthy();
  });

  it("排队中的行显示「排队中」且不再提供更新入口", () => {
    renderDesktop({ updates: [mkItem()], rowStates: { u1: { phase: "queued" } } });
    const status = screen.getByTestId("row-status-u1");
    expect(status).toHaveAttribute("data-phase", "queued");
    expect(status).toHaveTextContent(t("install:updatepage.row_queued"));
  });

  it("成功的行展示已更新到的版本号", () => {
    renderDesktop({ updates: [mkItem({ newVersion: "2.10.0" })], rowStates: { u1: { phase: "success" } } });
    const status = screen.getByTestId("row-status-u1");
    expect(status).toHaveAttribute("data-phase", "success");
    expect(status).toHaveTextContent(t("install:updatepage.row_updated", { version: "2.10.0" }));
  });

  it("失败的行留在原地并可点重试", () => {
    const onUpdate = vi.fn();
    renderDesktop({
      updates: [mkItem()],
      rowStates: { u1: { phase: "fail", error: "下载新版本失败" } },
      onUpdate,
    });
    const status = screen.getByTestId("row-status-u1");
    expect(status).toHaveAttribute("data-phase", "fail");
    expect(status).toHaveTextContent(t("install:updatepage.row_failed"));
    fireEvent.click(screen.getByTestId("row-retry-u1"));
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("初始态的行仍是常规的更新/忽略入口", () => {
    renderDesktop({ updates: [mkItem()] });
    expect(screen.getByTestId("row-status-u1")).toHaveAttribute("data-phase", "idle");
    expect(screen.getByText(t("install:updatepage.update"))).toBeTruthy();
  });
});

describe("批量更新行内状态 移动视图", () => {
  it("更新中的卡片显示「更新中」并给出扫光条", () => {
    renderMobile({ updates: [mkItem()], rowStates: { u1: { phase: "working" } } });
    const status = screen.getByTestId("row-status-u1");
    expect(status).toHaveAttribute("data-phase", "working");
    expect(status).toHaveTextContent(t("install:updatepage.row_updating"));
    expect(document.querySelector(".animate-indeterminate-bar")).toBeTruthy();
  });

  it("失败的卡片可点重试", () => {
    const onUpdate = vi.fn();
    renderMobile({ updates: [mkItem()], rowStates: { u1: { phase: "fail", error: "boom" } }, onUpdate });
    fireEvent.click(screen.getByTestId("row-retry-u1"));
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("成功的卡片展示已更新到的版本号", () => {
    renderMobile({ updates: [mkItem({ newVersion: "3.0.1" })], rowStates: { u1: { phase: "success" } } });
    expect(screen.getByTestId("row-status-u1")).toHaveTextContent(
      t("install:updatepage.row_updated", { version: "3.0.1" })
    );
  });
});

describe("批量更新汇总条", () => {
  it("推进中显示已完成/总数与确定性进度", () => {
    renderDesktop({ updates: [mkItem()], batchProgress: { done: 2, total: 4, failed: 0, finished: false } });
    const summary = screen.getByTestId("batch-summary");
    expect(summary).toHaveTextContent(t("install:updatepage.batch_progress", { done: 2, total: 4 }));
    expect(summary.querySelector('[role="progressbar"]')).toHaveAttribute("aria-valuenow", "2");
    expect(screen.queryByTestId("batch-open-scripts")).toBeNull();
  });

  it("结束后汇总成功与失败数量", () => {
    renderDesktop({ updates: [mkItem()], batchProgress: { done: 4, total: 4, failed: 1, finished: true } });
    expect(screen.getByTestId("batch-summary")).toHaveTextContent(
      t("install:updatepage.batch_done_partial", { updated: 3, failed: 1 })
    );
  });

  it("结束后提供查看更新脚本的入口", () => {
    const onOpenScriptList = vi.fn();
    renderDesktop({
      updates: [mkItem()],
      batchProgress: { done: 2, total: 2, failed: 0, finished: true },
      onOpenScriptList,
    });
    const entry = screen.getByTestId("batch-open-scripts");
    expect(entry).toHaveTextContent(t("install:updatepage.view_updated_scripts"));
    fireEvent.click(entry);
    expect(onOpenScriptList).toHaveBeenCalledTimes(1);
  });

  it("移动视图同样展示汇总条与查看入口", () => {
    const onOpenScriptList = vi.fn();
    renderMobile({
      updates: [mkItem()],
      batchProgress: { done: 2, total: 2, failed: 0, finished: true },
      onOpenScriptList,
    });
    expect(screen.getByTestId("batch-summary")).toHaveTextContent(t("install:updatepage.batch_done", { count: 2 }));
    fireEvent.click(screen.getByTestId("batch-open-scripts"));
    expect(onOpenScriptList).toHaveBeenCalledTimes(1);
  });
});

describe("批量更新 更新数据过期提示", () => {
  it("桌面视图提示重新检查并把检查按钮切成高亮样式", () => {
    renderDesktop({ updates: [mkItem()], recordExpired: true });
    expect(screen.getByTestId("record-expired")).toHaveTextContent(t("install:updatepage.record_expired"));
    const recheck = screen.getByText(t("install:updatepage.main_header")).closest("button");
    expect(recheck).toHaveAttribute("data-variant", "default");
  });

  it("移动视图同样提示重新检查", () => {
    renderMobile({ updates: [mkItem()], recordExpired: true });
    expect(screen.getByTestId("record-expired")).toHaveTextContent(t("install:updatepage.record_expired"));
  });
});

describe("批量更新 自动关闭药丸", () => {
  it("倒计时中可点击取消", () => {
    const onCancelAutoClose = vi.fn();
    renderDesktop({ autoClose: 12, onCancelAutoClose });
    const chip = screen.getByTestId("auto-close-chip");
    expect(chip.tagName).toBe("BUTTON");
    expect(chip).toHaveAttribute("data-state", "counting");
    expect(chip).toHaveTextContent(t("install:updatepage.auto_close_cancel_hint"));
    fireEvent.click(chip);
    expect(onCancelAutoClose).toHaveBeenCalledTimes(1);
  });

  it("已取消时切成不可点击的已取消态", () => {
    renderDesktop({ autoClose: null, autoCloseCancelled: true });
    const chip = screen.getByTestId("auto-close-chip");
    expect(chip.tagName).not.toBe("BUTTON");
    expect(chip).toHaveAttribute("data-state", "cancelled");
    expect(chip).toHaveTextContent(t("install:updatepage.auto_close_cancelled"));
  });

  it("未要求自动关闭时不显示药丸", () => {
    renderDesktop({ autoClose: null, autoCloseCancelled: false });
    expect(screen.queryByTestId("auto-close-chip")).toBeNull();
  });

  it("移动视图的药丸同样可点击取消", () => {
    const onCancelAutoClose = vi.fn();
    renderMobile({ updates: [mkItem()], autoClose: 2, onCancelAutoClose });
    fireEvent.click(screen.getByTestId("auto-close-chip"));
    expect(onCancelAutoClose).toHaveBeenCalledTimes(1);
  });

  it("移动视图在已取消后仍显示已取消态", () => {
    renderMobile({ updates: [mkItem()], autoClose: null, autoCloseCancelled: true });
    expect(screen.getByTestId("auto-close-chip")).toHaveAttribute("data-state", "cancelled");
  });
});

describe("批量更新 全部恢复并更新的确认", () => {
  it("桌面视图点击后先确认，取消则不发起", () => {
    const onRestoreAll = vi.fn();
    renderDesktop({ ignored: [mkItem({ uuid: "i1", ignored: true })], onRestoreAll });
    fireEvent.click(screen.getByTestId("ignored-restore-all"));
    expect(screen.getByText(t("install:updatepage.restore_all_confirm", { count: 1 }))).toBeTruthy();
    expect(onRestoreAll).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText(t("cancel")));
    expect(onRestoreAll).not.toHaveBeenCalled();
  });

  it("确认弹窗点出新增 @connect 的后果", () => {
    renderDesktop({
      ignored: [
        mkItem({ uuid: "i1", ignored: true, withNewConnect: true, newConnects: ["api.example.com"] }),
        mkItem({ uuid: "i2", ignored: true }),
      ],
    });
    fireEvent.click(screen.getByTestId("ignored-restore-all"));
    const expected = `${t("install:updatepage.restore_all_confirm", { count: 2 })} ${t(
      "install:updatepage.restore_all_confirm_connect",
      { count: 1 }
    )}`;
    expect(screen.getByText(expected)).toBeTruthy();
  });

  it("确认后才发起全部恢复并更新", () => {
    const onRestoreAll = vi.fn();
    renderDesktop({ ignored: [mkItem({ uuid: "i1", ignored: true })], onRestoreAll });
    fireEvent.click(screen.getByTestId("ignored-restore-all"));
    fireEvent.click(screen.getByTestId("popconfirm-confirm"));
    expect(onRestoreAll).toHaveBeenCalledTimes(1);
  });

  it("单行与批量的动词一致，都是「恢复并更新」语义", () => {
    renderDesktop({ ignored: [mkItem({ uuid: "i1", ignored: true })] });
    expect(screen.getByText(t("install:updatepage.restore"))).toBeTruthy();
    expect(screen.getByTestId("ignored-restore-all")).toHaveTextContent(t("install:updatepage.restore_all"));
  });
});
