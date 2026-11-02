import { describe, expect, it } from "vitest";
import {
  checkUrlMatch,
  getApiMatchesAndGlobs,
  extractUrlPatterns,
  RuleType,
  extractSchemesOfGlobs,
  embeddedPatternCheckerString,
  getMatchPatternHost,
  PLACEHOLDER_MATCH_PATTERN,
} from "./url_matcher";
import { isUrlIncluded } from "./match";

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

const BILIBILI_MATCHES = [
  "*://www.bilibili.com/video/*",
  "*://www.bilibili.com/list/*",
  "*://www.bilibili.com/bangumi/play/*",
  "*://www.bilibili.com/medialist/play/watchlater",
  "*://www.bilibili.com/medialist/play/watchlater/*",
  "*://www.bilibili.com/medialist/play/ml*",
];
const BILIBILI_INCLUDES = BILIBILI_MATCHES.map((p) => `// @include         ${p}`);

// 浏览器把 matches 与 includeGlobs 取并集（任一命中即注入），所以 matches 里一旦出现 *://*/*，
// 注册范围就是全站；只有脚本规则本身覆盖全站，或正则无法收窄时才允许出现（#1803）
describe.concurrent("getApiMatchesAndGlobs-1 （基础测试）", () => {
  it.concurrent("只有 match pattern 时原样注册，不需要 glob", () => {
    const scriptUrlPatterns = extractUrlPatterns([
      "@match http://google.com/*",
      "@match https://google.com/*",
      "@match file:///mydir/myfile/001/*",
    ]);
    const result = getApiMatchesAndGlobs(scriptUrlPatterns);

    expect(result).toEqual({
      matches: ["http://google.com/*", "https://google.com/*", "file:///mydir/myfile/001/*"],
      includeGlobs: [],
      regexUnbounded: false,
    });
  });

  it.concurrent("只有 glob 时 matches 用占位 pattern，范围完全由 glob 决定", () => {
    const result = getApiMatchesAndGlobs(extractUrlPatterns(["@include *hello*"]));

    expect(result).toEqual({
      matches: [PLACEHOLDER_MATCH_PATTERN],
      includeGlobs: ["*hello*"],
      regexUnbounded: false,
    });
  });

  it.concurrent("match 与 glob 混用时各自保留，不再退回 *://*/*", () => {
    const result = getApiMatchesAndGlobs(
      extractUrlPatterns(["@match http://google.com/*", "@match https://google.com/*", "@include *hello*"])
    );

    expect(result).toEqual({
      matches: ["http://google.com/*", "https://google.com/*"],
      includeGlobs: ["*hello*"],
      regexUnbounded: false,
    });
  });

  it.concurrent("file:/// 的 match pattern 直接保留，不需要额外追加 file:///*", () => {
    const result = getApiMatchesAndGlobs(
      extractUrlPatterns([
        "@match http://google.com/*",
        "@match https://google.com/*",
        "@match file:///mydir/myfile/001/*",
        "@include *hello*",
      ])
    );

    expect(result.matches).toEqual(["http://google.com/*", "https://google.com/*", "file:///mydir/myfile/001/*"]);
    expect(result.includeGlobs).toEqual(["*hello*"]);
  });

  it.concurrent("脚本本身写了 *://*/* 时照常全站注册", () => {
    const result = getApiMatchesAndGlobs(extractUrlPatterns(["@match *://*/*", "@include *hello*"]));

    expect(result.matches).toEqual(["*://*/*"]);
    expect(result.regexUnbounded).toBe(false);
  });

  it.concurrent(
    "glob 不以 * 结尾时补一条 #* 变体：浏览器拿带 hash 的完整网址匹配 glob，脚本猫匹配前会去掉 hash",
    () => {
      const result = getApiMatchesAndGlobs(extractUrlPatterns(["@include https://*example.com/page"]));

      expect(result.matches).toEqual([PLACEHOLDER_MATCH_PATTERN]);
      expect(result.includeGlobs).toEqual(["https://*example.com/page", "https://*example.com/page#*"]);
    }
  );

  it.concurrent("glob 推导出的非 http scheme 追加到 matches", () => {
    const result = getApiMatchesAndGlobs(extractUrlPatterns(["@include ftp://*example*/*"]));

    expect(result.matches).toEqual(["ftp://*/*"]);
    expect(result.includeGlobs).toEqual(["ftp://*example*/*"]);
  });
});

