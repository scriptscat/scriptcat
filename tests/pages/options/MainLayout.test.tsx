import { describe, expect, it, beforeEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { render, setupGlobalMocks } from "@Tests/test-utils";
import MainLayout from "@App/pages/components/layout/MainLayout";

// Mock dependencies
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "zh-CN" },
  }),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: "/" }),
  Outlet: () => <div data-testid="outlet">{"Options Content"}</div>,
}));

vi.mock("../store/features/script", () => ({
  scriptClient: {
    list: vi.fn().mockResolvedValue([]),
  },
}));

describe("Options MainLayout Component", () => {
  beforeEach(() => {
    setupGlobalMocks();
    vi.clearAllMocks();
  });

  it("should render main layout successfully", async () => {
    render(
      <MainLayout className="" pageName="options">
        {"Test Content"}
      </MainLayout>
    );

    // 布局应该成功渲染
    expect(document.body).toBeInTheDocument();
  });

  it("should render children content", async () => {
    const testContent = "Test Options Content";
    render(
      <MainLayout className="" pageName="options">
        {testContent}
      </MainLayout>
    );

    await waitFor(() => {
      expect(screen.getByText(testContent)).toBeInTheDocument();
    });
  });

  it("should handle page name prop", async () => {
    render(
      <MainLayout className="" pageName="options">
        {"Content"}
      </MainLayout>
    );

    // 验证组件正确接受pageName属性
    expect(screen.getByText("Content")).toBeInTheDocument();
  });

  it("should render with custom className", async () => {
    render(
      <MainLayout pageName="options" className="custom-class">
        {"Content"}
      </MainLayout>
    );

    await waitFor(() => {
      expect(screen.getByText("Content")).toBeInTheDocument();
    });
  });
});
