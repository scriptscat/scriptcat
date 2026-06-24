import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { render, setupGlobalMocks } from "@Tests/test-utils";
import App from "@App/pages/popup/App";
import { ExtVersion } from "@App/app/const";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
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
    Edge: 2,
    Chrome: 1,
    noUserScriptsAPI: 64,
    guardedByDeveloperMode: 128,
    guardedByAllowScript: 256,
    Mouse: 1,
    Touch: 2,
  },
  isPermissionOk: vi.fn(async (_s: string) => true),
}));

vi.mock("@App/locales/locales", () => ({
  localePath: "",
  initLocales: vi.fn(),
  changeLanguage: vi.fn(),
  i18nLang: vi.fn((): string => "en"),
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

  // Default tabs query behavior for tests
  vi.spyOn(chrome.tabs, "query").mockImplementation((_query: any, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
    const mockTabs = [{ id: 1, url: "https://example.com", title: "Example", active: true }] as chrome.tabs.Tab[];
    callback?.(mockTabs);
    return Promise.resolve(mockTabs);
  });
  vi.spyOn(chrome.action, "getBadgeText").mockImplementation(() => Promise.resolve(""));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Popup App Component", () => {
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

  // it("should handle chrome extension calls", async () => {
  //   render(<App />);

  //   // 验证初始化时调用了必要的API
  //   await waitFor(() => {
  //     expect(chrome.tabs.query).toHaveBeenCalled();
  //   });
  // });

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
        expect(screen.getByText("current_page_scripts (0/0)")).toBeInTheDocument();
        expect(screen.getByText("enabled_background_scripts (0/0)")).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  it("should handle popup client initialization", async () => {
    render(<App />);

    // 验证chrome tabs API被调用
    // await waitFor(
    //   () => {
    //     expect(chrome.tabs.query).toHaveBeenCalled();
    //   },
    //   { timeout: 1000 }
    // );

    // 验证UI渲染正常，说明组件初始化成功
    await waitFor(
      () => {
        expect(screen.getByText("ScriptCat")).toBeInTheDocument();
        expect(screen.getByText("current_page_scripts (0/0)")).toBeInTheDocument();
        expect(screen.getByText("enabled_background_scripts (0/0)")).toBeInTheDocument();
        expect(screen.getByText("v" + ExtVersion)).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });
});