describe.concurrent("getApiMatchesAndGlobs 浏览器不支持的 scheme", () => {
  it.concurrent("只剩不支持的 scheme 时 matches 为空，不能退回 *://*/*", () => {
    const { matches } = getApiMatchesAndGlobs(extractUrlPatterns(["@match edge://settings/*"]));

    expect(matches).toEqual([]);
  });

  it.concurrent("与支持的 scheme 混用时只丢弃不支持的", () => {
    const { matches } = getApiMatchesAndGlobs(
      extractUrlPatterns([
        "@match chrome://extensions/*",
        "@match https://example.com/*",
        "@match ftp://example.com/*",
        "@match file:///tmp/*",
      ])
    );

    expect(matches).toEqual(["https://example.com/*", "ftp://example.com/*", "file:///tmp/*"]);
  });

  it.concurrent("只有不支持 scheme 的 glob 时整条丢弃，没有可注册的 matches", () => {
    const result = getApiMatchesAndGlobs(extractUrlPatterns(["@include edge://*"]));

    expect(result.matches).toEqual([]);
    expect(result.includeGlobs).toEqual([]);
  });
});

describe.concurrent("getApiMatchesAndGlobs-2 （实际例子测试）", () => {
  const realWorldIncludes = `
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
    .split(/[\r\n]+/);

  it.concurrent("大量 match/glob 混用时逐条精确注册", () => {
    const result = getApiMatchesAndGlobs(extractUrlPatterns(realWorldIncludes));

    expect(result).toEqual({
      matches: [
        "*://steamcommunity.com/*",
        "*://meta.appinn.net/*",
        "*://v2ex.com/*",
        "*://www.v2ex.com/*",
        "*://greasyfork.org/*",
        "*://bilibili.com/*",
        "*://www.douyin.com/*",
        "*://weibo.com/*",
        "https://www.baidu.com/s?*",
        "https://www.google.com/search*",
        "https://www.bing.com/search*",
        "https://www.so.com/s*",
        "https://regex101.com/",
        "https://discord.com/*",
        "https://web.telegram.org/*",
        "https://www.flipkart.com/*",
      ],
      includeGlobs: [
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
        "*/releases#*",
        "*/releases/*",
        "*:5244*",
        "*:8080*",
        "https://*.test.com/*",
      ],
      regexUnbounded: false,
    });
  });

  it.concurrent("夹带一条无法收窄的正则时退回全站注册并标记 regexUnbounded", () => {
    const result = getApiMatchesAndGlobs(
      extractUrlPatterns([...realWorldIncludes, "// @include     /.*(?<!exam)ple.*/"])
    );

    expect(result).toEqual({ matches: ["*://*/*"], includeGlobs: [], regexUnbounded: true });
  });

  it.concurrent("issue #1803 的脚本：正则 @include 只扩展出它的网域 glob，不影响其他站点", () => {
    const result = getApiMatchesAndGlobs(
      extractUrlPatterns([
        "// @match        *://*.douyin.com/*",
        "// @exclude      *://so.douyin.com/*",
        "// @match        *://*.bilibili.com/*",
        "// @include      /^https?:\\/\\/(greasy|sleazy)fork\\.org\\/[^/]+\\/scripts\\/\\d+-/",
        "// @match        *://*.zhihu.com/*",
      ])
    );

    expect(result).toEqual({
      matches: ["*://*.douyin.com/*", "*://*.bilibili.com/*", "*://*.zhihu.com/*"],
      includeGlobs: ["http*://?????yfork.org/*"],
      regexUnbounded: false,
    });
  });
});

describe.concurrent("getApiMatchesAndGlobs-3 （正则 @include 的收窄）", () => {
  it.concurrent("标准match格式", () => {
    const result = getApiMatchesAndGlobs(extractUrlPatterns(BILIBILI_INCLUDES));
    expect(result).toEqual({ matches: BILIBILI_MATCHES, includeGlobs: [], regexUnbounded: false });
  });

  it.concurrent.each([
    ["https?:\\/\\/", "/https?:\\/\\/live\\.bilibili\\.com\\/(blanc\\/)?\\d+([/?]|$)/", "http*://live.bilibili.com/*"],
    ["https?://", "/https?://live\\.bilibili\\.com\\/(blanc\\/)?\\d+([/?]|$)/", "http*://live.bilibili.com/*"],
    ["*://", "/.*://live\\.bilibili\\.com\\/(blanc\\/)?\\d+([/?]|$)/", "*://live.bilibili.com/*"],
    ["网域含单字通配", "/.*://live\\.bilibili\\.(com|net)\\/(blanc\\/)?\\d+([/?]|$)/", "*://live.bilibili.???/*"],
    ["网域含 *.", "/https?://.*\\.bilibili\\.com\\/(blanc\\/)?\\d+([/?]|$)/", "http*://*.bilibili.com/*"],
    ["网域含可选字符", "/https?://www\\.bil?ibili\\.com\\/(blanc\\/)?\\d+([/?]|$)/", "http*://www.bi*ibili.com/*"],
    ["网域含大写分组", "/https?://www(AS).com/www#11?11/2.*/", "http*://wwwas?com/*"],
  ])("[A] 能抽出 scheme://网域 的正则（%s）只追加网域级 glob", (_label, regex, glob) => {
    const result = getApiMatchesAndGlobs(extractUrlPatterns([...BILIBILI_INCLUDES, `// @include         ${regex}`]));

    expect(result).toEqual({ matches: BILIBILI_MATCHES, includeGlobs: [glob], regexUnbounded: false });
  });

  it.concurrent("[A] 正则默认忽略大小写，抽出的网域 glob 统一转小写", () => {
    const result = getApiMatchesAndGlobs(
      extractUrlPatterns(["// @include /^https?:\\/\\/WWW\\.Example\\.COM\\/Path/"])
    );

    expect(result).toEqual({
      matches: [PLACEHOLDER_MATCH_PATTERN],
      includeGlobs: ["http*://www.example.com/*"],
      regexUnbounded: false,
    });
  });

  it.concurrent.each([
    ["没有 scheme 的局部正则", "/live\\.bilibili\\.com\\/(blanc\\/)?\\d+([/?]|$)/"],
    ["只有网域片段", "/live\\.bilibili\\.com/"],
    ["以 :// 开头", "/://www\\.bil?ibili\\.com\\/(blanc\\/)?\\d+([/?]|$)/"],
  ])("[B] 无法抽出网域的正则（%s）退回全站注册并标记 regexUnbounded", (_label, regex) => {
    const result = getApiMatchesAndGlobs(extractUrlPatterns([...BILIBILI_INCLUDES, `// @include         ${regex}`]));

    expect(result).toEqual({ matches: ["*://*/*"], includeGlobs: [], regexUnbounded: true });
  });

  it.concurrent("[C] 多条正则都能收窄时，@exclude 正则不进入 includeGlobs", () => {
    const result = getApiMatchesAndGlobs(
      extractUrlPatterns([
        "// @include         *://www.google.com/video/*",
        "// @include         *://www.bilibili.com/list/*",
        "// @include         *://www.bilibili.com/bangumi/play/*",
        "// @include         *://live.bilibili.com/medialist/play/watchlater",
        "// @include         /https?://www\\.google\\.com/search?q=\\w+&page=\\d+/",
        "// @exclude         /https?://www\\.google\\.com/search?q=\\w+&page=[123]/",
        "// @include         /http://www\\.bilibili\\.com/\\w+/",
        "// @include         /http://www\\.apple\\.com/abc/",
        "// @include         file:///myfile/*",
      ])
    );

    expect(result).toEqual({
      matches: [
        "*://www.google.com/video/*",
        "*://www.bilibili.com/list/*",
        "*://www.bilibili.com/bangumi/play/*",
        "*://live.bilibili.com/medialist/play/watchlater",
        "file:///myfile/*",
      ],
      includeGlobs: ["http*://www.google.com/*", "http://www.bilibili.com/*", "http://www.apple.com/*"],
      regexUnbounded: false,
    });
  });

  it.concurrent("[C] 退回全站注册时保留非 http 的 match pattern", () => {
    const result = getApiMatchesAndGlobs(
      extractUrlPatterns([
        "// @include         *://www.google.com/video/*",
        "// @include         /live\\.bilibili\\.com/",
        "// @include         file:///myfile/*",
      ])
    );

    expect(result).toEqual({ matches: ["*://*/*", "file:///myfile/*"], includeGlobs: [], regexUnbounded: true });
  });
});

