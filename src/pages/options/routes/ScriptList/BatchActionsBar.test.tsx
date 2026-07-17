import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { t } from "@App/locales/locales";
import { initTestLanguage } from "@Tests/initTestLanguage";

// useSystemConfig("trash_enabled") 读的是这个 store；默认给回收站「开启」，
// 关闭态相关用例（见「回收站关闭时的批量删除确认文案」describe）再各自切到 false。
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
      {...over}
    />
  );

beforeAll(() => initTestLanguage("zh-CN"));

beforeEach(() => {
  vi.clearAllMocks();
  get.mockImplementation((key: string) => Promise.resolve(key === "trash_enabled" ? true : 30));
});
afterEach(cleanup);

describe("BatchActionsBar 批量删除二次确认", () => {
  it("批量删除触发器为带 aria-haspopup 的真实按钮（trigger 属性透传到 BatchBtn 内层按钮）", () => {
    renderBar({});
    const trigger = screen.getByText(t("delete"), { selector: "button" });
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
  });

  it("点击批量删除先弹出带数量的 Popconfirm，确认前不调用 onBatchDelete（回收站默认开启，文案说可还原）", async () => {
    const onBatchDelete = vi.fn();
    renderBar({ onBatchDelete });

    const trigger = screen.getByText(t("delete"), { selector: "button" });
    fireEvent.click(trigger);

    expect(await screen.findByText(t("script:confirm_delete_scripts_trash_content", { count: 3 }))).toBeInTheDocument();
    expect(onBatchDelete).not.toHaveBeenCalled();
  });

  it("在 Popconfirm 中点击确认后才调用 onBatchDelete", async () => {
    const onBatchDelete = vi.fn();
    renderBar({ onBatchDelete });

    const trigger = screen.getByText(t("delete"), { selector: "button" });
    fireEvent.click(trigger);
    await screen.findByText(t("script:confirm_delete_scripts_trash_content", { count: 3 }));

    const confirmBtn = screen.getAllByText(t("delete"), { selector: "button" }).find((b) => b !== trigger)!;
    fireEvent.click(confirmBtn);
    expect(onBatchDelete).toHaveBeenCalledTimes(1);
  });

  it("回收站关闭时，批量删除确认文案改回「此操作无法撤销」", async () => {
    get.mockImplementation((key: string) => Promise.resolve(key === "trash_enabled" ? false : 30));
    renderBar({});

    const trigger = screen.getByText(t("delete"), { selector: "button" });
    fireEvent.click(trigger);

    expect(await screen.findByText(t("script:confirm_delete_scripts_content", { count: 3 }))).toBeInTheDocument();
    expect(screen.queryByText(t("script:confirm_delete_scripts_trash_content", { count: 3 }))).not.toBeInTheDocument();
  });
});
