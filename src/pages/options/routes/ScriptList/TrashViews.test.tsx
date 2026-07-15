import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { renderWithRouter } from "@Tests/renderWithThemeRouter";
import { initTestLanguage } from "@Tests/initTestLanguage";

const { requestTrashScripts, get } = vi.hoisted(() => ({ requestTrashScripts: vi.fn(), get: vi.fn() }));
vi.mock("@App/pages/store/features/script", () => ({
  requestTrashScripts,
  requestRestoreScripts: vi.fn(),
  requestPurgeScripts: vi.fn(),
}));
// trash_enabled 默认「开启」，与关闭态相关的用例（见「回收站关闭时的提示与倒计时」describe）再各自切到 false。
vi.mock("@App/pages/store/global", async () => {
  const { createGlobalStoreMock } = await import("@Tests/mocks/pageStores.ts");
  return createGlobalStoreMock({ systemConfig: { get, set: vi.fn() } });
});

import TrashCardGrid from "./TrashCardGrid";
import TrashTable from "./TrashTable";

beforeAll(() => initTestLanguage("zh-CN"));

beforeEach(() => {
  requestTrashScripts.mockResolvedValue([]);
  get.mockImplementation((key: string) => Promise.resolve(key === "trash_enabled" ? true : 30));
});
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

describe("回收站脚本元信息样式", () => {
  const trashed = {
    uuid: "trash-meta",
    name: "带版本脚本",
    namespace: "example.namespace",
    deleteBy: "user",
    deleteTime: Date.now() - 3 * 24 * 60 * 60 * 1000,
    metadata: { icon: ["https://example.com/icon.png"], version: ["1.2.3"] },
  };

  it.each([
    ["桌面端", <TrashTable key="desktop" />],
    ["移动端", <TrashCardGrid key="mobile" />],
  ])("%s 与脚本列表一致显示图标、11px 版本和语义化时间", async (_name, view) => {
    requestTrashScripts.mockResolvedValue([trashed]);
    renderWithRouter(view);

    expect(await screen.findByText("example.namespace · v1.2.3")).toHaveClass("text-[11px]");
    expect(screen.getByRole("img", { name: "带版本脚本" })).toHaveAttribute("src", "https://example.com/icon.png");
    expect(screen.getByText(/3 days ago|3天前/)).toBeInTheDocument();
  });
});

// cleanupExpiredTrash 在回收站关闭时直接返回 0（不再自动清理），hint 若还在倒数一个
// 永远不会到来的期限就是在撒谎；关闭态下 days 须归零，hint 须换成「回收站已关闭」。
describe("回收站关闭时的提示与倒计时", () => {
  // 特意选一个按默认 30 天算「早已过期」的删除时间，用来证明关闭态下不再倒数（不会显示「今天」）
  const overdue = {
    uuid: "trash-disabled",
    name: "关闭态脚本",
    namespace: "verify",
    deleteBy: "user",
    deleteTime: Date.now() - 40 * 24 * 60 * 60 * 1000,
  };

  beforeEach(() => {
    get.mockImplementation((key: string) => Promise.resolve(key === "trash_enabled" ? false : 30));
    requestTrashScripts.mockResolvedValue([overdue]);
  });

  it("桌面端：提示改为「回收站已关闭」，过期条目不再显示「今天」，倒计时列显示占位符", async () => {
    renderWithRouter(<TrashTable />);

    expect(await screen.findByText("关闭态脚本")).toBeInTheDocument();
    expect(screen.getByText("回收站已关闭 · 新删除的脚本将直接彻底删除")).toBeInTheDocument();
    expect(screen.queryByText("今天")).not.toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("移动端：提示改为「回收站已关闭」，过期条目不再显示「今天」", async () => {
    renderWithRouter(<TrashCardGrid />);

    expect(await screen.findByText("关闭态脚本")).toBeInTheDocument();
    expect(screen.getByText("回收站已关闭 · 新删除的脚本将直接彻底删除")).toBeInTheDocument();
    expect(screen.queryByText("今天")).not.toBeInTheDocument();
  });
});
