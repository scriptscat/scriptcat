import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { t } from "@App/locales/locales";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { renderWithRouterTooltip } from "@Tests/renderWithTooltip";
import { SCRIPT_RUN_STATUS_COMPLETE, SCRIPT_STATUS_ENABLE, SCRIPT_TYPE_NORMAL } from "@App/app/repo/scripts";
import type { ScriptLoading } from "@App/pages/store/features/script";
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

const script = {
  uuid: "u1",
  name: "示例脚本",
  namespace: "test",
  metadata: { version: ["1.0.0"] },
  type: SCRIPT_TYPE_NORMAL,
  status: SCRIPT_STATUS_ENABLE,
  sort: 0,
  runStatus: SCRIPT_RUN_STATUS_COMPLETE,
  createtime: 1700000000000,
  updatetime: 1700000000000,
  checktime: 1700000000000,
} satisfies ScriptLoading;

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

  it("脚本卡片复用 Surface 承载面", () => {
    renderWithRouterTooltip(<ScriptCardGrid {...baseProps} scriptList={[script]} />);

    const card = screen.getByTestId("script-card");
    expect(card).toHaveAttribute("data-slot", "surface");
    expect(card).toHaveTextContent("示例脚本");
  });
});
