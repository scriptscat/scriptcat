import { describe, expect, it } from "vitest";
import { dealPatternMatches, parsePatternMatchesURL, UrlMatch } from "./match";

// https://developer.chrome.com/docs/extensions/mv3/match_patterns/
describe("UrlMatch-google", () => {
  const url = new UrlMatch<string>();
  url.add("https://*/*", "ok1");
  url.add("https://*/foo*", "ok2");
  url.add("https://*.google.com/foo*bar", "ok3");
  url.add("https://example.org/foo/bar.html", "ok4");
  url.add("http://127.0.0.1/*", "ok5");
  url.add("*://mail.google.com/*", "ok6");
  it("match1", () => {
    expect(url.match("https://www.google.com/")).toEqual(["ok1"]);
    expect(url.match("https://example.org/foo/bar.html")).toEqual(["ok1", "ok2", "ok4"]);
  });
  it("match2", () => {
    expect(url.match("https://example.com/foo/bar.html")).toEqual(["ok1", "ok2"]);
    expect(url.match("https://www.google.com/foo")).toEqual(["ok1", "ok2"]);
    expect(url.match("https://www.google.com/foo2")).toEqual(["ok1", "ok2"]);
  });
  it("match3", () => {
    expect(url.match("https://www.google.com/foo/baz/bar")).toEqual(["ok1", "ok2", "ok3"]);
    expect(url.match("https://docs.google.com/foobar")).toEqual(["ok1", "ok2", "ok3"]);
  });
  it("match4", () => {
    expect(url.match("https://example.org/foo/bar.html")).toEqual(["ok1", "ok2", "ok4"]);
  });
  it("match5", () => {
    expect(url.match("http://127.0.0.1/")).toEqual(["ok5"]);
    expect(url.match("http://127.0.0.1/foo/bar.html")).toEqual(["ok5"]);
  });
  it("match6", () => {
    expect(url.match("http://mail.google.com/foo/baz/bar")).toEqual(["ok6"]);
    expect(url.match("https://mail.google.com/foobar")).toEqual(["ok1", "ok2", "ok3", "ok6"]);
  });
});

describe("UrlMatch-google-error", () => {
  const url = new UrlMatch<string>();
  it("error-1", () => {
    expect(() => {
      url.add("https://*foo/bar", "ok1");
    }).toThrow(Error);
  });
  // 从v0.17.0开始允许这种
  it("error-2", () => {
    url.add("https://foo.*.bar/baz", "ok1");
    expect(url.match("https://foo.api.bar/baz")).toEqual(["ok1"]);
  });
  it("error-3", () => {
    expect(() => {
      url.add("http:/bar", "ok1");
    }).toThrow(Error);
  });
});

// 从tm找的一些特殊的匹配规则
describe("UrlMatch-search", () => {
  const url = new UrlMatch<string>();
  url.add("https://www.google.com/search?q=*", "ok1");
  it("match1", () => {
    expect(url.match("https://www.google.com/search?q=foo")).toEqual(["ok1"]);
    expect(url.match("https://www.google.com/search?q1=foo")).toEqual([]);
  });

  url.add("https://bbs.tampermonkey.net.cn", "ok2");
  it("match2", () => {
    expect(url.match("https://bbs.tampermonkey.net.cn")).toEqual(["ok2"]);
    expect(url.match("https://bbs.tampermonkey.net.cn/")).toEqual(["ok2"]);
    expect(url.match("https://bbs.tampermonkey.net.cn/foo/bar.html")).toEqual([]);
  });
  it("http://api.*.example.com/*", () => {
    const url = new UrlMatch<string>();
    url.add("http://api.*.example.com/*", "ok1");
    expect(url.match("http://api.foo.example.com/")).toEqual(["ok1"]);
    expect(url.match("http://api.bar.example.com/")).toEqual(["ok1"]);
    expect(url.match("http://api.example.com/")).toEqual([]);
  });
});

