import { describe, expect, it } from "vitest";
import { checkUrlMatch, getApiMatchesAndGlobs, extractUrlPatterns, RuleType } from "./url_matcher";

describe("extractUrlPatterns", () => {
  it("test1", () => {
    const lines = [
      "@match http://google.com/*",
      "@match https://google.com/*",
      "@match file:///mydir/myfile/001/*",
      "@include *hello*",
      "@exclude *world*",
      "@include /.*apple.*/",
      "@exclude /.*juice.*/",
    ];
    const scriptUrlPatterns = extractUrlPatterns(lines);
    expect(scriptUrlPatterns.length).toEqual(lines.length);
    expect(scriptUrlPatterns[0]).toEqual({
      ruleType: RuleType.MATCH_INCLUDE,
      ruleContent: scriptUrlPatterns[0].ruleContent,
      ruleTag: "match",
      patternString: "http://google.com/*",
    });
    expect(scriptUrlPatterns[1]).toEqual({
      ruleType: RuleType.MATCH_INCLUDE,
      ruleContent: scriptUrlPatterns[1].ruleContent,
      ruleTag: "match",
      patternString: "https://google.com/*",
    });
    expect(scriptUrlPatterns[2]).toEqual({
      ruleType: RuleType.MATCH_INCLUDE,
      ruleContent: scriptUrlPatterns[2].ruleContent,
      ruleTag: "match",
      patternString: "file:///mydir/myfile/001/*",
    });
    expect(scriptUrlPatterns[3]).toEqual({
      ruleType: RuleType.GLOB_INCLUDE,
      ruleContent: scriptUrlPatterns[3].ruleContent,
      ruleTag: "include",
      patternString: "*hello*",
    });
    expect(scriptUrlPatterns[4]).toEqual({
      ruleType: RuleType.GLOB_EXCLUDE,
      ruleContent: scriptUrlPatterns[4].ruleContent,
      ruleTag: "exclude",
      patternString: "*world*",
    });
    expect(scriptUrlPatterns[5]).toEqual({
      ruleType: RuleType.REGEX_INCLUDE,
      ruleContent: scriptUrlPatterns[5].ruleContent,
      ruleTag: "include",
      patternString: "/.*apple.*/",
    });
    expect(scriptUrlPatterns[6]).toEqual({
      ruleType: RuleType.REGEX_EXCLUDE,
      ruleContent: scriptUrlPatterns[6].ruleContent,
      ruleTag: "exclude",
      patternString: "/.*juice.*/",
    });
  });

  it("invalid-regex", () => {
    const lines = [
      "@match http://google.com/*",
      "@match https://google.com/*",
      "@match file:///mydir/myfile/001/*",
      "@include *hello*",
      "@exclude *world*",
      "@include /*apple*/", // invalid
      "@exclude /.*juice.*/",
      "@include /.*123.*/",
      "@include /hello[world/", // invalid
      "@include /hello(world/", // invalid
      "@include /hello world)/", // invalid
      "@include /hello world\\/", // invalid
      "@include /.*456.*/",
      "@include *789*",
    ];
    const scriptUrlPatterns = extractUrlPatterns(lines);
    expect(scriptUrlPatterns.length).toEqual(lines.length - 5);
  });
});

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
    expect(checkUrlMatch("*://*.example.com/*/*")).toEqual(["*", ".example.com", "*/*"]);
    expect(checkUrlMatch("*://*.example.com/*/*/*")).toEqual(["*", ".example.com", "*/*/*"]);
    // expect(checkUrlMatch("*://*.example.com/*/**")).toEqual(["*", ".example.com", "*/*"]); // 实际操作pattern已被修正，不会有 **
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

