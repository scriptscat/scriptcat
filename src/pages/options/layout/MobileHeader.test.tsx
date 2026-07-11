import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { cleanup, fireEvent } from "@testing-library/react";
import { t } from "@App/locales/locales";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { mockMatchMedia } from "@Tests/mockMatchMedia";
import { renderWithThemeRouter } from "@Tests/renderWithThemeRouter";
import MobileHeader from "./MobileHeader";

vi.mock("@App/pages/options/routes/ScriptList/importHandler", () => ({
  handleImportFiles: vi.fn(),
  handleImportUrls: vi.fn(),
}));
// MobileHeader 的 ☰ 抽屉(MobileNavDrawer)现会调用 useOnboarding,隔离渲染需提供桩
vi.mock("../onboarding/OnboardingProvider", () => ({
  useOnboarding: () => ({ start: () => {} }),
}));

beforeAll(() => initTestLanguage("zh-CN"));

beforeEach(() => {
  localStorage.clear();
  mockMatchMedia();
});

afterEach(cleanup);

function renderHeader() {
  return renderWithThemeRouter(<MobileHeader />);
}

describe("MobileHeader 移动顶栏", () => {
  it("渲染 ScriptCat 标题", () => {
    const { getByText } = renderHeader();
    expect(getByText("ScriptCat")).toBeInTheDocument();
  });

  it("渲染新建脚本图标按钮(带无障碍标签)", () => {
    const { getByLabelText } = renderHeader();
    expect(getByLabelText(t("script:create_script"))).toBeInTheDocument();
  });

  it("默认不展示导航抽屉内容", () => {
    const { queryByText } = renderHeader();
    expect(queryByText(t("agent:title"))).toBeNull();
  });

  it("点击菜单按钮(☰)打开导航抽屉,展示 AI Agent 等导航入口", () => {
    const { getByLabelText, getByText } = renderHeader();
    fireEvent.click(getByLabelText(t("menu")));
    expect(getByText(t("agent:title"))).toBeInTheDocument();
  });
});
