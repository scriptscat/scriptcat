import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { SCRIPT_STATUS_ENABLE } from "@App/app/repo/scripts";
import FilterBar from "./FilterBar";

beforeAll(() => initTestLanguage("zh-CN"));

afterEach(cleanup);

describe("FilterBar 国际化", () => {
  it("状态筛选 Chip 应显示中文翻译而非原始 i18n key", () => {
    const { container } = render(
      <FilterBar
        filterItems={{ statusItems: [], typeItems: [], tagItems: [], sourceItems: [] }}
        selectedFilters={{ status: null, type: null, tags: null, source: null }}
        setSelectedFilters={() => {}}
      />
    );

    // script_list.sidebar.* 的 key 存放在 script 命名空间，必须带 "script:" 前缀才能解析
    expect(container.textContent).toContain("状态");
    expect(container.textContent).not.toContain("script_list.sidebar.status");
  });

  it("chip 行可横向滚动,清除按钮固定在滚动区之外", () => {
    const { container } = render(
      <FilterBar
        filterItems={{ statusItems: [], typeItems: [], tagItems: [], sourceItems: [] }}
        selectedFilters={{ status: SCRIPT_STATUS_ENABLE, type: null, tags: null, source: null }}
        setSelectedFilters={() => {}}
      />
    );
    // chip 行包裹在独立的横向滚动容器里
    const scroller = container.querySelector(".overflow-x-auto");
    expect(scroller).not.toBeNull();
    // 「清除筛选」按钮在滚动容器之外(不会被横向滚动顶出可视区)
    const clearBtn = screen.getByText("清除筛选");
    expect(scroller!.contains(clearBtn)).toBe(false);
  });
});
