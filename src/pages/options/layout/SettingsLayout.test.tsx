// src/pages/options/layout/SettingsLayout.test.tsx
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Settings } from "lucide-react";
import { SettingsLayout } from "./SettingsLayout";
import { useIsMobile } from "@App/pages/components/use-is-mobile";

const scrollTo = vi.fn();
vi.mock("../hooks/useScrollSpy", () => ({
  useScrollSpy: () => ({
    activeId: "general",
    register: () => () => {},
    scrollContainerRef: { current: null },
    scrollTo,
  }),
}));

vi.mock("@App/pages/components/use-is-mobile", () => ({ useIsMobile: vi.fn(() => false) }));
const mockedUseIsMobile = vi.mocked(useIsMobile);

// jsdom 未实现 scrollIntoView,横向栏激活分类滚动到可视区会用到
Element.prototype.scrollIntoView = vi.fn();

afterEach(cleanup);
beforeEach(() => {
  scrollTo.mockClear();
  mockedUseIsMobile.mockReturnValue(false);
});

describe("设置外壳 SettingsLayout", () => {
  const cats = [
    { id: "general", icon: Settings, label: "通用" },
    { id: "interface", icon: Settings, label: "界面" },
  ];

  const renderLayout = () =>
    render(
      <SettingsLayout title="设置" categories={cats}>
        {() => <div>body</div>}
      </SettingsLayout>
    );

  describe("桌面端(竖向左栏)", () => {
    it("渲染标题与全部分类导航项", () => {
      renderLayout();
      expect(screen.getByText("设置")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "通用" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "界面" })).toBeInTheDocument();
    });

    it("点击导航项调用 scrollTo(id)", () => {
      renderLayout();
      fireEvent.click(screen.getByRole("button", { name: "界面" }));
      expect(scrollTo).toHaveBeenCalledWith("interface");
    });

    it("导航为 220px 竖向左栏", () => {
      renderLayout();
      expect(screen.getByRole("navigation").className).toContain("w-[220px]");
    });

    it("左侧分类导航使用 bg-card 背景(设计稿 Category Nav 为白底)", () => {
      renderLayout();
      expect(screen.getByRole("navigation").className).toContain("bg-card");
    });

    it("标题栏使用 bg-card 背景(与其它页面顶栏一致)", () => {
      renderLayout();
      const header = screen.getByText("设置").parentElement!;
      expect(header.className).toContain("bg-card");
    });
  });

  describe("移动端(顶部横向栏)", () => {
    beforeEach(() => mockedUseIsMobile.mockReturnValue(true));

    it("分类导航改为横向滚动栏", () => {
      renderLayout();
      const nav = screen.getByRole("navigation");
      expect(nav.className).toContain("overflow-x-auto");
      expect(nav.className).not.toContain("w-[220px]");
    });

    it("横向栏仍渲染全部分类且点击调用 scrollTo(id)", () => {
      renderLayout();
      expect(screen.getByRole("button", { name: "通用" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "界面" }));
      expect(scrollTo).toHaveBeenCalledWith("interface");
    });
  });
});
