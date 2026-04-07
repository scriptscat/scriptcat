import { describe, it, expect, vi, beforeEach } from "vitest";
import { WebFetchExecutor, stripHtmlTags } from "./web_fetch";

// 通过 mockSender.sendMessage 控制 offscreen extractHtmlContent 的返回值
let mockExtractReturnValue: string | null = null;
let mockExtractShouldThrow = false;

describe("stripHtmlTags", () => {
  it("should remove HTML tags", () => {
    expect(stripHtmlTags("<p>Hello <b>World</b></p>")).toBe("Hello World");
  });

  it("should remove script and style tags with content", () => {
    const html = "<div>text<script>alert(1)</script> <style>.x{}</style>more</div>";
    expect(stripHtmlTags(html)).toBe("text more");
  });

  it("should handle empty string", () => {
    expect(stripHtmlTags("")).toBe("");
  });
});

describe("WebFetchExecutor", () => {
  const mockSender = {
    sendMessage: vi.fn().mockImplementation(() => {
      if (mockExtractShouldThrow) {
        return Promise.reject(new Error("Offscreen unavailable"));
      }
      return Promise.resolve({ data: mockExtractReturnValue });
    }),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    mockExtractReturnValue = null;
    mockExtractShouldThrow = false;
    mockSender.sendMessage.mockImplementation(() => {
      if (mockExtractShouldThrow) {
        return Promise.reject(new Error("Offscreen unavailable"));
      }
      return Promise.resolve({ data: mockExtractReturnValue });
    });
  });

  it("should throw for missing url", async () => {
    const executor = new WebFetchExecutor(mockSender);
    await expect(executor.execute({})).rejects.toThrow('缺少必填参数 "url"');
  });

  it("should throw for invalid url", async () => {
    const executor = new WebFetchExecutor(mockSender);
    await expect(executor.execute({ url: "not-a-url" })).rejects.toThrow("Invalid URL");
  });

  it("should throw for non-http protocol", async () => {
    const executor = new WebFetchExecutor(mockSender);
    await expect(executor.execute({ url: "ftp://example.com" })).rejects.toThrow("Only http/https");
  });

  it("should handle JSON response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      text: () => Promise.resolve('{"key":"value"}'),
    });
    vi.stubGlobal("fetch", mockFetch);

    const executor = new WebFetchExecutor(mockSender);
    const result = JSON.parse((await executor.execute({ url: "https://api.example.com/data" })) as string);

    expect(result.content_type).toBe("json");
    expect(JSON.parse(result.content)).toEqual({ key: "value" });
    expect(result.truncated).toBe(false);
  });

  it("should handle HTML response with offscreen extraction", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "text/html" }),
      text: () => Promise.resolve("<html><body><p>Hello World long content here for testing</p></body></html>"),
    });
    vi.stubGlobal("fetch", mockFetch);
    mockExtractReturnValue = "Hello World long content here for testing extracted properly by offscreen";

    const executor = new WebFetchExecutor(mockSender);
    const result = JSON.parse((await executor.execute({ url: "https://example.com" })) as string);

    expect(result.content_type).toBe("html");
    expect(result.content).toContain("Hello World");
  });

  it("should fallback to stripHtmlTags when extraction returns null", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "text/html" }),
      text: () => Promise.resolve("<p>Simple text</p>"),
    });
    vi.stubGlobal("fetch", mockFetch);
    mockExtractReturnValue = null;

    const executor = new WebFetchExecutor(mockSender);
    const result = JSON.parse((await executor.execute({ url: "https://example.com" })) as string);

    expect(result.content_type).toBe("text");
    expect(result.content).toBe("Simple text");
  });

  it("should truncate content at max_length", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "text/plain" }),
      text: () => Promise.resolve("a".repeat(200)),
    });
    vi.stubGlobal("fetch", mockFetch);

    const executor = new WebFetchExecutor(mockSender);
    const result = JSON.parse((await executor.execute({ url: "https://example.com", max_length: 50 })) as string);

    expect(result.content.length).toBe(50);
    expect(result.truncated).toBe(true);
  });

  it("should throw on HTTP error", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });
    vi.stubGlobal("fetch", mockFetch);

    const executor = new WebFetchExecutor(mockSender);
    await expect(executor.execute({ url: "https://example.com" })).rejects.toThrow("HTTP 404");
  });

  it("should fallback to stripHtmlTags when offscreen extraction throws", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "text/html" }),
      text: () => Promise.resolve("<p>Fallback content</p>"),
    });
    vi.stubGlobal("fetch", mockFetch);
    mockExtractShouldThrow = true;

    const executor = new WebFetchExecutor(mockSender);
    const result = JSON.parse((await executor.execute({ url: "https://example.com" })) as string);

    expect(result.content_type).toBe("text");
    expect(result.content).toBe("Fallback content");
  });

  it("should fallback to stripHtmlTags when extraction result is too short", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "text/html" }),
      text: () => Promise.resolve("<p>Hi</p>"),
    });
    vi.stubGlobal("fetch", mockFetch);
    mockExtractReturnValue = "Hi"; // shorter than 50 chars

    const executor = new WebFetchExecutor(mockSender);
    const result = JSON.parse((await executor.execute({ url: "https://example.com" })) as string);

    expect(result.content_type).toBe("text");
    expect(result.content).toBe("Hi");
  });

  it("should handle invalid JSON with json content-type", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      text: () => Promise.resolve("not valid json {{{"),
    });
    vi.stubGlobal("fetch", mockFetch);

    const executor = new WebFetchExecutor(mockSender);
    const result = JSON.parse((await executor.execute({ url: "https://api.example.com" })) as string);

    // Should fall back to text
    expect(result.content_type).toBe("text");
  });

  it("should handle empty content-type as unknown (try html extraction)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({}),
      text: () =>
        Promise.resolve(
          "<html><body>Long enough content for extraction to work properly and pass the threshold</body></html>"
        ),
    });
    vi.stubGlobal("fetch", mockFetch);
    mockExtractReturnValue = "Long enough content for extraction to work properly and pass the threshold";

    const executor = new WebFetchExecutor(mockSender);
    const result = JSON.parse((await executor.execute({ url: "https://example.com" })) as string);

    expect(result.content_type).toBe("html");
    expect(mockSender.sendMessage).toHaveBeenCalled();
  });

  it("should handle text/plain content-type as plain text", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "text/plain" }),
      text: () => Promise.resolve("Just plain text"),
    });
    vi.stubGlobal("fetch", mockFetch);

    const executor = new WebFetchExecutor(mockSender);
    const result = JSON.parse((await executor.execute({ url: "https://example.com/file.txt" })) as string);

    expect(result.content_type).toBe("text");
    expect(result.content).toBe("Just plain text");
    expect(mockSender.sendMessage).not.toHaveBeenCalled();
  });

  it("should pass User-Agent header and AbortSignal to fetch", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "text/plain" }),
      text: () => Promise.resolve("hello"),
    });
    vi.stubGlobal("fetch", mockFetch);

    const executor = new WebFetchExecutor(mockSender);
    await executor.execute({ url: "https://example.com" });

    expect(mockFetch).toHaveBeenCalledWith("https://example.com", {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ScriptCat Agent)" },
      signal: expect.any(AbortSignal),
    });
  });

  it("should return final_url when response URL differs (redirect)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      url: "https://example.com/redirected",
      headers: new Headers({ "content-type": "text/plain" }),
      text: () => Promise.resolve("content"),
    });
    vi.stubGlobal("fetch", mockFetch);

    const executor = new WebFetchExecutor(mockSender);
    const result = JSON.parse((await executor.execute({ url: "https://example.com" })) as string);

    expect(result.final_url).toBe("https://example.com/redirected");
  });

  it("should not include final_url when no redirect", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      url: "https://example.com",
      headers: new Headers({ "content-type": "text/plain" }),
      text: () => Promise.resolve("content"),
    });
    vi.stubGlobal("fetch", mockFetch);

    const executor = new WebFetchExecutor(mockSender);
    const result = JSON.parse((await executor.execute({ url: "https://example.com" })) as string);

    expect(result.final_url).toBeUndefined();
  });

  it("should not truncate by default", async () => {
    const longContent = "x".repeat(15000);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "text/plain" }),
      text: () => Promise.resolve(longContent),
    });
    vi.stubGlobal("fetch", mockFetch);

    const executor = new WebFetchExecutor(mockSender);
    const result = JSON.parse((await executor.execute({ url: "https://example.com" })) as string);

    expect(result.content.length).toBe(15000);
    expect(result.truncated).toBe(false);
  });
});
