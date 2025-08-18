import { describe, expect, it } from "vitest";
import { UrlMatch } from "./match";
import { v4 as uuidv4 } from "uuid";
import { metaUMatchAnalyze, checkUrlMatch, getApiMatchesAndGlobs } from "./url_matcher";

describe("checkUrlMatch-1", () => {
  it("match1", () => {
    expect(checkUrlMatch("https://www.google.com/")).toEqual(["https", "www.google.com", ""]);
    expect(checkUrlMatch("https://www.google.com/*")).toEqual(["https", "www.google.com", "*"]);
    expect(checkUrlMatch("https://www.google.com/*/")).toEqual(["https", "www.google.com", "*/"]);
    expect(checkUrlMatch("https://www.google.com/*/a")).toEqual(["https", "www.google.com", "*/a"]);
    expect(checkUrlMatch("https://*.google.com/")).toEqual(["https", ".google.com", ""]);
    expect(checkUrlMatch("https://*.google.com/*")).toEqual(["https", ".google.com", "*"]);
    expect(checkUrlMatch("https://*.google.com/*/")).toEqual(["https", ".google.com", "*/"]);
    expect(checkUrlMatch("https://*.google.com/*/a")).toEqual(["https", ".google.com", "*/a"]);
    expect(checkUrlMatch("*.google.com/")).toBeNull();
    expect(checkUrlMatch("*.google.com/*")).toBeNull();
    expect(checkUrlMatch("*.google.com/*/")).toBeNull();
    expect(checkUrlMatch("*.google.com/*/a")).toBeNull();
    expect(checkUrlMatch("")).toBeNull();
    expect(checkUrlMatch("*")).toBeNull();
    expect(checkUrlMatch("*:")).toBeNull();
    expect(checkUrlMatch("*://")).toBeNull();
    expect(checkUrlMatch("*://*")).toBeNull();
    expect(checkUrlMatch("*://*/")).toEqual(["*", "", ""]);
    expect(checkUrlMatch("*://*/*")).not.toBeNull();
    expect(checkUrlMatch("*google.com/")).toBeNull();
    expect(checkUrlMatch("*google.com/*")).toBeNull();
    expect(checkUrlMatch("*google.com/*/")).toBeNull();
    expect(checkUrlMatch("*google.com/*/a")).toBeNull();
    expect(checkUrlMatch("https://*google.com/")).toBeNull();
    expect(checkUrlMatch("https://*google.com/*")).toBeNull();
    expect(checkUrlMatch("https://*google.com/*/")).toBeNull();
    expect(checkUrlMatch("https://*google.com/*/a")).toBeNull();
    expect(checkUrlMatch("https:///*")).toBeNull();
    expect(checkUrlMatch("file:///*")).toEqual(["file", "", "*"]);
    expect(checkUrlMatch("*")).toBeNull();
    expect(checkUrlMatch("*://*.example.com/*/**")).toEqual(["*", ".example.com", "*/**"]);
    expect(checkUrlMatch("*://*/query?a=*")).toEqual(["*", "", "query?a=*"]);
  });

  it("ignore-port", () => {
    // The path pattern string should not include a port number. Adding a port, as in: http://localhost:1234/* causes the match pattern to be ignored.
    expect(checkUrlMatch("https://www.google.com:80/")).toBeNull();
    expect(checkUrlMatch("https://www.google.com:81/*")).toBeNull();
    expect(checkUrlMatch("https://www.google.com:0/*/")).toBeNull();
    expect(checkUrlMatch("https://www.google.com:1/*/a")).toBeNull();
  });
});

