// src/pages/options/layout/SettingsLayout.test.tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Settings } from "lucide-react";
import { SettingsLayout } from "./SettingsLayout";

afterEach(cleanup);

const scrollTo = vi.fn();
vi.mock("../hooks/useScrollSpy", () => ({
  useScrollSpy: () => ({
    activeId: "general",
    register: () => () => {},
    scrollContainerRef: { current: null },
    scrollTo,
  }),
}));

describe("设置外壳 SettingsLayout", () => {
  const cats = [
    { id: "general", icon: Settings, label: "通用" },
    { id: "interface", icon: Settings, label: "界面" },
  ];

  it("渲染标题与全部分类导航项", () => {
    render(
      <SettingsLayout title="设置" categories={cats}>
        {() => <div>body</div>}
      </SettingsLayout>
    );
    expect(screen.getByText("设置")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "通用" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "界面" })).toBeInTheDocument();
  });

  it("点击导航项调用 scrollTo(id)", () => {
    render(
      <SettingsLayout title="设置" categories={cats}>
        {() => <div>body</div>}
      </SettingsLayout>
    );
    fireEvent.click(screen.getByRole("button", { name: "界面" }));
    expect(scrollTo).toHaveBeenCalledWith("interface");
  });
});
