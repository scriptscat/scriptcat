import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithRouter } from "@Tests/renderWithThemeRouter";
import { initTestLanguage } from "@Tests/initTestLanguage";

const { requestTrashScripts, requestRestoreScripts, requestPurgeScripts, get, messageHandlers } = vi.hoisted(() => ({
  requestTrashScripts: vi.fn(),
  requestRestoreScripts: vi.fn(),
  requestPurgeScripts: vi.fn(),
  get: vi.fn(),
  messageHandlers: new Map<string, (data: object) => void>(),
}));
vi.mock("@App/pages/store/features/script", () => ({
  requestTrashScripts,
  requestRestoreScripts,
  requestPurgeScripts,
}));
vi.mock("@App/pages/components/ui/toast", () => ({
  notify: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(),
    promise: vi.fn(),
    undo: vi.fn(),
    dismiss: vi.fn(),
  },
}));
// trash_enabled 默认「开启」，与关闭态相关的用例（见「回收站关闭时的提示与倒计时」describe）再各自切到 false。
vi.mock("@App/pages/store/global", async () => {
  const { createGlobalStoreMock } = await import("@Tests/mocks/pageStores.ts");
  return {
    ...createGlobalStoreMock({ systemConfig: { get, set: vi.fn() } }),
    subscribeMessage: vi.fn((topic: string, handler: (data: object) => void) => {
      messageHandlers.set(topic, handler);
      return vi.fn();
    }),
  };
});

import TrashListMobile from "./TrashListMobile";
import TrashTable from "./TrashTable";
import { notify } from "@App/pages/components/ui/toast";

beforeAll(() => initTestLanguage("zh-CN"));

beforeEach(() => {
  vi.clearAllMocks();
  messageHandlers.clear();
  requestTrashScripts.mockResolvedValue([]);
  get.mockImplementation((key: string) => Promise.resolve(key === "trash_enabled" ? true : 30));
});
afterEach(cleanup);

describe("多窗口回收站实时同步", () => {
  it.each([
    ["桌面端", <TrashTable key="desktop" />],
    ["移动端", <TrashListMobile key="mobile" />],
  ])("%s 收到回收站内容事件时应重新拉取列表", async (_name, view) => {
    renderWithRouter(view);
    await waitFor(() => expect(requestTrashScripts).toHaveBeenCalledTimes(1));

    messageHandlers.get("trashScripts")?.({});
    messageHandlers.get("deleteScripts")?.({});
    messageHandlers.get("installScript")?.({});

    await waitFor(() => expect(requestTrashScripts).toHaveBeenCalledTimes(4));
  });
});

