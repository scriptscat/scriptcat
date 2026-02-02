import { describe, expect, it } from "vitest";
import {
  checkUrlMatch,
  getApiMatchesAndGlobs,
  extractUrlPatterns,
  RuleType,
  extractMatchPatternsFromGlobs,
  extractSchemesOfGlobs,
} from "./url_matcher";

describe.concurrent("extractMatchPatternsFromGlobs", () => {
  it.concurrent("test1", () => {
    expect(extractMatchPatternsFromGlobs(["https://www.google.com/*"])).toEqual(["https://www.google.com/*"]);
    expect(extractMatchPatternsFromGlobs(["http://www.google.com/*"])).toEqual(["http://www.google.com/*"]);
    expect(extractMatchPatternsFromGlobs(["http*://www.google.com/*"])).toEqual(["*://www.google.com/*"]);
    expect(extractMatchPatternsFromGlobs(["*://www.google.com/*"])).toEqual(["*://www.google.com/*"]);
    expect(extractMatchPatternsFromGlobs(["*://www.g*le.com/*"])).toEqual([null]);
    expect(extractMatchPatternsFromGlobs(["*://*.gle.com/*"])).toEqual([null]);
    expect(extractMatchPatternsFromGlobs(["*://*ww.gle.com/*"])).toEqual([null]);
    expect(extractMatchPatternsFromGlobs(["*://www.gle.cm*/*"])).toEqual([null]);
    expect(extractMatchPatternsFromGlobs(["*://www.gll?e.com/*"])).toEqual([null]);
    expect(extractMatchPatternsFromGlobs(["*://www.google.com/a?b*c*"])).toEqual(["*://www.google.com/*"]);
    expect(extractMatchPatternsFromGlobs(["http*://www.google.com/a?b*c*"])).toEqual(["*://www.google.com/*"]);
    expect(extractMatchPatternsFromGlobs(["https://www.google.com/a?b*c*"])).toEqual(["https://www.google.com/*"]);
    expect(extractMatchPatternsFromGlobs(["http://www.google.com/a?b*c*"])).toEqual(["http://www.google.com/*"]);
    expect(extractMatchPatternsFromGlobs(["file:///mydrive/t*.html"])).toEqual(["file:///*"]);
    expect(extractMatchPatternsFromGlobs(["file:///my?ive/t*.html"])).toEqual(["file:///*"]);
    expect(extractMatchPatternsFromGlobs(["www.g*le.com/*"])).toEqual([null]);
    expect(extractMatchPatternsFromGlobs(["www.google.com"])).toEqual([null]);
    expect(extractMatchPatternsFromGlobs(["*www.g*le.com/*"])).toEqual([null]);
    expect(extractMatchPatternsFromGlobs(["*ww.google.com*"])).toEqual([null]);
    expect(extractMatchPatternsFromGlobs(["*www.google.com/hello/*"])).toEqual([null]);
  });
});

