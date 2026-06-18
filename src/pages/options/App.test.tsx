// @vitest-environment happy-dom
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { mockMatchMedia } from "@Tests/mockMatchMedia";
import { useIsMobile } from "@App/pages/components/use-is-mobile";
import { ThemeProvider } from "@App/pages/components/theme-provider";
import { Layout } from "./App";

vi.mock("@App/pages/components/use-is-mobile", () => ({
  useIsMobile: vi.fn(),
}));

const mockedUseIsMobile = vi.mocked(useIsMobile);

beforeEach(() => {
  mockMatchMedia();
});

beforeAll(() => initTestLanguage("zh-CN"));

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
    mockedUseIsMobile.mockReturnValue(true);
    const { getByTestId, container } = renderLayout();
    expect(getByTestId("bottom-tab-bar")).toBeInTheDocument();
    expect(container.querySelector("aside")).toBeNull();
  });

  it("桌面端渲染左侧 Sidebar,不渲染底部 Tab 栏", () => {
    mockedUseIsMobile.mockReturnValue(false);
    const { queryByTestId, container } = renderLayout();
    expect(container.querySelector("aside")).not.toBeNull();
    expect(queryByTestId("bottom-tab-bar")).toBeNull();
  });
});
