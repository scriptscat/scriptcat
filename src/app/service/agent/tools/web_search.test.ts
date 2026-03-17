import { describe, it, expect, vi, beforeEach } from "vitest";
import { WebSearchExecutor } from "./web_search";
import type { SearchConfigRepo } from "./search_config";

// mockExtractResults 存储 mock 返回值，通过 mockSender.sendMessage 传递
let mockExtractReturnValue: any[] = [];

describe("WebSearchExecutor", () => {
  const mockSender = {
    sendMessage: vi.fn().mockImplementation(() => Promise.resolve({ data: mockExtractReturnValue })),
  } as any;

  const createMockConfigRepo = (engine: "duckduckgo" | "google_custom"): SearchConfigRepo => ({
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
    await expect(executor.execute({})).rejects.toThrow("query is required");
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
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("googleapis.com/customsearch"));
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