describe("UrlMatch-internal1", () => {
  const url = new UrlMatch<string>();
  url.add("*://**/*", "ok1");
  url.add("*://*/*", "ok2");
  url.add("*gro?.com*", "ok3");
  it("match1", () => {
    expect(url.urlMatch("https://www.google.com/")).toEqual(["ok1", "ok2"]);
    expect(url.urlMatch("https://example.org/foo/bar.html")).toEqual(["ok1", "ok2"]);
    expect(url.urlMatch("https://grok.com/")).toEqual(["ok1", "ok2", "ok3"]);
  });

  const url2 = new UrlMatch<string>();
  url2.addRules(
    "ok1",
    metaUMatchAnalyze([
      "@match *://greasyfork.org/*",
      "@match *://sleazyfork.org/*",
      "@match *://cn-greasyfork.org/*",
      "@match *://api.sleazyfork.org/*",
      "@match *://api.cn-greasyfork.org/*",
    ])
  );
  url2.addRules("ok2", metaUMatchAnalyze(["@include *docs.scriptcat.org/docs/change/*/"]));
  url2.addRules("ok3", metaUMatchAnalyze(["@match https://docs.scriptcat.org/docs/change/*/"]));
  it("match2", () => {
    expect(url2.urlMatch("https://docs.scriptcat.org/docs/change/beta-changelog/#1.0.0-beta.2")).toEqual([
      "ok2",
      "ok3",
    ]);
    expect(
      url2.urlMatch(
        "https://www.google.com/recaptcha/api2/anchor?ar=2&k=abc&co=def&hl=en&v=ghj&size=invisible&anchor-ms=20000&execute-ms=15000&cb=we3"
      )
    ).toEqual([]);
  });
});

// https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts?hl=en#incl-globs
describe("UrlMatch-globs1", () => {
  const url = new UrlMatch<string>();
  url.addRules("ok1", metaUMatchAnalyze(["@include https://???.example.com/foo/*"]));
  it("match1", () => {
    expect(url.urlMatch("https://www.example.com/foo/bar")).toEqual(["ok1"]);
    expect(url.urlMatch("https://the.example.com/foo/")).toEqual(["ok1"]);
    expect(url.urlMatch("https://my.example.com/foo/bar")).toEqual([]);
    expect(url.urlMatch("https://example.com/foo/*")).toEqual([]);
    expect(url.urlMatch("https://www.example.com/foo")).toEqual([]);
  });
});

// https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts?hl=en#excl-globs
// https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts?hl=en#all-custom
describe("UrlMatch-globs2", () => {
  const url1 = new UrlMatch<string>();
  url1.addRules("ok1", metaUMatchAnalyze(["@match https://*.example.com/*", "@exclude *science*"]));
  it("globs-2a", () => {
    expect(url1.urlMatch("https://abc.com/")).toEqual([]);
    expect(url1.urlMatch("https://example.com/")).toEqual(["ok1"]);
    expect(url1.urlMatch("https://history.example.com/")).toEqual(["ok1"]);
    expect(url1.urlMatch("https://t.example.com/music")).toEqual(["ok1"]);
    expect(url1.urlMatch("https://science.example.com/")).toEqual([]);
    expect(url1.urlMatch("https://www.example.com/science")).toEqual([]);
  });

  const url2 = new UrlMatch<string>();
  url2.addRules(
    "ok1",
    metaUMatchAnalyze(["@match https://*.example.com/*", "@exclude *://*/*business*", "@exclude *science*"])
  );
  it("globs-2b", () => {
    expect(url2.urlMatch("https://abc.com")).toEqual([]);
    expect(url2.urlMatch("https://example.com/")).toEqual(["ok1"]);
    expect(url2.urlMatch("https://www.example.com/arts/index.html")).toEqual(["ok1"]);
    expect(url2.urlMatch("https://t.example.com/jobs/index.html")).toEqual(["ok1"]);
    expect(url2.urlMatch("https://science.example.com/")).toEqual([]); // @exclude *science*
    expect(url2.urlMatch("https://www.example.com/jobs/business")).toEqual([]); // @exclude *://*/*business*
    expect(url2.urlMatch("https://www.example.com/science")).toEqual([]); // @exclude *science*
  });
});

