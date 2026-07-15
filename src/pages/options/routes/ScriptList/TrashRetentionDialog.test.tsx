import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";

const { get, set } = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock("@App/pages/store/global", async () => {
  const { createGlobalStoreMock } = await import("@Tests/mocks/pageStores.ts");
  return createGlobalStoreMock({ systemConfig: { get, set } });
});

import { TrashRetentionDialog } from "./TrashRetentionDialog";

beforeAll(() => initTestLanguage("zh-CN"));

beforeEach(() => {
  get.mockReset();
  set.mockReset();
  get.mockResolvedValue(30);
});

describe("回收站自动清理时间弹窗", () => {
  it("从回收站入口选择 90 天并保存后写入系统配置", async () => {
    render(<TrashRetentionDialog />);

    fireEvent.click(await screen.findByRole("button", { name: "设置" }));
    fireEvent.click(screen.getByRole("radio", { name: "90天" }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(set).toHaveBeenCalledWith("trash_retention_days", 90);
  });
});
