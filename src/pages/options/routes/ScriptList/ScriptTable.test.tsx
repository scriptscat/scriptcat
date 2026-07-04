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
vi.mock("./BatchActionsBar", () => ({ default: () => null }));

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
}: {
  scriptList: ScriptLoading[];
  initialSortState?: SortState;
}) => {
  const [sortState, setSortState] = useState<SortState>(initialSortState);
  return (
    <ScriptTable
      scriptList={scriptList}
      loadingList={false}
      updateScripts={noop}
      handleDelete={noop}
      handleRunStop={() => Promise.resolve()}
      setViewMode={noop}
      searchRequest={{ keyword: "", type: "auto" }}
      setSearchRequest={noop}
      totalCount={scriptList.length}
      scriptListSortOrderMove={noop}
      filterItems={{ statusItems: [], typeItems: [], tagItems: [], sourceItems: [] }}
      selectedFilters={{ status: null, type: null, tags: null, source: null }}
      setSelectedFilters={noop}
      selectedUuids={new Set()}
      toggleSelect={noop}
      toggleSelectAll={noop}
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

describe("ScriptTable 列头点击排序", () => {
  // 自然顺序：B、A、C
  const list = [mk("b", "Banana", 30), mk("a", "Apple", 10), mk("c", "Cherry", 20)];

  it("点击「名称」表头在 升序 → 降序 → 关闭 之间循环", () => {
    renderTable(list);
    expect(renderedOrder()).toEqual(["Banana", "Apple", "Cherry"]);

    const nameHeader = screen.getByText(t("name")).closest("button")!;
    fireEvent.click(nameHeader); // 升序
    expect(renderedOrder()).toEqual(["Apple", "Banana", "Cherry"]);

    fireEvent.click(nameHeader); // 降序
    expect(renderedOrder()).toEqual(["Cherry", "Banana", "Apple"]);

    fireEvent.click(nameHeader); // 关闭，回到自然顺序
    expect(renderedOrder()).toEqual(["Banana", "Apple", "Cherry"]);
  });

  it("点击「最后更新」表头按更新时间升序排列", () => {
    renderTable(list);
    fireEvent.click(screen.getByText(t("logs:last_updated")).closest("button")!);
    // updatetime: A=10, C=20, B=30
    expect(renderedOrder()).toEqual(["Apple", "Cherry", "Banana"]);
  });

  it("从外部排序状态恢复上次的列排序", () => {
    renderTable(list, { key: "updatetime", order: "desc" });
    expect(renderedOrder()).toEqual(["Banana", "Cherry", "Apple"]);
  });

  it("排序激活时禁用手动拖拽（不再渲染可拖拽手柄）", () => {
    renderTable(list);
    // 未排序时每行都有可拖拽手柄
    expect(document.querySelectorAll(".cursor-grab").length).toBe(list.length);

    fireEvent.click(screen.getByText(t("name")).closest("button")!);
    expect(document.querySelectorAll(".cursor-grab").length).toBe(0);
  });
});

describe("ScriptTable 英文列头布局", () => {
  it("状态列为 Status 文本和排序图标保留完整宽度", () => {
    initTestLanguage("en-US");
    renderTable([mk("a", "Apple", 10)]);

    const statusColumn = document.querySelector('[data-tour="col-enable"]');
    expect(statusColumn).toHaveClass("w-16");
  });

  it("状态列表头居中且开关列不额外偏移", () => {
    initTestLanguage("zh-CN");
    renderTable([mk("a", "Apple", 10)]);

    expect(screen.getByRole("button", { name: t("script:script_list.sidebar.status") })).toHaveClass("justify-center");
    expect(document.querySelector('[data-tour="col-enable"]')).toHaveClass("text-center");

    const switchColumn = screen.getByRole("switch").parentElement;
    expect(switchColumn).toHaveClass("w-16", "flex");
    expect(switchColumn).not.toHaveClass("justify-center");
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