describe("UrlMatch-globs2", () => {
  const url1 = new UrlMatch<string>();
  url1.addRules("ok1", metaUMatchAnalyze(["@include *.example.com/*", "@exclude *science*"]));
  it("globs-2c", () => {
    expect(url1.urlMatch("https://abc.com/")).toEqual([]);
    expect(url1.urlMatch("https://example.com/")).toEqual([]);
    expect(url1.urlMatch("https://history.example.com/")).toEqual(["ok1"]);
    expect(url1.urlMatch("https://t.example.com/music")).toEqual(["ok1"]);
    expect(url1.urlMatch("https://science.example.com/")).toEqual([]);
    expect(url1.urlMatch("https://www.example.com/science")).toEqual([]);
  });

  const url2 = new UrlMatch<string>();
  url2.addRules(
    "ok1",
    metaUMatchAnalyze(["@include *.example.com/*", "@exclude *://*/*business*", "@exclude *science*"])
  );
  it("globs-2d", () => {
    expect(url2.urlMatch("https://abc.com/")).toEqual([]);
    expect(url2.urlMatch("https://example.com/")).toEqual([]);
    expect(url2.urlMatch("https://www.example.com/arts/index.html")).toEqual(["ok1"]);
    expect(url2.urlMatch("https://t.example.com/jobs/index.html")).toEqual(["ok1"]);
    expect(url2.urlMatch("https://science.example.com/")).toEqual([]); // @exclude *science*
    expect(url2.urlMatch("https://www.example.com/jobs/business")).toEqual([]); // @exclude *://*/*business*
    expect(url2.urlMatch("https://www.example.com/science")).toEqual([]); // @exclude *science*
  });

  const url3 = new UrlMatch<string>();
  url3.addRules("ok1", metaUMatchAnalyze(["@include *.example.com/*", "@include *def.com/*", "@exclude *science*"]));
  console.log(url3.rulesMap.get("ok1"));
  it("globs-2d", () => {
    expect(url3.urlMatch("https://abc.com/")).toEqual([]);
    expect(url3.urlMatch("https://def.com/")).toEqual(["ok1"]);
    expect(url3.urlMatch("https://example.com/")).toEqual([]);
    expect(url3.urlMatch("https://www.example.com/arts/index.html")).toEqual(["ok1"]);
    expect(url3.urlMatch("https://www.example.com/science/index.html")).toEqual([]);
  });
});

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
    expect(url.urlMatch("https://www.google.com/")).toEqual(["ok1"]);
    expect(url.urlMatch("https://example.org/foo/bar.html")).toEqual(["ok1", "ok2", "ok4"]);
  });
  it("match2", () => {
    expect(url.urlMatch("https://example.com/foo/bar.html")).toEqual(["ok1", "ok2"]);
    expect(url.urlMatch("https://www.google.com/foo")).toEqual(["ok1", "ok2"]);
    expect(url.urlMatch("https://www.google.com/foo2")).toEqual(["ok1", "ok2"]);
  });
  it("match3", () => {
    expect(url.urlMatch("https://www.google.com/foo/baz/bar")).toEqual(["ok1", "ok2", "ok3"]);
    expect(url.urlMatch("https://docs.google.com/foobar")).toEqual(["ok1", "ok2", "ok3"]);
  });
  it("match4", () => {
    expect(url.urlMatch("https://example.org/foo/bar.html")).toEqual(["ok1", "ok2", "ok4"]);
  });
  it("match5", () => {
    expect(url.urlMatch("http://127.0.0.1/")).toEqual(["ok5"]);
    expect(url.urlMatch("http://127.0.0.1/foo/bar.html")).toEqual(["ok5"]);
  });
  it("match6", () => {
    expect(url.urlMatch("http://mail.google.com/foo/baz/bar")).toEqual(["ok6"]);
    expect(url.urlMatch("https://mail.google.com/foobar")).toEqual(["ok1", "ok2", "ok3", "ok6"]);
  });
  it("exclude", () => {
    expect(url.urlMatch("https://example-2.org/foo/bar.html")).toEqual(["ok2"]);
  });
});

