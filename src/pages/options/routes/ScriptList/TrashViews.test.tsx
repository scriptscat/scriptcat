import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { renderWithRouter } from "@Tests/renderWithThemeRouter";
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
    renderWithRouter(<TrashTable leading={<span>{"tabs"}</span>} />);

    expect(await screen.findByRole("searchbox", { name: "搜索已删除的脚本" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "全部" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "设置" })).toBeInTheDocument();
    expect(screen.getByText("回收站是空的")).toBeInTheDocument();
  });

  it("移动端保留来源筛选和清理时间设置，仅卡片内容显示空状态", () => {
    renderWithRouter(<TrashCardGrid />);

    expect(screen.getByRole("button", { name: "全部" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "设置" })).toBeInTheDocument();
    expect(screen.getByText("回收站是空的")).toBeInTheDocument();
  });
});

describe("桌面回收站批量操作槽位", () => {
  const renderWithOneTrashed = async () => {
    requestTrashScripts.mockResolvedValue([
      { uuid: "trash-1", name: "待还原脚本", namespace: "verify", deleteBy: "user", deleteTime: Date.now() },
    ]);
    renderWithRouter(<TrashTable />);
    await screen.findByText("待还原脚本");
    return screen.getAllByRole("checkbox");
  };

  it("选择脚本后展开批量操作栏，与已安装列表复用同一个计数文案，栏内带批量还原", async () => {
    const checkboxes = await renderWithOneTrashed();
    fireEvent.click(checkboxes[1]);

    // 行内也有同名的图标按钮，故须限定在栏内查询，确认操作按钮确实挂进了 SelectionBar 的 children 槽位
    const bar = screen.getByText("已选择 1 项").parentElement!;
    expect(within(bar).getByRole("button", { name: "还原" })).toBeInTheDocument();
  });

  it("点击批量操作栏的关闭按钮清空选择", async () => {
    const checkboxes = await renderWithOneTrashed();
    fireEvent.click(checkboxes[1]);
    expect(checkboxes[1]).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "关闭" }));

    expect(checkboxes[1]).not.toBeChecked();
  });
});
