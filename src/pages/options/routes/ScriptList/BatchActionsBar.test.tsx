import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { act, render, cleanup, screen, fireEvent } from "@testing-library/react";
import { t } from "@App/locales/locales";
import { initTestLanguage } from "@Tests/initTestLanguage";

// useSystemConfig("trash_enabled") 读的是这个 store；默认给回收站「开启」，
// 关闭态相关用例（见「批量删除」describe）再各自切到 false。
const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@App/pages/store/global", async () => {
  const { createGlobalStoreMock } = await import("@Tests/mocks/pageStores.ts");
  return createGlobalStoreMock({
    systemConfig: { get, getLanguage: vi.fn().mockResolvedValue("zh-CN"), set: vi.fn() },
  });
});

import BatchActionsBar from "./BatchActionsBar";

const noop = () => {};

const renderBar = (over: Partial<React.ComponentProps<typeof BatchActionsBar>> = {}) =>
  render(
    <BatchActionsBar
      selectedCount={3}
      onBatchEnable={noop}
      onBatchDisable={noop}
      onBatchExport={noop}
      onBatchDelete={noop}
      onBatchPinTop={noop}
      onBatchCheckUpdate={noop}
      onClose={noop}
      allSelected={false}
      onToggleSelectAll={noop}
      {...over}
    />
  );

beforeAll(() => initTestLanguage("zh-CN"));

beforeEach(() => {
  vi.clearAllMocks();
  get.mockImplementation((key: string) => Promise.resolve(key === "trash_enabled" ? true : 30));
});
afterEach(cleanup);

describe("BatchActionsBar 批量删除", () => {
  // trash_enabled 经 store 异步读取，点击前先等它落地
  const flushConfig = () => act(async () => {});
  const trashOff = () => get.mockImplementation((key: string) => Promise.resolve(key === "trash_enabled" ? false : 30));

  it("回收站开启时，点击批量删除直接调用 onBatchDelete，不弹确认（由撤销 toast 兜底）", async () => {
    const onBatchDelete = vi.fn();
    renderBar({ onBatchDelete });
    await flushConfig();

    fireEvent.click(screen.getByText(t("delete"), { selector: "button" }));

    expect(onBatchDelete).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(t("script:confirm_delete_scripts_content", { count: 3 }))).not.toBeInTheDocument();
  });

  it("回收站关闭时，批量删除触发器为带 aria-haspopup 的真实按钮", async () => {
    trashOff();
    renderBar({});
    await flushConfig();

    const trigger = screen.getByText(t("delete"), { selector: "button" });
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
  });

  it("回收站关闭时，先弹出带数量的「此操作无法撤销」确认，确认后才调用 onBatchDelete", async () => {
    trashOff();
    const onBatchDelete = vi.fn();
    renderBar({ onBatchDelete });
    await flushConfig();

    const trigger = screen.getByText(t("delete"), { selector: "button" });
    fireEvent.click(trigger);
    expect(await screen.findByText(t("script:confirm_delete_scripts_content", { count: 3 }))).toBeInTheDocument();
    expect(onBatchDelete).not.toHaveBeenCalled();

    const confirmBtn = screen.getAllByText(t("delete"), { selector: "button" }).find((b) => b !== trigger)!;
    fireEvent.click(confirmBtn);
    expect(onBatchDelete).toHaveBeenCalledTimes(1);
  });

  it("回收站配置尚未读到时按不可撤销处理，仍先弹确认", async () => {
    get.mockImplementation(() => new Promise(() => {}));
    const onBatchDelete = vi.fn();
    renderBar({ onBatchDelete });

    fireEvent.click(screen.getByText(t("delete"), { selector: "button" }));

    expect(await screen.findByText(t("script:confirm_delete_scripts_content", { count: 3 }))).toBeInTheDocument();
    expect(onBatchDelete).not.toHaveBeenCalled();
  });
});

describe("BatchActionsBar 全选入口", () => {
  it("栏内提供三态全选框：未全选时为半选，全选后为选中", () => {
    renderBar({ allSelected: false });
    expect(screen.getByLabelText(t("script:select_all"))).toHaveAttribute("data-state", "indeterminate");

    cleanup();
    renderBar({ allSelected: true });
    expect(screen.getByLabelText(t("script:select_all"))).toHaveAttribute("data-state", "checked");
  });

  it("点击全选框调用 onToggleSelectAll", () => {
    const onToggleSelectAll = vi.fn();
    renderBar({ onToggleSelectAll });

    fireEvent.click(screen.getByLabelText(t("script:select_all")));

    expect(onToggleSelectAll).toHaveBeenCalled();
  });
});