describe.concurrent("extractSchemesOfGlobs", () => {
  it.concurrent("test1", () => {
    expect(extractSchemesOfGlobs(["https://www.google.com/*"])).toEqual(["*://*/*"]);
    expect(extractSchemesOfGlobs(["http://www.google.com/*"])).toEqual(["*://*/*"]);
    expect(extractSchemesOfGlobs(["http*://www.google.com/*"])).toEqual(["*://*/*"]);
    expect(extractSchemesOfGlobs(["*://www.google.com/*"])).toEqual(["*://*/*"]);
    expect(extractSchemesOfGlobs(["*://www.g*le.com/*"])).toEqual(["*://*/*"]);
    expect(extractSchemesOfGlobs(["*://*.gle.com/*"])).toEqual(["*://*/*"]);
    expect(extractSchemesOfGlobs(["*://*ww.gle.com/*"])).toEqual(["*://*/*"]);
    expect(extractSchemesOfGlobs(["*://www.gle.cm*/*"])).toEqual(["*://*/*"]);
    expect(extractSchemesOfGlobs(["*://www.gll?e.com/*"])).toEqual(["*://*/*"]);
    expect(extractSchemesOfGlobs(["*://www.google.com/a?b*c*"])).toEqual(["*://*/*"]);
    expect(extractSchemesOfGlobs(["http*://www.google.com/a?b*c*"])).toEqual(["*://*/*"]);
    expect(extractSchemesOfGlobs(["https://www.google.com/a?b*c*"])).toEqual(["*://*/*"]);
    expect(extractSchemesOfGlobs(["http://www.google.com/a?b*c*"])).toEqual(["*://*/*"]);
    expect(extractSchemesOfGlobs(["https://*google.com/*"])).toEqual(["*://*/*"]);
    // 预设包含 *://*/*
    expect(extractSchemesOfGlobs(["file:///mydrive/t*.html"])).toEqual(["*://*/*", "file:///*"]);
    expect(extractSchemesOfGlobs(["file:///my?ive/t*.html"])).toEqual(["*://*/*", "file:///*"]);
    // 其他scheme
    expect(extractSchemesOfGlobs(["my-protocol://hello/world/t_?*.html"])).toEqual(["*://*/*", "my-protocol://*/*"]);
    expect(extractSchemesOfGlobs(["tcp://hello/world/t_?*.html"])).toEqual(["*://*/*", "tcp://*/*"]);
    expect(extractSchemesOfGlobs(["ab://hello/world/t_?*.html"])).toEqual(["*://*/*", "ab://*/*"]);
    // 无视无效scheme
    expect(extractSchemesOfGlobs(["myl*://hello/world/t_?*.html"])).toEqual(["*://*/*"]);
    expect(extractSchemesOfGlobs(["my?l//hello/world/t_?*.html"])).toEqual(["*://*/*"]);
    expect(extractSchemesOfGlobs(["*m?yl//hello/world/t_?*.html"])).toEqual(["*://*/*"]);
  });

  it.concurrent("test2", () => {
    // https scheme
    expect(extractSchemesOfGlobs(["https://www.abc.com/*", "http://www.abc.com/*"])).toEqual(["*://*/*"]);
    expect(extractSchemesOfGlobs(["https://www.abc.com/*", "www.abc.com/*"])).toEqual(["*://*/*"]);
    // file scheme
    expect(extractSchemesOfGlobs(["file:///mydrive/*", "http://www.abc.com/*"]).sort()).toEqual(
      ["file:///*", "*://*/*"].sort()
    );
    expect(extractSchemesOfGlobs(["file:///mydrive/*", "www.abc.com/*"]).sort()).toEqual(
      ["file:///*", "*://*/*"].sort()
    );
    // 其他scheme
    expect(extractSchemesOfGlobs(["my-place://mydrive/*", "http://www.abc.com/*"]).sort()).toEqual(
      ["my-place://*/*", "*://*/*"].sort()
    );
    expect(extractSchemesOfGlobs(["my-place://mydrive/*", "www.abc.com/*"]).sort()).toEqual(
      ["my-place://*/*", "*://*/*"].sort()
    );
    // 3个不重复 (file:///)
    expect(
      extractSchemesOfGlobs(["https://www.abc.com/*", "file:///mydrive/*", "http://www.def.com/*"]).sort()
    ).toEqual(["file:///*", "*://*/*"].sort());
    expect(extractSchemesOfGlobs(["http://www.abc.com/*", "file:///mydrive/*", "http://www.def.com/*"]).sort()).toEqual(
      ["file:///*", "*://*/*"].sort()
    );
    expect(
      extractSchemesOfGlobs([
        "http://www.abc.com/p/*",
        "file://mydrive/14/*",
        "http://www.def.com/g/*",
        "http://www.abc.com/q/*",
        "file://mydrive/13/*",
        "http://www.def.com/h/*",
      ]).sort()
    ).toEqual(["file:///*", "*://*/*"].sort());

    // 3个不重复 (my-path://)
    expect(
      extractSchemesOfGlobs(["https://www.abc.com/*", "my-path://mydrive/*", "http://www.def.com/*"]).sort()
    ).toEqual(["my-path://*/*", "*://*/*"].sort());
    expect(
      extractSchemesOfGlobs(["http://www.abc.com/*", "my-path://mydrive/*", "http://www.def.com/*"]).sort()
    ).toEqual(["my-path://*/*", "*://*/*"].sort());
    expect(
      extractSchemesOfGlobs([
        "http://www.abc.com/p/*",
        "my-path://mydrive/14/*",
        "http://www.def.com/g/*",
        "http://www.abc.com/q/*",
        "my-path://mydrive/13/*",
        "http://www.def.com/h/*",
      ]).sort()
    ).toEqual(["my-path://*/*", "*://*/*"].sort());
  });
});