describe("UrlMatch-google-error", () => {
  const url = new UrlMatch<string>();
  it("error-1", () => {
    url.add("https://foo.*.bar/baz", "ok1"); // @include glob *
    expect(url.urlMatch("https://foo.api.bar/baz")).toEqual(["ok1"]);
  });
});

// 从tm找的一些特殊的匹配规则
describe("UrlMatch-special", () => {
  const url = new UrlMatch<string>();
  url.add("https://www.google.com/search?q=*", "ok1"); // @match
  it("match1", () => {
    expect(url.urlMatch("https://www.google.com/search?q=foo")).toEqual(["ok1"]);
    expect(url.urlMatch("https://www.google.com/search?q1=foo")).toEqual([]);
  });

  // 不符合TM
  url.add("https://bbs.tampermonkey.net.cn", "ok2"); // 不會匹配任何網址 (@include glob *)
  it("match2", () => {
    // expect(url.match("https://bbs.tampermonkey.net.cn")).toEqual(["ok2"]); // 不跟隨TM // 不適用。href必定包含/
    expect(url.urlMatch("https://bbs.tampermonkey.net.cn/")).toEqual([]); // 跟隨TM
    expect(url.urlMatch("https://bbs.tampermonkey.net.cn/foo/bar.html")).toEqual([]); // 跟隨TM
  });
  it("http://api.*.example.com/*", () => {
    const url = new UrlMatch<string>();
    url.add("http://api.*.example.com/*", "ok1"); // @include (glob *)
    expect(url.urlMatch("http://api.foo.example.com/")).toEqual(["ok1"]);
    expect(url.urlMatch("http://api.bar.example.com/")).toEqual(["ok1"]);
    expect(url.urlMatch("http://api.example.com/")).toEqual([]);
  });
  it("*://example*/*/example.path*", () => {
    const url = new UrlMatch<string>();
    url.add("*://example*/*/example.path*", "ok1");
    expect(url.urlMatch("https://example.com/foo/example.path")).toEqual(["ok1"]);
    expect(url.urlMatch("https://example.com/foo/bar/example.path")).toEqual(["ok1"]);
    expect(url.urlMatch("https://example.com/foo/bar/example.path2")).toEqual(["ok1"]);
  });
  it("*.example.com/path/*", () => {
    const url = new UrlMatch<string>();
    url.add("*.example.com/path/*", "ok1"); // @include (glob *)
    expect(url.urlMatch("https://www.example.com/path/foo")).toEqual(["ok1"]);
    expect(url.urlMatch("https://www.example.com/path/foo/bar")).toEqual(["ok1"]);
    expect(url.urlMatch("https://www.example.com/path/foo/bar/baz")).toEqual(["ok1"]);
    expect(url.urlMatch("https://www.example.com/path2/foo")).toEqual([]);
  });
  it("http*", () => {
    const url = new UrlMatch<string>();
    url.add("http*", "ok1"); // @include (glob *)
    expect(url.urlMatch("http://www.example.com/")).toEqual(["ok1"]);
    expect(url.urlMatch("https://www.example.com/")).toEqual(["ok1"]);
  });
  it("/^.*?://.*?.example.com.*?$/", () => {
    const url = new UrlMatch<string>();
    url.add("/^.*?://.*?.example.com.*?$/", "ok1"); // @include (regex)
    expect(url.urlMatch("https://www.example.com/")).toEqual(["ok1"]);
    expect(url.urlMatch("http://www.example.com/")).toEqual(["ok1"]);
    expect(url.urlMatch("https://api.example.com/foo/bar")).toEqual(["ok1"]);
    expect(url.urlMatch("https://api.foo.example.com/foo/bar")).toEqual(["ok1"]);
  });
});

