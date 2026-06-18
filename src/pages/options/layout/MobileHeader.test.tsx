// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { initLanguage, t } from "@App/locales/locales";
import { ThemeProvider } from "@App/pages/components/theme-provider";
import MobileHeader from "./MobileHeader";

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

function renderHeader() {
  return render(
    <ThemeProvider>
      <MemoryRouter>
        <MobileHeader />
      </MemoryRouter>
    </ThemeProvider>
  );
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

  it("点击菜单按钮(☰)打开导航抽屉,展示 AI Agent 等导航入口", async () => {
    const { getByLabelText, findByText } = renderHeader();
    fireEvent.click(getByLabelText(t("menu")));
    expect(await findByText(t("agent:title"))).toBeInTheDocument();
  });
});
