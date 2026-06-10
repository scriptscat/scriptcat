import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { render, setupGlobalMocks } from "@Tests/test-utils";

// AppProvider 挂载时根据 localStorage.lightMode 初始化主题。
// body 上的 arco-theme 属性必须始终被显式设置（light 也不例外），
// 模板内联 CSS 依赖 body:not([arco-theme]) 识别"主题未初始化"状态来做暗色兜底（issue #1497）。
describe("AppContext 颜色主题初始化", () => {
  beforeAll(() => {
    setupGlobalMocks();
  });

  afterEach(() => {
    localStorage.removeItem("lightMode");
    document.body.removeAttribute("arco-theme");
    document.documentElement.classList.remove("dark");
  });

  it("dark 模式下应在 body 上设置 arco-theme=dark", () => {
    localStorage.lightMode = "dark";
    render(<div />);
    expect(document.body.getAttribute("arco-theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("light 模式下应在 body 上显式设置 arco-theme=light，以区分主题未初始化状态", () => {
    localStorage.lightMode = "light";
    render(<div />);
    expect(document.body.getAttribute("arco-theme")).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("auto 模式且系统为亮色时也应显式标记 arco-theme=light", () => {
    localStorage.lightMode = "auto";
    render(<div />);
    expect(document.body.getAttribute("arco-theme")).toBe("light");
  });
});
