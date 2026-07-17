import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act, cleanup } from "@testing-library/react";
import { mockMatchMedia } from "@Tests/mockMatchMedia";
import { ThemeProvider, useTheme } from "./theme-provider";

// theme-provider 用 window.matchMedia 判断系统主题，DOM 测试环境默认未实现，需 mock
beforeEach(() => {
  mockMatchMedia();
  localStorage.removeItem("lightMode");
  localStorage.removeItem("scriptcat-theme");
  document.documentElement.classList.remove("dark");
});

afterEach(() => {
  cleanup();
});

function Consumer() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button data-testid="set-dark" onClick={() => setTheme("dark")}>
        {"dark"}
      </button>
    </div>
  );
}

describe("ThemeProvider 主题持久化", () => {
  it("切换主题应持久化到 localStorage 的 lightMode 键（与 common.ts 预渲染脚本及 release/v1.4 一致）", () => {
    const { getByTestId } = render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>
    );

    act(() => {
      fireEvent.click(getByTestId("set-dark"));
    });

    expect(localStorage.getItem("lightMode")).toBe("dark");
  });

  it("初始化时应从 lightMode 读取已保存的主题", () => {
    localStorage.setItem("lightMode", "dark");

    const { getByTestId } = render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>
    );

    expect(getByTestId("theme").textContent).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
