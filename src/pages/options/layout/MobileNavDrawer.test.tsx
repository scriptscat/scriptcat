import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { initLanguage, t } from "@App/locales/locales";
import { ThemeProvider } from "@App/pages/components/theme-provider";
import MobileNavDrawer from "./MobileNavDrawer";

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

function renderDrawer(initialPath = "/", onNavigate = () => {}) {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <MobileNavDrawer onNavigate={onNavigate} />
      </MemoryRouter>
    </ThemeProvider>
  );
}

const agentSubLabels = () => [
  t("agent:chat"),
  t("agent:provider"),
  t("agent:skills"),
  t("agent:mcp"),
  t("agent:tasks"),
  t("agent:opfs"),
  t("agent:settings"),
];

describe("MobileNavDrawer 移动导航抽屉", () => {
  it("默认展开,渲染主导航 / AI Agent 分组(7 子项) / 辅助导航全部入口", () => {
    const { getByText, getByTestId } = renderDrawer();
    // 主导航
    expect(getByText(t("script:installed_scripts"))).toBeInTheDocument();
    expect(getByText(t("script:subscribe"))).toBeInTheDocument();
    // AI Agent 分组标题
    expect(getByText(t("agent:title"))).toBeInTheDocument();
    // Agent 7 子项默认全部可见
    const submenu = getByTestId("drawer-agent-submenu");
    for (const label of agentSubLabels()) {
      expect(within(submenu).getByText(label)).toBeInTheDocument();
    }
    // 辅助导航
    expect(getByText(t("logs"))).toBeInTheDocument();
    expect(getByText(t("tools"))).toBeInTheDocument();
  });

  it("点击 AI Agent 分组标题可折叠子项,再次点击重新展开", () => {
    const { getByText, queryByTestId, getByTestId } = renderDrawer();
    expect(getByTestId("drawer-agent-submenu")).toBeInTheDocument();
    fireEvent.click(getByText(t("agent:title")));
    expect(queryByTestId("drawer-agent-submenu")).toBeNull();
    fireEvent.click(getByText(t("agent:title")));
    expect(getByTestId("drawer-agent-submenu")).toBeInTheDocument();
  });

  it("点击任一导航项触发 onNavigate(用于跳转后关闭抽屉)", () => {
    const onNavigate = vi.fn();
    const { getByText } = renderDrawer("/", onNavigate);
    fireEvent.click(getByText(t("agent:skills")));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("当前路由对应的导航项标记为激活态(aria-current)", () => {
    const { getByText } = renderDrawer("/agent/skills");
    const link = getByText(t("agent:skills")).closest("a");
    expect(link).toHaveAttribute("aria-current", "page");
  });
});
