import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AgentDomService } from "./agent_dom";

// mock chrome.scripting
const mockExecuteScript = vi.fn();
// mock chrome.tabs
const mockTabsQuery = vi.fn();
const mockTabsGet = vi.fn();
const mockTabsCreate = vi.fn();
const mockTabsUpdate = vi.fn();
const mockTabsReload = vi.fn();
const mockCaptureVisibleTab = vi.fn();
const mockOnUpdated = {
  addListener: vi.fn(),
  removeListener: vi.fn(),
};
const mockOnCreated = {
  addListener: vi.fn(),
  removeListener: vi.fn(),
};
const mockOnRemoved = {
  addListener: vi.fn(),
  removeListener: vi.fn(),
};

// mock chrome.permissions
const mockPermissionsContains = vi.fn();
const mockPermissionsRequest = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();

  // 设置 chrome.scripting mock
  (chrome as any).scripting = {
    executeScript: mockExecuteScript,
  };
  // 覆盖 chrome.tabs mock
  (chrome.tabs as any).query = mockTabsQuery;
  (chrome.tabs as any).get = mockTabsGet;
  (chrome.tabs as any).create = mockTabsCreate;
  (chrome.tabs as any).update = mockTabsUpdate;
  (chrome.tabs as any).reload = mockTabsReload;
  (chrome.tabs as any).captureVisibleTab = mockCaptureVisibleTab;
  (chrome.tabs as any).onUpdated = mockOnUpdated;
  (chrome.tabs as any).onCreated = mockOnCreated;
  (chrome.tabs as any).onRemoved = mockOnRemoved;
  (chrome as any).permissions = {
    contains: mockPermissionsContains,
    request: mockPermissionsRequest,
  };
});

