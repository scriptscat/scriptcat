import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { initLanguage } from "@App/locales/locales";
import { useIsMobile } from "@App/pages/components/use-is-mobile";
import { ThemeProvider } from "@App/pages/components/theme-provider";
import { Layout } from "./App";

vi.mock("@App/pages/components/use-is-mobile", () => ({
  useIsMobile: vi.fn(),
}));

const mockedUseIsMobile = vi.mocked(useIsMobile);

beforeEach(() => {
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

function renderLayout() {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<div>content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </ThemeProvider>
  );
}

describe("Layout 外壳响应式", () => {
  it("移动端渲染底部 Tab 栏,不渲染左侧 Sidebar", () => {
    initLanguage("zh-CN");
    mockedUseIsMobile.mockReturnValue(true);
    const { getByTestId, container } = renderLayout();
    expect(getByTestId("bottom-tab-bar")).toBeInTheDocument();
    expect(container.querySelector("aside")).toBeNull();
  });

  it("桌面端渲染左侧 Sidebar,不渲染底部 Tab 栏", () => {
    initLanguage("zh-CN");
    mockedUseIsMobile.mockReturnValue(false);
    const { queryByTestId, container } = renderLayout();
    expect(container.querySelector("aside")).not.toBeNull();
    expect(queryByTestId("bottom-tab-bar")).toBeNull();
  });
});
