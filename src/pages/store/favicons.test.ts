import {
  extractFaviconsDomain,
  extractDomainFromPattern,
  parseFaviconsNew,
  fetchIconByService,
  fetchIconByDomain,
  timeoutAbortSignal,
} from "@App/pages/store/favicons";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("extractFaviconsDomain", () => {
  it("应该正确提取各种URL模式的域名", () => {
    const result = extractFaviconsDomain(
      [
        "https://example.com/*", // 基本的match模式
        "https://*.sub.com/*", // 通配符域名模式 -> sub.com
        "https://a.*.domain.com/*", // 多个通配符 -> domain.com
        "https://.site.com/*", // 以点开头的域名 -> site.com
        "https://web.cn*/*", // 以通配符结尾的域名 -> web.cn
        "*://test.com/*", // 通配符协议
        "https://sub.domain.com/*", // 子域名
        "https://host.com:8080/*", // 带端口号
        "simple.com", // 纯域名字符串
        "invalid-pattern", // 无效的模式
      ],
      []
    );

    expect(result).toHaveLength(10);
    expect(result[0]).toEqual({ match: "https://example.com/*", domain: "example.com" });
    expect(result[1]).toEqual({ match: "https://*.sub.com/*", domain: "sub.com" });
    expect(result[2]).toEqual({ match: "https://a.*.domain.com/*", domain: "domain.com" });
    expect(result[3]).toEqual({ match: "https://.site.com/*", domain: "site.com" });
    expect(result[4]).toEqual({ match: "https://web.cn*/*", domain: "web.cn" });
    expect(result[5]).toEqual({ match: "*://test.com/*", domain: "test.com" });
    expect(result[6]).toEqual({ match: "https://sub.domain.com/*", domain: "sub.domain.com" });
    expect(result[7]).toEqual({ match: "https://host.com:8080/*", domain: "host.com:8080" });
    expect(result[8]).toEqual({ match: "simple.com", domain: "simple.com" });
    expect(result[9]).toEqual({ match: "invalid-pattern", domain: "" });

    // 同时处理match和include规则
    const result2 = extractFaviconsDomain(["https://match.com/*"], ["https://include.com/*"]);
    expect(result2).toHaveLength(2);
    expect(result2[0]).toEqual({ match: "https://match.com/*", domain: "match.com" });
    expect(result2[1]).toEqual({ match: "https://include.com/*", domain: "include.com" });

    // 空数组和默认参数
    expect(extractFaviconsDomain([], [])).toEqual([]);
    expect(extractFaviconsDomain()).toEqual([]);
  });

  it("相同域名应该去重", () => {
    const result = extractFaviconsDomain(["https://example.com/page1", "https://example.com/page2"], []);
    // 两个pattern提取出相同域名 example.com，应去重
    expect(result).toHaveLength(1);
    expect(result[0].domain).toBe("example.com");
  });
});

describe("extractDomainFromPattern", () => {
  // 基础场景已在 extractFaviconsDomain 中覆盖，这里只测试额外边界情况
  it("应该从带query参数的URL中提取域名", () => {
    expect(extractDomainFromPattern("https://www.google.com/search?q=test")).toBe("www.google.com");
  });

  it("空字符串应返回null", () => {
    expect(extractDomainFromPattern("")).toBe(null);
  });
});

