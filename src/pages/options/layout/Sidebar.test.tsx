import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { cleanup, fireEvent, within } from "@testing-library/react";
import { t } from "@App/locales/locales";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { mockMatchMedia } from "@Tests/mockMatchMedia";
import { renderWithThemeRouter } from "@Tests/renderWithThemeRouter";
import Sidebar from "./Sidebar";

const start = vi.fn();
vi.mock("../onboarding/OnboardingProvider", () => ({
  useOnboarding: () => ({ start }),
}));

beforeAll(() => initTestLanguage("zh-CN"));

beforeEach(() => {
  localStorage.clear();
  mockMatchMedia();
  start.mockReset();
});

afterEach(cleanup);

function renderSidebar(initialPath = "/") {
  return renderWithThemeRouter(<Sidebar />, { initialEntries: [initialPath] });
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

describe("Sidebar 帮助中心", () => {
  it("悬浮帮助中心后点「新手引导」应调用 start", () => {
    const { getByText, getByRole } = renderSidebar();
    // 帮助中心为 hover 触发的二级菜单（useHoverMenu），用 mouseEnter 打开
    fireEvent.mouseEnter(getByText(t("helpcenter")).closest("button")!);
    fireEvent.click(getByRole("menuitem", { name: t("guide:title") }));
    expect(start).toHaveBeenCalled();
  });
});