describe("UrlMatch-match1", () => {
  const url = new UrlMatch<string>();
  url.add("http://test.list.ggnb.top/search", "ok1"); // @match
  it("match1", () => {
    expect(url.urlMatch("http://test.list.ggnb.top/search")).toEqual(["ok1"]);
    expect(url.urlMatch("http://test.list.ggnb.top/search?")).toEqual(["ok1"]); // 跟隨TM
    expect(url.urlMatch("http://test.list.ggnb.top/search?foo=bar")).toEqual([]);
  });

  it("port", () => {
    // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Match_patterns
    expect(url.urlMatch("http://test.list.ggnb.top:80/search")).toEqual(["ok1"]);
    expect(url.urlMatch("http://test.list.ggnb.top:443/search")).toEqual(["ok1"]);
  });
});

describe("UrlMatch-match2", () => {
  const url = new UrlMatch<string>();
  url.add("https://blank.page/index.html", "ok1"); // @match
  it("match2", () => {
    expect(url.urlMatch("https://blank.page/index.html")).toEqual(["ok1"]);
    expect(url.urlMatch("https://blank.page/index.html?")).toEqual(["ok1"]);
    expect(url.urlMatch("https://blank.page/index.html?a")).toEqual([]);
  });
});

describe("UrlMatch-match3", () => {
  const url = new UrlMatch<string>();
  url.add("https://blank.page/index.html?", "ok1"); // @match
  it("match2", () => {
    expect(url.urlMatch("https://blank.page/index.html")).toEqual(["ok1"]);
    expect(url.urlMatch("https://blank.page/index.html?")).toEqual(["ok1"]); // 不跟隨TM
    expect(url.urlMatch("https://blank.page/index.html?a")).toEqual([]);
  });
});

describe("UrlMatch-match4", () => {
  const url = new UrlMatch<string>();
  // match pattern 不接受port
  // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Match_patterns
  // https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns?hl=en
  // 改為 glob * 處理
  url.add("http://test.list.ggnb.top:80/search", "ok1"); // @include (glob *)
  url.add("http://test.list.ggnb.top*/search", "ok2"); // @include (glob *)
  url.add("http://test.list.ggnb.top:*/search", "ok3"); // @include (glob *)
  url.add("http://localhost:3000/", "ok4"); // @include (glob *)
  url.add("http://localhost:5000/*", "ok5"); // @include (glob *)
  it("port1", () => {
    expect(url.urlMatch("http://test.list.ggnb.top:80/search")).toEqual(["ok1", "ok2", "ok3"]);
    expect(url.urlMatch("http://test.list.ggnb.top:81/search")).toEqual(["ok2", "ok3"]);
    // expect(url.match("http://test.list.ggnb.top/search")).toEqual(["ok1", "ok2", "ok3"]);
  });
  it("port2", () => {
    expect(url.urlMatch("http://localhost:3000/")).toEqual(["ok4"]);
    expect(url.urlMatch("http://localhost:8000/")).toEqual([]);
    expect(url.urlMatch("http://localhost:3000/abc.html")).toEqual([]);
    expect(url.urlMatch("http://localhost:5000/")).toEqual(["ok5"]);
    expect(url.urlMatch("http://localhost:5000/abc.html")).toEqual(["ok5"]);
  });
});

describe("UrlMatch-exclude", () => {
  it("exclue-port", () => {
    const url = new UrlMatch<string>();
    url.add("*://*/*", "ok3");
    url.exclude("*:5244*", "ok3");
    expect(url.urlMatch("http://test.list.ggnb.top:5244/search")).toEqual([]);
    expect(url.urlMatch("http://test.list.ggnb.top:80/search")).toEqual(["ok3"]);
  });
});

const makeUrlMatcher = (uuid: string, matchesList: string[], excludeMatchesList: string[]) => {
  const urlMatcher = new UrlMatch<string>();
  urlMatcher.addRules(
    uuid,
    metaUMatchAnalyze([...matchesList.map((e) => `@include ${e}`), ...excludeMatchesList.map((e) => `@exclude ${e}`)])
  );
  return { urlMatcher };
};

