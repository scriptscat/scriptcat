import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validateInstallUrl,
  fetchInstallSourceWithPolicy,
  UrlPolicyViolation,
  MAX_REDIRECTS,
  MAX_DOWNLOAD_BYTES,
} from "./url_policy";

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

describe("MCP install URL 策略 - validateInstallUrl（doc 04 §5）", () => {
  it("接受 https URL", () => {
    expect(validateInstallUrl("https://example.com/script.user.js")).toEqual({ ok: true });
  });

  it("拒绝 http（非 https）", () => {
    const result = validateInstallUrl("http://example.com/script.user.js");
    expect(result.ok).toBe(false);
  });

  it("拒绝 file:", () => {
    expect(validateInstallUrl("file:///etc/passwd").ok).toBe(false);
  });

  it("拒绝 data:", () => {
    expect(validateInstallUrl("data:text/javascript,alert(1)").ok).toBe(false);
  });

  it("拒绝 javascript:", () => {
    expect(validateInstallUrl("javascript:alert(1)").ok).toBe(false);
  });

  it("拒绝 blob:", () => {
    expect(validateInstallUrl("blob:https://example.com/uuid").ok).toBe(false);
  });

  it("拒绝含内嵌凭据的 URL（user:pass@host）", () => {
    expect(validateInstallUrl("https://user:pass@example.com/script.user.js").ok).toBe(false);
  });

  it("拒绝无法解析的 URL", () => {
    expect(validateInstallUrl("not a url").ok).toBe(false);
  });

  describe("私有/内网/回环/链路本地/组播目标全部拒绝", () => {
    const rejected = [
      "https://127.0.0.1/x.user.js",
      "https://localhost/x.user.js",
      "https://10.0.0.1/x.user.js",
      "https://172.16.0.1/x.user.js",
      "https://172.31.255.255/x.user.js",
      "https://192.168.1.1/x.user.js",
      "https://169.254.1.1/x.user.js",
      "https://224.0.0.1/x.user.js",
      "https://[::1]/x.user.js",
      "https://[fe80::1]/x.user.js",
      "https://[fc00::1]/x.user.js",
    ];
    it.each(rejected)("拒绝 %s", (url) => {
      expect(validateInstallUrl(url).ok).toBe(false);
    });
  });

  it("接受非私有范围的公网类字面量 IP（策略只拦截保留段，不做 DNS 解析）", () => {
    expect(validateInstallUrl("https://93.184.216.34/x.user.js")).toEqual({ ok: true });
  });

  it("限制常量与 doc 04 §7 一致", () => {
    expect(MAX_REDIRECTS).toBe(3);
    expect(MAX_DOWNLOAD_BYTES).toBe(2 * 1024 * 1024);
  });
});

describe("MCP install URL 策略 - fetchInstallSourceWithPolicy", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("初始 URL 违反策略时,不发起网络请求", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchInstallSourceWithPolicy("http://example.com/x.user.js")).rejects.toThrow(UrlPolicyViolation);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("成功下载并返回代码文本", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(makeResponse({ url: "https://example.com/x.user.js", body: "// ==UserScript==" }));
    vi.stubGlobal("fetch", fetchMock);
    const text = await fetchInstallSourceWithPolicy("https://example.com/x.user.js");
    expect(text).toBe("// ==UserScript==");
  });

  it("重定向后的最终 URL 落在私网目标时拒绝", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(makeResponse({ url: "https://127.0.0.1/x.user.js", body: "malicious" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchInstallSourceWithPolicy("https://example.com/redirect")).rejects.toThrow(UrlPolicyViolation);
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
});
