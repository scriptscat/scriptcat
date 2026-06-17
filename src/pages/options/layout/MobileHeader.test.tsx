import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { initLanguage, t } from "@App/locales/locales";
import MobileHeader from "./MobileHeader";

afterEach(cleanup);

describe("MobileHeader 移动顶栏", () => {
  it("渲染 ScriptCat 标题", () => {
    initLanguage("zh-CN");
    const { getByText } = render(
      <MemoryRouter>
        <MobileHeader />
      </MemoryRouter>
    );
    expect(getByText("ScriptCat")).toBeInTheDocument();
  });

  it("渲染新建脚本图标按钮(带无障碍标签)", () => {
    initLanguage("zh-CN");
    const { getByLabelText } = render(
      <MemoryRouter>
        <MobileHeader />
      </MemoryRouter>
    );
    expect(getByLabelText(t("script:create_script"))).toBeInTheDocument();
  });
});
