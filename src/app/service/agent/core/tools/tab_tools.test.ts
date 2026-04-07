import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTabTools } from "./tab_tools";

// mock chrome.scripting
const mockExecuteScript = vi.fn();
// mock chrome.tabs
const mockTabsQuery = vi.fn();
const mockTabsCreate = vi.fn();
const mockTabsRemove = vi.fn();
const mockTabsUpdate = vi.fn();
const mockTabsGet = vi.fn();
// mock chrome.windows
const mockWindowsUpdate = vi.fn();
// mock chrome.tabs.onUpdated
const mockOnUpdatedAddListener = vi.fn();
const mockOnUpdatedRemoveListener = vi.fn();

// mock offscreen extractHtmlWithSelectors 的返回值
let mockExtractReturn: string | null = "Extracted content with selectors for testing";
let mockExtractShouldThrow = false;

const mockSender = {
  sendMessage: vi.fn().mockImplementation(() => {
    if (mockExtractShouldThrow) {
      return Promise.reject(new Error("Offscreen unavailable"));
    }
    return Promise.resolve({ data: mockExtractReturn });
  }),
} as any;

const mockSummarize = vi.fn().mockResolvedValue("Summarized content");

beforeEach(() => {
  vi.clearAllMocks();
  mockExtractReturn = "Extracted content with selectors for testing";
  mockExtractShouldThrow = false;

  // Default mock for chrome.tabs.get - allows normal test flow
  mockTabsGet.mockResolvedValue({ id: 42, url: "https://example.com" });

  (chrome as any).scripting = { executeScript: mockExecuteScript };
  (chrome as any).tabs = {
    query: mockTabsQuery,
    create: mockTabsCreate,
    remove: mockTabsRemove,
    update: mockTabsUpdate,
    get: mockTabsGet,
    onUpdated: {
      addListener: mockOnUpdatedAddListener,
      removeListener: mockOnUpdatedRemoveListener,
    },
  };
  (chrome as any).windows = { update: mockWindowsUpdate };
});

function makeTools() {
  return createTabTools({ sender: mockSender, summarize: mockSummarize });
}

function getExecutor(name: string) {
  const { tools } = makeTools();
  const tool = tools.find((t) => t.definition.name === name);
  if (!tool) throw new Error(`Tool ${name} not found`);
  return tool.executor;
}

describe("createTabTools", () => {
  it("should create 5 tools", () => {
    const { tools } = makeTools();
    expect(tools).toHaveLength(5);
    const names = tools.map((t) => t.definition.name);
    expect(names).toContain("get_tab_content");
    expect(names).toContain("list_tabs");
    expect(names).toContain("open_tab");
    expect(names).toContain("close_tab");
    expect(names).toContain("activate_tab");
  });
});

