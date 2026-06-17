import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { initLanguage } from "@App/locales/locales";
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

vi.mock("./hooks", () => ({
  useScriptDataManagement: () => ({
    scriptList: stableScriptList,
    setScriptList: stableSetScriptList,
    loadingList: false,
  }),
  useScriptFilters: () => ({ stats: stableStats, filterItems: stableFilterItems }),
}));

vi.mock("@App/pages/store/features/script", () => ({
  scriptClient: { requestCheckUpdate: vi.fn() },
  fetchScriptList: vi.fn().mockResolvedValue([]),
  requestEnableScript: vi.fn().mockResolvedValue(undefined),
  requestRunScript: vi.fn().mockResolvedValue(undefined),
  requestStopScript: vi.fn().mockResolvedValue(undefined),
  requestDeleteScripts: vi.fn().mockResolvedValue(undefined),
  requestFilterResult: vi.fn().mockResolvedValue([]),
  sortScript: vi.fn().mockResolvedValue(undefined),
  pinToTop: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@App/pages/store/global", () => ({
  messageQueue: { subscribe: vi.fn(() => vi.fn()), publish: vi.fn() },
  systemConfig: {
    getLanguage: vi.fn().mockResolvedValue("zh-CN"),
    getFaviconService: vi.fn().mockResolvedValue("google"),
  },
  globalCache: new Map(),
  message: { send: vi.fn(), on: vi.fn() },
  systemClient: {},
  subscribeMessage: vi.fn(() => vi.fn()),
}));

// Stub sub-trees with Radix Popper to avoid infinite setState loops in jsdom.
// ScriptTable stub renders the view-toggle testid so desktop tests still work.
vi.mock("./ScriptTable", () => ({
  default: () => <div data-testid="view-toggle" />,
}));
vi.mock("./ScriptCard", () => ({
  default: () => null,
}));
vi.mock("./ScriptCardGrid", () => ({
  default: () => null,
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

// ── Helpers ──────────────────────────────────────────────────────────────────

const mockedUseIsMobile = vi.mocked(useIsMobile);

beforeEach(() => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
  mockedUseIsMobile.mockReturnValue(false);
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
    initLanguage("zh-CN");
    const { getByTestId, queryByTestId } = render(
      <MemoryRouter>
        <ScriptListMobile {...props} />
      </MemoryRouter>
    );
    expect(getByTestId("mobile-search")).toBeInTheDocument();
    expect(queryByTestId("view-toggle")).toBeNull();
  });
});

describe("ScriptList 移动/桌面分支", () => {
  it("移动端忽略 localStorage 的 table 偏好,不渲染表格视图切换", () => {
    mockedUseIsMobile.mockReturnValue(true);
    initLanguage("zh-CN");
    localStorage.setItem("script-list-view-mode", "table");
    const { getByTestId, queryByTestId } = render(
      <MemoryRouter>
        <ScriptList />
      </MemoryRouter>
    );
    expect(getByTestId("mobile-search")).toBeInTheDocument();
    expect(queryByTestId("view-toggle")).toBeNull();
  });

  it("桌面端渲染含视图切换的桌面布局", () => {
    mockedUseIsMobile.mockReturnValue(false);
    initLanguage("zh-CN");
    const { getByTestId, queryByTestId } = render(
      <MemoryRouter>
        <ScriptList />
      </MemoryRouter>
    );
    expect(getByTestId("view-toggle")).toBeInTheDocument();
    expect(queryByTestId("mobile-search")).toBeNull();
  });
});