describe.concurrent("extractUrlPatterns", () => {
  it.concurrent("test1", () => {
    const lines = [
      "@match http://google.com/*",
      "@match https://google.com/*",
      "@match file:///mydir/myfile/001/*",
      "@match *://*example.com/*",
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
      ruleType: RuleType.MATCH_INCLUDE,
      ruleContent: scriptUrlPatterns[3].ruleContent,
      ruleTag: "match",
      patternString: "*://*.example.com/*",
    });
    expect(scriptUrlPatterns[4]).toEqual({
      ruleType: RuleType.GLOB_INCLUDE,
      ruleContent: scriptUrlPatterns[4].ruleContent,
      ruleTag: "include",
      patternString: "*hello*",
    });
    expect(scriptUrlPatterns[5]).toEqual({
      ruleType: RuleType.GLOB_EXCLUDE,
      ruleContent: scriptUrlPatterns[5].ruleContent,
      ruleTag: "exclude",
      patternString: "*world*",
    });
    expect(scriptUrlPatterns[6]).toEqual({
      ruleType: RuleType.REGEX_INCLUDE,
      ruleContent: scriptUrlPatterns[6].ruleContent,
      ruleTag: "include",
      patternString: "/.*apple.*/",
    });
    expect(scriptUrlPatterns[7]).toEqual({
      ruleType: RuleType.REGEX_EXCLUDE,
      ruleContent: scriptUrlPatterns[7].ruleContent,
      ruleTag: "exclude",
      patternString: "/.*juice.*/",
    });
  });

  it.concurrent("invalid-regex", () => {
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

  it.concurrent("@match www.website.com/*", () => {
    // https://github.com/scriptscat/scriptcat/pull/1165
    const lines = [
      "@match www.website1.com/*",
      "@match www.website2.com/index.html?page=*",
      "@match www.invalid1.com^/*",
      "@match website3.com/*",
      "@match website4.com/index.html?page=*",
      "@match invalid2^.com/*",
      "@match *.website5.com/*",
      "@match *.website6.com/index.html?page=*",
      "@match *.invalid3^",
    ];
    const scriptUrlPatterns = extractUrlPatterns(lines);
    expect(scriptUrlPatterns.length).toEqual(6);
    expect(scriptUrlPatterns[0]).toEqual({
      ruleType: RuleType.MATCH_INCLUDE,
      ruleContent: scriptUrlPatterns[0].ruleContent,
      ruleTag: "match",
      patternString: "*://www.website1.com/*",
    });
    expect(scriptUrlPatterns[1]).toEqual({
      ruleType: RuleType.MATCH_INCLUDE,
      ruleContent: scriptUrlPatterns[1].ruleContent,
      ruleTag: "match",
      patternString: "*://www.website2.com/index.html?page=*",
    });
    expect(scriptUrlPatterns[2]).toEqual({
      ruleType: RuleType.MATCH_INCLUDE,
      ruleContent: scriptUrlPatterns[2].ruleContent,
      ruleTag: "match",
      patternString: "*://website3.com/*",
    });
    expect(scriptUrlPatterns[3]).toEqual({
      ruleType: RuleType.MATCH_INCLUDE,
      ruleContent: scriptUrlPatterns[3].ruleContent,
      ruleTag: "match",
      patternString: "*://website4.com/index.html?page=*",
    });
    expect(scriptUrlPatterns[4]).toEqual({
      ruleType: RuleType.MATCH_INCLUDE,
      ruleContent: scriptUrlPatterns[4].ruleContent,
      ruleTag: "match",
      patternString: "*://*.website5.com/*",
    });
    expect(scriptUrlPatterns[5]).toEqual({
      ruleType: RuleType.MATCH_INCLUDE,
      ruleContent: scriptUrlPatterns[5].ruleContent,
      ruleTag: "match",
      patternString: "*://*.website6.com/index.html?page=*",
    });
  });
});

describe.concurrent("checkUrlMatch-1", () => {
  it.concurrent("match1", () => {
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

  it.concurrent("ignore-port", () => {
    // The path pattern string should not include a port number. Adding a port, as in: http://localhost:1234/* causes the match pattern to be ignored.
    expect(checkUrlMatch("https://www.google.com:80/")).toBeNull();
    expect(checkUrlMatch("https://www.google.com:81/*")).toBeNull();
    expect(checkUrlMatch("https://www.google.com:0/*/")).toBeNull();
    expect(checkUrlMatch("https://www.google.com:1/*/a")).toBeNull();
  });
});

describe.concurrent("getApiMatchesAndGlobs-1 （基础测试）", () => {
  it.concurrent("match1", () => {
    // 只有有效的match pattern，不需要glob pattern
    const scriptUrlPatterns = extractUrlPatterns([
      "@match http://google.com/*",
      "@match https://google.com/*",
      "@match file:///mydir/myfile/001/*",
    ]);
    const { matches, includeGlobs } = getApiMatchesAndGlobs(scriptUrlPatterns);

    expect(matches).toEqual(["http://google.com/*", "https://google.com/*", "file:///mydir/myfile/001/*"]);
    expect(includeGlobs).toEqual([]);
  });
  it.concurrent("match2", () => {
    // 由于 *hello* ，故要 match 全部页面
    const scriptUrlPatterns = extractUrlPatterns(["@include *hello*"]);
    const { matches, includeGlobs } = getApiMatchesAndGlobs(scriptUrlPatterns);

    expect(matches).toEqual(["*://*/*"]);
    expect(includeGlobs).toEqual(["*hello*"]);
  });

  it.concurrent("match3", () => {
    // 由于 *hello* ，故要 match 全部页面
    const scriptUrlPatterns = extractUrlPatterns([
      "@match http://google.com/*",
      "@match https://google.com/*",
      "@include *hello*",
    ]);
    const { matches, includeGlobs } = getApiMatchesAndGlobs(scriptUrlPatterns);

    expect(matches).toEqual(["*://*/*"]);
    expect(includeGlobs).toEqual(["*hello*", "http://google.com/*", "https://google.com/*"]);
  });

  it.concurrent("match4", () => {
    // 由于 *hello* ，故要 match 全部页面
    // @match 有 file:/// ，故追加 file:///* 至match
    const scriptUrlPatterns = extractUrlPatterns([
      "@match http://google.com/*",
      "@match https://google.com/*",
      "@match file:///mydir/myfile/001/*",
      "@include *hello*",
    ]);
    const { matches, includeGlobs } = getApiMatchesAndGlobs(scriptUrlPatterns);

    expect(matches).toEqual(["*://*/*", "file:///*"]);
    expect(includeGlobs).toEqual([
      "*hello*",
      "http://google.com/*",
      "https://google.com/*",
      "file:///mydir/myfile/001/*",
    ]);
  });
});

describe.concurrent("getApiMatchesAndGlobs-2 （实际例子测试）", () => {
  it.concurrent("match1", () => {
    // 测试真实例子，验证解析结果
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

describe.concurrent("getApiMatchesAndGlobs-3 （全面性测试）", () => {
  it.concurrent("标准match格式", () => {
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

  it.concurrent("[A1] regex格式可抽出match网域 (https?:\\/\\/)", () => {
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
        "http*://live.bilibili.com/*",
      ].sort()
    );
  });

  it.concurrent("[A2] regex格式可抽出match网域 (https?://)", () => {
    // 斜线没有反斜线不影响结果
    const scriptUrlPatterns = extractUrlPatterns([
      "// @include         *://www.bilibili.com/video/*",
      "// @include         *://www.bilibili.com/list/*",
      "// @include         *://www.bilibili.com/bangumi/play/*",
      "// @include         *://www.bilibili.com/medialist/play/watchlater",
      "// @include         *://www.bilibili.com/medialist/play/watchlater/*",
      "// @include         *://www.bilibili.com/medialist/play/ml*",
      "// @include         /https?://live\\.bilibili\\.com\\/(blanc\\/)?\\d+([/?]|$)/",
    ]);
    const { matches, includeGlobs } = getApiMatchesAndGlobs(scriptUrlPatterns);
    // 可以是 "*://*/*"
    expect(matches).toEqual(["*://live.bilibili.com/*", "*://www.bilibili.com/*"]);
    // 忽略次序
    expect(includeGlobs.sort()).toEqual(
      [
        "http*://www.bilibili.com/video/*",
        "http*://www.bilibili.com/list/*",
        "http*://www.bilibili.com/bangumi/play/*",
        "http*://www.bilibili.com/medialist/play/watchlater",
        "http*://www.bilibili.com/medialist/play/watchlater/*",
        "http*://www.bilibili.com/medialist/play/ml*",
        "http*://live.bilibili.com/*",
      ].sort()
    );
  });

  it.concurrent("[A3] regex格式可抽出match网域 (*://)", () => {
    const scriptUrlPatterns = extractUrlPatterns([
      "// @include         *://www.bilibili.com/video/*",
      "// @include         *://www.bilibili.com/list/*",
      "// @include         *://www.bilibili.com/bangumi/play/*",
      "// @include         *://www.bilibili.com/medialist/play/watchlater",
      "// @include         *://www.bilibili.com/medialist/play/watchlater/*",
      "// @include         *://www.bilibili.com/medialist/play/ml*",
      "// @include         /.*://live\\.bilibili\\.com\\/(blanc\\/)?\\d+([/?]|$)/",
    ]);
    const { matches, includeGlobs } = getApiMatchesAndGlobs(scriptUrlPatterns);
    // 可以是 "*://*/*"
    expect(matches).toEqual(["*://live.bilibili.com/*", "*://www.bilibili.com/*"]);
    // 忽略次序
    expect(includeGlobs.sort()).toEqual(
      [
        "http*://www.bilibili.com/video/*",
        "http*://www.bilibili.com/list/*",
        "http*://www.bilibili.com/bangumi/play/*",
        "http*://www.bilibili.com/medialist/play/watchlater",
        "http*://www.bilibili.com/medialist/play/watchlater/*",
        "http*://www.bilibili.com/medialist/play/ml*",
        "*://live.bilibili.com/*",
      ].sort()
    );
  });

  it.concurrent("[B1] regex转换成*://*/* (match & glob)", () => {
    // /live\\.bilibili\\.com/ 可匹配 123live.bilibili.com, www.live.bilibili.com, myhome.com/live.bilibili.com
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
        "*://*/*",
      ].sort()
    );
  });

  it.concurrent("[B2] regex转换成*://*/* (match only)", () => {
    // /live\\.bilibili\\.com/ 可匹配 123live.bilibili.com, www.live.bilibili.com, myhome.com/live.bilibili.com
    // 相对于 (1) ，regex为较简单，glob部份不需转换
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
        "live.bilibili.com",
      ].sort()
    );
  });

  it.concurrent("[C1] 无法从regex抽出match网域, 全域match配合glob (live.bilibili.???)", () => {
    const scriptUrlPatterns = extractUrlPatterns([
      "// @include         *://www.bilibili.com/video/*",
      "// @include         *://www.bilibili.com/list/*",
      "// @include         *://www.bilibili.com/bangumi/play/*",
      "// @include         *://www.bilibili.com/medialist/play/watchlater",
      "// @include         *://www.bilibili.com/medialist/play/watchlater/*",
      "// @include         *://www.bilibili.com/medialist/play/ml*",
      "// @include         /.*://live\\.bilibili\\.(com|net)\\/(blanc\\/)?\\d+([/?]|$)/",
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
        "*://live.bilibili.???/*",
      ].sort()
    );
  });

  it.concurrent("[C2] 无法从regex抽出match网域, 全域match配合glob (*.bilibili.com)", () => {
    // glob/regex 的 *.bilibili.com 可以匹配 google.com/my.bilibili.com, 因此无法转换成match网域
    const scriptUrlPatterns = extractUrlPatterns([
      "// @include         *://www.bilibili.com/video/*",
      "// @include         *://www.bilibili.com/list/*",
      "// @include         *://www.bilibili.com/bangumi/play/*",
      "// @include         *://www.bilibili.com/medialist/play/watchlater",
      "// @include         *://www.bilibili.com/medialist/play/watchlater/*",
      "// @include         *://www.bilibili.com/medialist/play/ml*",
      "// @include         /https?://.*\\.bilibili\\.com\\/(blanc\\/)?\\d+([/?]|$)/",
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
        "http*://*.bilibili.com/*",
      ].sort()
    );
  });

  it.concurrent("[C3] 无法从regex抽出match网域, 全域match配合glob (www.bil?bili.com)", () => {
    const scriptUrlPatterns = extractUrlPatterns([
      "// @include         *://www.bilibili.com/video/*",
      "// @include         *://www.bilibili.com/list/*",
      "// @include         *://www.bilibili.com/bangumi/play/*",
      "// @include         *://www.bilibili.com/medialist/play/watchlater",
      "// @include         *://www.bilibili.com/medialist/play/watchlater/*",
      "// @include         *://www.bilibili.com/medialist/play/ml*",
      "// @include         /https?://www\\.bil?ibili\\.com\\/(blanc\\/)?\\d+([/?]|$)/",
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
        "http*://www.bi*ibili.com/*",
      ].sort()
    );
  });

  it.concurrent("[D1] 无法从regex抽出match网域, 全域match配合glob (fallback glob to *://*/*)", () => {
    // 减低依赖 regexToGlob 所带来的问题，regex 转成 glob后，出现罕见 glob pattern 会fallback至 *://*/*
    const scriptUrlPatterns = extractUrlPatterns([
      "// @include         *://www.bilibili.com/video/*",
      "// @include         *://www.bilibili.com/list/*",
      "// @include         *://www.bilibili.com/bangumi/play/*",
      "// @include         *://www.bilibili.com/medialist/play/watchlater",
      "// @include         *://www.bilibili.com/medialist/play/watchlater/*",
      "// @include         *://www.bilibili.com/medialist/play/ml*",
      "// @include         /://www\\.bil?ibili\\.com\\/(blanc\\/)?\\d+([/?]|$)/",
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
        "*://*/*",
      ].sort()
    );
  });

  it.concurrent("[D2] 无法从regex抽出match网域, 全域match配合glob (fallback glob to *://*/*)", () => {
    // 减低依赖 regexToGlob 所带来的问题，regex 转成 glob后，出现罕见 glob pattern 会fallback至 *://*/*
    const scriptUrlPatterns = extractUrlPatterns([
      "// @include         *://www.bilibili.com/video/*",
      "// @include         *://www.bilibili.com/list/*",
      "// @include         *://www.bilibili.com/bangumi/play/*",
      "// @include         *://www.bilibili.com/medialist/play/watchlater",
      "// @include         *://www.bilibili.com/medialist/play/watchlater/*",
      "// @include         *://www.bilibili.com/medialist/play/ml*",
      "// @include         /https?://www(AS).com/www#11?11/2.*/",
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
        "*://*/*",
      ].sort()
    );
  });

  it.concurrent("[E1] 混合 regex/glob pattern 测试解析正确性", () => {
    const scriptUrlPatterns = extractUrlPatterns([
      "// @include         *://www.google.com/video/*",
      "// @include         *://www.bilibili.com/list/*",
      "// @include         *://www.bilibili.com/bangumi/play/*",
      "// @include         *://live.bilibili.com/medialist/play/watchlater",
      "// @include         /https?://www(AS).com/www#11?11/2.*/",
      "// @include         /https?://www.google.com/search\\?q=\\w+&page=\\d+/",
      "// @exclude         /https?://www.google.com/search\\?q=\\w+&page=[123]/",
      "// @include         /http://www.bilibili.com/\\w+/",
      "// @include         /http://www.apple.com/abc/",
      "// @include         /www.myapple.com/def/",
    ]);
    const { matches, includeGlobs } = getApiMatchesAndGlobs(scriptUrlPatterns);
    // 可以是 "*://*/*"
    expect(matches).toEqual(["*://*/*"]);
    // 忽略次序
    expect(includeGlobs.sort()).toEqual(
      [
        "http*://www.bilibili.com/bangumi/play/*",
        "http*://www.bilibili.com/list/*",
        "http*://www.google.com/video/*",
        "http*://www?google?com/*",
        "http://www?bilibili?com/*",
        "http*://live.bilibili.com/medialist/play/watchlater",
        "*://*/*",
        "http://www?apple?com/*",
      ].sort()
    );
  });

  it.concurrent("[E2] 混合 regex/glob pattern 测试解析正确性", () => {
    const scriptUrlPatterns = extractUrlPatterns([
      "// @include         *://www.google.com/video/*",
      "// @include         *://www.bilibili.com/list/*",
      "// @include         *://www.bilibili.com/bangumi/play/*",
      "// @include         *://live.bilibili.com/medialist/play/watchlater",
      "// @include         /https?://www\\.google\\.com/search?q=\\w+&page=\\d+/",
      "// @exclude         /https?://www\\.google\\.com/search?q=\\w+&page=[123]/",
      "// @include         /http://www\\.bilibili\\.com/\\w+/",
      "// @include         /http://www\\.apple\\.com/abc/",
    ]);
    const { matches, includeGlobs } = getApiMatchesAndGlobs(scriptUrlPatterns);
    // 可以是 "*://*/*"
    expect(matches).toEqual([
      "*://www.google.com/*",
      "http://www.bilibili.com/*",
      "http://www.apple.com/*",
      "*://www.bilibili.com/*",
      "*://live.bilibili.com/*",
    ]);
    // 忽略次序
    expect(includeGlobs.sort()).toEqual(
      [
        "http*://www.bilibili.com/bangumi/play/*",
        "http*://www.bilibili.com/list/*",
        "http*://www.google.com/video/*",
        "http*://www.google.com/*",
        "http://www.bilibili.com/*",
        "http*://live.bilibili.com/medialist/play/watchlater",
        "http://www.apple.com/*",
      ].sort()
    );
  });

  it.concurrent("[F1] 混合 regex/glob pattern & file scheme 测试解析正确性", () => {
    // 由于regex pattern 而fallback至全部页面
    // 含有 file:///，追加 "file:///*"
    const scriptUrlPatterns = extractUrlPatterns([
      "// @include         *://www.google.com/video/*",
      "// @include         *://www.bilibili.com/list/*",
      "// @include         *://www.bilibili.com/bangumi/play/*",
      "// @include         *://live.bilibili.com/medialist/play/watchlater",
      "// @include         /https?://www(AS).com/www#11?11/2.*/",
      "// @include         /https?://www.google.com/search\\?q=\\w+&page=\\d+/",
      "// @exclude         /https?://www.google.com/search\\?q=\\w+&page=[123]/",
      "// @include         /http://www.bilibili.com/\\w+/",
      "// @include         /http://www.apple.com/abc/",
      "// @include         file:///myfile/*",
    ]);
    const { matches, includeGlobs } = getApiMatchesAndGlobs(scriptUrlPatterns);
    expect(matches).toEqual(["*://*/*", "file:///*"]);
    // 忽略次序
    expect(includeGlobs.sort()).toEqual(
      [
        "http*://www.bilibili.com/bangumi/play/*",
        "http*://www.bilibili.com/list/*",
        "http*://www.google.com/video/*",
        "http*://www?google?com/*",
        "http://www?bilibili?com/*",
        "http*://live.bilibili.com/medialist/play/watchlater",
        "*://*/*",
        "http://www?apple?com/*",
        "file:///myfile/*",
      ].sort()
    );
  });

  it.concurrent("[F2] 混合 regex/glob pattern & file scheme 测试解析正确性", () => {
    // regex pattern 不用 fallback 至全部页面
    const scriptUrlPatterns = extractUrlPatterns([
      "// @include         *://www.google.com/video/*",
      "// @include         *://www.bilibili.com/list/*",
      "// @include         *://www.bilibili.com/bangumi/play/*",
      "// @include         *://live.bilibili.com/medialist/play/watchlater",
      "// @include         /https?://www\\.google\\.com/search?q=\\w+&page=\\d+/",
      "// @exclude         /https?://www\\.google\\.com/search?q=\\w+&page=[123]/",
      "// @include         /http://www\\.bilibili\\.com/\\w+/",
      "// @include         /http://www\\.apple\\.com/abc/",
      "// @include         file:///myfile/*",
    ]);
    const { matches, includeGlobs } = getApiMatchesAndGlobs(scriptUrlPatterns);
    expect(matches).toEqual([
      "*://www.google.com/*",
      "http://www.bilibili.com/*",
      "http://www.apple.com/*",
      "*://www.bilibili.com/*",
      "*://live.bilibili.com/*",
      "file:///*",
    ]);
    // 忽略次序
    expect(includeGlobs.sort()).toEqual(
      [
        "http*://www.bilibili.com/bangumi/play/*",
        "http*://www.bilibili.com/list/*",
        "http*://www.google.com/video/*",
        "http*://www.google.com/*",
        "http://www.bilibili.com/*",
        "http*://live.bilibili.com/medialist/play/watchlater",
        "http://www.apple.com/*",
        "file:///myfile/*",
      ].sort()
    );
  });
});
