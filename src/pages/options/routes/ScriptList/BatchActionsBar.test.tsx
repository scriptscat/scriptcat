// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { initLanguage, t } from "@App/locales/locales";

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

beforeEach(() => {
  initLanguage("zh-CN");
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("BatchActionsBar 批量删除二次确认", () => {
  it("点击批量删除先弹出带数量的 Popconfirm，确认前不调用 onBatchDelete", async () => {
    const onBatchDelete = vi.fn();
    renderBar({ onBatchDelete });

    const trigger = screen.getByRole("button", { name: t("delete") });
    fireEvent.click(trigger);

    expect(await screen.findByText(t("script:confirm_delete_scripts_content", { count: 3 }))).toBeInTheDocument();
    expect(onBatchDelete).not.toHaveBeenCalled();
  });

  it("在 Popconfirm 中点击确认后才调用 onBatchDelete", async () => {
    const onBatchDelete = vi.fn();
    renderBar({ onBatchDelete });

    const trigger = screen.getByRole("button", { name: t("delete") });
    fireEvent.click(trigger);
    await screen.findByText(t("script:confirm_delete_scripts_content", { count: 3 }));

    const confirmBtn = screen.getAllByRole("button", { name: t("delete") }).find((b) => b !== trigger)!;
    fireEvent.click(confirmBtn);
    expect(onBatchDelete).toHaveBeenCalledTimes(1);
  });
});
