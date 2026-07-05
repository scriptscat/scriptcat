import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { act, render, cleanup, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { t } from "@App/locales/locales";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { requestDeleteScripts } from "@App/pages/store/features/script";
import type { ScriptLoading } from "@App/pages/store/features/script";
import { SCRIPT_RUN_STATUS_COMPLETE, SCRIPT_STATUS_ENABLE, SCRIPT_TYPE_NORMAL } from "@App/app/repo/scripts";

// 列表数据 Hook 涉及 OPFS/favicon/后台消息等副作用，测试中整体打桩。
// 注意：返回值须为稳定引用，否则过滤 useEffect 依赖每次渲染都变化会触发无限重渲染。
const { mockScriptData, getScriptValue } = vi.hoisted(() => ({
  mockScriptData: {
    scriptList: [] as ScriptLoading[],
    setScriptList: vi.fn(),
    loadingList: false,
  },
  getScriptValue: vi.fn(),
}));
vi.mock("./hooks", () => {
  const filters = { stats: { tagMap: {}, originMap: {} }, filterItems: [] };
  return {
    useScriptDataManagement: () => mockScriptData,
    useScriptFilters: () => filters,
  };
});

// 业务请求打桩，重点观察 requestDeleteScripts 是否被调用
vi.mock("@App/pages/store/features/script", () => ({
  requestDeleteScripts: vi.fn(() => Promise.resolve()),
  requestEnableScript: vi.fn(),
  requestRunScript: vi.fn(),
  requestStopScript: vi.fn(),
  requestFilterResult: vi.fn(() => Promise.resolve([])),
  sortScript: vi.fn(),
  scriptClient: { requestCheckUpdate: vi.fn() },
  valueClient: { getScriptValue },
}));

// toast 仅做提示，打桩避免依赖全局 Toaster
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

// 用轻量替身替换重型子组件：暴露一个触发删除的按钮，调用容器传入的 handleDelete
const testScript = { uuid: "u1", name: "TestScript", metadata: {} };
vi.mock("./ScriptTable", () => ({
  default: (props: {
    handleDelete: (s: unknown) => void;
    toggleSelect: (uuid: string) => void;
    onBatchDelete: () => void;
    setViewMode: (mode: "table" | "card") => void;
    setSearchRequest: (req: { keyword: string; type: "auto" | "name" | "script_code" }) => void;
    setSelectedFilters: (updater: (prev: { status: unknown }) => { status: number }) => void;
    setSortState: (updater: (prev: { key: unknown; order: "asc" | "desc" }) => { key: "name"; order: "asc" }) => void;
  }) => (
    <>
      <button onClick={() => props.handleDelete(testScript)}>{"trigger-delete"}</button>
      <button onClick={() => props.toggleSelect("u1")}>{"trigger-select"}</button>
      <button onClick={() => props.onBatchDelete()}>{"trigger-batch-delete"}</button>
      <button onClick={() => props.setViewMode("card")}>{"trigger-view-mode"}</button>
      <button onClick={() => props.setSearchRequest({ keyword: "helper", type: "name" })}>{"trigger-search"}</button>
      <button onClick={() => props.setSelectedFilters((prev) => ({ ...prev, status: 1 }))}>{"trigger-filter"}</button>
      <button onClick={() => props.setSortState(() => ({ key: "name", order: "asc" }))}>{"trigger-sort"}</button>
    </>
  ),
}));
vi.mock("./ScriptCard", () => ({ default: () => null }));
vi.mock("./ScriptListMobile", () => ({ default: () => null }));
vi.mock("@App/pages/components/use-is-mobile", () => ({ useIsMobile: () => false }));

import ScriptList from "./index";
import { invalidateUserConfig, preloadUserConfig } from "./preload";
import { SCRIPT_LIST_PREFERENCES_KEY, SCRIPT_LIST_VIEW_MODE_KEY } from "./preferences";

beforeAll(() => initTestLanguage("zh-CN"));

beforeEach(() => {
  mockScriptData.scriptList = [];
  mockScriptData.setScriptList = vi.fn();
  mockScriptData.loadingList = false;
  getScriptValue.mockReset();
  getScriptValue.mockResolvedValue({});
  localStorage.removeItem(SCRIPT_LIST_PREFERENCES_KEY);
  localStorage.removeItem(SCRIPT_LIST_VIEW_MODE_KEY);
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  invalidateUserConfig();
});

// 二次确认已下沉到行内/批量栏的 Popconfirm（见 components.test / BatchActionsBar.test），
// 此处只校验容器层：handleDelete / onBatchDelete 触发后按 uuid 调用删除接口。
describe("脚本列表删除接口调用", () => {
  it("handleDelete 触发后按 uuid 调用删除接口", async () => {
    render(<ScriptList />, { wrapper: MemoryRouter });
    expect(requestDeleteScripts).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("trigger-delete"));

    expect(requestDeleteScripts).toHaveBeenCalledWith(["u1"]);
  });

  it("批量删除按选中的 uuid 调用删除接口", async () => {
    render(<ScriptList />, { wrapper: MemoryRouter });
    fireEvent.click(screen.getByText("trigger-select")); // 选中 1 项
    fireEvent.click(screen.getByText("trigger-batch-delete"));

    expect(requestDeleteScripts).toHaveBeenCalledWith(["u1"]);
  });

  it("未选中任何脚本时批量删除不调用删除接口", () => {
    render(<ScriptList />, { wrapper: MemoryRouter });
    fireEvent.click(screen.getByText("trigger-batch-delete"));
    expect(requestDeleteScripts).not.toHaveBeenCalled();
  });
});