describe("parseFaviconsNew", () => {
  it("应该解析标准favicon link标签", () => {
    const hrefs: string[] = [];
    const html = '<html><head><link rel="icon" href="/favicon.ico"></head></html>';
    parseFaviconsNew(html, (href) => hrefs.push(href));
    expect(hrefs).toEqual(["/favicon.ico"]);
  });

  it("应该解析apple-touch-icon", () => {
    const hrefs: string[] = [];
    const html = '<link rel="apple-touch-icon" href="/apple-icon.png">';
    parseFaviconsNew(html, (href) => hrefs.push(href));
    expect(hrefs).toEqual(["/apple-icon.png"]);
  });

  it("应该解析apple-touch-icon-precomposed", () => {
    const hrefs: string[] = [];
    const html = '<link rel="apple-touch-icon-precomposed" href="/precomposed.png">';
    parseFaviconsNew(html, (href) => hrefs.push(href));
    expect(hrefs).toEqual(["/precomposed.png"]);
  });

  it("应该解析多个favicon link标签", () => {
    const hrefs: string[] = [];
    const html = `
      <link rel="icon" href="/icon1.png">
      <link rel="icon" href="/icon2.png">
      <link rel="apple-touch-icon" href="/icon3.png">
    `;
    parseFaviconsNew(html, (href) => hrefs.push(href));
    expect(hrefs).toHaveLength(3);
    expect(hrefs).toEqual(["/icon1.png", "/icon2.png", "/icon3.png"]);
  });

  it("没有link标签时不应调用回调", () => {
    const callback = vi.fn();
    parseFaviconsNew("<html><body>hello</body></html>", callback);
    expect(callback).not.toHaveBeenCalled();
  });

  it("应该忽略非favicon的link标签", () => {
    const hrefs: string[] = [];
    const html = '<link rel="stylesheet" href="/style.css"><link rel="icon" href="/icon.png">';
    parseFaviconsNew(html, (href) => hrefs.push(href));
    expect(hrefs).toEqual(["/icon.png"]);
  });

  it("应该处理单引号和双引号", () => {
    const hrefs: string[] = [];
    const html = `<link rel='icon' href='/icon1.png'><link rel="icon" href="/icon2.png">`;
    parseFaviconsNew(html, (href) => hrefs.push(href));
    expect(hrefs).toEqual(["/icon1.png", "/icon2.png"]);
  });

  it("应该处理大小写混合的标签", () => {
    const hrefs: string[] = [];
    const html = '<LINK REL="icon" HREF="/icon.png">';
    parseFaviconsNew(html, (href) => hrefs.push(href));
    expect(hrefs).toEqual(["/icon.png"]);
  });
});

// 创建模拟HTML Response的辅助函数
const mockHtmlResponse = (url: string, html: string) => ({
  ok: true,
  url,
  headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
  arrayBuffer: () => Promise.resolve(new TextEncoder().encode(html).buffer),
});

describe("fetchIconByService", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        url: "https://example.com/favicon.ico",
        text: () => Promise.resolve(""),
        blob: () => Promise.resolve(new Blob()),
        headers: new Headers({ "content-type": "text/html" }),
      })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("scriptcat服务应返回scriptcat API URL", async () => {
    const result = await fetchIconByService("example.com", "scriptcat");
    expect(result).toEqual(["https://ext.scriptcat.org/api/v1/open/favicons?domain=example.com&sz=64"]);
  });

  it("google服务应返回Google favicon URL", async () => {
    const result = await fetchIconByService("example.com", "google");
    expect(result).toEqual(["https://www.google.com/s2/favicons?domain=example.com&sz=64"]);
  });

  it("应该对域名进行URL编码", async () => {
    const result = await fetchIconByService("例え.jp", "scriptcat");
    expect(result).toEqual([
      `https://ext.scriptcat.org/api/v1/open/favicons?domain=${encodeURIComponent("例え.jp")}&sz=64`,
    ]);
  });

  // local 服务的具体行为已在 fetchIconByDomain 测试中充分覆盖
});