describe("空回收站的固定控制区", () => {
  it("桌面端保留搜索、来源筛选和清理时间设置，仅表格内容显示空状态", async () => {
    renderWithRouter(<TrashTable leading={<span>{"tabs"}</span>} />);

    expect(await screen.findByRole("searchbox", { name: "搜索已删除的脚本" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "全部" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "设置" })).toBeInTheDocument();
    expect(screen.getByText("回收站是空的")).toBeInTheDocument();
  });

  it("移动端保留来源筛选和清理时间设置，仅卡片内容显示空状态", () => {
    renderWithRouter(<TrashListMobile />);

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

  it("全选框挂在批量操作栏内，列表顶部没有独立全选行", async () => {
    const checkboxes = await renderWithOneTrashed();
    expect(checkboxes).toHaveLength(2); // 批量栏的全选 + 唯一一行

    const bar = screen.getByText("已选择 0 项").parentElement!;
    fireEvent.click(within(bar).getByLabelText("全选"));

    expect(checkboxes[1]).toBeChecked();
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
    ["移动端", <TrashListMobile key="mobile" />],
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
    renderWithRouter(<TrashListMobile />);

    expect(await screen.findByText("关闭态脚本")).toBeInTheDocument();
    expect(screen.getByText("回收站已关闭 · 新删除的脚本将直接彻底删除")).toBeInTheDocument();
    expect(screen.queryByText("今天")).not.toBeInTheDocument();
  });
});

// 条目可能已在别的窗口被还原/彻底删除，或被到期清理抢先：此时 SW 会抛
// "trash scripts not found"。失败必须有可见反馈，并重拉列表把陈旧行清掉，
// 否则用户看到的是「点了没反应」且僵尸行一直留在列表里。
describe("还原/彻底删除失败时的反馈", () => {
  const stale = {
    uuid: "trash-stale",
    name: "陈旧条目",
    namespace: "verify",
    deleteBy: "user",
    deleteTime: Date.now(),
  };

  beforeEach(() => {
    requestTrashScripts.mockResolvedValue([stale]);
  });

  it("桌面端：还原请求失败时提示错误并重新拉取列表", async () => {
    requestRestoreScripts.mockRejectedValue(new Error("trash scripts not found"));
    renderWithRouter(<TrashTable />);
    await screen.findByText("陈旧条目");

    // SelectionBar 里有同名的批量按钮（收起但仍在 DOM），用 title 限定到行内图标按钮
    fireEvent.click(screen.getByTitle("还原"));

    await waitFor(() => expect(notify.error).toHaveBeenCalledWith("还原失败"));
    // mount 一次 + 失败后重拉一次
    expect(requestTrashScripts).toHaveBeenCalledTimes(2);
  });

  it("桌面端：彻底删除请求失败时提示错误并重新拉取列表", async () => {
    requestPurgeScripts.mockRejectedValue(new Error("trash scripts not found"));
    renderWithRouter(<TrashTable />);
    await screen.findByText("陈旧条目");

    fireEvent.click(screen.getByTitle("彻底删除"));
    // Popconfirm 弹层（portal 到 body 末尾）里的确认按钮与行内/批量按钮同名，取最后出现的那个
    const confirmButtons = await screen.findAllByRole("button", { name: "彻底删除" });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => expect(notify.error).toHaveBeenCalledWith("删除失败"));
    expect(requestTrashScripts).toHaveBeenCalledTimes(2);
  });

  it("移动端：还原请求失败时提示错误并重新拉取列表", async () => {
    requestRestoreScripts.mockRejectedValue(new Error("trash scripts not found"));
    const { container } = renderWithRouter(<TrashListMobile />);
    await screen.findByText("陈旧条目");

    // 移动端还原挂在左滑露出的操作块上，未滑出时它对无障碍树不可见
    const swipe = container.querySelector('[data-slot="mobile-swipe-row"]')!;
    fireEvent.touchStart(swipe, { touches: [{ clientX: 200 }] });
    fireEvent.touchEnd(swipe, { changedTouches: [{ clientX: 100 }] });
    fireEvent.click(screen.getByRole("button", { name: "还原" }));

    await waitFor(() => expect(notify.error).toHaveBeenCalledWith("还原失败"));
    expect(requestTrashScripts).toHaveBeenCalledTimes(2);
  });
});

// 「永不清理」时 days=0，若照常插值会渲染出「保留 0 天」——一个撒谎的承诺。
describe("空回收站文案与保留时间联动", () => {
  it("保留时间为「永不」时不得显示「保留 0 天」", async () => {
    get.mockImplementation((key: string) => Promise.resolve(key === "trash_enabled" ? true : 0));
    renderWithRouter(<TrashTable />);

    expect(await screen.findByText("回收站是空的")).toBeInTheDocument();
    expect(screen.queryByText(/0 天/)).not.toBeInTheDocument();
    expect(screen.getByText("删除的脚本会先移到这里,除非手动彻底删除,否则会一直保留")).toBeInTheDocument();
  });

  it("回收站关闭时空状态说明改用关闭态提示", async () => {
    get.mockImplementation((key: string) => Promise.resolve(key === "trash_enabled" ? false : 30));
    renderWithRouter(<TrashListMobile />);

    expect(await screen.findByText("回收站是空的")).toBeInTheDocument();
    expect(screen.queryByText(/0 天/)).not.toBeInTheDocument();
    // 关闭态下「删除的脚本会先移到这里」不再成立，说明须与顶部提示一致改为关闭态文案
    expect(screen.getAllByText("回收站已关闭 · 新删除的脚本将直接彻底删除").length).toBeGreaterThan(0);
  });
});

describe("回收站桌面端列表化", () => {
  const mkTrash = (uuid: string, name: string, deleteTime: number) => ({
    uuid,
    name,
    namespace: "example.com",
    metadata: { version: ["1.0.0"] },
    deleteBy: "user",
    deleteTime,
  });

  // 主段第一个 span 是无图标脚本的兜底头像，脚本名取带 text-sm 的那个
  const trashOrder = () =>
    Array.from(document.querySelectorAll('[data-slot="list-row-main"] .text-sm')).map((el) => el.textContent);

  const sortBy = (label: string) => {
    const trigger = screen.getByTestId("sort-menu");
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);
    fireEvent.click(screen.getByText(label));
  };

  beforeEach(() => {
    requestTrashScripts.mockResolvedValue([
      mkTrash("b", "Banana", 30),
      mkTrash("a", "Apple", 10),
      mkTrash("c", "Cherry", 20),
    ]);
  });

  it("行改用共享的列表行骨架，不再渲染固定列表头", async () => {
    renderWithRouter(<TrashTable />);

    await waitFor(() => expect(document.querySelectorAll('[data-slot="list-row"]').length).toBe(3));
    expect(screen.queryByText("删除来源")).toBeNull();
    expect(screen.queryByText("自动清理")).toBeNull();
  });

  it("默认按删除时间倒序，最近删除的排在最前", async () => {
    renderWithRouter(<TrashTable />);

    await waitFor(() => expect(trashOrder()).toEqual(["Banana", "Cherry", "Apple"]));
  });

  it("工具栏排序下拉可改按名称排序", async () => {
    renderWithRouter(<TrashTable />);
    await waitFor(() => expect(document.querySelectorAll('[data-slot="list-row"]').length).toBe(3));

    sortBy("名称");

    await waitFor(() => expect(trashOrder()).toEqual(["Apple", "Banana", "Cherry"]));
  });
});