describe("AgentDomService", () => {
  let service: AgentDomService;

  beforeEach(() => {
    service = new AgentDomService();
  });

  describe("listTabs", () => {
    it("应返回所有标签页信息", async () => {
      mockTabsQuery.mockResolvedValue([
        { id: 1, url: "https://example.com", title: "Example", active: true, windowId: 1, discarded: false },
        { id: 2, url: "https://test.com", title: "Test", active: false, windowId: 1, discarded: false },
      ]);

      const result = await service.listTabs();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        tabId: 1,
        url: "https://example.com",
        title: "Example",
        active: true,
        windowId: 1,
        discarded: false,
      });
      expect(result[1].tabId).toBe(2);
    });

    it("应过滤没有 id 的标签页", async () => {
      mockTabsQuery.mockResolvedValue([
        { id: 1, url: "https://example.com", title: "Example", active: true, windowId: 1 },
        { url: "https://no-id.com", title: "No ID", active: false, windowId: 1 },
      ]);

      const result = await service.listTabs();
      expect(result).toHaveLength(1);
      expect(result[0].tabId).toBe(1);
    });
  });

  describe("navigate", () => {
    it("应在指定 tabId 时更新标签页", async () => {
      mockTabsUpdate.mockResolvedValue({});
      mockTabsGet.mockResolvedValue({
        id: 1,
        url: "https://new-url.com",
        title: "New Page",
        status: "complete",
      });

      const result = await service.navigate("https://new-url.com", { tabId: 1, waitUntil: false });

      expect(mockTabsUpdate).toHaveBeenCalledWith(1, { url: "https://new-url.com" });
      expect(result.tabId).toBe(1);
      expect(result.url).toBe("https://new-url.com");
    });

    it("应在未指定 tabId 时创建新标签页", async () => {
      mockTabsCreate.mockResolvedValue({ id: 5 });
      mockTabsGet.mockResolvedValue({
        id: 5,
        url: "https://new-url.com",
        title: "New Page",
        status: "complete",
      });

      const result = await service.navigate("https://new-url.com", { waitUntil: false });

      expect(mockTabsCreate).toHaveBeenCalledWith({ url: "https://new-url.com" });
      expect(result.tabId).toBe(5);
    });
  });

  describe("readPage", () => {
    it("应返回页面 HTML", async () => {
      const mockPageContent = {
        title: "Test Page",
        url: "https://example.com",
        html: "<html><body><h1>Hello</h1></body></html>",
      };
      mockExecuteScript.mockResolvedValue([{ result: mockPageContent }]);
      mockTabsQuery.mockResolvedValue([{ id: 1 }]);
      mockTabsGet.mockResolvedValue({ id: 1, status: "complete", discarded: false });

      const result = await service.readPage({ tabId: 1 });

      expect(result.title).toBe("Test Page");
      expect(result.html).toContain("<h1>Hello</h1>");
      expect(mockExecuteScript).toHaveBeenCalledWith(
        expect.objectContaining({
          target: { tabId: 1 },
          world: "MAIN",
        })
      );
    });

    it("应在 HTML 超长时截断", async () => {
      const mockPageContent = {
        title: "Test Page",
        url: "https://example.com",
        html: "<html>truncated...</html>",
        truncated: true,
        totalLength: 500000,
      };
      mockExecuteScript.mockResolvedValue([{ result: mockPageContent }]);
      mockTabsGet.mockResolvedValue({ id: 1, status: "complete", discarded: false });

      const result = await service.readPage({ tabId: 1 });

      expect(result.truncated).toBe(true);
      expect(result.totalLength).toBe(500000);
    });
  });

  describe("click", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("应执行默认模式点击", async () => {
      mockTabsGet.mockResolvedValue({ id: 1, url: "https://example.com", status: "complete", discarded: false });
      // 点击执行
      mockExecuteScript.mockResolvedValueOnce([{ result: undefined }]);

      const promise = service.click("#btn", { tabId: 1 });
      await vi.advanceTimersByTimeAsync(600);
      const result = await promise;

      expect(result.success).toBe(true);
      expect(mockExecuteScript).toHaveBeenCalledTimes(1);
    });

    it("应检测页面跳转", async () => {
      // 第一次 get 返回原始 URL（resolveTabId）
      mockTabsGet.mockResolvedValueOnce({ id: 1, url: "https://example.com", status: "complete", discarded: false });
      // 第二次 get 返回原始 URL（executeClick 内部）
      mockTabsGet.mockResolvedValueOnce({ id: 1, url: "https://example.com", status: "complete" });
      mockExecuteScript.mockResolvedValueOnce([{ result: undefined }]); // 点击
      // 第三次 get 返回新 URL（collectActionResult）
      mockTabsGet.mockResolvedValueOnce({ id: 1, url: "https://new-page.com", status: "complete" });

      const promise = service.click("#link", { tabId: 1 });
      await vi.advanceTimersByTimeAsync(600);
      const result = await promise;

      expect(result.success).toBe(true);
      expect(result.navigated).toBe(true);
      expect(result.url).toBe("https://new-page.com");
    });
  });

  describe("fill", () => {
    it("应执行默认模式填写", async () => {
      mockTabsGet.mockResolvedValue({ id: 1, url: "https://example.com", status: "complete", discarded: false });
      mockExecuteScript.mockResolvedValue([{ result: undefined }]);

      const result = await service.fill("#input", "test value", { tabId: 1 });

      expect(result.success).toBe(true);
      expect(result.url).toBe("https://example.com");
    });
  });

  describe("scroll", () => {
    it("应返回滚动位置信息", async () => {
      const scrollResult = {
        scrollTop: 800,
        scrollHeight: 5000,
        clientHeight: 900,
        atBottom: false,
      };
      mockExecuteScript.mockResolvedValue([{ result: scrollResult }]);
      mockTabsGet.mockResolvedValue({ id: 1, status: "complete", discarded: false });

      const result = await service.scroll("down", { tabId: 1 });

      expect(result.scrollTop).toBe(800);
      expect(result.atBottom).toBe(false);
    });
  });

  describe("waitFor", () => {
    it("应在元素存在时立即返回", async () => {
      const waitResult = {
        found: true,
        element: {
          selector: "#target",
          tag: "div",
          text: "Found",
          visible: true,
        },
      };
      mockExecuteScript.mockResolvedValue([{ result: waitResult }]);
      mockTabsGet.mockResolvedValue({ id: 1, status: "complete", discarded: false });

      const result = await service.waitFor("#target", { tabId: 1 });

      expect(result.found).toBe(true);
      expect(result.element?.tag).toBe("div");
    });

    it("应在超时后返回 found: false", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      mockExecuteScript.mockResolvedValue([{ result: null }]);
      mockTabsGet.mockResolvedValue({ id: 1, status: "complete", discarded: false });

      const promise = service.waitFor("#nonexistent", { tabId: 1, timeout: 100 });
      // 需要多次 advance 来驱动 while 循环中的 setTimeout
      for (let i = 0; i < 5; i++) {
        await vi.advanceTimersByTimeAsync(600);
      }
      const result = await promise;

      expect(result.found).toBe(false);
      vi.useRealTimers();
    });
  });

  describe("screenshot", () => {
    it("应在前台 tab 使用 captureVisibleTab", async () => {
      mockTabsGet.mockResolvedValue({
        id: 1,
        active: true,
        windowId: 1,
        status: "complete",
        discarded: false,
      });
      mockCaptureVisibleTab.mockResolvedValue("data:image/jpeg;base64,abc123");

      const result = await service.screenshot({ tabId: 1 });

      expect(result.dataUrl).toBe("data:image/jpeg;base64,abc123");
      expect(mockCaptureVisibleTab).toHaveBeenCalledWith(1, { format: "jpeg", quality: 80 });
    });
  });

  describe("executeScript", () => {
    it("应在页面中执行代码并返回结果", async () => {
      mockTabsGet.mockResolvedValue({ id: 1, status: "complete", discarded: false });
      mockExecuteScript.mockResolvedValue([{ result: { count: 42, items: ["a", "b"] } }]);

      const result = await service.executeScript('return document.querySelectorAll("a").length', { tabId: 1 });

      expect(result).toEqual({ result: { count: 42, items: ["a", "b"] }, tabId: 1 });
      expect(mockExecuteScript).toHaveBeenCalledWith(
        expect.objectContaining({
          target: { tabId: 1 },
          world: "ISOLATED",
        })
      );
    });

    it("应在执行失败时抛出错误", async () => {
      mockTabsGet.mockResolvedValue({ id: 1, status: "complete", discarded: false });
      mockExecuteScript.mockResolvedValue([]);

      await expect(service.executeScript("return 1", { tabId: 1 })).rejects.toThrow("Failed to execute script");
    });
  });

  describe("handleDomApi", () => {
    it("应正确路由 listTabs 请求", async () => {
      mockTabsQuery.mockResolvedValue([]);

      const result = await service.handleDomApi({ action: "listTabs", scriptUuid: "test" });

      expect(result).toEqual([]);
    });

    it("应对未知 action 抛出错误", async () => {
      await expect(service.handleDomApi({ action: "unknown" as any, scriptUuid: "test" })).rejects.toThrow(
        "Unknown DOM action"
      );
    });
  });

  describe("resolveTabId", () => {
    it("应在 tab 被 discard 时自动 reload", async () => {
      mockTabsGet.mockResolvedValueOnce({
        id: 1,
        discarded: true,
        status: "complete",
      });
      mockTabsReload.mockResolvedValue(undefined);
      // reload 后再次 get
      mockTabsGet.mockResolvedValueOnce({
        id: 1,
        discarded: false,
        status: "complete",
      });

      // 通过 readPage 间接测试 resolveTabId
      const mockContent = {
        title: "Test",
        url: "https://example.com",
        html: "<html><body>Test</body></html>",
      };
      mockExecuteScript.mockResolvedValue([{ result: mockContent }]);

      await service.readPage({ tabId: 1 });

      expect(mockTabsReload).toHaveBeenCalledWith(1);
    });

    it("应在无活动 tab 时抛出错误", async () => {
      mockTabsQuery.mockResolvedValue([]);
      mockExecuteScript.mockResolvedValue([{ result: {} }]);

      await expect(service.readPage()).rejects.toThrow("No active tab found");
    });
  });
});
