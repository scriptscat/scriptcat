import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";

const { requestTrashScripts } = vi.hoisted(() => ({ requestTrashScripts: vi.fn() }));
vi.mock("@App/pages/store/features/script", () => ({
  requestTrashScripts,
  requestRestoreScripts: vi.fn(),
  requestPurgeScripts: vi.fn(),
}));
vi.mock("@App/pages/store/global", async () => {
  const { createGlobalStoreMock } = await import("@Tests/mocks/pageStores.ts");
  return createGlobalStoreMock({ systemConfig: { get: vi.fn().mockResolvedValue(30), set: vi.fn() } });
});

import TrashCardGrid from "./TrashCardGrid";
import TrashTable from "./TrashTable";

beforeAll(() => initTestLanguage("zh-CN"));

beforeEach(() => requestTrashScripts.mockResolvedValue([]));
afterEach(cleanup);

describe("空回收站的固定控制区", () => {
  it("桌面端保留搜索、来源筛选和清理时间设置，仅表格内容显示空状态", async () => {
    render(<TrashTable leading={<span>{"tabs"}</span>} />);

    expect(await screen.findByRole("searchbox", { name: "搜索已删除的脚本" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "全部" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "设置" })).toBeInTheDocument();
    expect(screen.getByText("回收站是空的")).toBeInTheDocument();
  });

  it("移动端保留来源筛选和清理时间设置，仅卡片内容显示空状态", () => {
    render(<TrashCardGrid />);

    expect(screen.getByRole("button", { name: "全部" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "设置" })).toBeInTheDocument();
    expect(screen.getByText("回收站是空的")).toBeInTheDocument();
  });
});

describe("桌面回收站批量操作槽位", () => {
  it("选择脚本后用批量操作替换来源筛选行", async () => {
    requestTrashScripts.mockResolvedValue([
      { uuid: "trash-1", name: "待还原脚本", namespace: "verify", deleteBy: "user", deleteTime: Date.now() },
    ]);
    render(<TrashTable />);

    await screen.findByText("待还原脚本");
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]);

    expect(screen.getByText("已选择 1 项")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "全部" })).toBeNull();
  });
});