describe("UrlMatch-port1", () => {
  const url = new UrlMatch<string>();
  url.add("http://test.list.ggnb.top/search", "ok1");
  it("match1", () => {
    expect(url.match("http://test.list.ggnb.top/search")).toEqual(["ok1"]);
    expect(url.match("http://test.list.ggnb.top/search?")).toEqual([]);
    expect(url.match("http://test.list.ggnb.top/search?foo=bar")).toEqual([]);
  });

  it("port", () => {
    expect(url.match("http://test.list.ggnb.top:80/search")).toEqual(["ok1"]);
  });
});

describe("UrlMatch-port2", () => {
  const url = new UrlMatch<string>();
  url.add("http://test.list.ggnb.top:80/search", "ok1");
  url.add("http://test.list.ggnb.top*/search", "ok2");
  url.add("http://test.list.ggnb.top:*/search", "ok3");
  url.add("http://localhost:3000/", "ok4");
  it("match1", () => {
    expect(url.match("http://test.list.ggnb.top:80/search")).toEqual(["ok1", "ok2", "ok3"]);
    expect(url.match("http://test.list.ggnb.top:81/search")).toEqual(["ok2", "ok3"]);
    expect(url.match("http://test.list.ggnb.top/search")).toEqual(["ok1", "ok2", "ok3"]);
  });
  it("case2", () => {
    expect(url.match("http://localhost:3000/")).toEqual(["ok4"]);
    expect(url.match("http://localhost:8000/")).toEqual([]);
  });
});

// https://developer.chrome.com/docs/extensions/mv3/match_patterns/
describe("dealPatternMatches", () => {
  it("https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns?hl=zh-cn#examples", () => {
    const matches = dealPatternMatches([
      "https://*/*",
      "http://127.0.0.1/*",
      "http://127.0.0.1/",
      "https://*.example.com/*",
    ]);
    expect(matches.patternResult).toEqual([
      "https://*/*",
      "http://127.0.0.1/*",
      "http://127.0.0.1/",
      "https://*.example.com/*",
    ]);
  });
  // 处理一些特殊情况
  it("特殊情况", () => {
    const matches = dealPatternMatches([
      "*://www.example.com*",
      "*://api.*.example.com/*",
      "*://api.*.*.example.com/*",
      "*://*example.com/*",
    ]);
    expect(matches.patternResult).toEqual([
      "*://www.example.com/*",
      "*://*.example.com/*",
      "*://*.example.com/*",
      "*://example.com/*",
    ]);
    expect(matches.result).toEqual([
      "*://www.example.com*",
      "*://api.*.example.com/*",
      "*://api.*.*.example.com/*",
      "*://*example.com/*",
    ]);
  });
  it("特殊情况-exclude", () => {
    const matches = dealPatternMatches(["*://api.*.example.com/*", "*://api.*.*.example.com/*"], {
      exclude: true,
    });
    console.log(matches);
    expect(matches.patternResult).toEqual(["*://example.com/*", "*://example.com/*"]);
    expect(matches.result).toEqual(["*://api.*.example.com/*", "*://api.*.*.example.com/*"]);
  });
});

describe("parsePatternMatchesURL", () => {
  it("https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns?hl=zh-cn#examples", () => {
    const matches = parsePatternMatchesURL("https://*/*");
    expect(matches).toEqual({
      scheme: "https",
      host: "*",
      path: "*",
    });
    const matches2 = parsePatternMatchesURL("https://*/foo*");
    expect(matches2).toEqual({
      scheme: "https",
      host: "*",
      path: "foo*",
    });
    const matches3 = parsePatternMatchesURL("http://127.0.0.1/");
    expect(matches3).toEqual({
      scheme: "http",
      host: "127.0.0.1",
      path: "",
    });
  });
  it("search", () => {
    // 会忽略掉search部分
    const matches = parsePatternMatchesURL("https://*/*?search");
    expect(matches).toEqual({
      scheme: "https",
      host: "*",
      path: "*",
    });
  });
  it("*://www.example.com*", () => {
    const matches = parsePatternMatchesURL("*://www.example.com*");
    expect(matches).toEqual({
      scheme: "*",
      host: "www.example.com",
      path: "*",
    });
  });
  it("*://api.*.example.com/*", () => {
    const matches = parsePatternMatchesURL("*://api.*.example.com/*");
    expect(matches).toEqual({
      scheme: "*",
      host: "*.example.com",
      path: "*",
    });
  });
});
