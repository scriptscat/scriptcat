import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateInstallUrl, fetchInstallSourceWithPolicy, UrlPolicyViolation, MAX_DOWNLOAD_BYTES } from "./url_policy";

function makeResponse(opts: { url: string; status?: number; body: string; contentLength?: string }) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(opts.body);
  return {
    url: opts.url,
    status: opts.status ?? 200,
    headers: new Headers(opts.contentLength !== undefined ? { "content-length": opts.contentLength } : {}),
    body: {
      getReader() {
        let sent = false;
        return {
          read: async () => {
            if (sent) return { done: true, value: undefined };
            sent = true;
            return { done: false, value: bytes };
          },
          cancel: async () => {},
        };
      },
    },
    text: async () => opts.body,
  };
}

describe("External Access install URL", () => {
  it.each([
    "https://example.com/script.user.js",
    "http://localhost/script.user.js",
    "http://192.168.1.2/script.user.js",
    "https://user:pass@example.com/script.user.js",
    "data:text/javascript,alert(1)",
  ])("接受浏览器能够解析的 URL，不限制协议或网络目标：%s", (url) => {
    expect(validateInstallUrl(url)).toEqual({ ok: true });
  });

  it("拒绝无法解析的 URL", () => {
    expect(validateInstallUrl("not a url").ok).toBe(false);
  });

  it("下载尺寸仍受协议 source/frame 边界约束", () => {
    expect(MAX_DOWNLOAD_BYTES).toBe(2 * 1024 * 1024);
  });
});

describe("MCP install URL 策略 - fetchInstallSourceWithPolicy", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("成功下载并返回代码文本", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(makeResponse({ url: "https://example.com/x.user.js", body: "// ==UserScript==" }));
    vi.stubGlobal("fetch", fetchMock);
    const text = await fetchInstallSourceWithPolicy("https://example.com/x.user.js");
    expect(text).toBe("// ==UserScript==");
  });

  it("允许请求最终重定向到私网目标", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(makeResponse({ url: "https://127.0.0.1/x.user.js", body: "malicious" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchInstallSourceWithPolicy("https://example.com/redirect")).resolves.toBe("malicious");
  });

  it("非 200 状态码拒绝", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(makeResponse({ url: "https://example.com/x.user.js", status: 404, body: "" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchInstallSourceWithPolicy("https://example.com/x.user.js")).rejects.toThrow();
  });

  it("Content-Length 超过 2 MiB 时提前拒绝", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse({
        url: "https://example.com/x.user.js",
        body: "small",
        contentLength: String(MAX_DOWNLOAD_BYTES + 1),
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchInstallSourceWithPolicy("https://example.com/x.user.js")).rejects.toThrow(UrlPolicyViolation);
  });

  it("流式读取中途超过 2 MiB 时中止", async () => {
    const big = "x".repeat(MAX_DOWNLOAD_BYTES + 10);
    const fetchMock = vi.fn().mockResolvedValue(makeResponse({ url: "https://example.com/x.user.js", body: big }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchInstallSourceWithPolicy("https://example.com/x.user.js")).rejects.toThrow(UrlPolicyViolation);
  });

  it("响应不支持流式 body 时回退到 text()，仍返回代码文本", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      url: "https://example.com/x.user.js",
      status: 200,
      headers: new Headers(),
      body: undefined,
      text: async () => "// ==UserScript==\nfallback",
    });
    vi.stubGlobal("fetch", fetchMock);
    const text = await fetchInstallSourceWithPolicy("https://example.com/x.user.js");
    expect(text).toBe("// ==UserScript==\nfallback");
  });

  it("响应不支持流式 body 且 text() 结果超过 2 MiB 时拒绝", async () => {
    const big = "x".repeat(MAX_DOWNLOAD_BYTES + 10);
    const fetchMock = vi.fn().mockResolvedValue({
      url: "https://example.com/x.user.js",
      status: 200,
      headers: new Headers(),
      body: undefined,
      text: async () => big,
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchInstallSourceWithPolicy("https://example.com/x.user.js")).rejects.toThrow(UrlPolicyViolation);
  });
});
