import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { initLanguage, t } from "@App/locales/locales";
import { ThemeProvider } from "@App/pages/components/theme-provider";
import Sidebar from "./Sidebar";

beforeEach(() => {
  localStorage.clear();
  initLanguage("zh-CN");
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
});

afterEach(cleanup);

function renderSidebar(initialPath = "/") {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Sidebar />
      </MemoryRouter>
    </ThemeProvider>
  );
}

const subLabels = () => [
  t("agent:chat"),
  t("agent:provider"),
  t("agent:skills"),
  t("agent:mcp"),
  t("agent:tasks"),
  t("agent:opfs"),
  t("agent:settings"),
];

describe("Sidebar 侧边栏 AI Agent 菜单", () => {
  it("渲染 AI Agent 子菜单入口", () => {
    const { getByText } = renderSidebar();
    expect(getByText(t("agent:title"))).toBeInTheDocument();
  });

  it("默认折叠,点击 AI Agent 后展开显示 7 个子项", () => {
    const { getByText, queryByTestId, getByTestId } = renderSidebar();
    expect(queryByTestId("sidebar-agent-submenu")).toBeNull();
    fireEvent.click(getByText(t("agent:title")));
    const submenu = getByTestId("sidebar-agent-submenu");
    for (const label of subLabels()) {
      expect(within(submenu).getByText(label)).toBeInTheDocument();
    }
  });

  it("处于 /agent 路由时自动展开且对应子项为激活态", () => {
    const { getByText } = renderSidebar("/agent/skills");
    const link = getByText(t("agent:skills")).closest("a");
    expect(link).toHaveAttribute("aria-current", "page");
  });
});
