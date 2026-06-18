// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { initLanguage, t } from "@App/locales/locales";
import { SCRIPT_STATUS_ENABLE, SCRIPT_TYPE_NORMAL } from "@App/app/repo/scripts";
import type { ScriptLoading } from "@App/pages/store/features/script";
import { TooltipProvider } from "@App/pages/components/ui/tooltip";

// 行内开关会触发后台消息，打桩；其余子组件（顶栏/筛选栏/批量栏）与排序无关，置空以隔离测试。
vi.mock("@App/pages/store/features/script", () => ({
  requestEnableScript: vi.fn(() => Promise.resolve()),
  scriptClient: { requestCheckUpdate: vi.fn() },
}));
vi.mock("./Toolbar", () => ({ Toolbar: () => null }));
vi.mock("./FilterBar", () => ({ default: () => null }));
vi.mock("./BatchActionsBar", () => ({ default: () => null }));

import ScriptTable from "./ScriptTable";

beforeEach(() => initLanguage("zh-CN"));
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

const renderTable = (scriptList: ScriptLoading[]) =>
  render(
    <MemoryRouter>
      <TooltipProvider>
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
        />
      </TooltipProvider>
    </MemoryRouter>
  );

// 取出脚本名链接（href 指向编辑器）的文本顺序，即可见行顺序
const renderedOrder = () =>
  Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/script/editor/"]')).map((a) => a.textContent);

describe("ScriptTable 列头点击排序", () => {
  // 自然顺序：B、A、C
  const list = [mk("b", "Banana", 30), mk("a", "Apple", 10), mk("c", "Cherry", 20)];

  it("点击「名称」表头在 升序 → 降序 → 关闭 之间循环", () => {
    renderTable(list);
    expect(renderedOrder()).toEqual(["Banana", "Apple", "Cherry"]);

    const nameHeader = screen.getByRole("button", { name: t("name") });
    fireEvent.click(nameHeader); // 升序
    expect(renderedOrder()).toEqual(["Apple", "Banana", "Cherry"]);

    fireEvent.click(nameHeader); // 降序
    expect(renderedOrder()).toEqual(["Cherry", "Banana", "Apple"]);

    fireEvent.click(nameHeader); // 关闭，回到自然顺序
    expect(renderedOrder()).toEqual(["Banana", "Apple", "Cherry"]);
  });

  it("点击「最后更新」表头按更新时间升序排列", () => {
    renderTable(list);
    fireEvent.click(screen.getByRole("button", { name: t("logs:last_updated") }));
    // updatetime: A=10, C=20, B=30
    expect(renderedOrder()).toEqual(["Apple", "Cherry", "Banana"]);
  });

  it("排序激活时禁用手动拖拽（不再渲染可拖拽手柄）", () => {
    renderTable(list);
    // 未排序时每行都有可拖拽手柄
    expect(document.querySelectorAll(".cursor-grab").length).toBe(list.length);

    fireEvent.click(screen.getByRole("button", { name: t("name") }));
    expect(document.querySelectorAll(".cursor-grab").length).toBe(0);
  });
});
