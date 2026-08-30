import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { cleanup, screen, fireEvent, render } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@App/pages/components/ui/tooltip";
import { t } from "@App/locales/locales";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { renderWithRouterTooltip } from "@Tests/renderWithTooltip";
import { SCRIPT_STATUS_ENABLE, SCRIPT_TYPE_NORMAL } from "@App/app/repo/scripts";
import type { ScriptLoading } from "@App/pages/store/features/script";
import type { SortState } from "./sort";

// 行内开关会触发后台消息，打桩；其余子组件（顶栏/筛选栏/批量栏）与排序无关，置空以隔离测试。
vi.mock("@App/pages/store/features/script", async () => {
  const { createScriptStoreMock } = await import("@Tests/mocks/pageStores.ts");
  return createScriptStoreMock({
    requestEnableScript: vi.fn(() => Promise.resolve()),
    scriptClient: { requestCheckUpdate: vi.fn() },
  });
});
vi.mock("./Toolbar", () => ({ Toolbar: () => null }));
vi.mock("./FilterBar", () => ({ default: () => null }));
vi.mock("./BatchActionsBar", () => ({
  default: ({ allSelected, onToggleSelectAll }: { allSelected: boolean; onToggleSelectAll: () => void }) => (
    <button data-testid="batch-bar-select-all" data-all-selected={allSelected} onClick={onToggleSelectAll} />
  ),
}));

import ScriptTable from "./ScriptTable";

beforeAll(() => initTestLanguage("zh-CN"));
afterEach(cleanup);

const mk = (uuid: string, name: string, updatetime: number): ScriptLoading =>
  ({
    uuid,
    name,
    metadata: {},
    type: SCRIPT_TYPE_NORMAL,
    status: SCRIPT_STATUS_ENABLE,
    sort: 0,
    updatetime,
  }) as ScriptLoading;

const noop = () => {};

const TableHarness = ({
  scriptList,
  initialSortState = { key: null, order: "asc" },
  toggleSelectAll = noop,
  selectedUuids = new Set<string>(),
}: {
  scriptList: ScriptLoading[];
  initialSortState?: SortState;
  toggleSelectAll?: () => void;
  selectedUuids?: Set<string>;
}) => {
  const [sortState, setSortState] = useState<SortState>(initialSortState);
  return (
    <ScriptTable
      scriptList={scriptList}
      loadingList={false}
      updateScripts={noop}
      handleDelete={noop}
      handleRunStop={() => Promise.resolve()}
      searchRequest={{ keyword: "", type: "auto" }}
      setSearchRequest={noop}
      totalCount={scriptList.length}
      scriptListSortOrderMove={noop}
      filterItems={{ statusItems: [], typeItems: [], tagItems: [], sourceItems: [] }}
      selectedFilters={{ status: null, type: null, tags: null, source: null }}
      setSelectedFilters={noop}
      selectedUuids={selectedUuids}
      toggleSelect={noop}
      toggleSelectAll={toggleSelectAll}
      clearSelection={noop}
      onBatchEnable={noop}
      onBatchDisable={noop}
      onBatchExport={noop}
      onBatchDelete={noop}
      onBatchPinTop={noop}
      onBatchCheckUpdate={noop}
      sortState={sortState}
      setSortState={setSortState}
    />
  );
};

const tableEl = (scriptList: ScriptLoading[], initialSortState?: SortState) => (
  <TableHarness scriptList={scriptList} initialSortState={initialSortState} />
);

const renderTable = (scriptList: ScriptLoading[], initialSortState?: SortState) =>
  renderWithRouterTooltip(tableEl(scriptList, initialSortState));

// 取出脚本名链接（href 指向编辑器）的文本顺序，即可见行顺序
const renderedOrder = () =>
  Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/script/editor/"]')).map((a) => a.textContent);

