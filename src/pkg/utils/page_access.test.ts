import { describe, expect, it } from "vitest";
import { getPageAccessKind, isExtensionStoreUrl, toOrigin } from "./page_access";

describe("getPageAccessKind 页面可注入性分类", () => {
  it.each([
    "chrome://settings/",
    "chrome://flags/",
    "chrome-untrusted://terminal/",
    "edge://settings/",
    "about:addons",
    "devtools://devtools/bundled/inspector.html",
    "view-source:https://example.com/",
    "chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html",
    "moz-extension://11111111-2222-3333-4444-555555555555/popup.html",
  ])("浏览器内部页 / 扩展页不可注入：%s", (url) => {
    expect(getPageAccessKind(url)).toBe("restricted");
  });

  it("商店页在协议层面仍是普通 https 网页——是否注入得了由浏览器决定，不在此判定", () => {
    expect(getPageAccessKind("https://chromewebstore.google.com/detail/abc")).toBe("web");
  });

  it.each(["https://example.com/", "http://example.com/a?b=1", "https://xn--fiq228c.tld/"])(
    "普通 http(s) 页可注入：%s",
    (url) => {
      expect(getPageAccessKind(url)).toBe("web");
    }
  );

  it.each(["file:///Users/me/a.html", "file:///D:/tmp/b.htm"])("本地文件另成一类（需额外授权）：%s", (url) => {
    expect(getPageAccessKind(url)).toBe("file");
  });

  it.each(["", "not a url", "about:blank"])("无法解析或无内容的地址按不可注入处理：%s", (url) => {
    expect(getPageAccessKind(url)).toBe("restricted");
  });
});

describe("isExtensionStoreUrl 扩展商店页识别", () => {
  it.each([
    "https://chromewebstore.google.com/detail/abc",
    "https://chrome.google.com/webstore/detail/abc",
    "https://addons.mozilla.org/zh-CN/firefox/addon/abc/",
    "https://microsoftedge.microsoft.com/addons/detail/abcdefgh",
    "https://microsoftedge.microsoft.com/addons/Microsoft-Edge-Extensions-Home",
  ])("各浏览器的扩展商店：%s", (url) => {
    expect(isExtensionStoreUrl(url)).toBe(true);
  });

  it.each([
    "https://chrome.google.com/intl/zh-CN/chrome/",
    "https://microsoftedge.microsoft.com/",
    "https://www.microsoft.com/edge",
    "https://example.com/addons/detail",
  ])("同域下的非商店路径与同名路径不算商店：%s", (url) => {
    expect(isExtensionStoreUrl(url)).toBe(false);
  });

  it("无法解析的地址不算商店", () => {
    expect(isExtensionStoreUrl("not a url")).toBe(false);
  });
});

describe("toOrigin 注入前提的同一性", () => {
  it("同源不同路径/查询视为同一 origin（SPA 换页不应失效）", () => {
    expect(toOrigin("https://example.com/a?b=1")).toBe(toOrigin("https://example.com/c"));
  });

  it("不同 host 或不同端口不是同一 origin", () => {
    expect(toOrigin("https://example.com/")).not.toBe(toOrigin("https://other.com/"));
    expect(toOrigin("http://example.com:8080/")).not.toBe(toOrigin("http://example.com/"));
  });

  it("本地文件页之间共享同一授权前提", () => {
    expect(toOrigin("file:///a.html")).toBe("file://");
    expect(toOrigin("file:///b/c.html")).toBe("file://");
  });

  it("无法解析的地址返回空字符串", () => {
    expect(toOrigin("not a url")).toBe("");
  });
});
