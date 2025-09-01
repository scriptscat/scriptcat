import { describe, expect, it } from "vitest";
import { UrlMatch } from "./match";
import { v4 as uuidv4 } from "uuid";
import { extractUrlPatterns } from "./url_matcher";

describe("UrlMatch-internal1", () => {
  const url = new UrlMatch<string>();
  url.addMatch("*://**/*", "ok1");
  url.addMatch("*://*/*", "ok2");
  url.addInclude("*gro?.com*", "ok3");
  it("match & glob", () => {
    expect(url.urlMatch("https://www.google.com/")).toEqual(["ok1", "ok2"]);
    expect(url.urlMatch("https://example.org/foo/bar.html")).toEqual(["ok1", "ok2"]);
    expect(url.urlMatch("https://grok.com/")).toEqual(["ok1", "ok2", "ok3"]);
    expect(url.urlMatch("https://grok1.com/")).toEqual(["ok1", "ok2"]);
    expect(url.urlMatch("https://gro.com/")).toEqual(["ok1", "ok2"]);
  });

  const url2 = new UrlMatch<string>();
  url2.addRules(
    "ok1",
    extractUrlPatterns([
      "@match *://page.org/*",
      "@match *://example.org/*",
      "@match *://my-page.org/*",
      "@match *://api.example.org/*",
      "@match *://api.my-page.org/*",
    ])
  );
  url2.addRules("ok2", extractUrlPatterns(["@include *docs.scriptcat.org/docs/change/*/"]));
  url2.addRules("ok3", extractUrlPatterns(["@match https://docs.scriptcat.org/docs/change/*/"]));
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

describe("UrlMatch-internal2", () => {
  const url = new UrlMatch<string>();
  url.addInclude("*gro???***???.com*", "ok1");
  it("glob-test-1", () => {
    expect(url.urlMatch("https://www.google.com/31grokrr000abc.com")).toEqual(["ok1"]);
    expect(url.urlMatch("https://www.google.com/31grokrr0abc.com")).toEqual(["ok1"]);
    expect(url.urlMatch("https://www.google.com/31grokrrabc.com")).toEqual(["ok1"]);
    expect(url.urlMatch("https://www.google.com/31grokrabc.com")).toEqual([]);
    expect(url.urlMatch("https://www.31grokrr000abc.com/")).toEqual(["ok1"]);
    expect(url.urlMatch("https://www.31grokrr0abc.com/")).toEqual(["ok1"]);
    expect(url.urlMatch("https://www.31grokrrabc.com/")).toEqual(["ok1"]);
    expect(url.urlMatch("https://www.31grokrabc.com/")).toEqual([]);
  });

  url.addInclude("*hel?o?.?om*", "ok2");
  it("glob-test-2", () => {
    expect(url.urlMatch("https://www.hello.com")).toEqual([]);
    expect(url.urlMatch("https://www.hello1.com")).toEqual(["ok2"]);
    expect(url.urlMatch("https://www.hello12.com")).toEqual([]);
    expect(url.urlMatch("https://www.helxlo1.com")).toEqual([]);
    expect(url.urlMatch("https://www.hello1.ccom")).toEqual([]);
    expect(url.urlMatch("https://www.hello1.eomx")).toEqual(["ok2"]);
    expect(url.urlMatch("https://www.helo1.eomx")).toEqual([]);
  });

  url.addInclude("*gel*?.?*om*", "ok3");
  it("glob-test-3", () => {
    expect(url.urlMatch("https://www.gello.com")).toEqual(["ok3"]);
    expect(url.urlMatch("https://www.gello1.com")).toEqual(["ok3"]);
    expect(url.urlMatch("https://www.gello12.com")).toEqual(["ok3"]);
    expect(url.urlMatch("https://www.gelxlo1.com")).toEqual(["ok3"]);
    expect(url.urlMatch("https://www.gello1.ccom")).toEqual(["ok3"]);
    expect(url.urlMatch("https://www.gello1.eomx")).toEqual(["ok3"]);
    // gelo1
    expect(url.urlMatch("https://www.gelo1.eomx")).toEqual(["ok3"]);
    expect(url.urlMatch("https://www.gelo.eomx")).toEqual(["ok3"]);
    expect(url.urlMatch("https://www.gel.eomx")).toEqual([]);
    // eomx
    expect(url.urlMatch("https://www.gelo1.aeomx")).toEqual(["ok3"]);
    expect(url.urlMatch("https://www.gelo1.eomx")).toEqual(["ok3"]);
    expect(url.urlMatch("https://www.gelo1.omx")).toEqual([]);
    expect(url.urlMatch("https://www.gelo1.mx")).toEqual([]);
  });
});

// https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts?hl=en#incl-globs
describe("UrlMatch-globs1", () => {
  const url = new UrlMatch<string>();
  url.addRules("ok1", extractUrlPatterns(["@include https://???.example.com/foo/*"]));
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
  url1.addRules("ok1", extractUrlPatterns(["@match https://*.example.com/*", "@exclude *science*"]));
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
    extractUrlPatterns(["@match https://*.example.com/*", "@exclude *://*/*business*", "@exclude *science*"])
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
  url1.addRules("ok1", extractUrlPatterns(["@include *.example.com/*", "@exclude *science*"]));
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
    extractUrlPatterns(["@include *.example.com/*", "@exclude *://*/*business*", "@exclude *science*"])
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
  url3.addRules("ok1", extractUrlPatterns(["@include *.example.com/*", "@include *def.com/*", "@exclude *science*"]));
  it("globs-2e", () => {
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
  url.addMatch("https://*/*", "ok1");
  url.addMatch("https://*/foo*", "ok2");
  url.addMatch("https://*.google.com/foo*bar", "ok3");
  url.addMatch("https://example.org/foo/bar.html", "ok4");
  url.addMatch("http://127.0.0.1/*", "ok5");
  url.addMatch("*://mail.google.com/*", "ok6");
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
  it("error-1", () => {
    const url = new UrlMatch<string>();
    url.addInclude("https://*bar/baz", "ok1"); // @include glob *
    expect(url.urlMatch("https://foo.api.bar/baz")).toEqual(["ok1"]);
    url.addMatch("https://*api/bar", "ok2");
    expect(url.urlMatch("https://foo.api.bar/baz")).toEqual(["ok1"]); // @match 无效
  });
  it("error-2", () => {
    const url = new UrlMatch<string>();
    url.addInclude("https://foo.*.bar/baz", "ok1"); // @include glob *
    expect(url.urlMatch("https://foo.api.bar/baz")).toEqual(["ok1"]);
    url.addMatch("https://foo.*.bar/baz", "ok2");
    expect(url.urlMatch("https://foo.api.bar/baz")).toEqual(["ok1"]); // @match 无效
  });
  it("error-3", () => {
    const url = new UrlMatch<string>();
    url.addInclude("http:/bar", "ok1");
    expect(url.urlMatch("http://foo.api.bar/baz")).toEqual([]);
    url.addMatch("http:/bar", "ok2");
    expect(url.urlMatch("https://foo.api.bar/baz")).toEqual([]);
  });
});

// 从tm找的一些特殊的匹配规则
describe("UrlMatch-special", () => {
  const url = new UrlMatch<string>();
  url.addMatch("https://www.google.com/search?q=*", "ok1"); // @match
  it("match1", () => {
    expect(url.urlMatch("https://www.google.com/search?q=foo")).toEqual(["ok1"]);
    expect(url.urlMatch("https://www.google.com/search?q1=foo")).toEqual([]);
  });

  url.addMatch("https://bbs.tampermonkey.net.cn", "ok2");
  it("match2", () => {
    expect(url.urlMatch("https://bbs.tampermonkey.net.cn")).toEqual(["ok2"]);
    expect(url.urlMatch("https://bbs.tampermonkey.net.cn/")).toEqual(["ok2"]);
    expect(url.urlMatch("https://bbs.tampermonkey.net.cn/foo/bar.html")).toEqual([]);
  });

  it("http://api.*.example.com/*", () => {
    const url = new UrlMatch<string>();
    url.addInclude("http://api.*.example.com/*", "ok1"); // @include (glob *)
    expect(url.urlMatch("http://api.foo.example.com/")).toEqual(["ok1"]);
    expect(url.urlMatch("http://api.bar.example.com/")).toEqual(["ok1"]);
    expect(url.urlMatch("http://api.example.com/")).toEqual([]);
  });
  it("*://example*/*/example.path*", () => {
    const url = new UrlMatch<string>();
    url.addInclude("*://example*/*/example.path*", "ok1");
    expect(url.urlMatch("https://example.com/foo/example.path")).toEqual(["ok1"]);
    expect(url.urlMatch("https://example.com/foo/bar/example.path")).toEqual(["ok1"]);
    expect(url.urlMatch("https://example.com/foo/bar/example.path2")).toEqual(["ok1"]);
  });
  it("*.example.com/path/*", () => {
    const url = new UrlMatch<string>();
    url.addInclude("*.example.com/path/*", "ok1"); // @include (glob *)
    expect(url.urlMatch("https://www.example.com/path/foo")).toEqual(["ok1"]);
    expect(url.urlMatch("https://www.example.com/path/foo/bar")).toEqual(["ok1"]);
    expect(url.urlMatch("https://www.example.com/path/foo/bar/baz")).toEqual(["ok1"]);
    expect(url.urlMatch("https://www.example.com/path2/foo")).toEqual([]);
  });
  // 与 TM, VM 一致
  it("http*", () => {
    const url = new UrlMatch<string>();
    url.addInclude("http*", "ok1"); // @include (glob *)
    expect(url.urlMatch("http://www.example.com/")).toEqual(["ok1"]);
    expect(url.urlMatch("https://www.example.com/")).toEqual(["ok1"]);
  });
  // 与 GM, TM, VM 一致
  it("/^.*?://.*?.example.com.*?$/", () => {
    const url = new UrlMatch<string>();
    url.addInclude("/^.*?://.*?.example.com.*?$/", "ok1"); // @include (regex)
    expect(url.urlMatch("https://www.example.com/")).toEqual(["ok1"]);
    expect(url.urlMatch("http://www.example.com/")).toEqual(["ok1"]);
    expect(url.urlMatch("https://api.example.com/foo/bar")).toEqual(["ok1"]);
    expect(url.urlMatch("https://api.foo.example.com/foo/bar")).toEqual(["ok1"]);
  });
  // 与 GM, TM, VM 一致
  it("/^.*?://.*?.example.com.*?$/ case-insensitive", () => {
    const url = new UrlMatch<string>();
    url.addInclude("/^.*?://.*?.EXAMPLE.com.*?$/", "ok1"); // @include (regex)
    expect(url.urlMatch("https://www.example.com/")).toEqual(["ok1"]);
    expect(url.urlMatch("http://www.example.com/")).toEqual(["ok1"]);
    expect(url.urlMatch("https://api.example.com/foo/bar")).toEqual(["ok1"]);
    expect(url.urlMatch("https://api.foo.example.com/foo/bar")).toEqual(["ok1"]);
  });

  describe("https://*example.com/*", () => {
    it("match", () => {
      const url = new UrlMatch<string>();
      url.addMatch("https://*example.com/*", "ok1");
      expect(url.urlMatch("https://example.com/")).toEqual(["ok1"]);
      expect(url.urlMatch("https://www.example.com/")).toEqual(["ok1"]);
      expect(url.urlMatch("https://123example.com/")).toEqual([]);
    });

    it("include", () => {
      const url = new UrlMatch<string>();
      url.addInclude("https://*example.com/*", "ok1");
      expect(url.urlMatch("https://example.com/")).toEqual(["ok1"]);
      expect(url.urlMatch("https://www.example.com/")).toEqual(["ok1"]);
      expect(url.urlMatch("https://123example.com/")).toEqual(["ok1"]);
    });
  });
});

describe("UrlMatch-match1", () => {
  const url = new UrlMatch<string>();
  url.addMatch("http://test.list.ggnb.top/search", "ok1"); // @match
  it("match1", () => {
    expect(url.urlMatch("http://test.list.ggnb.top/search")).toEqual(["ok1"]);
    expect(url.urlMatch("http://test.list.ggnb.top/search?")).toEqual(["ok1"]); // 跟随TM
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
  url.addMatch("https://blank.page/index.html", "ok1"); // @match
  it("match2", () => {
    expect(url.urlMatch("https://blank.page/index.html")).toEqual(["ok1"]);
    expect(url.urlMatch("https://blank.page/index.html?")).toEqual(["ok1"]);
    expect(url.urlMatch("https://blank.page/index.html?a")).toEqual([]);
  });
});

describe("UrlMatch-match3", () => {
  const url = new UrlMatch<string>();
  url.addMatch("https://blank.page/index.html?", "ok1"); // @match
  it("match2", () => {
    expect(url.urlMatch("https://blank.page/index.html")).toEqual(["ok1"]);
    expect(url.urlMatch("https://blank.page/index.html?")).toEqual(["ok1"]); // 不跟随TM
    expect(url.urlMatch("https://blank.page/index.html?a")).toEqual([]);
  });
});

describe("UrlMatch-match4", () => {
  const url = new UrlMatch<string>();
  // match pattern 不接受port
  // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Match_patterns
  // https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns?hl=en
  // 改为 glob * 处理
  url.addInclude("http://test.list.ggnb.top:80/search", "ok1"); // @include (glob *)
  url.addInclude("http://test.list.ggnb.top*/search", "ok2"); // @include (glob *)
  url.addInclude("http://test.list.ggnb.top:*/search", "ok3"); // @include (glob *)
  url.addInclude("http://localhost:3000/", "ok4"); // @include (glob *)
  url.addInclude("http://localhost:5000/*", "ok5"); // @include (glob *)
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
    url.addInclude("*://*/*", "ok3");
    url.exclude("*:5244*", "ok3");
    expect(url.urlMatch("http://test.list.ggnb.top:5244/search")).toEqual([]);
    expect(url.urlMatch("http://test.list.ggnb.top:80/search")).toEqual(["ok3"]);
  });
});

const makeUrlMatcher = (uuid: string, matchesList: string[], excludeMatchesList: string[]) => {
  const urlMatcher = new UrlMatch<string>();
  urlMatcher.addRules(
    uuid,
    extractUrlPatterns([...matchesList.map((e) => `@include ${e}`), ...excludeMatchesList.map((e) => `@exclude ${e}`)])
  );
  return { urlMatcher };
};

describe("UrlMatch-exclusion", () => {
  it("exclusion-1", () => {
    const matchesList: string[] = ["*://**/*"];
    const excludeMatchesList: string[] = [
      "*://steamcommunity.com/*", // @match
      "*.jd.com/*", // @include glob *
      "*docs.google.com/*", // @include glob *
      "*://*.amazon.tld/*", // @include glob * (*://*.amazon.??*/*)
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
    expect(urlMatcher.urlMatch("https://amazon.tld/foo")).toEqual([uuid]);
    expect(urlMatcher.urlMatch("https://www.amazon.co.uk/foo")).toEqual([]);
    expect(urlMatcher.urlMatch("https://www.amazon.com/foo")).toEqual([]);
    expect(urlMatcher.urlMatch("https://www.amazon.tld/foo")).toEqual([]);
    expect(urlMatcher.urlMatch("https://test.store.com/aaa")).toEqual([]);
    expect(urlMatcher.urlMatch("https://foo.api.bar:5244/baz")).toEqual([]);
  });
});

describe("UrlMatch-Issue629", () => {
  it("match-1", () => {
    const scriptUrlPatterns = extractUrlPatterns(["@include     http*://*example.com/*"]);
    const um = new UrlMatch<string>();
    um.addRules("ok1", scriptUrlPatterns);
    expect(um.urlMatch("https://www.example.com/cn/?v=example")).toEqual(["ok1"]);
    expect(um.urlMatch("https://example.com/")).toEqual(["ok1"]);
  });
});

describe("UrlMatch-port1 (match)", () => {
  const url = new UrlMatch<string>();
  url.addMatch("https://scriptcat.org/zh-CN/search", "ok1");
  it("match1", () => {
    expect(url.urlMatch("https://scriptcat.org/zh-CN/search")).toEqual(["ok1"]);
    expect(url.urlMatch("https://scriptcat.org/zh-CN/search?")).toEqual(["ok1"]); // 与TM一致
    expect(url.urlMatch("https://scriptcat.org/zh-CN/search?foo=bar")).toEqual([]);
  });

  it("port", () => {
    expect(url.urlMatch("https://scriptcat.org:80/zh-CN/search")).toEqual(["ok1"]);
  });
});

describe("UrlMatch-port2 (match)", () => {
  const url = new UrlMatch<string>();
  url.addMatch("https://scriptcat.org:443/zh-CN/search", "ok1"); // 自动修正为 @match https://scriptcat.org/zh-CN/search
  url.addMatch("https://scriptcat.org*/zh-CN/search", "ok2"); // 自动修正为 @match https://scriptcat.org/zh-CN/search
  url.addMatch("https://scriptcat.org:*/zh-CN/search", "ok3"); // 自动修正为 @match https://scriptcat.org/zh-CN/search
  url.addMatch("http://localhost:3000/", "ok4"); // 自动修正为 @match http://localhost/
  it("match1", () => {
    expect(url.urlMatch("https://scriptcat.org:443/zh-CN/search")).toEqual(["ok1", "ok2", "ok3"]);
    expect(url.urlMatch("https://scriptcat.org:446/zh-CN/search")).toEqual(["ok1", "ok2", "ok3"]); // 与TM一致
    expect(url.urlMatch("https://scriptcat.org/zh-CN/search")).toEqual(["ok1", "ok2", "ok3"]);
  });
  it("case2", () => {
    expect(url.urlMatch("http://localhost:3000/")).toEqual(["ok4"]);
    expect(url.urlMatch("http://localhost:8000/")).toEqual(["ok4"]); // 与TM一致
    expect(url.urlMatch("http://localhost:3000/a")).toEqual([]);
    expect(url.urlMatch("http://localhost:8000/a")).toEqual([]);
    expect(url.urlMatch("http://localhost:3000/?x")).toEqual([]);
    expect(url.urlMatch("http://localhost:8000/?x")).toEqual([]);
    expect(url.urlMatch("http://localhost:3000/#x")).toEqual(["ok4"]);
    expect(url.urlMatch("http://localhost:8000/#x")).toEqual(["ok4"]);
  });
});

describe("UrlMatch-port1 (include)", () => {
  const url = new UrlMatch<string>();
  url.addInclude("https://scriptcat.org/zh-CN/search", "ok1");
  it("match1", () => {
    expect(url.urlMatch("https://scriptcat.org/zh-CN/search")).toEqual(["ok1"]);
    expect(url.urlMatch("https://scriptcat.org/zh-CN/search?")).toEqual(["ok1"]); // 与TM一致
    expect(url.urlMatch("https://scriptcat.org/zh-CN/search?foo=bar")).toEqual([]);
  });

  it("port", () => {
    expect(url.urlMatch("https://scriptcat.org:80/zh-CN/search")).toEqual(["ok1"]);
  });
});

describe("UrlMatch-port2 (include)", () => {
  const url = new UrlMatch<string>();
  url.addInclude("https://scriptcat.org:443/zh-CN/search", "ok1"); // @include https://scriptcat.org:443/zh-CN/search
  url.addInclude("https://scriptcat.org*/zh-CN/search", "ok2"); // @include https://scriptcat.org*/zh-CN/search
  url.addInclude("https://scriptcat.org:*/zh-CN/search", "ok3"); // @include https://scriptcat.org:*/zh-CN/search
  url.addInclude("http://localhost:3000/", "ok4");
  it("match1", () => {
    expect(url.urlMatch("https://scriptcat.org:443/zh-CN/search")).toEqual(["ok1", "ok2", "ok3"]);
    expect(url.urlMatch("https://scriptcat.org:446/zh-CN/search")).toEqual(["ok2", "ok3"]); // 与TM一致
    expect(url.urlMatch("https://scriptcat.org/zh-CN/search")).toEqual(["ok2"]); // 与TM一致
  });
  it("case2", () => {
    expect(url.urlMatch("http://localhost:3000/")).toEqual(["ok4"]);
    expect(url.urlMatch("http://localhost:8000/")).toEqual([]); // 与TM一致
  });
});

describe("特殊情况", () => {
  it("** (match)", () => {
    const url = new UrlMatch<string>();
    url.addMatch("*://**/*", "ok1"); // 自动修正为 @match *://*/*
    expect(url.urlMatch("http://www.example.com/")).toEqual(["ok1"]);
  });

  it("** (include)", () => {
    const url = new UrlMatch<string>();
    url.addInclude("*://**/*", "ok1"); // 自动修正为 @match *://*/*
    expect(url.urlMatch("http://www.example.com/")).toEqual(["ok1"]);
  });

  it("http* (match)", () => {
    const url = new UrlMatch<string>();
    url.addMatch("http*://example.com/*", "ok1"); // 自动修正为 @match *://example.com/*
    expect(url.urlMatch("https://example.com/")).toEqual(["ok1"]);
    expect(url.urlMatch("http://example.com/")).toEqual(["ok1"]);
  });

  it("http* (include)", () => {
    const url = new UrlMatch<string>();
    url.addInclude("http*://example.com/*", "ok1"); // @include http*://example.com/*
    expect(url.urlMatch("https://example.com/")).toEqual(["ok1"]);
    expect(url.urlMatch("http://example.com/")).toEqual(["ok1"]);
  });
});

describe("UrlInclude-1", () => {
  const url = new UrlMatch<string>();
  url.addInclude("*://*.baidu.com/", "ok");
  url.addInclude("*://*.m.baidu.com/test*", "ok2");
  url.addInclude("*://*.test.m.baidu.com/lll*233", "ok3");
  url.addInclude("http://test.baidu.com/*", "ok4");
  url.addInclude("http://example.org/foo/bar.html", "ok5");
  url.addInclude("https://bbs.tampermonkey.net.cn/*", "ok6");
  url.addInclude("https://bbs.tampermonkey.net.cn/test/*", "ok66");
  url.addInclude("*://*/test/param?*", "ok7");
  url.addInclude("i.tampermonkey.net.cn/*", "ok8"); // @include i.tampermonkey.net.cn/* 在TM无效
  url.addInclude("*i.tampermonkey.net.cn/*", "ok9");
  url.addInclude("http://bbs.tampermonkey.net.cn/test?id=*", "ok10");
  it("match", () => {
    expect(url.urlMatch("https://www.baidu.com/")).toEqual(["ok"]); // url参数永远有/
    expect(url.urlMatch("https://m.baidu.com/")).toEqual(["ok"]); // url参数永远有/
    expect(url.urlMatch("https://www.m.baidu.com/")).toEqual(["ok"]); // url参数永远有/
    expect(url.urlMatch("https://www.m.baidu.com/undefined")).toEqual([]);
    expect(url.urlMatch("http://test.m.baidu.com/test")).toEqual(["ok2"]);
    expect(url.urlMatch("http://test.m.baidu.com/test/233")).toEqual(["ok2"]);
    expect(url.urlMatch("http://test.m.baidu.com/test233")).toEqual(["ok2"]);
    expect(url.urlMatch("http://a.test.m.baidu.com/lll")).toEqual([]);
    expect(url.urlMatch("http://a.test.m.baidu.com/lll/a/233")).toEqual(["ok3"]);
    expect(url.urlMatch("http://a.test.m.baidu.com/lll/233")).toEqual(["ok3"]);
    expect(url.urlMatch("http://a.test.m.baidu.com/lll233")).toEqual(["ok3"]);
    expect(url.urlMatch("http://a.test.m.baidu.com/lll233end")).toEqual([]);
    expect(url.urlMatch("http://test.baidu.com/aaa")).toEqual(["ok4"]);
    expect(url.urlMatch("http://test.baidu.com/")).toEqual(["ok", "ok4"]);
    expect(url.urlMatch("http://example.org/foo/bar.html")).toEqual(["ok5"]);
    expect(url.urlMatch("https://bbs.tampermonkey.net.cn/test/thread-63-1-1.html")).toEqual(["ok6", "ok66"]);
    expect(url.urlMatch("https://bbs.tampermonkey.net.cn/forum-68-1.html")).toEqual(["ok6"]);
    expect(url.urlMatch("https://bbs.tampermonkey.net.cn/")).toEqual(["ok6"]);
    expect(url.urlMatch("https://bbs.tampermonkey.net.cn/test/param?a=1&b=2")).toEqual(["ok6", "ok66", "ok7"]);
    expect(url.urlMatch("https://www.baidu.com/test/param?id=123")).toEqual(["ok7"]);
    expect(url.urlMatch("https://i.tampermonkey.net.cn/aa")).toEqual(["ok9"]); // 与TM一致
    expect(url.urlMatch("https://wwi.tampermonkey.net.cn/aa")).toEqual(["ok9"]);
    expect(url.urlMatch("http://bbs.tampermonkey.net.cn/test?id=1234124")).toEqual(["ok10"]);
  });
  it("delete", () => {
    url.clearRules("ok5");
    expect(url.urlMatch("http://example.org/foo/bar.html")).toEqual([]);
    url.addInclude("http://example.org/foo/bar.html", "ok4");
    expect(url.urlMatch("http://example.org/foo/bar.html")).toEqual(["ok4"]);
    url.clearRules("ok5");
    expect(url.urlMatch("http://example.org/foo/bar.html")).toEqual(["ok4"]);
    url.clearRules("ok4");
    expect(url.urlMatch("http://example.org/foo/bar.html")).toEqual([]);
    expect(url.urlMatch("http://test.baidu.com/")).toEqual(["ok"]);
  });
  it("tld 顶域测试 (include only - 1)", () => {
    url.clearRules("ok9");
    url.clearRules("ok9x");
    url.addInclude("*://*.test-tld.tld/", "ok9");
    expect(url.urlMatch("https://www.test-tld.com/")).toEqual(["ok9"]); // url参数永远有/
    expect(url.urlMatch("https://www.test-tld.org.cn/")).toEqual(["ok9"]); // url参数永远有/
    expect(url.urlMatch("https://www.test-tld.co.uk/")).toEqual(["ok9"]); // url参数永远有/
    expect(url.urlMatch("https://www.test-tld.dk/")).toEqual(["ok9"]); // url参数永远有/

    expect(url.urlMatch("https://www.sub.test-tld.com/")).toEqual(["ok9"]); // url参数永远有/
    expect(url.urlMatch("https://www.sub.test-tld.org.cn/")).toEqual(["ok9"]); // url参数永远有/
    expect(url.urlMatch("https://www.sub.test-tld.co.uk/")).toEqual(["ok9"]); // url参数永远有/
    expect(url.urlMatch("https://www.sub.test-tld.dk/")).toEqual(["ok9"]); // url参数永远有/
  });

  it("tld 顶域测试 (match invalid - 1)", () => {
    url.clearRules("ok9");
    url.clearRules("ok9x");
    url.addMatch("*://*.test-tld.tld/", "ok9x");
    expect(url.urlMatch("https://www.test-tld.com/")).toEqual([]); // url参数永远有/
    expect(url.urlMatch("https://www.test-tld.org.cn/")).toEqual([]); // url参数永远有/
    expect(url.urlMatch("https://www.test-tld.co.uk/")).toEqual([]); // url参数永远有/
    expect(url.urlMatch("https://www.test-tld.dk/")).toEqual([]); // url参数永远有/

    expect(url.urlMatch("https://www.sub.test-tld.com/")).toEqual([]); // url参数永远有/
    expect(url.urlMatch("https://www.sub.test-tld.org.cn/")).toEqual([]); // url参数永远有/
    expect(url.urlMatch("https://www.sub.test-tld.co.uk/")).toEqual([]); // url参数永远有/
    expect(url.urlMatch("https://www.sub.test-tld.dk/")).toEqual([]); // url参数永远有/
  });

  it("tld 顶域测试 (include only - 2)", () => {
    url.clearRules("ok9");
    url.clearRules("ok9x");
    url.addInclude("*://*.test-tld.tld/*", "ok9");
    expect(url.urlMatch("https://www.test-tld.com/")).toEqual(["ok9"]); // url参数永远有/
    expect(url.urlMatch("https://www.test-tld.org.cn/")).toEqual(["ok9"]); // url参数永远有/
    expect(url.urlMatch("https://www.test-tld.co.uk/")).toEqual(["ok9"]); // url参数永远有/
    expect(url.urlMatch("https://www.test-tld.dk/")).toEqual(["ok9"]); // url参数永远有/

    expect(url.urlMatch("https://www.sub.test-tld.com/")).toEqual(["ok9"]); // url参数永远有/
    expect(url.urlMatch("https://www.sub.test-tld.org.cn/")).toEqual(["ok9"]); // url参数永远有/
    expect(url.urlMatch("https://www.sub.test-tld.co.uk/")).toEqual(["ok9"]); // url参数永远有/
    expect(url.urlMatch("https://www.sub.test-tld.dk/")).toEqual(["ok9"]); // url参数永远有/
  });

  it("tld 顶域测试 (match invalid - 2)", () => {
    url.clearRules("ok9");
    url.clearRules("ok9x");
    url.addMatch("*://*.test-tld.tld/*", "ok9x");
    expect(url.urlMatch("https://www.test-tld.com/")).toEqual([]); // url参数永远有/
    expect(url.urlMatch("https://www.test-tld.org.cn/")).toEqual([]); // url参数永远有/
    expect(url.urlMatch("https://www.test-tld.co.uk/")).toEqual([]); // url参数永远有/
    expect(url.urlMatch("https://www.test-tld.dk/")).toEqual([]); // url参数永远有/

    expect(url.urlMatch("https://www.sub.test-tld.com/")).toEqual([]); // url参数永远有/
    expect(url.urlMatch("https://www.sub.test-tld.org.cn/")).toEqual([]); // url参数永远有/
    expect(url.urlMatch("https://www.sub.test-tld.co.uk/")).toEqual([]); // url参数永远有/
    expect(url.urlMatch("https://www.sub.test-tld.dk/")).toEqual([]); // url参数永远有/
  });

  it("tld 顶域测试 (include-k1)", () => {
    url.clearRules("ok9");
    url.clearRules("ok9x");
    url.addInclude("*.test-tld.tld/", "ok9");
    expect(url.urlMatch("https://www.test-tld.com/")).toEqual(["ok9"]); // url参数永远有/
    expect(url.urlMatch("https://www.test-tld.org.cn/")).toEqual(["ok9"]); // url参数永远有/
    expect(url.urlMatch("https://www.test-tld.co.uk/")).toEqual(["ok9"]); // url参数永远有/
    expect(url.urlMatch("https://www.test-tld.dk/")).toEqual(["ok9"]); // url参数永远有/
  });

  it("tld 顶域测试 (include-k2)", () => {
    url.clearRules("ok9");
    url.clearRules("ok9x");
    url.addInclude("*test-tld.tld/", "ok9");
    expect(url.urlMatch("https://www.test-tld.com/")).toEqual(["ok9"]); // url参数永远有/
    expect(url.urlMatch("https://www.test-tld.org.cn/")).toEqual(["ok9"]); // url参数永远有/
    expect(url.urlMatch("https://www.test-tld.co.uk/")).toEqual(["ok9"]); // url参数永远有/
    expect(url.urlMatch("https://www.test-tld.dk/")).toEqual(["ok9"]); // url参数永远有/
  });

  it("tld 顶域测试 (include-k3)", () => {
    url.clearRules("ok9");
    url.clearRules("ok9x");
    url.addInclude("*.tld/", "ok9");
    expect(url.urlMatch("https://www.test-tld.com/")).toEqual(["ok9"]); // url参数永远有/
    expect(url.urlMatch("https://www.test-tld.org.cn/")).toEqual(["ok9"]); // url参数永远有/
    expect(url.urlMatch("https://www.test-tld.co.uk/")).toEqual(["ok9"]); // url参数永远有/
    expect(url.urlMatch("https://www.test-tld.dk/")).toEqual(["ok9"]); // url参数永远有/
  });

  it("tld 顶域测试 (include-k4)", () => {
    url.clearRules("ok9");
    url.clearRules("ok9x");
    url.addInclude("*.tld*", "ok9");
    expect(url.urlMatch("https://www.test-tld.com/")).toEqual([]); // url参数永远有/
    expect(url.urlMatch("https://www.test-tld.org.cn/")).toEqual([]); // url参数永远有/
    expect(url.urlMatch("https://www.test-tld.co.uk/")).toEqual([]); // url参数永远有/
    expect(url.urlMatch("https://www.test-tld.dk/")).toEqual([]); // url参数永远有/
  });

  it("trump", () => {
    url.addInclude("*://*.x.com/*", "ok10"); // @include *://*.x.com/*
    expect(url.urlMatch("https://x.com/trump_chinese")).toEqual([]); // 与TM一致
    url.clearRules("ok10");
    url.addMatch("*://*.x.com/*", "ok10"); // @match *://*.x.com/*
    expect(url.urlMatch("https://x.com/trump_chinese")).toEqual(["ok10"]); // 与TM一致
    url.exclude("*://*.x.com/*", "ok10"); // @exclude *://*.x.com/*
    expect(url.urlMatch("https://x.com/trump_chinese")).toEqual(["ok10"]); // 与TM一致
    url.exclude("*://*x.com/*", "ok10"); // @exclude *://*x.com/*
    expect(url.urlMatch("https://x.com/trump_chinese")).toEqual([]); // 与TM一致
  });

  it("多*", () => {
    url.addInclude("*://*.google*/search*", "ok11"); // 自动修正为 @include *://*.google*/search*
    expect(
      url.urlMatch(
        "https://www.google.com.hk/search?q=%E6%88%91&oq=%E6%88%91&aqs=edge.0.69i59j0i512l5j69i61l3.1416j0j4&sourceid=chrome&ie=UTF-8"
      )
    ).toEqual(["ok11"]);
  });
});

describe("UrlInclude-2", () => {
  it("http* (include)", () => {
    const url = new UrlMatch<string>();
    url.addInclude("http*", "ok1");
    url.addInclude("*://*", "ok2");
    expect(url.urlMatch("http://www.http.com/")).toEqual(["ok1", "ok2"]); // url参数永远有/
    expect(
      url.urlMatch("https://pan.baidu.com/disk/home?from=newversion&stayAtHome=true#/all?path=%2F&vmode=list")
    ).toEqual(["ok1", "ok2"]);
    expect(url.urlMatch("https://github.com/CodFrm")).toEqual(["ok1", "ok2"]);
    url.addInclude("http*://example.com/*", "ok3");
    expect(url.urlMatch("https://example.com/")).toEqual(["ok1", "ok2", "ok3"]);
    expect(url.urlMatch("http://example.com/")).toEqual(["ok1", "ok2", "ok3"]);
  });
  it("port (match)", () => {
    const url = new UrlMatch<string>();
    url.addMatch("http://domain:8080", "ok2"); // 自动修正为 @match http://domain:8080/
    expect(url.urlMatch("http://domain:8080/")).toEqual(["ok2"]); // 与TM一致
    expect(url.urlMatch("http://domain:8080/123")).toEqual([]);
  });
  it("port (include)", () => {
    const url = new UrlMatch<string>();
    url.addInclude("http://domain:8080", "ok2"); // @include http://domain:8080
    expect(url.urlMatch("http://domain:8080/")).toEqual([]); // 与TM一致
    expect(url.urlMatch("http://domain:8080/123")).toEqual([]);
  });
  it("无/ (match)", () => {
    const url = new UrlMatch<string>();
    url.addMatch("http://domain2", "ok3"); // @match http://domain2
    url.addMatch("http://domain2*", "ok4"); // @match http://domain2*
    expect(url.urlMatch("http://domain2/")).toEqual(["ok3", "ok4"]); // 与TM一致
    expect(url.urlMatch("http://domain2.com/")).toEqual([]); // 与TM一致
    expect(url.urlMatch("http://domain2/123")).toEqual([]);
  });
  it("无/ (include)", () => {
    const url = new UrlMatch<string>();
    url.addInclude("http://domain2", "ok3"); // @include http://domain2
    url.addInclude("http://domain2*", "ok4"); // @include http://domain2*
    expect(url.urlMatch("http://domain2/")).toEqual(["ok4"]); // 与TM一致
    expect(url.urlMatch("http://domain2.com/")).toEqual(["ok4"]);
    expect(url.urlMatch("http://domain2/123")).toEqual(["ok4"]);
  });
  it("nomral (match)", () => {
    const url = new UrlMatch<string>();
    url.addMatch("*://*.bilibili.com/bangumi/play/*", "ok1");
    expect(url.urlMatch("https://www.bilibili.com/bangumi/play/ep691613")).toEqual(["ok1"]);
  });
  it("nomral (include)", () => {
    const url = new UrlMatch<string>();
    url.addInclude("*://*.bilibili.com/bangumi/play/*", "ok1");
    expect(url.urlMatch("https://www.bilibili.com/bangumi/play/ep691613")).toEqual(["ok1"]);
  });
});

// 与 TM 一致
describe("@match * (root only)", () => {
  const url = new UrlMatch<string>();
  url.addMatch("*", "ok1");
  it("ok1", () => {
    expect(url.urlMatch("http://www.baidu.com/")).toEqual(["ok1"]); // url参数永远有/
    expect(url.urlMatch("http://www.baidu.com/search")).toEqual([]);
    expect(url.urlMatch("http://my.apple.com.cn/")).toEqual(["ok1"]); // url参数永远有/
    expect(url.urlMatch("http://my.apple.com.cn/home?page=1")).toEqual([]);
    expect(url.urlMatch("https://www.baidu.com/")).toEqual(["ok1"]); // url参数永远有/
    expect(url.urlMatch("https://www.baidu.com/search")).toEqual([]);
    expect(url.urlMatch("https://my.apple.com.cn/")).toEqual(["ok1"]); // url参数永远有/
    expect(url.urlMatch("https://my.apple.com.cn/home?page=1")).toEqual([]);
    expect(url.urlMatch("https://www.baidu.com:123/")).toEqual(["ok1"]); // url参数永远有/
    expect(url.urlMatch("https://www.baidu.com:456/search")).toEqual([]);
    expect(url.urlMatch("https://my.apple.com.cn:7890/")).toEqual(["ok1"]); // url参数永远有/
    expect(url.urlMatch("https://my.apple.com.cn:36901/home?page=1")).toEqual([]);
    expect(url.urlMatch("http://109.70.80.1/")).toEqual(["ok1"]);
    expect(url.urlMatch("http://109.70.80.1:40/")).toEqual(["ok1"]);
    expect(url.urlMatch("http://109.70.80.1/?")).toEqual(["ok1"]);
    expect(url.urlMatch("http://109.70.80.1:40/?")).toEqual(["ok1"]);
    expect(url.urlMatch("http://109.70.80.1/?a")).toEqual([]);
    expect(url.urlMatch("http://109.70.80.1:40/?a")).toEqual([]);
    expect(url.urlMatch("http://109.70.80.1/#page")).toEqual(["ok1"]);
    expect(url.urlMatch("http://109.70.80.1:40/#page")).toEqual(["ok1"]);
    expect(url.urlMatch("http://109.70.80.1/?#page")).toEqual(["ok1"]);
    expect(url.urlMatch("http://109.70.80.1:40/?#page")).toEqual(["ok1"]);
  });
});

describe("@include * (all)", () => {
  const url = new UrlMatch<string>();
  url.addInclude("*", "ok1");
  it("ok1", () => {
    expect(url.urlMatch("http://www.baidu.com/")).toEqual(["ok1"]); // url参数永远有/
    expect(url.urlMatch("http://www.baidu.com/search")).toEqual(["ok1"]);
    expect(url.urlMatch("http://my.apple.com.cn/")).toEqual(["ok1"]); // url参数永远有/
    expect(url.urlMatch("http://my.apple.com.cn/home?page=1")).toEqual(["ok1"]);
    expect(url.urlMatch("https://www.baidu.com/")).toEqual(["ok1"]); // url参数永远有/
    expect(url.urlMatch("https://www.baidu.com/search")).toEqual(["ok1"]);
    expect(url.urlMatch("https://my.apple.com.cn/")).toEqual(["ok1"]); // url参数永远有/
    expect(url.urlMatch("https://my.apple.com.cn/home?page=1")).toEqual(["ok1"]);
    expect(url.urlMatch("https://www.baidu.com:123/")).toEqual(["ok1"]); // url参数永远有/
    expect(url.urlMatch("https://www.baidu.com:456/search")).toEqual(["ok1"]);
    expect(url.urlMatch("https://my.apple.com.cn:7890/")).toEqual(["ok1"]); // url参数永远有/
    expect(url.urlMatch("https://my.apple.com.cn:36901/home?page=1")).toEqual(["ok1"]);
    expect(url.urlMatch("http://109.70.80.1/")).toEqual(["ok1"]);
    expect(url.urlMatch("http://109.70.80.1:40/")).toEqual(["ok1"]);
    expect(url.urlMatch("http://109.70.80.1/?")).toEqual(["ok1"]);
    expect(url.urlMatch("http://109.70.80.1:40/?")).toEqual(["ok1"]);
    expect(url.urlMatch("http://109.70.80.1/?a")).toEqual(["ok1"]);
    expect(url.urlMatch("http://109.70.80.1:40/?a")).toEqual(["ok1"]);
    expect(url.urlMatch("http://109.70.80.1/#page")).toEqual(["ok1"]);
    expect(url.urlMatch("http://109.70.80.1:40/#page")).toEqual(["ok1"]);
    expect(url.urlMatch("http://109.70.80.1/?#page")).toEqual(["ok1"]);
    expect(url.urlMatch("http://109.70.80.1:40/?#page")).toEqual(["ok1"]);
  });
});