describe("getApiMatchesAndGlobs-1", () => {
  it("match1", () => {
    const urlCovering = metaUMatchAnalyze([
      "@match http://google.com/*",
      "@match https://google.com/*",
      "@match file://mydir/myfile/001/*",
    ]);
    const { matches, includeGlobs } = getApiMatchesAndGlobs(urlCovering);

    expect(matches).toEqual(["http://google.com/*", "https://google.com/*", "file://mydir/myfile/001/*"]);
    expect(includeGlobs).toEqual([]);
  });
  it("match2", () => {
    const urlCovering = metaUMatchAnalyze(["@include *hello*"]);
    const { matches, includeGlobs } = getApiMatchesAndGlobs(urlCovering);

    expect(matches).toEqual(["*://*/*"]);
    expect(includeGlobs).toEqual(["*hello*"]);
  });

  it("match3", () => {
    const urlCovering = metaUMatchAnalyze([
      "@match http://google.com/*",
      "@match https://google.com/*",
      "@include *hello*",
    ]);
    const { matches, includeGlobs } = getApiMatchesAndGlobs(urlCovering);

    expect(matches).toEqual(["*://*/*"]);
    expect(includeGlobs).toEqual(["*hello*", "http://google.com/*", "https://google.com/*"]);
  });

  it("match4", () => {
    const urlCovering = metaUMatchAnalyze([
      "@match http://google.com/*",
      "@match https://google.com/*",
      "@match file://mydir/myfile/001/*",
      "@include *hello*",
    ]);
    const { matches, includeGlobs } = getApiMatchesAndGlobs(urlCovering);

    expect(matches).toEqual(["<all_urls>"]);
    expect(includeGlobs).toEqual([
      "*hello*",
      "http://google.com/*",
      "https://google.com/*",
      "file://mydir/myfile/001/*",
    ]);
  });
});

describe("getApiMatchesAndGlobs-2", () => {
  it("match1", () => {
    const urlCovering = metaUMatchAnalyze(
      `
// @include	    *://steamcommunity.com/*
// @include	    *://meta.appinn.net/*
// @include	    *://v2ex.com/*
// @include	    *://www.v2ex.com/*
// @include	    *://greasyfork.org/*
// @include	    *://bilibili.com/*
// @include	    *.bilibili.com/*
// @include	    *://www.douyin.com/*
// @include	    *.1688.com/*
// @include	    *.taobao.com/*
// @include	    *.tmall.com/*
// @include	    *.jd.com/*
// @include	    *.smzdm.com/*
// @include	    *.zhihu.com/*
// @include	    *://weibo.com/*
// @include	    *.qq.com/*
// @include	    *.live.com/*
// @include	    *.windows.com/*
// @include	    *.mi.com/*
// @include	    *docs.google.com/*
// @include	    *baike.baidu.com/*
// @include	    *.wikipedia.org/*
// @include     *://*.amazon.tld/*
// @include	    *.flightradar24.com/*
// @include	    *.obsidian.md/*
// @include	    *.runoob.com/*
// @include	    https://www.baidu.com/s?*
// @include	    https://www.google.com/search*
// @include	    https://www.bing.com/search*
// @include	    https://www.so.com/s*
// @include	    https://regex101.com/
// @include	    https://discord.com/*
// @include	    https://web.telegram.org/*
// @include	    https://www.flipkart.com/*
// @include	    *.themoviedb.org/*
// @include	    *.youku.com/*
// @include	    *.cn/*
// @include     *mall*
// @include     *shop*
// @include     /.*(?<!jav)store.*/
// @include     *buy*
// @include     *tools*
// @include     *translate*
// @include     */releases
// @include     */releases/*
// @include     *:5244*
// @include     *:8080*
// @include     https://*.test.com/*
`
        .trim()
        .split(/[\r\n]+/)
    );
    const { matches, includeGlobs } = getApiMatchesAndGlobs(urlCovering);

    expect(matches).toEqual(["*://*/*"]);
    expect(includeGlobs).toEqual([
      "*.bilibili.com/*",
      "*.1688.com/*",
      "*.taobao.com/*",
      "*.tmall.com/*",
      "*.jd.com/*",
      "*.smzdm.com/*",
      "*.zhihu.com/*",
      "*.qq.com/*",
      "*.live.com/*",
      "*.windows.com/*",
      "*.mi.com/*",
      "*docs.google.com/*",
      "*baike.baidu.com/*",
      "*.wikipedia.org/*",
      "*.flightradar24.com/*",
      "*.obsidian.md/*",
      "*.runoob.com/*",
      "*.themoviedb.org/*",
      "*.youku.com/*",
      "*.cn/*",
      "*mall*",
      "*shop*",
      "*buy*",
      "*tools*",
      "*translate*",
      "*/releases",
      "*/releases/*",
      "*:5244*",
      "*:8080*",
      "http*://steamcommunity.com/*",
      "http*://meta.appinn.net/*",
      "http*://v2ex.com/*",
      "http*://www.v2ex.com/*",
      "http*://greasyfork.org/*",
      "http*://bilibili.com/*",
      "http*://www.douyin.com/*",
      "http*://weibo.com/*",
      "http*://amazon.tld/*",
      "http*://*.amazon.tld/*",
      "https://www.baidu.com/s?*",
      "https://www.google.com/search*",
      "https://www.bing.com/search*",
      "https://www.so.com/s*",
      "https://regex101.com/",
      "https://discord.com/*",
      "https://web.telegram.org/*",
      "https://www.flipkart.com/*",
      "https://test.com/*",
      "https://*.test.com/*",
    ]);
  });
});

