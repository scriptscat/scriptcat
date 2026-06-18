// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { initLanguage, t } from "@App/locales/locales";
import BottomTabBar from "./BottomTabBar";

afterEach(cleanup);

describe("BottomTabBar 底部导航", () => {
  it("渲染脚本/订阅/日志/工具/设置五个导航项", () => {
    initLanguage("zh-CN");
    const { getByTestId } = render(
      <MemoryRouter initialEntries={["/"]}>
        <BottomTabBar />
      </MemoryRouter>
    );
    const bar = getByTestId("bottom-tab-bar");
    for (const label of [t("script:nav_scripts"), t("script:subscribe"), t("logs"), t("tools"), t("settings")]) {
      expect(within(bar).getByText(label)).toBeInTheDocument();
    }
  });

  it("当前路由对应项为激活态(aria-current=page)", () => {
    initLanguage("zh-CN");
    const { getByText } = render(
      <MemoryRouter initialEntries={["/logs"]}>
        <BottomTabBar />
      </MemoryRouter>
    );
    const logsLink = getByText(t("logs")).closest("a");
    expect(logsLink).toHaveAttribute("aria-current", "page");
  });
});
