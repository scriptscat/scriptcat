import { describe, expect, it } from "vitest";
import { dealPatternMatches, parsePatternMatchesURL, UrlMatch } from "./match";
import { v4 as uuidv4 } from "uuid";

// https://developer.chrome.com/docs/extensions/mv3/match_patterns/
describe("UrlMatch-google", () => {
  const url = new UrlMatch<string>();
  url.add("https://*/*", "ok1");
  url.add("https://*/foo*", "ok2");
  url.add("https://*.google.com/foo*bar", "ok3");
  url.add("https://example.org/foo/bar.html", "ok4");
  url.add("http://127.0.0.1/*", "ok5");
  url.add("*://mail.google.com/*", "ok6");
  url.exclude("https://example-2.org/foo/bar.html", "ok1");
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
  it("exclude", () => {
    expect(url.match("https://example-2.org/foo/bar.html")).toEqual(["ok2"]);
  });
});

describe("UrlMatch-google-error", () => {
  const url = new UrlMatch<string>();
  it("error-1", () => {
    url.add("https://foo.*.bar/baz", "ok1");
    expect(url.match("https://foo.api.bar/baz")).toEqual(["ok1"]);
  });
});

// 从tm找的一些特殊的匹配规则
describe("UrlMatch-special", () => {
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
  it("*://example*/*/example.path*", () => {
    const url = new UrlMatch<string>();
    url.add("*://example*/*/example.path*", "ok1");
    expect(url.match("https://example.com/foo/example.path")).toEqual(["ok1"]);
    expect(url.match("https://example.com/foo/bar/example.path")).toEqual(["ok1"]);
    expect(url.match("https://example.com/foo/bar/example.path2")).toEqual(["ok1"]);
  });
  it("*.example.com/path/*", () => {
    const url = new UrlMatch<string>();
    url.add("*.example.com/path/*", "ok1");
    expect(url.match("https://www.example.com/path/foo")).toEqual(["ok1"]);
    expect(url.match("https://www.example.com/path/foo/bar")).toEqual(["ok1"]);
    expect(url.match("https://www.example.com/path/foo/bar/baz")).toEqual(["ok1"]);
    expect(url.match("https://www.example.com/path2/foo")).toEqual([]);
  });
  it("http*", () => {
    const url = new UrlMatch<string>();
    url.add("http*", "ok1");
    expect(url.match("http://www.example.com")).toEqual(["ok1"]);
    expect(url.match("https://www.example.com")).toEqual(["ok1"]);
  });
  it("/^.*?://.*?.example.com.*?$/", () => {
    const url = new UrlMatch<string>();
    url.add("/^.*?://.*?.example.com.*?$/", "ok1");
    expect(url.match("https://www.example.com")).toEqual(["ok1"]);
    expect(url.match("http://www.example.com")).toEqual(["ok1"]);
    expect(url.match("https://api.example.com/foo/bar")).toEqual(["ok1"]);
    expect(url.match("https://api.foo.example.com/foo/bar")).toEqual(["ok1"]);
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

describe("UrlMatch-exclude", () => {
  it("exclue-port", () => {
    const url = new UrlMatch<string>();
    url.add("*://*/*", "ok3");
    url.exclude("*:5244*", "ok3");
    expect(url.match("http://test.list.ggnb.top:5244/search")).toEqual([]);
    expect(url.match("http://test.list.ggnb.top:80/search")).toEqual(["ok3"]);
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
      "https://*.example.com/foo?search",
    ]);
    expect(matches.patternResult).toEqual([
      "https://*/*",
      "http://127.0.0.1/*",
      "http://127.0.0.1/",
      "https://*.example.com/*",
      "https://*.example.com/foo*",
    ]);
  });
  // 处理一些特殊情况
  it("特殊情况", () => {
    const matches = dealPatternMatches([
      "*://www.example.com*",
      "*://api.*.example.com/*",
      "*://api.*.*.example.com/*",
      "*://*example.com/*",
      "*.example.com/path/*",
      "http*",
      "/^.*?://.*?.example.com.*?$/",
      "*://*.example.tld/*",
    ]);
    expect(matches.patternResult).toEqual([
      "*://*/*",
      "*://*.example.com/*",
      "*://*.example.com/*",
      "*://example.com/*",
      "*://*.example.com/path/*",
      "*://*/*", // http*
      "*://*/*", // 正则
      "*://*/*", // tld
    ]);
    expect(matches.result).toEqual([
      "*://www.example.com*",
      "*://api.*.example.com/*",
      "*://api.*.*.example.com/*",
      "*://*example.com/*",
      "*.example.com/path/*",
      "http*",
      "/^.*?://.*?.example.com.*?$/",
      "*://*.example.tld/*",
    ]);
  });
  it("特殊情况-exclude", () => {
    const matches = dealPatternMatches(["*://api.*.example.com/*", "*://api.*.*.example.com/*"], {
      exclude: true,
    });
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
    const matches4 = parsePatternMatchesURL("*://*/*");
    expect(matches4).toEqual({
      scheme: "*",
      host: "*",
      path: "*",
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
      host: "*",
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
  it("端口", () => {
    const matches = parsePatternMatchesURL("http://examle:80/search");
    expect(matches).toEqual({
      scheme: "http",
      host: "examle:*",
      path: "search",
    });
  });
  it("tld顶级域名", () => {
    const matches = parsePatternMatchesURL("http://*.example.tld/*");
    expect(matches).toEqual({
      scheme: "http",
      host: "*",
      path: "*",
    });
  });
  it("一些怪异的情况", () => {
    let matches = parsePatternMatchesURL("*://*./*");
    expect(matches).toEqual({
      scheme: "*",
      host: "*",
      path: "*",
    });
    matches = parsePatternMatchesURL("*://example*/*");
    expect(matches).toEqual({
      scheme: "*",
      host: "*",
      path: "*",
    });
    matches = parsePatternMatchesURL("http*://*.example.com/*");
    expect(matches).toEqual({
      scheme: "*",
      host: "*.example.com",
      path: "*",
    });
    matches = parsePatternMatchesURL("*.example.com/path/*");
    expect(matches).toEqual({
      scheme: "*",
      host: "*.example.com",
      path: "path/*",
    });
    matches = parsePatternMatchesURL("http*");
    expect(matches).toEqual({
      scheme: "*",
      host: "*",
      path: "*",
    });
    matches = parsePatternMatchesURL("/^.*?://.*?.example.com.*?$/");
    expect(matches).toEqual({
      scheme: "*",
      host: "*",
      path: "*",
    });
  });
});

const makeUrlMatcher = (uuid: string, matchesList: string[], excludeMatchesList: string[]) => {
  const patternMatches = dealPatternMatches(matchesList);
  const matchesResult = patternMatches.result;
  const matches = patternMatches.patternResult;
  const result = dealPatternMatches(excludeMatchesList, {
    exclude: true,
  });
  const excludeMatchesResult = result.result;
  const excludeMatches = result.patternResult;

  const urlMatcher = new UrlMatch<string>();
  for (const match of matchesResult) {
    urlMatcher.add(match, uuid);
  }
  for (const exclude of excludeMatchesResult) {
    urlMatcher.exclude(exclude, uuid);
  }

  return { urlMatcher, matches, excludeMatches };
};

describe("UrlMatch-exclusion", () => {
  it("exclusion-1", () => {
    const matchesList: string[] = ["*://**/*"];
    const excludeMatchesList: string[] = [
      "*://steamcommunity.com/*",
      "*.jd.com/*",
      "*docs.google.com/*",
      "*://*.amazon.tld/*",
      "*shop*",
      "/.*(?<!test)store.*/",
      "*/releases",
      "*/releases/*",
      "*:5244*",
    ];
    const uuid = uuidv4();
    const { urlMatcher } = makeUrlMatcher(uuid, matchesList, excludeMatchesList);
    expect(urlMatcher.match("https://foo.api.bar/baz")).toEqual([uuid]);
    expect(urlMatcher.match("https://steamcommunity.com/foo")).toEqual([]);
    expect(urlMatcher.match("https://jd.com/foo")).toEqual([]);
    expect(urlMatcher.match("https://docs.google.com/foo")).toEqual([]);
    expect(urlMatcher.match("https://amazon.com/foo")).toEqual([]);
    expect(urlMatcher.match("https://test.store.com/aaa")).toEqual([]);
    expect(urlMatcher.match("https://foo.api.bar:5244/baz")).toEqual([]);
  });
});
