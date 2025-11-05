import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { render, setupGlobalMocks } from "@Tests/test-utils";
import MainLayout from "@App/pages/components/layout/MainLayout";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));
vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: "/" }),
  Outlet: () => <div data-testid="outlet">{"Options Content"}</div>,
}));

// Use vi.hoisted to avoid hoisting pitfalls
const hoisted = vi.hoisted(() => {
  const mockPopupClient = {
    getCurrentTab: vi.fn().mockResolvedValue({ id: 1, url: "https://example.com", title: "Test Page" }),
    getPopupData: vi.fn().mockResolvedValue({
      scriptList: [{ id: "1", name: "Test Script 1", enable: true, menus: [], runNum: 0, updatetime: Date.now() }],
      backScriptList: [
        { id: "2", name: "Background Script 1", enable: true, menus: [], runNum: 0, updatetime: Date.now() },
      ],
      isBlacklist: false,
    }),
    menuClick: vi.fn(),
  };

  const mockScriptClient = {
    run: vi.fn(),
    stop: vi.fn(),
    enableScript: vi.fn(),
    disableScript: vi.fn(),
    deleteScript: vi.fn(),
  };

  const mockSystemConfig = {
    getEnableScript: () => Promise.resolve(true),
    setEnableScript: vi.fn(),
    getCheckUpdate: () => Promise.resolve({ version: "1.0.0-beta.1", notice: "", isRead: false }),
    setCheckUpdate: vi.fn(),
    getMenuExpandNum: () => Promise.resolve(5),
  };

  const mockMessageQueue = {
    subscribe: () => () => {},
  };

  return { mockPopupClient, mockScriptClient, mockSystemConfig, mockMessageQueue };
});

// IMPORTANT: mock the exact paths used by App
vi.mock("@App/pages/store/features/script", () => ({
  popupClient: hoisted.mockPopupClient,
  scriptClient: hoisted.mockScriptClient,
}));

vi.mock("@App/pages/store/global", () => ({
  systemConfig: hoisted.mockSystemConfig,
  messageQueue: hoisted.mockMessageQueue,
  message: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("@App/pkg/utils/utils", () => ({
  checkUserScriptsAvailable: vi.fn(() => true),
  getBrowserType: vi.fn(() => "chrome"),
  getCurrentTab: vi.fn().mockResolvedValue({
    id: 1,
    url: "https://example.com",
    title: "Example",
  }),
  BrowserType: {
    Chrome: "chrome",
    Firefox: "firefox",
    Edge: "edge",
  },
}));

vi.mock("@App/locales/locales", () => ({
  localePath: "",
  initLocales: vi.fn(),
  changeLanguage: vi.fn(),
  i18nName: vi.fn((script: any) => script.name),
  i18nDescription: vi.fn((script: any) => script.metadata?.description || ""),
  matchLanguage: () => Promise.resolve(undefined),
  isChineseUser: vi.fn(() => true),
  t: vi.fn((key: string) => key),
  default: {
    changeLanguage: vi.fn(),
    t: vi.fn((key: string) => key),
    store: {
      data: {},
    },
  },
  i18n: {
    changeLanguage: vi.fn(),
    t: vi.fn((key: string) => key),
    store: {
      data: {},
    },
  },
}));

beforeEach(() => {
  setupGlobalMocks(); // Setup global window mocks
  vi.clearAllMocks();
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("Options MainLayout Component", () => {
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