describe("UrlMatch-exclusion", () => {
  it("exclusion-1", () => {
    const matchesList: string[] = ["*://**/*"];
    const excludeMatchesList: string[] = [
      "*://steamcommunity.com/*", // @match
      "*.jd.com/*", // @include glob *
      "*docs.google.com/*", // @include glob *
      "*://*.amazon.tld/*", // @match
      "*shop*", // @include glob *
      "/.*(?<!test)store.*/", // @include regex
      "*/releases", // @include glob *
      "*/releases/*", // @include glob *
      "*:5244*", // @include glob *
    ];
    const uuid = uuidv4();
    const { urlMatcher } = makeUrlMatcher(uuid, matchesList, excludeMatchesList);
    expect(urlMatcher.urlMatch("https://foo.api.bar/baz")).toEqual([uuid]);
    expect(urlMatcher.urlMatch("https://steamcommunity.com/foo")).toEqual([]);
    expect(urlMatcher.urlMatch("https://jd.com/foo")).toEqual([uuid]);
    expect(urlMatcher.urlMatch("https://www.jd.com/foo")).toEqual([]);
    expect(urlMatcher.urlMatch("https://docs.google.com/foo")).toEqual([]);
    expect(urlMatcher.urlMatch("https://amazon.com/foo")).toEqual([uuid]);
    expect(urlMatcher.urlMatch("https://amazon.tld/foo")).toEqual([]);
    expect(urlMatcher.urlMatch("https://www.amazon.tld/foo")).toEqual([]);
    expect(urlMatcher.urlMatch("https://test.store.com/aaa")).toEqual([]);
    expect(urlMatcher.urlMatch("https://foo.api.bar:5244/baz")).toEqual([]);
  });
});

describe("UrlMatch-Issue629", () => {
  it("match-1", () => {
    const urlCovering = metaUMatchAnalyze([
      "@include     http*://*javlibrary.com/*",
      "@include     http*://*example.com/*",
    ]);
    const um = new UrlMatch<string>();
    um.addRules("ok1", urlCovering);
    expect(um.urlMatch("https://www.javlibrary.com/cn/?v=javmeyzhze")).toEqual(["ok1"]);
    expect(um.urlMatch("https://example.com/")).toEqual(["ok1"]);
  });
});