describe.concurrent("getMatchPatternHost", () => {
  it.concurrent("应取出 match pattern 绑定的具体网域", () => {
    expect(getMatchPatternHost("*://www.example.com/*")).toBe("www.example.com");
    expect(getMatchPatternHost("https://www.example.com/path/*")).toBe("www.example.com");
    // 无 scheme 的 TM 兼容写法
    expect(getMatchPatternHost("www.example.com/*")).toBe("www.example.com");
  });

  it.concurrent("通配网域不绑定到任何具体网域", () => {
    // ".example.com" 覆盖全部子域，"" 覆盖全部网域，都不等于任何单一 host
    expect(getMatchPatternHost("*://*.example.com/*")).toBe(".example.com");
    expect(getMatchPatternHost("*://*/*")).toBe("");
  });

  it.concurrent("非 match pattern 应返回 null", () => {
    expect(getMatchPatternHost("/^https:\\/\\/example\\.com/")).toBeNull();
  });
});

describe.concurrent("embeddedPatternChecker", () => {
  // 构造 URLRuleEntry 的 ruleContent 格式与 extractUrlPatterns 一致
  // match: [scheme, host, pathPattern], glob: string[], regex: [pattern, flags]

  it.concurrent("match include 规则匹配", () => {
    const patterns = extractUrlPatterns(["@match https://example.com/*"]);
    const reduced = patterns.map(({ ruleType, ruleContent }) => ({ ruleType, ruleContent }));
    // 使用 embeddedPatternCheckerString 生成代码，通过 eval 执行
    const code = embeddedPatternCheckerString('"https://example.com/page"', JSON.stringify(reduced));
    expect(eval(code)).toBe(true);
  });

  it.concurrent("match include 规则不匹配", () => {
    const patterns = extractUrlPatterns(["@match https://example.com/*"]);
    const reduced = patterns.map(({ ruleType, ruleContent }) => ({ ruleType, ruleContent }));
    const code = embeddedPatternCheckerString('"https://other.com/page"', JSON.stringify(reduced));
    expect(eval(code)).toBe(false);
  });

  it.concurrent("match exclude 规则排除", () => {
    const patterns = extractUrlPatterns(["@match https://example.com/*", "@exclude https://example.com/admin/*"]);
    const reduced = patterns.map(({ ruleType, ruleContent }) => ({ ruleType, ruleContent }));
    // 匹配 include 但被 exclude 排除
    const code1 = embeddedPatternCheckerString('"https://example.com/admin/settings"', JSON.stringify(reduced));
    expect(eval(code1)).toBe(false);
    // 匹配 include 且不被 exclude 排除
    const code2 = embeddedPatternCheckerString('"https://example.com/home"', JSON.stringify(reduced));
    expect(eval(code2)).toBe(true);
  });

  it.concurrent("glob include 匹配", () => {
    const patterns = extractUrlPatterns(["@include *example*"]);
    const reduced = patterns.map(({ ruleType, ruleContent }) => ({ ruleType, ruleContent }));
    const code = embeddedPatternCheckerString('"https://example.com/page"', JSON.stringify(reduced));
    expect(eval(code)).toBe(true);
  });

  it.concurrent("glob include 不匹配", () => {
    const patterns = extractUrlPatterns(["@include *example*"]);
    const reduced = patterns.map(({ ruleType, ruleContent }) => ({ ruleType, ruleContent }));
    const code = embeddedPatternCheckerString('"https://other.com/page"', JSON.stringify(reduced));
    expect(eval(code)).toBe(false);
  });

  it.concurrent("glob exclude 排除", () => {
    const patterns = extractUrlPatterns(["@include *example*", "@exclude *admin*"]);
    const reduced = patterns.map(({ ruleType, ruleContent }) => ({ ruleType, ruleContent }));
    const code = embeddedPatternCheckerString('"https://example.com/admin"', JSON.stringify(reduced));
    expect(eval(code)).toBe(false);
  });

  it.concurrent("regex include 匹配", () => {
    const patterns = extractUrlPatterns(["@include /https?://example\\.com\\/.*/"]);
    const reduced = patterns.map(({ ruleType, ruleContent }) => ({ ruleType, ruleContent }));
    const code = embeddedPatternCheckerString('"https://example.com/page"', JSON.stringify(reduced));
    expect(eval(code)).toBe(true);
  });

  it.concurrent("regex include 不匹配", () => {
    const patterns = extractUrlPatterns(["@include /https?://example\\.com\\/.*/"]);
    const reduced = patterns.map(({ ruleType, ruleContent }) => ({ ruleType, ruleContent }));
    const code = embeddedPatternCheckerString('"https://other.com/page"', JSON.stringify(reduced));
    expect(eval(code)).toBe(false);
  });

  it.concurrent("regex exclude 排除", () => {
    const patterns = extractUrlPatterns(["@include /https?://example\\.com\\/.*/", "@exclude /\\/admin\\//"]);
    const reduced = patterns.map(({ ruleType, ruleContent }) => ({ ruleType, ruleContent }));
    const code = embeddedPatternCheckerString('"https://example.com/admin/settings"', JSON.stringify(reduced));
    expect(eval(code)).toBe(false);
  });

  it.concurrent("混合规则（include + exclude）", () => {
    const patterns = extractUrlPatterns(["@match https://example.com/*", "@include *test*", "@exclude /\\/secret\\//"]);
    const reduced = patterns.map(({ ruleType, ruleContent }) => ({ ruleType, ruleContent }));
    // match include 命中
    const code1 = embeddedPatternCheckerString('"https://example.com/home"', JSON.stringify(reduced));
    expect(eval(code1)).toBe(true);
    // glob include 命中
    const code2 = embeddedPatternCheckerString('"https://other.com/test"', JSON.stringify(reduced));
    expect(eval(code2)).toBe(true);
    // exclude 排除
    const code3 = embeddedPatternCheckerString('"https://example.com/secret/data"', JSON.stringify(reduced));
    expect(eval(code3)).toBe(false);
  });
});