describe("get_tab_content", () => {
  it("should throw when tab_id is missing", async () => {
    const executor = getExecutor("get_tab_content");
    await expect(executor.execute({})).rejects.toThrow('缺少必填参数 "tab_id"');
  });

  it("should inject script and return extracted content", async () => {
    mockExecuteScript.mockResolvedValue([
      { result: { html: "<div>Hello World</div>", title: "Test", url: "https://example.com" } },
    ]);

    const executor = getExecutor("get_tab_content");
    const raw = (await executor.execute({ tab_id: 42 })) as string;
    const result = JSON.parse(raw);

    expect(result.tab_id).toBe(42);
    expect(result.url).toBe("https://example.com");
    expect(result.title).toBe("Test");
    expect(result.content).toBe("Extracted content with selectors for testing");
    expect(result.truncated).toBe(false);
    expect(mockExecuteScript).toHaveBeenCalledWith(expect.objectContaining({ target: { tabId: 42 }, world: "MAIN" }));
  });

  it("should handle selector parameter", async () => {
    mockExecuteScript.mockResolvedValue([
      { result: { html: "<div>Section</div>", title: "Test", url: "https://example.com" } },
    ]);

    const executor = getExecutor("get_tab_content");
    const raw = (await executor.execute({ tab_id: 1, selector: "#main" })) as string;
    const result = JSON.parse(raw);

    expect(result.used_selector).toBe("#main");
    // Verify selector was passed to injected script
    const callArgs = mockExecuteScript.mock.calls[0][0].args[0];
    expect(callArgs.selector).toBe("#main");
  });

  it("should handle element not found", async () => {
    mockExecuteScript.mockResolvedValue([
      { result: { html: null, title: "Test", url: "https://example.com", error: "Element not found: #missing" } },
    ]);

    const executor = getExecutor("get_tab_content");
    const raw = (await executor.execute({ tab_id: 1 })) as string;
    const result = JSON.parse(raw);

    expect(result.content).toBe("Element not found: #missing");
  });

  it("should truncate at max_length", async () => {
    mockExecuteScript.mockResolvedValue([
      { result: { html: "<div>content</div>", title: "Test", url: "https://example.com" } },
    ]);
    mockExtractReturn = "A".repeat(200);

    const executor = getExecutor("get_tab_content");
    const raw = (await executor.execute({ tab_id: 1, max_length: 50 })) as string;
    const result = JSON.parse(raw);

    expect(result.content.length).toBe(50);
    expect(result.truncated).toBe(true);
  });

  it("should call summarize when prompt is provided", async () => {
    mockExecuteScript.mockResolvedValue([
      { result: { html: "<div>Hello</div>", title: "Test", url: "https://example.com" } },
    ]);

    const executor = getExecutor("get_tab_content");
    const raw = (await executor.execute({ tab_id: 1, prompt: "What is the price?" })) as string;
    const result = JSON.parse(raw);

    expect(mockSummarize).toHaveBeenCalledWith(expect.any(String), "What is the price?");
    expect(result.content).toBe("Summarized content");
    expect(result.truncated).toBe(false);
  });

  it("should fallback when offscreen extraction throws", async () => {
    mockExecuteScript.mockResolvedValue([
      { result: { html: "<div>Fallback text</div>", title: "Test", url: "https://example.com" } },
    ]);
    mockExtractShouldThrow = true;

    const executor = getExecutor("get_tab_content");
    const raw = (await executor.execute({ tab_id: 1 })) as string;
    const result = JSON.parse(raw);

    // 降级到简单去标签
    expect(result.content).toContain("Fallback text");
  });

  it("should throw when executeScript fails", async () => {
    mockExecuteScript.mockResolvedValue([]);

    const executor = getExecutor("get_tab_content");
    await expect(executor.execute({ tab_id: 1 })).rejects.toThrow("Failed to read tab content");
  });

  it("should fallback to raw HTML when extraction returns short content", async () => {
    mockExecuteScript.mockResolvedValue([
      { result: { html: "<div>Hi</div>", title: "Test", url: "https://example.com" } },
    ]);
    mockExtractReturn = "Hi"; // shorter than 20 chars

    const executor = getExecutor("get_tab_content");
    const raw = (await executor.execute({ tab_id: 1 })) as string;
    const result = JSON.parse(raw);

    // 降级到原始 HTML
    expect(result.content).toBe("<div>Hi</div>");
  });

  it("should return 'No content' when html is null without error", async () => {
    mockExecuteScript.mockResolvedValue([{ result: { html: null, title: "Test", url: "https://example.com" } }]);

    const executor = getExecutor("get_tab_content");
    const raw = (await executor.execute({ tab_id: 1 })) as string;
    const result = JSON.parse(raw);

    expect(result.content).toBe("No content");
  });

  it("should propagate summarize errors", async () => {
    mockExecuteScript.mockResolvedValue([
      { result: { html: "<div>content</div>", title: "Test", url: "https://example.com" } },
    ]);
    mockSummarize.mockRejectedValue(new Error("No model configured"));

    const executor = getExecutor("get_tab_content");
    await expect(executor.execute({ tab_id: 1, prompt: "summarize" })).rejects.toThrow("No model configured");
  });

  it("should set used_selector to null when no selector provided", async () => {
    mockExecuteScript.mockResolvedValue([
      { result: { html: "<div>content</div>", title: "Test", url: "https://example.com" } },
    ]);

    const executor = getExecutor("get_tab_content");
    const raw = (await executor.execute({ tab_id: 1 })) as string;
    const result = JSON.parse(raw);

    expect(result.used_selector).toBeNull();
  });
});

