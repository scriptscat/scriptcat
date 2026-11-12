import { describe, it, expect } from "vitest";
import { splitUrlForDisplay } from "./url_display";

describe("splitUrlForDisplay 权限取值里的地址拆分", () => {
  it("拆出协议、域名、可省略的中段与保留的文件名加参数", () => {
    expect(
      splitUrlForDisplay("https://raw.githubusercontent.com/maboloshi/github-chinese/gh-pages/locals.js?v1.9.4")
    ).toEqual({
      prefix: "",
      scheme: "https://",
      host: "raw.githubusercontent.com",
      middle: "/maboloshi/github-chinese/gh-pages",
      tail: "/locals.js?v1.9.4",
    });
  });

  it("路径里的百分号编码解码成可读文字", () => {
    const parts = splitUrlForDisplay(
      "https://greasyfork.org/scripts/435207-%E4%B8%AD%E6%96%87/code/GitHub%20%E4%B8%AD%E6%96%87.js?v1.9.2"
    )!;
    expect(parts.middle).toBe("/scripts/435207-中文/code");
    expect(parts.tail).toBe("/GitHub 中文.js?v1.9.2");
  });

  it("不解码保留字符的编码,避免把 %2F、%3F 显示成真的分隔符", () => {
    const parts = splitUrlForDisplay("https://a.com/x%2F..%2Fb/c.js%3Fv=1")!;
    expect(parts.middle).toBe("/x%2F..%2Fb");
    expect(parts.tail).toBe("/c.js%3Fv=1");
  });

  it("解码结果含双向控制等不可见字符时退回原文,防止伪造文件名", () => {
    const parts = splitUrlForDisplay("https://a.com/lib/%E2%80%AEsj.exe")!;
    expect(parts.tail).toBe("/%E2%80%AEsj.exe");
  });

  it("编码不完整无法解码时原样显示", () => {
    expect(splitUrlForDisplay("https://a.com/lib/100%.js")!.tail).toBe("/100%.js");
  });

  it("查询参数里的斜杠不参与路径切分", () => {
    const parts = splitUrlForDisplay("https://a.com/dir/lib.js?from=x/y")!;
    expect(parts.middle).toBe("/dir");
    expect(parts.tail).toBe("/lib.js?from=x/y");
  });

  it("只有一级路径时没有中段", () => {
    expect(splitUrlForDisplay("https://education.github.com/*")).toEqual({
      prefix: "",
      scheme: "https://",
      host: "education.github.com",
      middle: "",
      tail: "/*",
    });
  });

  it("@resource 的资源名作为前缀保留", () => {
    expect(splitUrlForDisplay("css https://cdn.a.com/x/a.css")).toEqual({
      prefix: "css ",
      scheme: "https://",
      host: "cdn.a.com",
      middle: "/x",
      tail: "/a.css",
    });
  });

  it("通配协议与通配域名的匹配规则同样拆分", () => {
    expect(splitUrlForDisplay("*://*.example.com/*")).toMatchObject({ scheme: "*://", host: "*.example.com" });
  });

  it("不是地址的取值(<all_urls>、正则、*)返回 null,按原文显示", () => {
    expect(splitUrlForDisplay("<all_urls>")).toBeNull();
    expect(splitUrlForDisplay("/^https:\\/\\/a\\.com/")).toBeNull();
    expect(splitUrlForDisplay("*")).toBeNull();
  });
});
