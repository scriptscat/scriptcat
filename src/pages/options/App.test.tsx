import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { Routes, Route } from "react-router-dom";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { mockMatchMedia } from "@Tests/mockMatchMedia";
import { renderWithThemeRouter } from "@Tests/renderWithThemeRouter";
import { useIsMobile } from "@App/pages/components/use-is-mobile";
import { Layout } from "./App";

vi.mock("@App/pages/components/use-is-mobile", () => ({
  useIsMobile: vi.fn(),
}));

vi.mock("./layout/Sidebar", () => ({ default: () => <aside /> }));
vi.mock("./layout/MobileHeader", () => ({ default: () => <header data-testid="mobile-header" /> }));
vi.mock("./layout/BottomTabBar", () => ({ default: () => <nav data-testid="bottom-tab-bar" /> }));
vi.mock("./layout/useScriptDropzone", () => ({ useScriptDropzone: () => ({ isDragActive: false }) }));
vi.mock("./layout/DropOverlay", () => ({ DropOverlay: () => null }));
vi.mock("./onboarding/OnboardingHost", () => ({ OnboardingHost: () => null }));
vi.mock("./routes/ScriptList/importHandler", () => ({ handleImportFiles: vi.fn() }));
vi.mock("./routes/ScriptList", () => ({ default: () => null }));
vi.mock("./routes/SubscribeList", () => ({ default: () => null }));
vi.mock("./routes/ScriptEditor", () => ({ default: () => null }));
vi.mock("./routes/Logger", () => ({ default: () => null }));
vi.mock("./routes/Setting", () => ({ default: () => null }));
vi.mock("./routes/Tools", () => ({ default: () => null }));
vi.mock("./routes/Agent/Chat", () => ({ default: () => null }));
vi.mock("./routes/Agent/Skills", () => ({ default: () => null }));
vi.mock("./routes/Agent/Provider", () => ({ default: () => null }));
vi.mock("./routes/Agent/Mcp", () => ({ default: () => null }));
vi.mock("./routes/Agent/Tasks", () => ({ default: () => null }));
vi.mock("./routes/Agent/OPFS", () => ({ default: () => null }));
vi.mock("./routes/Agent/Settings", () => ({ default: () => null }));

const mockedUseIsMobile = vi.mocked(useIsMobile);

beforeEach(() => {
  mockMatchMedia();
});

beforeAll(() => initTestLanguage("zh-CN"));

afterEach(cleanup);

function renderLayout() {
  return renderWithThemeRouter(
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<div>{"content"}</div>} />
      </Route>
    </Routes>,
    { initialEntries: ["/"] }
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

  // 100vh 在带可收起工具栏/软键盘的移动浏览器上等于「大视口」，外壳会比当前可见区域更高，
  // 底部 Tab 栏被挤到可视区外且文档本身不可滚动（issue #1555）；动态视口单位才跟随可见高度。
  it.each([
    ["移动端", true],
    ["桌面端", false],
  ])("%s 外壳高度使用动态视口单位而非 100vh", (_label, isMobile) => {
    mockedUseIsMobile.mockReturnValue(isMobile);
    const { container } = renderLayout();
    const shell = container.querySelector("div")!;
    expect(shell.className).toContain("h-dvh");
    expect(shell.className).not.toContain("h-screen");
  });
});
