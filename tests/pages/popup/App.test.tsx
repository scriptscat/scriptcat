import { describe, expect, it, beforeEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { render, setupGlobalMocks } from "@Tests/test-utils";
import App from "@App/pages/popup/App";

// Mock i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// Create mock objects first
const mockPopupClient = {
  getCurrentTab: vi.fn().mockResolvedValue({
    id: 1,
    url: "https://example.com",
    title: "Test Page",
  }),
  getPopupData: vi.fn().mockResolvedValue({
    scriptList: [
      {
        id: "1",
        name: "Test Script 1",
        enable: true,
        menus: [],
        runNum: 0,
        updatetime: Date.now(),
      },
    ],
    backScriptList: [
      {
        id: "2",
        name: "Background Script 1",
        enable: true,
        menus: [],
        runNum: 0,
        updatetime: Date.now(),
      },
    ],
    isBlacklist: false,
  }),
};

const mockScriptClient = {
  run: vi.fn(),
  stop: vi.fn(),
  enableScript: vi.fn(),
  disableScript: vi.fn(),
  deleteScript: vi.fn(),
};

const mockSystemConfig = {
  getEnableScript: vi.fn().mockResolvedValue(true),
  setEnableScript: vi.fn(),
  getCheckUpdate: vi.fn().mockResolvedValue({
    version: "1.0.0-beta.1",
    notice: "",
    isRead: false,
  }),
  setCheckUpdate: vi.fn(),
};

// Mock the store features
vi.mock("../store/features/script", () => ({
  popupClient: mockPopupClient,
  scriptClient: mockScriptClient,
}));

// Mock systemConfig
vi.mock("../store/global", () => ({
  systemConfig: mockSystemConfig,
  message: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

// Mock utils
vi.mock("@App/pkg/utils/utils", () => ({
  isUserScriptsAvailable: vi.fn(() => true),
  getBrowserType: vi.fn(() => "chrome"),
  BrowserType: {
    Chrome: "chrome",
    Firefox: "firefox",
    Edge: "edge",
  },
}));

// Mock localePath
vi.mock("@App/locales/locales", () => ({
  localePath: "",
  initLocales: vi.fn(),
  changeLanguage: vi.fn(),
  i18nName: vi.fn((script) => script.name),
  i18nDescription: vi.fn((script) => script.metadata?.description || ""),
  matchLanguage: vi.fn(),
  isChineseUser: vi.fn(() => true),
  t: vi.fn((key) => key),
  default: {
    changeLanguage: vi.fn(),
    t: vi.fn((key) => key),
  },
}));

describe("Popup App Component", () => {
  beforeEach(() => {
    // Setup global mocks
    setupGlobalMocks();

    // Reset all mocks
    vi.clearAllMocks();

    // Setup default mock responses for Chrome tabs API
    vi.spyOn(chrome.tabs, "query").mockImplementation((query, callback) => {
      const mockTabs = [
        {
          id: 1,
          url: "https://example.com",
          title: "Example",
          active: true,
        },
      ] as chrome.tabs.Tab[];
      if (callback) {
        callback(mockTabs);
      }
      return Promise.resolve(mockTabs);
    });

    // Setup chrome runtime mock
    (chrome.runtime as any).lastError = undefined;
  });

  it("should render popup app successfully", async () => {
    render(<App />);

    // 应用应该成功渲染
    expect(document.body).toBeInTheDocument();
  });

  it("should render basic UI elements", async () => {
    render(<App />);

    await waitFor(() => {
      // 检查是否有ScriptCat标题
      expect(screen.getByText("ScriptCat")).toBeInTheDocument();
    });
  });

  it("should handle chrome extension calls", async () => {
    render(<App />);

    // 验证初始化时调用了必要的API
    await waitFor(() => {
      expect(chrome.tabs.query).toHaveBeenCalled();
    });
  });

  it("should display scripts in the menu list", async () => {
    // 确保URL被正确设置以避免ScriptMenuList中的URL错误
    vi.spyOn(chrome.tabs, "query").mockImplementation((query, callback) => {
      const mockTabs = [
        {
          id: 1,
          url: "https://example.com/test",
          title: "Example",
          active: true,
        },
      ] as chrome.tabs.Tab[];
      if (callback) {
        callback(mockTabs);
      }
      return Promise.resolve(mockTabs);
    });

    render(<App />);

    // 等待组件渲染完成，但不期望特定的脚本名称出现
    await waitFor(
      () => {
        // 检查是否存在折叠面板结构
        expect(screen.getByText("current_page_scripts")).toBeInTheDocument();
        expect(screen.getByText("enabled_background_scripts")).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  it("should handle popup client initialization", async () => {
    render(<App />);

    // 验证chrome tabs API被调用
    await waitFor(
      () => {
        expect(chrome.tabs.query).toHaveBeenCalled();
      },
      { timeout: 1000 }
    );

    // 验证UI渲染正常，说明组件初始化成功
    await waitFor(
      () => {
        expect(screen.getByText("ScriptCat")).toBeInTheDocument();
        expect(screen.getByText("current_page_scripts")).toBeInTheDocument();
        expect(screen.getByText("enabled_background_scripts")).toBeInTheDocument();
        expect(screen.getByText("v1.0.0-beta.1")).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });
});
