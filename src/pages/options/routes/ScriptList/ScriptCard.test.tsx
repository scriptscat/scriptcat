import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { t } from "@App/locales/locales";
import { initTestLanguage } from "@Tests/initTestLanguage";
import ScriptCard from "./ScriptCard";

vi.mock("@App/pages/store/features/script", () => ({
  requestEnableScript: vi.fn(),
  requestFilterResult: vi.fn(),
}));

vi.mock("./importHandler", () => ({
  handleImportFiles: vi.fn(),
  handleImportUrls: vi.fn(),
}));

beforeAll(() => initTestLanguage("zh-CN"));

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
    render(
      <MemoryRouter>
        <ScriptCard {...baseProps} />
      </MemoryRouter>
    );
    expect(screen.getByText(t("script:create_script"))).toBeInTheDocument();
  });
});