describe("getApiMatchesAndGlobs-1", () => {
  it("match1", () => {
    const scriptUrlPatterns = extractUrlPatterns([
      "@match http://google.com/*",
      "@match https://google.com/*",
      "@match file:///mydir/myfile/001/*",
    ]);
    const { matches, includeGlobs } = getApiMatchesAndGlobs(scriptUrlPatterns);

    expect(matches).toEqual(["http://google.com/*", "https://google.com/*", "file:///mydir/myfile/001/*"]);
    expect(includeGlobs).toEqual([]);
  });
  it("match2", () => {
    const scriptUrlPatterns = extractUrlPatterns(["@include *hello*"]);
    const { matches, includeGlobs } = getApiMatchesAndGlobs(scriptUrlPatterns);

    expect(matches).toEqual(["*://*/*"]);
    expect(includeGlobs).toEqual(["*hello*"]);
  });

  it("match3", () => {
    const scriptUrlPatterns = extractUrlPatterns([
      "@match http://google.com/*",
      "@match https://google.com/*",
      "@include *hello*",
    ]);
    const { matches, includeGlobs } = getApiMatchesAndGlobs(scriptUrlPatterns);

    expect(matches).toEqual(["*://*/*"]);
    expect(includeGlobs).toEqual(["*hello*", "http://google.com/*", "https://google.com/*"]);
  });

  it("match4", () => {
    const scriptUrlPatterns = extractUrlPatterns([
      "@match http://google.com/*",
      "@match https://google.com/*",
      "@match file:///mydir/myfile/001/*",
      "@include *hello*",
    ]);
    const { matches, includeGlobs } = getApiMatchesAndGlobs(scriptUrlPatterns);

    expect(matches).toEqual(["<all_urls>"]);
    expect(includeGlobs).toEqual([
      "*hello*",
      "http://google.com/*",
      "https://google.com/*",
      "file:///mydir/myfile/001/*",
    ]);
  });
});

describe("getApiMatchesAndGlobs-2", () => {
  it("match1", () => {
    const scriptUrlPatterns = extractUrlPatterns(
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
// @include     /.*(?<!exam)ple.*/
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
    const { matches, includeGlobs } = getApiMatchesAndGlobs(scriptUrlPatterns);

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
      "*://*.amazon.??*/*",
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
      "https://*.test.com/*",
      "*ple*",
      "http*://steamcommunity.com/*",
      "http*://meta.appinn.net/*",
      "http*://v2ex.com/*",
      "http*://www.v2ex.com/*",
      "http*://greasyfork.org/*",
      "http*://bilibili.com/*",
      "http*://www.douyin.com/*",
      "http*://weibo.com/*",
      // "http*://amazon.tld/*",
      // "http*://*.amazon.tld/*",
      "https://www.baidu.com/s?*",
      "https://www.google.com/search*",
      "https://www.bing.com/search*",
      "https://www.so.com/s*",
      "https://regex101.com/",
      "https://discord.com/*",
      "https://web.telegram.org/*",
      "https://www.flipkart.com/*",
      // "https://test.com/*",
      // "https://*.test.com/*",
    ]);
  });
});