describe("list_tabs", () => {
  it("should return all tabs", async () => {
    mockTabsQuery.mockResolvedValue([
      {
        id: 1,
        url: "https://a.com",
        title: "A",
        active: true,
        windowId: 1,
        index: 0,
        audible: false,
        status: "complete",
      },
      {
        id: 2,
        url: "https://b.com",
        title: "B",
        active: false,
        windowId: 1,
        index: 1,
        audible: true,
        status: "loading",
      },
    ]);

    const executor = getExecutor("list_tabs");
    const raw = (await executor.execute({})) as string;
    const result = JSON.parse(raw);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(1);
    expect(result[1].audible).toBe(true);
  });

  it("should filter by url_pattern", async () => {
    mockTabsQuery.mockResolvedValue([
      { id: 1, url: "https://github.com/repo", title: "GitHub", active: true, windowId: 1, index: 0 },
      { id: 2, url: "https://google.com", title: "Google", active: false, windowId: 1, index: 1 },
    ]);

    const executor = getExecutor("list_tabs");
    const raw = (await executor.execute({ url_pattern: "github" })) as string;
    const result = JSON.parse(raw);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it("should filter by title_pattern", async () => {
    mockTabsQuery.mockResolvedValue([
      { id: 1, url: "https://a.com", title: "Shopping Cart", active: true, windowId: 1, index: 0 },
      { id: 2, url: "https://b.com", title: "Blog Post", active: false, windowId: 1, index: 1 },
    ]);

    const executor = getExecutor("list_tabs");
    const raw = (await executor.execute({ title_pattern: "shopping" })) as string;
    const result = JSON.parse(raw);

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Shopping Cart");
  });

  it("should pass active/audible/windowId to query", async () => {
    mockTabsQuery.mockResolvedValue([]);

    const executor = getExecutor("list_tabs");
    await executor.execute({ active: true, window_id: 5, audible: false });

    expect(mockTabsQuery).toHaveBeenCalledWith({ active: true, windowId: 5, audible: false });
  });

  it("should exclude tabs without id", async () => {
    mockTabsQuery.mockResolvedValue([
      { id: 1, url: "https://a.com", title: "A", active: true, windowId: 1, index: 0 },
      { url: "https://b.com", title: "B", active: false, windowId: 1, index: 1 }, // no id
    ]);

    const executor = getExecutor("list_tabs");
    const raw = (await executor.execute({})) as string;
    const result = JSON.parse(raw);

    expect(result).toHaveLength(1);
  });
});

describe("open_tab", () => {
  it("should throw when url is missing", async () => {
    const executor = getExecutor("open_tab");
    await expect(executor.execute({})).rejects.toThrow('缺少必填参数 "url"');
  });

  it("should create a new tab", async () => {
    mockTabsCreate.mockResolvedValue({
      id: 10,
      url: "https://example.com",
      title: "Example",
      windowId: 1,
      index: 3,
    });

    const executor = getExecutor("open_tab");
    const raw = (await executor.execute({ url: "https://example.com" })) as string;
    const result = JSON.parse(raw);

    expect(result.id).toBe(10);
    expect(result.url).toBe("https://example.com");
    expect(mockTabsCreate).toHaveBeenCalledWith({ url: "https://example.com", active: true });
  });

  it("should create background tab when active=false", async () => {
    mockTabsCreate.mockResolvedValue({ id: 11, url: "https://bg.com", title: "", windowId: 1, index: 4 });

    const executor = getExecutor("open_tab");
    await executor.execute({ url: "https://bg.com", active: false });

    expect(mockTabsCreate).toHaveBeenCalledWith({ url: "https://bg.com", active: false });
  });

  it("should pass window_id if provided", async () => {
    mockTabsCreate.mockResolvedValue({ id: 12, url: "https://a.com", title: "", windowId: 2, index: 0 });

    const executor = getExecutor("open_tab");
    await executor.execute({ url: "https://a.com", window_id: 2 });

    expect(mockTabsCreate).toHaveBeenCalledWith({ url: "https://a.com", active: true, windowId: 2 });
  });

  it("should use pendingUrl when url is undefined", async () => {
    mockTabsCreate.mockResolvedValue({
      id: 13,
      url: undefined,
      pendingUrl: "https://pending.com",
      title: "",
      windowId: 1,
      index: 0,
    });

    const executor = getExecutor("open_tab");
    const raw = (await executor.execute({ url: "https://pending.com" })) as string;
    const result = JSON.parse(raw);

    expect(result.url).toBe("https://pending.com");
  });
});

describe("close_tab", () => {
  it("should throw when tab_id is missing", async () => {
    const executor = getExecutor("close_tab");
    await expect(executor.execute({})).rejects.toThrow('缺少必填参数 "tab_id"');
  });

  it("should close the tab", async () => {
    mockTabsRemove.mockResolvedValue(undefined);

    const executor = getExecutor("close_tab");
    const raw = (await executor.execute({ tab_id: 5 })) as string;
    const result = JSON.parse(raw);

    expect(result.success).toBe(true);
    expect(result.tab_id).toBe(5);
    expect(mockTabsRemove).toHaveBeenCalledWith(5);
  });

  it("should propagate error when tab does not exist", async () => {
    mockTabsRemove.mockRejectedValue(new Error("No tab with id: 999"));

    const executor = getExecutor("close_tab");
    await expect(executor.execute({ tab_id: 999 })).rejects.toThrow("No tab with id: 999");
  });
});

describe("activate_tab", () => {
  it("should throw when tab_id is missing", async () => {
    const executor = getExecutor("activate_tab");
    await expect(executor.execute({})).rejects.toThrow('缺少必填参数 "tab_id"');
  });

  it("should activate the tab and focus the window", async () => {
    mockTabsUpdate.mockResolvedValue({
      id: 7,
      url: "https://example.com",
      title: "Example",
      active: true,
      windowId: 3,
    });
    mockWindowsUpdate.mockResolvedValue({});

    const executor = getExecutor("activate_tab");
    const raw = (await executor.execute({ tab_id: 7 })) as string;
    const result = JSON.parse(raw);

    expect(result.id).toBe(7);
    expect(result.active).toBe(true);
    expect(mockTabsUpdate).toHaveBeenCalledWith(7, { active: true });
    expect(mockWindowsUpdate).toHaveBeenCalledWith(3, { focused: true });
  });

  it("should throw when tab is not found", async () => {
    mockTabsUpdate.mockResolvedValue(undefined);

    const executor = getExecutor("activate_tab");
    await expect(executor.execute({ tab_id: 999 })).rejects.toThrow("Tab 999 not found");
  });

  it("should not call windows.update when windowId is falsy", async () => {
    mockTabsUpdate.mockResolvedValue({
      id: 8,
      url: "https://example.com",
      title: "Example",
      active: true,
      windowId: 0,
    });

    const executor = getExecutor("activate_tab");
    await executor.execute({ tab_id: 8 });

    expect(mockTabsUpdate).toHaveBeenCalledWith(8, { active: true });
    expect(mockWindowsUpdate).not.toHaveBeenCalled();
  });
});

describe("open_tab with tab_id (navigate)", () => {
  it("should navigate and wait for load by default", async () => {
    mockTabsUpdate.mockResolvedValue({ id: 42 });
    mockOnUpdatedAddListener.mockImplementation((listener: (tabId: number, info: { status?: string }) => void) => {
      listener(42, { status: "complete" });
    });
    mockTabsGet.mockResolvedValue({
      id: 42,
      url: "https://new-page.com",
      title: "New Page",
      status: "complete",
    });

    const executor = getExecutor("open_tab");
    const raw = (await executor.execute({ tab_id: 42, url: "https://new-page.com" })) as string;
    const result = JSON.parse(raw);

    expect(result.id).toBe(42);
    expect(result.url).toBe("https://new-page.com");
    expect(result.title).toBe("New Page");
    expect(result.status).toBe("complete");
    expect(mockTabsUpdate).toHaveBeenCalledWith(42, { url: "https://new-page.com" });
    expect(mockOnUpdatedAddListener).toHaveBeenCalled();
    expect(mockOnUpdatedRemoveListener).toHaveBeenCalled();
  });

  it("should skip waiting when wait_until_loaded is false", async () => {
    mockTabsUpdate.mockResolvedValue({ id: 42 });
    mockTabsGet.mockResolvedValue({
      id: 42,
      url: "https://new-page.com",
      title: "",
      status: "loading",
    });

    const executor = getExecutor("open_tab");
    const raw = (await executor.execute({
      tab_id: 42,
      url: "https://new-page.com",
      wait_until_loaded: false,
    })) as string;
    const result = JSON.parse(raw);

    expect(result.status).toBe("loading");
    expect(mockOnUpdatedAddListener).not.toHaveBeenCalled();
  });

  it("should ignore updates from other tabs", async () => {
    mockTabsUpdate.mockResolvedValue({ id: 42 });
    mockOnUpdatedAddListener.mockImplementation((listener: (tabId: number, info: { status?: string }) => void) => {
      listener(99, { status: "complete" }); // 其他 tab
      listener(42, { status: "loading" }); // 目标 tab 还在加载
      listener(42, { status: "complete" }); // 目标 tab 加载完成
    });
    mockTabsGet.mockResolvedValue({
      id: 42,
      url: "https://new-page.com",
      title: "Done",
      status: "complete",
    });

    const executor = getExecutor("open_tab");
    const raw = (await executor.execute({ tab_id: 42, url: "https://new-page.com" })) as string;
    const result = JSON.parse(raw);

    expect(result.title).toBe("Done");
  });
});
