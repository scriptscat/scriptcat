import { describe, it, expect, vi, beforeEach } from "vitest";
import { WebSearchExecutor } from "./web_search";
import type { SearchConfigRepo } from "./search_config";

// mockExtractResults 存储 mock 返回值，通过 mockSender.sendMessage 传递
let mockExtractReturnValue: any[] = [];

describe("WebSearchExecutor", () => {
  const mockSender = {
    sendMessage: vi.fn().mockImplementation(() => Promise.resolve({ data: mockExtractReturnValue })),
  } as any;

  const createMockConfigRepo = (engine: "bing" | "duckduckgo" | "baidu" | "google_custom"): SearchConfigRepo => ({
    getConfig: vi.fn().mockResolvedValue({
      engine,
      googleApiKey: engine === "google_custom" ? "test-key" : undefined,
      googleCseId: engine === "google_custom" ? "test-cse" : undefined,
    }),
    saveConfig: vi.fn(),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    mockExtractReturnValue = [];
    mockSender.sendMessage.mockImplementation(() => Promise.resolve({ data: mockExtractReturnValue }));
  });

  it("should throw for missing query", async () => {
    const executor = new WebSearchExecutor(mockSender, createMockConfigRepo("duckduckgo"));
    await expect(executor.execute({})).rejects.toThrow('缺少必填参数 "query"');
  });

  it("should search DuckDuckGo and return results", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("<html><div class='result'>...</div></html>"),
    });
    vi.stubGlobal("fetch", mockFetch);

    mockExtractReturnValue = [
      { title: "Result 1", url: "https://example.com/1", snippet: "Snippet 1" },
      { title: "Result 2", url: "https://example.com/2", snippet: "Snippet 2" },
    ];

    const executor = new WebSearchExecutor(mockSender, createMockConfigRepo("duckduckgo"));
    const result = JSON.parse((await executor.execute({ query: "test search" })) as string);

    expect(result).toHaveLength(2);
    expect(result[0].title).toBe("Result 1");
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("html.duckduckgo.com"), expect.any(Object));
  });

  it("should respect max_results", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("<html></html>"),
    });
    vi.stubGlobal("fetch", mockFetch);

    const manyResults = Array.from({ length: 10 }, (_, i) => ({
      title: `R${i}`,
      url: `https://example.com/${i}`,
      snippet: `S${i}`,
    }));
    mockExtractReturnValue = manyResults;

    const executor = new WebSearchExecutor(mockSender, createMockConfigRepo("duckduckgo"));
    const result = JSON.parse((await executor.execute({ query: "test", max_results: 3 })) as string);

    expect(result).toHaveLength(3);
  });

  it("should cap max_results at 10", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("<html></html>"),
    });
    vi.stubGlobal("fetch", mockFetch);

    const manyResults = Array.from({ length: 15 }, (_, i) => ({
      title: `R${i}`,
      url: `https://example.com/${i}`,
      snippet: `S${i}`,
    }));
    mockExtractReturnValue = manyResults;

    const executor = new WebSearchExecutor(mockSender, createMockConfigRepo("duckduckgo"));
    const result = JSON.parse((await executor.execute({ query: "test", max_results: 20 })) as string);

    expect(result).toHaveLength(10);
  });

  it("should search Google Custom Search API", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          items: [{ title: "Google Result", link: "https://example.com", snippet: "Google snippet" }],
        }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const executor = new WebSearchExecutor(mockSender, createMockConfigRepo("google_custom"));
    const result = JSON.parse((await executor.execute({ query: "google test" })) as string);

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Google Result");
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("googleapis.com/customsearch"), expect.any(Object));
  });

  it("should throw when DuckDuckGo returns error", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    });
    vi.stubGlobal("fetch", mockFetch);

    const executor = new WebSearchExecutor(mockSender, createMockConfigRepo("duckduckgo"));
    await expect(executor.execute({ query: "test" })).rejects.toThrow("DuckDuckGo search failed");
  });

  it("should throw when Google API returns error", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: () => Promise.resolve("Forbidden"),
    });
    vi.stubGlobal("fetch", mockFetch);

    const executor = new WebSearchExecutor(mockSender, createMockConfigRepo("google_custom"));
    await expect(executor.execute({ query: "test" })).rejects.toThrow("Google search failed: HTTP 403");
  });

  it("should throw when Google config is missing API key", async () => {
    const configRepo: SearchConfigRepo = {
      getConfig: vi.fn().mockResolvedValue({
        engine: "google_custom",
        googleApiKey: "",
        googleCseId: "",
      }),
      saveConfig: vi.fn(),
    };

    const executor = new WebSearchExecutor(mockSender, configRepo);
    await expect(executor.execute({ query: "test" })).rejects.toThrow("Google Custom Search requires API Key");
  });

  it("should handle Google API returning no items", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });
    vi.stubGlobal("fetch", mockFetch);

    const executor = new WebSearchExecutor(mockSender, createMockConfigRepo("google_custom"));
    const result = JSON.parse((await executor.execute({ query: "test" })) as string);

    expect(result).toEqual([]);
  });

  it("should pass AbortSignal to DuckDuckGo fetch for 15s timeout", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("<html></html>"),
    });
    vi.stubGlobal("fetch", mockFetch);
    mockExtractReturnValue = [];

    const executor = new WebSearchExecutor(mockSender, createMockConfigRepo("duckduckgo"));
    await executor.execute({ query: "test" });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("html.duckduckgo.com"),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("should pass AbortSignal to Google fetch for 15s timeout", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ items: [] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const executor = new WebSearchExecutor(mockSender, createMockConfigRepo("google_custom"));
    await executor.execute({ query: "test" });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("googleapis.com/customsearch"),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("should return warning when extractSearchResults times out", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("<html><div class='result'>...</div></html>"),
    });
    vi.stubGlobal("fetch", mockFetch);

    // 模拟 extractSearchResults 抛出超时错误（等效于 Promise.race 超时）
    mockSender.sendMessage.mockImplementation(() => Promise.reject(new Error("extract timeout")));

    const executor = new WebSearchExecutor(mockSender, createMockConfigRepo("duckduckgo"));
    const result = JSON.parse((await executor.execute({ query: "test" })) as string);

    expect(result.results).toEqual([]);
    expect(result.warning).toContain("extraction failed");
    expect(result.warning).toContain("DuckDuckGo");
  });

  it("should search Bing and return results", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () =>
        Promise.resolve(
          "<html><li class='b_algo'><h2><a href='https://example.com'>Bing Result</a></h2><div class='b_caption'><p>Bing snippet</p></div></li></html>"
        ),
    });
    vi.stubGlobal("fetch", mockFetch);

    mockExtractReturnValue = [{ title: "Bing Result", url: "https://example.com", snippet: "Bing snippet" }];

    const executor = new WebSearchExecutor(mockSender, createMockConfigRepo("bing"));
    const result = JSON.parse((await executor.execute({ query: "bing test" })) as string);

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Bing Result");
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("bing.com/search"), expect.any(Object));
  });

  it("should throw when Bing returns error", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    });
    vi.stubGlobal("fetch", mockFetch);

    const executor = new WebSearchExecutor(mockSender, createMockConfigRepo("bing"));
    await expect(executor.execute({ query: "test" })).rejects.toThrow("Bing search failed");
  });

  it("should return warning when Bing extraction fails", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("<html></html>"),
    });
    vi.stubGlobal("fetch", mockFetch);

    mockSender.sendMessage.mockImplementation(() => Promise.reject(new Error("extract timeout")));

    const executor = new WebSearchExecutor(mockSender, createMockConfigRepo("bing"));
    const result = JSON.parse((await executor.execute({ query: "test" })) as string);

    expect(result.results).toEqual([]);
    expect(result.warning).toContain("extraction failed");
    expect(result.warning).toContain("Bing");
  });

  it("should search Baidu and return results", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () =>
        Promise.resolve(
          "<html><div class='result'><h3 class='t'><a href='https://example.com'>Baidu Result</a></h3><div class='c-abstract'>Baidu snippet</div></div></html>"
        ),
    });
    vi.stubGlobal("fetch", mockFetch);

    mockExtractReturnValue = [{ title: "Baidu Result", url: "https://example.com", snippet: "Baidu snippet" }];

    const executor = new WebSearchExecutor(mockSender, createMockConfigRepo("baidu"));
    const result = JSON.parse((await executor.execute({ query: "百度测试" })) as string);

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Baidu Result");
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("baidu.com/s"), expect.any(Object));
  });

  it("should throw when Baidu returns error", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    });
    vi.stubGlobal("fetch", mockFetch);

    const executor = new WebSearchExecutor(mockSender, createMockConfigRepo("baidu"));
    await expect(executor.execute({ query: "test" })).rejects.toThrow("Baidu search failed");
  });

  it("should default to 5 results when max_results not specified", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("<html></html>"),
    });
    vi.stubGlobal("fetch", mockFetch);

    const manyResults = Array.from({ length: 8 }, (_, i) => ({
      title: `R${i}`,
      url: `https://example.com/${i}`,
      snippet: `S${i}`,
    }));
    mockExtractReturnValue = manyResults;

    const executor = new WebSearchExecutor(mockSender, createMockConfigRepo("duckduckgo"));
    const result = JSON.parse((await executor.execute({ query: "test" })) as string);

    expect(result).toHaveLength(5);
  });
});
