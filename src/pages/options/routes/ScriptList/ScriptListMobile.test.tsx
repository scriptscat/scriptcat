import { describe, it, expect, afterEach, beforeAll, beforeEach, vi } from "vitest";
import type { ReactNode } from "react";
import { cleanup, screen, fireEvent } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { mockMatchMedia } from "@Tests/mockMatchMedia";
import { renderWithRouter } from "@Tests/renderWithThemeRouter";
import { useIsMobile } from "@App/pages/components/use-is-mobile";
import ScriptListMobile from "./ScriptListMobile";
import ScriptList from "./index";

// ── Top-level mocks ──────────────────────────────────────────────────────────

vi.mock("@App/pages/components/use-is-mobile", () => ({
  useIsMobile: vi.fn(),
  MOBILE_BREAKPOINT: 768,
}));

// Stable references are critical: index.tsx puts `stats` and `scriptList` in
// useEffect dependency arrays. Returning new objects on each hook call would
// cause an infinite re-render loop.
const stableScriptList: never[] = [];
const stableSetScriptList = vi.fn();
const stableStats = { tagMap: {}, originMap: {}, counts: {} };
const stableFilterItems = { statusItems: [], typeItems: [], tagItems: [], sourceItems: [] };
const { mockTrashCount } = vi.hoisted(() => ({ mockTrashCount: { value: 0 } }));

// useTrashCount 的真实签名就是 useState 的形状，用 useState 打桩才能让组件自己的
// setTrashCount(0)（清空回收站的回报路径）真正触发重渲染；返回定值的话，React.memo
// 包裹的 ScriptListMobile 会把外部 rerender 全部挡掉，回落分支永远跑不到。
vi.mock("./hooks", async () => {
  const { useState } = await import("react");
  return {
    useScriptDataManagement: () => ({
      scriptList: stableScriptList,
      setScriptList: stableSetScriptList,
      loadingList: false,
    }),
    useScriptFilters: () => ({ stats: stableStats, filterItems: stableFilterItems }),
    useTrashCount: () => useState(mockTrashCount.value),
  };
});

vi.mock("@App/pages/store/features/script", () => ({
  scriptClient: { requestCheckUpdate: vi.fn() },
  fetchScriptList: vi.fn().mockResolvedValue([]),
  requestEnableScript: vi.fn().mockResolvedValue(undefined),
  requestRunScript: vi.fn().mockResolvedValue(undefined),
  requestStopScript: vi.fn().mockResolvedValue(undefined),
  requestDeleteScripts: vi.fn().mockResolvedValue(undefined),
  requestRestoreScripts: vi.fn().mockResolvedValue({ restored: [], conflicts: [] }),
  requestTrashScripts: vi.fn().mockResolvedValue([]),
  requestFilterResult: vi.fn().mockResolvedValue([]),
  sortScript: vi.fn().mockResolvedValue(undefined),
  pinToTop: vi.fn().mockResolvedValue(undefined),
}));

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@App/pages/store/global", async () => {
  const { createGlobalStoreMock } = await import("@Tests/mocks/pageStores.ts");
  return createGlobalStoreMock({
    systemConfig: {
      get,
      getLanguage: vi.fn().mockResolvedValue("zh-CN"),
      getFaviconService: vi.fn().mockResolvedValue("google"),
      set: vi.fn(),
    },
    messageQueue: { subscribe: vi.fn(() => vi.fn()), publish: vi.fn() },
    globalCache: new Map(),
    message: { send: vi.fn(), on: vi.fn() },
    systemClient: {},
  });
});

