// @vitest-environment happy-dom
import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { t } from "@App/locales/locales";
import { initTestLanguage } from "@Tests/initTestLanguage";
import ScriptCardGrid from "./ScriptCardGrid";

beforeAll(() => initTestLanguage("zh-CN"));

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
    const { getByText } = render(
      <MemoryRouter>
        <ScriptCardGrid {...baseProps} />
      </MemoryRouter>
    );
    expect(getByText(t("no_scripts"))).toBeInTheDocument();
  });

  it("loading 时显示加载态", () => {
    const { getByText } = render(
      <MemoryRouter>
        <ScriptCardGrid {...baseProps} loadingList />
      </MemoryRouter>
    );
    expect(getByText(t("loading"))).toBeInTheDocument();
  });
});