describe("getApiMatchesAndGlobs-3", () => {
  it("test-0", () => {
    const scriptUrlPatterns = extractUrlPatterns([
      "// @include         *://www.bilibili.com/video/*",
      "// @include         *://www.bilibili.com/list/*",
      "// @include         *://www.bilibili.com/bangumi/play/*",
      "// @include         *://www.bilibili.com/medialist/play/watchlater",
      "// @include         *://www.bilibili.com/medialist/play/watchlater/*",
      "// @include         *://www.bilibili.com/medialist/play/ml*",
    ]);
    const { matches, includeGlobs } = getApiMatchesAndGlobs(scriptUrlPatterns);
    expect(matches).toEqual([
      "*://www.bilibili.com/video/*",
      "*://www.bilibili.com/list/*",
      "*://www.bilibili.com/bangumi/play/*",
      "*://www.bilibili.com/medialist/play/watchlater",
      "*://www.bilibili.com/medialist/play/watchlater/*",
      "*://www.bilibili.com/medialist/play/ml*",
    ]);
    expect(includeGlobs).toEqual([]);
  });

  it("test-1", () => {
    const scriptUrlPatterns = extractUrlPatterns([
      "// @include         *://www.bilibili.com/video/*",
      "// @include         *://www.bilibili.com/list/*",
      "// @include         *://www.bilibili.com/bangumi/play/*",
      "// @include         *://www.bilibili.com/medialist/play/watchlater",
      "// @include         *://www.bilibili.com/medialist/play/watchlater/*",
      "// @include         *://www.bilibili.com/medialist/play/ml*",
      "// @include         /https?:\\/\\/live\\.bilibili\\.com\\/(blanc\\/)?\\d+([/?]|$)/",
    ]);
    const { matches, includeGlobs } = getApiMatchesAndGlobs(scriptUrlPatterns);
    // 可以是 "*://*/*" 或者 *://*.bilibili.com/* 或 (*://www.bilibili.com/* 及 *://live.bilibili.com/*)
    // expect(matches).toEqual(["*://*/*"]);
    expect(matches.sort()).toEqual(["*://www.bilibili.com/*", "*://live.bilibili.com/*"].sort());
    // 忽略次序
    expect(includeGlobs.sort()).toEqual(
      [
        "http*://www.bilibili.com/video/*",
        "http*://www.bilibili.com/list/*",
        "http*://www.bilibili.com/bangumi/play/*",
        "http*://www.bilibili.com/medialist/play/watchlater",
        "http*://www.bilibili.com/medialist/play/watchlater/*",
        "http*://www.bilibili.com/medialist/play/ml*",
        "http*://live.bilibili.com/?*",
      ].sort()
    );
  });

  it("test-2", () => {
    const scriptUrlPatterns = extractUrlPatterns([
      "// @include         *://www.bilibili.com/video/*",
      "// @include         *://www.bilibili.com/list/*",
      "// @include         *://www.bilibili.com/bangumi/play/*",
      "// @include         *://www.bilibili.com/medialist/play/watchlater",
      "// @include         *://www.bilibili.com/medialist/play/watchlater/*",
      "// @include         *://www.bilibili.com/medialist/play/ml*",
      "// @include         /live\\.bilibili\\.com\\/(blanc\\/)?\\d+([/?]|$)/",
    ]);
    const { matches, includeGlobs } = getApiMatchesAndGlobs(scriptUrlPatterns);
    // 可以是 "*://*/*"
    expect(matches).toEqual(["*://*/*"]);
    // 忽略次序
    expect(includeGlobs.sort()).toEqual(
      [
        "http*://www.bilibili.com/video/*",
        "http*://www.bilibili.com/list/*",
        "http*://www.bilibili.com/bangumi/play/*",
        "http*://www.bilibili.com/medialist/play/watchlater",
        "http*://www.bilibili.com/medialist/play/watchlater/*",
        "http*://www.bilibili.com/medialist/play/ml*",
        "*live.bilibili.com/?*",
      ].sort()
    );
  });

  it("test-3", () => {
    const scriptUrlPatterns = extractUrlPatterns([
      "// @include         *://www.bilibili.com/video/*",
      "// @include         *://www.bilibili.com/list/*",
      "// @include         *://www.bilibili.com/bangumi/play/*",
      "// @include         *://www.bilibili.com/medialist/play/watchlater",
      "// @include         *://www.bilibili.com/medialist/play/watchlater/*",
      "// @include         *://www.bilibili.com/medialist/play/ml*",
      "// @include         /live\\.bilibili\\.com/",
    ]);
    const { matches, includeGlobs } = getApiMatchesAndGlobs(scriptUrlPatterns);
    // 可以是 "*://*/*"
    expect(matches).toEqual(["*://*/*"]);
    // 忽略次序
    expect(includeGlobs.sort()).toEqual(
      [
        "http*://www.bilibili.com/video/*",
        "http*://www.bilibili.com/list/*",
        "http*://www.bilibili.com/bangumi/play/*",
        "http*://www.bilibili.com/medialist/play/watchlater",
        "http*://www.bilibili.com/medialist/play/watchlater/*",
        "http*://www.bilibili.com/medialist/play/ml*",
        "*live.bilibili.com*",
      ].sort()
    );
  });
});