describe("脚本列表用户配置弹窗", () => {
  it("行内预加载后深链打开应复用同一份脚本值", async () => {
    mockScriptData.scriptList = [
      {
        uuid: "u1",
        name: "TestScript",
        namespace: "",
        metadata: {},
        config: { 基本设置: { apiUrl: { title: "API 地址", description: "", type: "text", index: 0 } } },
        type: SCRIPT_TYPE_NORMAL,
        status: SCRIPT_STATUS_ENABLE,
        sort: 0,
        runStatus: SCRIPT_RUN_STATUS_COMPLETE,
        createtime: 0,
        checktime: 0,
      },
    ];
    await preloadUserConfig(mockScriptData.scriptList[0]);

    render(
      <MemoryRouter initialEntries={["/?userConfig=u1"]}>
        <ScriptList />
      </MemoryRouter>
    );

    expect(await screen.findByText("TestScript")).toBeInTheDocument();
    expect(getScriptValue).toHaveBeenCalledOnce();
  });

  it("从 userConfig 深链打开后点击取消，不应因旧 URL 状态再次弹出", async () => {
    mockScriptData.scriptList = [
      {
        uuid: "u1",
        name: "TestScript",
        namespace: "",
        metadata: {},
        config: {
          基本设置: {
            apiUrl: { title: "API 地址", description: "", type: "text", index: 0 },
          },
        },
        type: SCRIPT_TYPE_NORMAL,
        status: SCRIPT_STATUS_ENABLE,
        sort: 0,
        runStatus: SCRIPT_RUN_STATUS_COMPLETE,
        createtime: 0,
        checktime: 0,
      },
    ];

    render(
      <MemoryRouter initialEntries={["/?userConfig=u1"]}>
        <ScriptList />
      </MemoryRouter>
    );

    expect(await screen.findByText("TestScript")).toBeInTheDocument();

    await act(async () => fireEvent.click(screen.getByText(t("editor:cancel"), { selector: "button" })));

    expect(screen.queryByText("TestScript")).toBeNull();
  });
});

describe("脚本列表偏好持久化", () => {
  it("更改视图、搜索、筛选与列排序后写入 localStorage", () => {
    render(<ScriptList />, { wrapper: MemoryRouter });

    fireEvent.click(screen.getByText("trigger-search"));
    fireEvent.click(screen.getByText("trigger-filter"));
    fireEvent.click(screen.getByText("trigger-sort"));
    fireEvent.click(screen.getByText("trigger-view-mode"));

    expect(localStorage.getItem(SCRIPT_LIST_VIEW_MODE_KEY)).toBe("card");
    expect(JSON.parse(localStorage.getItem(SCRIPT_LIST_PREFERENCES_KEY) || "{}")).toEqual({
      viewMode: "card",
      selectedFilters: { status: 1, type: null, tags: null, source: null },
      searchRequest: { keyword: "helper", type: "name" },
      sortState: { key: "name", order: "asc" },
    });
  });
});