describe("fetchIconByDomain", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("应该从HTML中解析favicon并验证", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string | URL) => {
        const urlStr = url.toString();
        if (urlStr === "https://example.com") {
          return Promise.resolve(
            mockHtmlResponse(
              "https://example.com/",
              '<html><head><link rel="icon" href="/static/favicon.ico"></head></html>'
            )
          );
        }
        return Promise.resolve({ ok: true, url: "https://example.com/static/favicon.ico" });
      })
    );

    const icons = await fetchIconByDomain("example.com");
    expect(icons).toEqual(["https://example.com/static/favicon.ico"]);
  });

  it("没有link标签时应回退到/favicon.ico", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string | URL) => {
        const urlStr = url.toString();
        if (urlStr === "https://noicon.com") {
          return Promise.resolve(mockHtmlResponse("https://noicon.com/", "<html><head></head></html>"));
        }
        return Promise.resolve({ ok: true, url: "https://noicon.com/favicon.ico" });
      })
    );

    const icons = await fetchIconByDomain("noicon.com");
    expect(icons).toEqual(["https://noicon.com/favicon.ico"]);
  });

  it("HEAD请求失败时应过滤掉该icon", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string | URL) => {
        const urlStr = url.toString();
        if (urlStr === "https://fail.com") {
          return Promise.resolve(
            mockHtmlResponse("https://fail.com/", '<html><head><link rel="icon" href="/missing.ico"></head></html>')
          );
        }
        return Promise.reject(new Error("Not found"));
      })
    );

    const icons = await fetchIconByDomain("fail.com");
    expect(icons).toEqual([]);
  });

  it("HEAD请求返回非OK状态时应过滤掉该icon", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string | URL) => {
        const urlStr = url.toString();
        if (urlStr === "https://badstatus.com") {
          return Promise.resolve(
            mockHtmlResponse("https://badstatus.com/", '<html><head><link rel="icon" href="/icon.png"></head></html>')
          );
        }
        return Promise.resolve({ ok: false, url: "https://badstatus.com/icon.png" });
      })
    );

    const icons = await fetchIconByDomain("badstatus.com");
    expect(icons).toEqual([]);
  });

  it("HEAD请求重定向到不同文件名时应过滤", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string | URL) => {
        const urlStr = url.toString();
        if (urlStr === "https://redirect.com") {
          return Promise.resolve(
            mockHtmlResponse("https://redirect.com/", '<html><head><link rel="icon" href="/icon.png"></head></html>')
          );
        }
        return Promise.resolve({ ok: true, url: "https://redirect.com/404.html" });
      })
    );

    const icons = await fetchIconByDomain("redirect.com");
    expect(icons).toEqual([]);
  });

  it("应该正确解析相对URL为绝对URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string | URL) => {
        const urlStr = url.toString();
        if (urlStr === "https://cdn.example.com") {
          // 页面重定向到了不同的URL
          return Promise.resolve(
            mockHtmlResponse(
              "https://www.example.com/home",
              '<html><head><link rel="icon" href="../assets/icon.png"></head></html>'
            )
          );
        }
        return Promise.resolve({ ok: true, url: "https://www.example.com/assets/icon.png" });
      })
    );

    const icons = await fetchIconByDomain("cdn.example.com");
    expect(icons).toEqual(["https://www.example.com/assets/icon.png"]);
  });

  it("应该处理多个favicon并全部验证", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string | URL) => {
        const urlStr = url.toString();
        if (urlStr === "https://multi.com") {
          return Promise.resolve(
            mockHtmlResponse(
              "https://multi.com/",
              `<html><head>
                <link rel="icon" href="/icon16.png">
                <link rel="icon" href="/icon32.png">
                <link rel="apple-touch-icon" href="/apple.png">
              </head></html>`
            )
          );
        }
        // 所有HEAD请求都成功
        return Promise.resolve({ ok: true, url: urlStr });
      })
    );

    const icons = await fetchIconByDomain("multi.com");
    expect(icons).toHaveLength(3);
    expect(icons).toContain("https://multi.com/icon16.png");
    expect(icons).toContain("https://multi.com/icon32.png");
    expect(icons).toContain("https://multi.com/apple.png");
  });
});

describe("timeoutAbortSignal", () => {
  it("应该返回AbortSignal", () => {
    const signal = timeoutAbortSignal(5000);
    expect(signal).toBeInstanceOf(AbortSignal);
  });
});