// 表头随列表化移除后，排序的三态循环归 SortMenu 所有（见 SortMenu.test.tsx）；
// 这里只覆盖 ScriptTable 自己的契约：给定排序状态时行的渲染顺序与拖拽可用性。
describe("ScriptTable 按排序状态渲染", () => {
  // 自然顺序：B、A、C
  const list = [mk("b", "Banana", 30), mk("a", "Apple", 10), mk("c", "Cherry", 20)];

  it("未排序时保持拖拽得到的自然顺序", () => {
    renderTable(list);
    expect(renderedOrder()).toEqual(["Banana", "Apple", "Cherry"]);
  });

  it("按名称升序与降序分别渲染对应顺序", () => {
    renderTable(list, { key: "name", order: "asc" });
    expect(renderedOrder()).toEqual(["Apple", "Banana", "Cherry"]);

    cleanup();
    renderTable(list, { key: "name", order: "desc" });
    expect(renderedOrder()).toEqual(["Cherry", "Banana", "Apple"]);
  });

  it("按更新时间排序", () => {
    renderTable(list, { key: "updatetime", order: "asc" });
    // updatetime: A=10, C=20, B=30
    expect(renderedOrder()).toEqual(["Apple", "Cherry", "Banana"]);
  });

  it("排序激活时禁用手动拖拽，未排序时每行都有拖拽手柄", () => {
    renderTable(list);
    expect(document.querySelectorAll(".cursor-grab").length).toBe(list.length);

    cleanup();
    renderTable(list, { key: "name", order: "asc" });
    expect(document.querySelectorAll(".cursor-grab").length).toBe(0);
  });
});

describe("ScriptTable 全选入口", () => {
  const twoScripts = [mk("a", "Apple", 10), mk("b", "Banana", 20)];

  it("列表顶部没有独立全选行，可见复选框只有每行一个", () => {
    initTestLanguage("zh-CN");
    // BatchActionsBar 已被替身取代，故此处若还出现全选框，就只可能来自列表自己渲染的独立全选行
    renderWithRouterTooltip(<TableHarness scriptList={twoScripts} />);

    expect(screen.queryByLabelText(t("script:select_all"))).toBeNull();
    expect(screen.getAllByRole("checkbox")).toHaveLength(twoScripts.length);
  });

  it("全选状态与回调交给批量操作条", () => {
    initTestLanguage("zh-CN");
    const onToggleAll = vi.fn();
    renderWithRouterTooltip(<TableHarness scriptList={twoScripts} toggleSelectAll={onToggleAll} />);

    const slot = screen.getByTestId("batch-bar-select-all");
    expect(slot).toHaveAttribute("data-all-selected", "false");
    fireEvent.click(slot);
    expect(onToggleAll).toHaveBeenCalled();
  });

  it("全部脚本被选中时批量操作条收到全选态", () => {
    initTestLanguage("zh-CN");
    renderWithRouterTooltip(
      <TableHarness scriptList={twoScripts} selectedUuids={new Set(twoScripts.map((s) => s.uuid))} />
    );

    expect(screen.getByTestId("batch-bar-select-all")).toHaveAttribute("data-all-selected", "true");
  });
});

describe("ScriptTable 新手引导锚点", () => {
  it("表头移除后，引导锚点落在行内的开关与操作区上", () => {
    initTestLanguage("zh-CN");
    renderTable([mk("a", "Apple", 10)]);

    const enableAnchor = document.querySelector('[data-tour="row-enable"]');
    const actionAnchor = document.querySelector('[data-tour="row-action"]');

    expect(enableAnchor).not.toBeNull();
    expect(enableAnchor!.querySelector('[role="switch"]')).not.toBeNull();
    expect(actionAnchor).not.toBeNull();
    expect(actionAnchor!.querySelectorAll("button").length).toBeGreaterThan(0);
  });
});

describe("ScriptTable 行级 memo 不会展示过期数据", () => {
  // 关键：updatetime 不变（如 selfMetadata/tag/版本等被原地更新时不一定 bump updatetime），
  // 但脚本对象内容变了，行必须重新渲染显示最新内容，否则用户看到旧数据。
  const withVersion = (v: string): ScriptLoading =>
    ({ ...mk("a", "Apple", 10), metadata: { version: [v] } }) as ScriptLoading;

  it("脚本对象内容变化但 updatetime 不变时，行应重新渲染显示最新版本", () => {
    const { rerender } = render(
      <MemoryRouter>
        <TooltipProvider>{tableEl([withVersion("1.0.0")])}</TooltipProvider>
      </MemoryRouter>
    );
    expect(screen.getByText(/v1\.0\.0/)).toBeInTheDocument();

    // 同一 ScriptTable 实例下更新 scriptList：新对象引用、相同 updatetime、不同版本
    rerender(
      <MemoryRouter>
        <TooltipProvider>{tableEl([withVersion("2.0.0")])}</TooltipProvider>
      </MemoryRouter>
    );
    expect(screen.getByText(/v2\.0\.0/)).toBeInTheDocument();
    expect(screen.queryByText(/v1\.0\.0/)).toBeNull();
  });
});
