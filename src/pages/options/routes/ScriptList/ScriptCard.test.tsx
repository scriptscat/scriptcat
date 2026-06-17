import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { initLanguage, t } from "@App/locales/locales";
import ScriptCard from "./ScriptCard";

afterEach(cleanup);

const baseProps = {
  scriptList: [],
  loadingList: false,
  updateScripts: vi.fn(),
  handleDelete: vi.fn(),
  handleRunStop: vi.fn(),
  setViewMode: vi.fn(),
  searchRequest: { keyword: "", type: "auto" as const },
  setSearchRequest: vi.fn(),
  totalCount: 0,
  scriptListSortOrderMove: vi.fn(),
  filterItems: { statusItems: [], typeItems: [], tagItems: [], sourceItems: [] },
  selectedFilters: { status: null, type: null, tags: null, source: null },
  setSelectedFilters: vi.fn(),
};

describe("ScriptCard 卡片视图顶栏", () => {
  it("卡片模式也应显示「新建脚本」按钮", () => {
    initLanguage("zh-CN");
    render(
      <MemoryRouter>
        <ScriptCard {...baseProps} />
      </MemoryRouter>
    );
    expect(screen.getByText(t("script:create_script"))).toBeInTheDocument();
  });
});