describe.concurrent("@exclude-match", () => {
  const run = (lines: string[], url: string) => isUrlIncluded(url, extractUrlPatterns(lines));

  it.concurrent("一条或多条 @exclude-match 解析为 match pattern 排除规则", () => {
    const rules = extractUrlPatterns([
      "@match *://*.example.com/*",
      "@exclude-match https://example.com/admin/*",
      "@exclude-match *://cdn.example.com/*",
    ]);
    expect(rules.slice(1)).toEqual([
      {
        ruleType: RuleType.MATCH_EXCLUDE,
        ruleContent: ["https", "example.com", "admin/*"],
        ruleTag: "exclude-match",
        patternString: "https://example.com/admin/*",
      },
      {
        ruleType: RuleType.MATCH_EXCLUDE,
        ruleContent: ["*", "cdn.example.com", "*"],
        ruleTag: "exclude-match",
        patternString: "*://cdn.example.com/*",
      },
    ]);
  });

  it.concurrent("不命中 @exclude-match 的网址仍按 @match 执行", () => {
    expect(
      run(["@match *://*.example.com/*", "@exclude-match *://example.com/admin/*"], "https://example.com/home")
    ).toBe(true);
  });

  it.concurrent("同时命中 @match 与 @exclude-match 时不执行，与声明顺序无关", () => {
    const url = "https://example.com/admin/users";
    expect(run(["@match *://example.com/*", "@exclude-match *://example.com/admin/*"], url)).toBe(false);
    expect(run(["@exclude-match *://example.com/admin/*", "@match *://example.com/*"], url)).toBe(false);
  });

  it.concurrent("按 match pattern 的通配网域与 scheme 语义排除", () => {
    const lines = ["@match *://*/*", "@exclude-match *://*.example.com/*", "@exclude-match https://secure.test/*"];
    expect(run(lines, "https://example.com/")).toBe(false);
    expect(run(lines, "http://a.b.example.com/x")).toBe(false);
    expect(run(lines, "https://notexample.com/")).toBe(true);
    expect(run(lines, "https://secure.test/page")).toBe(false);
    expect(run(lines, "http://secure.test/page")).toBe(true);
  });

  it.concurrent("与 @match 相同的 TM 兼容写法：省略 scheme、端口、http*", () => {
    expect(extractUrlPatterns(["@exclude-match www.example.com/*"])[0].patternString).toBe("*://www.example.com/*");
    expect(extractUrlPatterns(["@exclude-match https://example.com:8080/*"])[0].patternString).toBe(
      "https://example.com/*"
    );
    expect(extractUrlPatterns(["@exclude-match http*://example.com/*"])[0].patternString).toBe("*://example.com/*");
  });

  it.concurrent("不合法的 match pattern 直接丢弃，不退化为 @exclude 的 glob/正则", () => {
    for (const value of ["/example\\.com/", "*example*", "https://exa*mple.com/*", "hello-world^^"]) {
      expect(extractUrlPatterns([`@exclude-match ${value}`]), value).toEqual([]);
    }
    // 同一取值写成 @exclude 仍按 glob 生效
    expect(extractUrlPatterns(["@exclude *example*"])[0].ruleType).toBe(RuleType.GLOB_EXCLUDE);
  });

  it.concurrent("嵌入式检查器（unwrap / early-start）同样排除，与声明顺序无关", () => {
    const check = (lines: string[], url: string) => {
      const reduced = extractUrlPatterns(lines).map(({ ruleType, ruleContent }) => ({ ruleType, ruleContent }));
      return eval(embeddedPatternCheckerString(JSON.stringify(url), JSON.stringify(reduced)));
    };
    const url = "https://example.com/admin/users";
    expect(check(["@include /example\\.com/", "@exclude-match *://example.com/admin/*"], url)).toBe(false);
    expect(check(["@exclude-match *://example.com/admin/*", "@include /example\\.com/"], url)).toBe(false);
    expect(check(["@include /example\\.com/", "@exclude-match *://example.com/admin/*"], "https://example.com/")).toBe(
      true
    );
  });
});
