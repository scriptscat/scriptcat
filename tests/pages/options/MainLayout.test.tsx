import type { ReactNode } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
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

const hoisted = vi.hoisted(() => {
  const mockAppContext = {
    updateColorTheme: vi.fn(),
    setGuideMode: vi.fn(),
  };

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

  return { mockAppContext, mockPopupClient, mockScriptClient, mockSystemConfig, mockMessageQueue };
});

vi.mock("@App/pages/store/AppContext", () => ({
  AppProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useAppContext: () => ({
    colorThemeState: "auto",
    guideMode: false,
    setGuideMode: hoisted.mockAppContext.setGuideMode,
    updateColorTheme: hoisted.mockAppContext.updateColorTheme,
  }),
}));

vi.mock("react-dropzone", () => ({
  useDropzone: () => ({
    getRootProps: () => ({}),
    getInputProps: () => ({}),
    isDragActive: false,
  }),
}));

vi.mock("@App/pages/components/layout/ScrollBoundary", () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@App/pages/store/features/script", () => ({
  popupClient: hoisted.mockPopupClient,
  scriptClient: hoisted.mockScriptClient,
  agentClient: { prepareSkillInstall: vi.fn().mockResolvedValue("mock-uuid") },
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
  subscribeMessage: () => vi.fn(),
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
  i18nName: vi.fn((script: { name: string }) => script.name),
  i18nDescription: vi.fn((script: { metadata?: { description?: string } }) => script.metadata?.description || ""),
  matchLanguage: vi.fn().mockResolvedValue(true),
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
  setupGlobalMocks();
  vi.clearAllMocks();
});

describe("Options MainLayout Component", () => {
  it("should render main layout successfully", () => {
    render(
      <MainLayout className="" pageName="options">
        {"Test Content"}
      </MainLayout>
    );

    expect(screen.getByText("ScriptCat")).toBeInTheDocument();
    expect(screen.getByText("Test Content")).toBeInTheDocument();
  });

  it("should render children content", () => {
    const testContent = "Test Options Content";

    render(
      <MainLayout className="" pageName="options">
        {testContent}
      </MainLayout>
    );

    expect(screen.getByText(testContent)).toBeInTheDocument();
  });

  it("should handle page name prop", () => {
    render(
      <MainLayout className="" pageName="options">
        {"Content"}
      </MainLayout>
    );

    expect(screen.getByText("create_script")).toBeInTheDocument();
  });

  it("should render with custom className", () => {
    render(
      <MainLayout pageName="options" className="custom-class">
        {"Content"}
      </MainLayout>
    );

    expect(screen.getByText("Content").closest(".custom-class")).toBeInTheDocument();
  });
});