// Stub sub-trees with Radix Popper to avoid infinite setState loops in the DOM test environment.
// ScriptTable stub renders the view-toggle testid so desktop tests still work; it must forward
// `leading` (the tabs, per ScriptTableProps) since that's the only place index.tsx renders them.
vi.mock("./ScriptTable", () => ({
  default: ({ leading }: { leading?: ReactNode }) => <div data-testid="view-toggle">{leading}</div>,
}));
vi.mock("./ScriptCard", () => ({
  default: () => null,
}));
vi.mock("./ScriptCardGrid", () => ({
  default: () => <div data-testid="script-card-grid" />,
}));
vi.mock("./FilterBar", () => ({
  default: () => null,
}));
vi.mock("./CreateScriptMenu", () => ({
  CreateScriptMenu: () => null,
}));
vi.mock("./MobileSearchBar", () => ({
  MobileSearchBar: () => <div data-testid="mobile-search" />,
}));
// 两个桩都暴露一个「清空」按钮回报 onCountChange(0)：真实组件里彻底删除/清空只发生在组件内部，
// 外部只能通过这个回调感知归零，回落分支正是被它触发的。
vi.mock("./TrashTable", () => ({
  default: ({ leading, onCountChange }: { leading?: ReactNode; onCountChange?: (n: number) => void }) => (
    <div data-testid="trash-table">
      {leading}
      <button data-testid="purge-all" onClick={() => onCountChange?.(0)} />
    </div>
  ),
}));
vi.mock("./TrashCardGrid", () => ({
  default: ({ onCountChange }: { onCountChange?: (n: number) => void }) => (
    <div data-testid="trash-card-grid">
      <button data-testid="purge-all" onClick={() => onCountChange?.(0)} />
    </div>
  ),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const mockedUseIsMobile = vi.mocked(useIsMobile);

beforeAll(() => initTestLanguage("zh-CN"));

beforeEach(() => {
  mockMatchMedia(false);
  mockedUseIsMobile.mockReturnValue(false);
  mockTrashCount.value = 0;
  get.mockImplementation((key: string) => Promise.resolve(key === "trash_enabled" ? true : 30));
});

afterEach(() => {
  cleanup();
  localStorage.removeItem("script-list-view-mode");
});

const props = {
  scriptList: [],
  loadingList: false,
  updateScripts: vi.fn(),
  handleDelete: vi.fn(),
  handleRunStop: vi.fn(),
  searchRequest: { keyword: "", type: "auto" as const },
  setSearchRequest: vi.fn(),
  scriptListSortOrderMove: vi.fn(),
  filterItems: stableFilterItems,
  selectedFilters: { status: null, type: null, tags: null, source: null },
  setSelectedFilters: vi.fn(),
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("ScriptListMobile 移动版", () => {
  it("渲染移动搜索框,且不渲染表格/卡片视图切换", () => {
    const { getByTestId, queryByTestId } = renderWithRouter(<ScriptListMobile {...props} />);
    expect(getByTestId("mobile-search")).toBeInTheDocument();
    expect(queryByTestId("view-toggle")).toBeNull();
  });
});

describe("ScriptList 移动/桌面分支", () => {
  it("移动端忽略 localStorage 的 table 偏好,不渲染表格视图切换", () => {
    mockedUseIsMobile.mockReturnValue(true);
    localStorage.setItem("script-list-view-mode", "table");
    const { getByTestId, queryByTestId } = renderWithRouter(<ScriptList />);
    expect(getByTestId("mobile-search")).toBeInTheDocument();
    expect(queryByTestId("view-toggle")).toBeNull();
  });

  it("桌面端渲染含视图切换的桌面布局", () => {
    mockedUseIsMobile.mockReturnValue(false);
    const { getByTestId, queryByTestId } = renderWithRouter(<ScriptList />);
    expect(getByTestId("view-toggle")).toBeInTheDocument();
    expect(queryByTestId("mobile-search")).toBeNull();
  });
});

describe("回收站 tab 显隐", () => {
  const disableTrash = () =>
    get.mockImplementation((key: string) => Promise.resolve(key === "trash_enabled" ? false : 30));

  it("回收站开启但数量为 0 时桌面端不显示回收站 tab", async () => {
    renderWithRouter(<ScriptList />);

    await screen.findByRole("button", { name: /已安装/ });
    expect(screen.queryByRole("button", { name: /回收站/ })).not.toBeInTheDocument();
  });

  it("回收站数量大于 0 时桌面端显示回收站 tab", async () => {
    mockTrashCount.value = 1;
    renderWithRouter(<ScriptList />);

    expect(await screen.findByRole("button", { name: /回收站/ })).toBeInTheDocument();
  });

  it("回收站关闭且已清空时桌面端不显示回收站 tab", async () => {
    disableTrash();
    renderWithRouter(<ScriptList />);

    // 先等已安装 tab 落地，确保配置已异步到位，否则「查不到回收站」会是假阳性
    await screen.findByRole("button", { name: /已安装/ });
    expect(screen.queryByRole("button", { name: /回收站/ })).not.toBeInTheDocument();
  });

  it("回收站关闭但仍有残留条目时继续显示回收站 tab", async () => {
    disableTrash();
    mockTrashCount.value = 1;
    renderWithRouter(<ScriptList />);

    expect(await screen.findByRole("button", { name: /回收站/ })).toBeInTheDocument();
  });

  it("回收站关闭且已清空时移动端同样不显示回收站 tab", async () => {
    disableTrash();
    mockedUseIsMobile.mockReturnValue(true);
    renderWithRouter(<ScriptList />);

    await screen.findByRole("button", { name: /已安装/ });
    expect(screen.queryByRole("button", { name: /回收站/ })).not.toBeInTheDocument();
  });

  it("回收站开启但数量为 0 时移动端同样不显示回收站 tab", async () => {
    mockedUseIsMobile.mockReturnValue(true);
    renderWithRouter(<ScriptList />);

    await screen.findByRole("button", { name: /已安装/ });
    expect(screen.queryByRole("button", { name: /回收站/ })).not.toBeInTheDocument();
  });
});

// 关闭态下停在回收站 tab 时清空最后一条：tab 当场消失，页面不能停在一个已不存在的 tab 上
describe("回收站 tab 消失时回落到已安装", () => {
  const disableTrash = () =>
    get.mockImplementation((key: string) => Promise.resolve(key === "trash_enabled" ? false : 30));

  it("桌面端清空回收站后 tab 消失并回落到已安装", async () => {
    disableTrash();
    mockTrashCount.value = 1;
    renderWithRouter(<ScriptList />);

    fireEvent.click(await screen.findByRole("button", { name: /回收站/ }));
    expect(screen.getByTestId("trash-table")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("purge-all"));

    expect(screen.queryByRole("button", { name: /回收站/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId("trash-table")).not.toBeInTheDocument();
    expect(screen.getByTestId("view-toggle")).toBeInTheDocument();
  });

  it("移动端清空回收站后 tab 消失并回落到已安装", async () => {
    disableTrash();
    mockedUseIsMobile.mockReturnValue(true);
    mockTrashCount.value = 1;
    renderWithRouter(<ScriptList />);

    fireEvent.click(await screen.findByRole("button", { name: /回收站/ }));
    expect(screen.getByTestId("trash-card-grid")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("purge-all"));

    expect(screen.queryByRole("button", { name: /回收站/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId("trash-card-grid")).not.toBeInTheDocument();
    expect(screen.getByTestId("script-card-grid")).toBeInTheDocument();
  });
});
