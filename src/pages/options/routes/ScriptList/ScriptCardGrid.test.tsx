// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { initLanguage, t } from "@App/locales/locales";
import ScriptCardGrid from "./ScriptCardGrid";

afterEach(cleanup);

const baseProps = {
  scriptList: [],
  loadingList: false,
  updateScripts: vi.fn(),
  handleDelete: vi.fn(),
  handleRunStop: vi.fn(),
  scriptListSortOrderMove: vi.fn(),
};

describe("ScriptCardGrid 卡片网格", () => {
  it("空列表时显示「暂无脚本」", () => {
    initLanguage("zh-CN");
    const { getByText } = render(
      <MemoryRouter>
        <ScriptCardGrid {...baseProps} />
      </MemoryRouter>
    );
    expect(getByText(t("no_scripts", { defaultValue: "暂无脚本" }))).toBeInTheDocument();
  });

  it("loading 时显示加载态", () => {
    initLanguage("zh-CN");
    const { getByText } = render(
      <MemoryRouter>
        <ScriptCardGrid {...baseProps} loadingList />
      </MemoryRouter>
    );
    expect(getByText(t("loading", { defaultValue: "加载中..." }))).toBeInTheDocument();
  });
});