describe("回收站移动端单条操作", () => {
  const trashed = {
    uuid: "trash-1",
    name: "待还原脚本",
    namespace: "verify",
    deleteBy: "user",
    deleteTime: Date.now(),
  };

  // 左滑是隐藏手势，不能是单条还原的唯一入口——脚本列表与订阅列表都有「点整行开面板」这条可见退路
  it("点整行打开操作面板，面板里有还原与彻底删除", async () => {
    requestTrashScripts.mockResolvedValue([trashed]);
    renderWithRouter(<TrashListMobile />);
    await screen.findByText("待还原脚本");

    fireEvent.click(document.querySelector('[data-slot="mobile-list-row-main"]')!);

    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText("还原")).toBeInTheDocument();
    expect(within(sheet).getByText("彻底删除")).toBeInTheDocument();
  });

  it("面板中的还原按该条发起请求", async () => {
    requestTrashScripts.mockResolvedValue([trashed]);
    requestRestoreScripts.mockResolvedValue({ restored: ["trash-1"], conflicts: [] });
    renderWithRouter(<TrashListMobile />);
    await screen.findByText("待还原脚本");
    fireEvent.click(document.querySelector('[data-slot="mobile-list-row-main"]')!);

    const sheet = await screen.findByRole("dialog");
    fireEvent.click(within(sheet).getByText("还原"));

    await waitFor(() => expect(requestRestoreScripts).toHaveBeenCalledWith(["trash-1"]));
  });
});

describe("回收站移动端多选", () => {
  const trashed = {
    uuid: "trash-1",
    name: "待还原脚本",
    namespace: "verify",
    deleteBy: "user",
    deleteTime: Date.now(),
  };

  it("顶栏入口进入多选，底部批量操作条提供还原与彻底删除", async () => {
    requestTrashScripts.mockResolvedValue([trashed]);
    renderWithRouter(<TrashListMobile />);
    await screen.findByText("待还原脚本");

    fireEvent.click(screen.getByRole("button", { name: "多选" }));

    expect(screen.getByText("已选择 0 项")).toBeInTheDocument();
    const bar = document.querySelector('[data-slot="mobile-batch-bar"]')!;
    expect(bar.textContent).toContain("还原");
    expect(bar.textContent).toContain("彻底删除");
  });

  it("勾选后批量还原按选中项发起请求，并退出多选", async () => {
    requestTrashScripts.mockResolvedValue([trashed]);
    requestRestoreScripts.mockResolvedValue({ restored: ["trash-1"], conflicts: [] });
    renderWithRouter(<TrashListMobile />);
    await screen.findByText("待还原脚本");
    fireEvent.click(screen.getByRole("button", { name: "多选" }));

    fireEvent.click(screen.getByRole("checkbox", { name: "待还原脚本" }));
    fireEvent.click(within(document.querySelector('[data-slot="mobile-batch-bar"]')!).getByText("还原"));

    await waitFor(() => expect(requestRestoreScripts).toHaveBeenCalledWith(["trash-1"]));
    expect(document.querySelector('[data-slot="mobile-batch-bar"]')).toBeNull();
  });
});
