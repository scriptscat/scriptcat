import { describe, it, expect } from "vitest";
import { regexToGlob } from "./regex_to_glob";

/**
 * 测试说明（Test Overview）
 * - 本套件聚焦 regex → glob 映射的行为验证，不改变任何原有断言或数据。
 * - 仅做结构分组与注释增强，帮助快速定位类别与边界情况。
 * - ok(re, glob): 期望转换成功且等于目标 glob
 * - bad(re):      期望转换失败（返回 null）
 */
describe("regexToGlob - comprehensive test suite (regrouped & commented)", () => {
  const ok = (re: string, glob: string) => {
    const got = regexToGlob(re);
    expect(got).not.toBeNull();
    expect(got).toBe(glob);
  };
  const bad = (re: string) => expect(regexToGlob(re)).toBeNull();

  // ────────────────────────────────────────────────────────────────────────────
  // 1) 基础字面量与锚点/边界 (Literals, Dots, Anchors, Boundaries)
  //    目的：确保 "."、^$、以及非消耗断言在 glob 中被正确弱化或移除
  //    Goal: Verify ".", ^$, and non-consuming assertions are weakened/removed
  // ────────────────────────────────────────────────────────────────────────────
  describe("1) Literals, dots, anchors, boundaries", () => {
    it("1.1 literal vs dot and anchors", () => {
      // 锚点在 glob 中无意义，点号转为单字符
      // Anchors drop out in glob; dot → single-char match
      ok("abc", "abc");
      ok("\\.", ".");
      ok("a\\.b", "a.b");
      ok("^abc$", "abc"); // anchors drop out
      ok("^a.b$", "a?b");
      ok("^test$", "test");
      ok("a.b.c", "a?b?c"); // from JSDoc examples
      ok(".*", "*"); // from JSDoc examples
    });

    it("1.2 word boundaries and non-consuming assertions", () => {
      // \b、lookaround 在 glob 中被移除，仅保留可见字符
      // \b and lookarounds are removed; keep visible text only
      ok("\\bword\\b", "word"); // \b removed
      ok("(?=abc)xyz", "xyz"); // lookahead drops
      ok("(?!foo)bar", "bar"); // negative lookahead drops
      ok("(?<=http)://", "://"); // lookbehind drops
      ok("(?<!x)y", "y"); // negative lookbehind drops
      ok(".*(?<!exam)ple.*", "*ple*");
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 2) 转义与保留字 (Escapes & Glob-reserved)
  //    目的：确定转义字符如何在 glob 中呈现，glob 保留符号何时退化为 '?'
  //    Goal: Ensure escapes render as literals; glob-reserved forced to '?'
  // ────────────────────────────────────────────────────────────────────────────
  describe("2) Escapes and glob-reserved literals", () => {
    it('2.1 escaped specials become literals, glob-reserved map to "?"', () => {
      // 纯 glob 无法安全表达字面 '?' '*'，降级为单字符 '?'
      // Literal '?' '*' cannot be safely expressed → degrade to '?'
      ok("\\?", "?"); // cannot render literal ? in pure glob
      ok("\\*", "?"); // cannot render literal * in pure glob
      ok("\\+", "+");
      ok("\\(", "(");
      ok("\\)", ")");
      ok("\\[", "[");
      ok("\\]", "]");
      ok("a\\?b\\*c", "a?b?c");
      ok("\\.", ".");
      ok("\\!", "!");
      ok("\\$", "$");
      ok("\\/", "/");
      ok("\\-", "-");
    });

    it("2.2 class-like escapes become single-char", () => {
      // 字符类逃逸统一近似为单字符匹配
      // Class-like escapes map to single-char
      ok("\\d", "?");
      ok("\\w", "?");
      ok("\\s", "?");
      ok("\\D", "?");
      ok("\\W", "?");
      ok("\\S", "?");
      ok("\\w?", "*");
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 3) 字符类 (Character Classes)
  //    目的：验证基本类/取反/范围/类内转义；以及不合法类的失败路径
  //    Goal: Validate basic/negated/ranges/escapes in class; invalid → null
  // ────────────────────────────────────────────────────────────────────────────
  describe("3) Character classes", () => {
    it("3.1 basic, negated, ranges, escapes inside", () => {
      // 字符类整体近似为单字符；是否取反对 glob 近似度影响不大
      // Classes collapse to single char; negation doesn't change glob shape
      ok("[a-z]", "?");
      ok("[^0-9]", "?");
      ok("[\\]]", "?"); // literal ] inside class
      ok("[a\\-z]", "?"); // escaped -
      ok("[abc]", "?");
      ok("[^abc]", "?");
      ok("[-!$+.?*]", "?");
      ok("[^-!$+.?*]", "?");
    });

    it("3.2 invalid classes return null", () => {
      // 不闭合或非法内容 → null
      // Unclosed/invalid → null
      bad("[]"); // no content before ]
      // no closing ]
      bad("[");
      bad("[^");
      bad("[$");
      bad("[+");
      bad("[*");
      bad("[?");
      bad("[|");
      // no closing )
      bad("(");
      bad("(^");
      bad("($");
      bad("(+");
      bad("(*");
      bad("(?");
      bad("(|");
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 4) 量词 (Quantifiers)
  //    目的：*, +, ?, {m}, {m,}, {m,n}（含惰性/占有）与格式错误时的降级
  //    Goal: *, +, ?, {m}, {m,}, {m,n} incl. lazy/possessive & malformed fallback
  // ────────────────────────────────────────────────────────────────────────────
  describe("4) Quantifiers: *, +, ?, {m}, {m,}, {m,n} (incl. lazy/possessive)", () => {
    it("4.1 Kleene and optional", () => {
      // Kleene 星/加/问号 → 在 glob 中折叠为 '*' 或 '?*'
      // Kleene quantifiers fold to '*' or '?*' in glob
      ok("a*", "*"); // base repeats → *
      ok("a+", "a*"); // base once then *
      ok("a?", "*"); // 0 or 1 → *
      ok(".+", "?*"); // at least one any → ?*
      ok("[a-z]*", "*");
      ok("[a-z]+", "?*");
      ok("\\w*", "*"); // from JSDoc examples
      ok("\\w+", "?*"); // from JSDoc examples
      ok("\\S+", "?*");
      ok("\\S?", "*");
    });

    it("4.2 braced exact counts", () => {
      // 精确次数 → 直接展开（近似为重复字面/单字符）
      // Exact counts → expand by repetition
      ok("a{3}", "aaa");
      ok("(ab){2}", "abab");
      ok("(abc){3}", "abcabcabc");
      ok("\\d{4}", "????");
      ok("\\d{3}-\\d{2}-\\d{4}", "???-??-????"); // from JSDoc examples
    });

    it("4.3 braced open upper bound", () => {
      // 下界有，上界无 → 固定下界 + '*' 近似
      // Lower bound with open upper → lower expansion + '*'
      ok("a{2,}", "aa*");
      ok("\\w{1,}", "?*");
      ok("(xy){5,}", "xyxyxyxyxy*");
      ok("p[^abc]{8,}q", "p????????*q");
      ok("user_\\d{2,}", "user_??*"); // from JSDoc examples
    });

    it("4.4 braced ranges", () => {
      // 有界范围 → 最小展开 + '*'（保留“至少最小值”的含义）
      // Bounded ranges → min expansion + '*'
      ok("a{1,3}", "a*"); // min once, may vary → *
      ok("\\d{2,4}", "??*");
      ok("(st){5,8}", "ststststst*");
      ok("p[^abc]{0,2}q", "p*q");
      ok("te(st){5,}", "teststststst*"); // from JSDoc examples
      ok("te(st){5,8}", "teststststst*"); // from JSDoc examples
    });

    it("4.5 lazy variants behave same in glob", () => {
      // 惰性量词在 glob 近似中与贪婪等价
      // Lazy behaves same as greedy for glob
      ok("-a*?", "-*");
      ok("-a+?", "-a*");
      ok("-a??", "-*");
      ok("a{2,}?", "aa*");
      ok("a{3}?", "aaa");
      ok("a{2,5}?", "aa*");
      ok("\\S+?", "?*");
      ok("\\S*?", "*");
      ok("\\S??", "*");
    });

    it("4.6 possessive variants behave same in glob", () => {
      // 占有量词对 glob 也无差别
      // Possessive behaves same for glob
      ok("-a*+", "-*");
      ok("-a++", "-a*");
      ok("-a?+", "-*");
      ok("a{2,}+", "aa*");
      ok("a{3}+", "aaa");
      ok("a{2,5}+", "aa*");
      ok("\\S++", "?*");
      ok("\\S*+", "*");
      ok("\\S?+", "*");
    });

    it("4.7 malformed brace quantifiers should fall back to unit (not null)", () => {
      // 花括号格式错误：不应报错，回退到原文本
      // Malformed braces: fallback to literal text (not null)
      ok("a{", "a{");
      ok("a{,", "a{,");
      ok("a,}", "a,}");
      ok("a{2,", "a{2,");
      ok("a{2,3", "a{2,3");
      ok("a{,3}", "a{,3}");
      ok("a{}", "a{}");
      ok("a{,}", "a{,}");
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 5) 分组与分支 (Groups & Alternations)
  //    目的：保证最小公共前后缀抽取、嵌套分组与 lookaround 混合情形
  //    Goal: Common prefix/suffix factoring, nested groups, lookarounds inside
  // ────────────────────────────────────────────────────────────────────────────
  describe("5) Groups and alternations", () => {
    it("5.1 non-capturing groups", () => {
      // 非捕获组：量词展开或合并为 '?'
      // Non-capturing groups: expand or collapse to '?'
      ok("(?:abc)+", "abc*");
      ok("(?:a|b)", "?");
    });

    it("5.2 alternations without common affixes", () => {
      // 无公共前后缀：长度不等时退化为 '?' 或带 '*'
      // No common affixes: degrade to '?' or add '*'
      ok("(abc|def)", "???");
      ok("(a|ab)", "a*"); // common head "a" and variable mid
      ok("(cat|car|cap)", "ca?"); // common head "ca" and fixed tail length 1
      ok("(a|b|c)", "?"); // from JSDoc examples
    });

    it("5.3 alternations with common prefix/suffix extraction", () => {
      // 有公共前/后缀：中间可变部分用 '?' 或 '*'
      // With shared affixes: middle variability as '?'/'*'
      ok("(fooXbar|fooYbar)", "foo?bar");
      ok("(preA|preBB)fix", "pre?*fix"); // mid varies in length
      ok("start(abc|a|abcd)end", "starta*end");
      ok("a(b|c)d", "a?d");
      ok("(ab|abc)", "ab*"); // min length 2 -> 'ab*'
      ok("file\\.(js|ts)", "file.?s");
      ok("file\\.(js|ts|tsx)", "file.??*");
      ok("file\\.(js|ts|tsx|\\w+)", "file.?*");
      ok("file\\.(js|ts|tsx|\\w*)", "file.*");
    });

    it("5.4 nested groups", () => {
      // 嵌套分组：内部分支归纳后整体近似
      // Nested groups: summarize inner alternations
      ok("a(b(c|de)f)g", "ab?*fg"); // inner alt summarized
      ok("(ab(cd|ef(gh|i)))", "ab??*"); // multiple nesting summarized
    });

    it("5.5 lookarounds mixed in groups", () => {
      // 组内混合前后查找：查找被移除
      // Lookarounds inside groups → dropped
      ok("(?:(?=x)ab|cd(?!y))", "??");
    });

    it("5.6 alternations mixed with counted pieces (additional)", () => {
      // 分支 + 次数：按下界展开 + 近似
      // Alternation + counts: expand at lower bound + approximate
      ok("p(uuid-\\d+|id-\\d+){0,2}q", "p*q");
      ok("p(uuid-\\d+|id-\\d+)q", "p????*q");
      ok("p(uuid-\\d+|id-\\d+){8,}q", "p????????????????????????????????*q"); // 32 ? then *
      ok("te(st|ac){5,}", "te??????????*");
      ok("te(st|ac){5,8}", "te??????????*");
      ok("te(st|ac|acx){5,}", "te??????????*");
      ok("te(st|ac|acx){5,8}", "te??????????*");
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 6) 归一化（* 与 ? 的折叠）(Canonicalization of consecutive * and ?)
  //    目的：确保 "*?*"、"?.*" 等组合被稳定折叠
  //    Goal: Ensure patterns like "*?*" collapse consistently
  // ────────────────────────────────────────────────────────────────────────────
  describe("6) Canonicalization of consecutive * and ?", () => {
    it('6.1 collapses "*?*" to "?*"', () => {
      // 组合次序变化不应影响最终规约
      // Different compositions should normalize equivalently
      ok(".*.+", "?*");
      ok("a.*.?b", "a*b");
      ok(".*.?+", "*");
      ok("a.*.+b", "a?*b");
      ok(".*.++", "?*");
      ok("\\\\*\\\\+", "*\\*");
      ok("a\\\\*\\\\?b", "a*b");
      ok("\\\\*\\\\?+", "*");
      ok("a\\\\*\\\\+b", "a*\\*b");
      ok("\\\\*\\\\++", "*\\*");
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 7) HTTP/URL 模式 (HTTP/URL patterns)
  //    目的：覆盖协议可选、域名转义、路径/查询参数的近似映射
  //    Goal: Cover protocol optionality, domain escapes, path/query approximations
  // ────────────────────────────────────────────────────────────────────────────
  describe("7) HTTP/URL patterns beyond examples", () => {
    it("7.1 mixed optional and escaped segments", () => {
      // http(s) 可选，点与斜杠的转义，组内分支对主机/路径的影响
      // Optional http(s), escaped dots/slashes, alternations on host/path
      ok("^(http|https):\\/\\/www\\.google\\.com", "http*://www.google.com");
      ok("^(http|https?):\\/\\/www\\.google\\.com", "http*://www.google.com");
      ok("https?:\\/\\/example\\.com\\/p(?:ath)?\\/\\w+\\.js", "http*://example.com/p*/?*.js".replace("p*", "p*"));
      ok("^https?:\\/\\/(foo|bar)\\.site\\/(v\\d+|latest)$", "http*://???.site/??*");
    });

    it("7.2 longer URLs with escapes (additional)", () => {
      // 更复杂的转义与查询参数：保留字母数字范围近似为 '?*'
      // Heavier escaping & queries: alnum ranges approximate to '?*'
      ok("https?://www.google.com/search\\?q=\\w+&page=\\d+", "http*://www?google?com/search?q=?*&page=?*");
      ok("https?://www.google.com/search?q=\\w+&page=\\d+", "http*://www?google?com/searc*q=?*&page=?*");
      ok(
        "https?://www.go\\$og\\@l\\!e\\.co\\#m/sea\\*r\\(c\\)h?q=\\w+&page=\\d+",
        "http*://www?go$og@l!e.co#m/sea?r(c)*q=?*&page=?*"
      );
      ok("https?://live\\.bilibili\\.com/", "http*://live.bilibili.com/");
      ok("https?:\\/\\/live\\.bilibili\\.com\\/", "http*://live.bilibili.com/");
      ok("https?://live.bilibili.com/", "http*://live?bilibili?com/");
      ok("https?:\\/\\/live\\.bilibili\\.com\\/(blanc\\/)?\\d+([/?]|$)", "http*://live.bilibili.com/?*");
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 8) 边界与奇异情况 (Edge & Odd Cases)
  //    目的：空字符串、未配对括号、回退字面量、转义末尾、复杂序列等
  //    Goal: Empty input, unbalanced parens, literal fallbacks, trailing escape
  // ────────────────────────────────────────────────────────────────────────────
  describe("8) Edge/odd cases", () => {
    it("8.1 empty string and standalone operators", () => {
      // 空串应映射为空；孤立括号/方括号应失败
      // Empty string maps to empty; lone brackets/parens fail
      ok("", "");
      bad("(");
      bad(")");
      bad("[");
      bad("]");
    });

    it("8.2 unbalanced parentheses", () => {
      // 括号/方括号未闭合 → null
      // Unbalanced → null
      bad("(abc");
      bad("abc)");
      bad("[abc");
      bad("abc]");
    });

    it("8.3 misc OK fallbacks and empty-alt", () => {
      // 某些非正则字面量保持原样；空分支 (|) 折叠为空串
      // Some literals pass through; empty alternation collapses
      ok("{", "{");
      ok("}", "}");
      ok("(|)", "");
      ok("ab(|)cd", "abcd");
    });

    it("8.4 escaped end-of-input is invalid", () => {
      // 末尾孤立反斜杠非法
      // Trailing backslash is invalid
      bad("\\");
    });

    it("8.5 dot + class + escapes sequence analysis", () => {
      // 混合序列应逐段近似：. → ?；类 → ?；\d+ → ?*
      // Mixed sequence approximates by parts: . → ?; class → ?; \d+ → ?*
      ok(".[a-z]\\d+", "???*"); // . -> ?, [a-z] -> ?, \d+ -> ?*
      ok(".\\d\\w", "???"); // . -> ?, \d -> ?, \w -> ?
      ok(".\\d+_\\w*", "??*_*"); // . -> ?, \d+ -> ?*, "_" literal, \w* -> *
      ok("[A-F]\\s?\\.\\w+", "?*.?*"); // class -> ?, \s? -> *, "." literal, \w+ -> ?*
      ok("\\.\\d{2}[A-Z]", ".???"); // "." literal, \d{2} -> "??", [A-Z] -> "?"
    });

    it("8.6 complex structures -> approximate (additional)", () => {
      // 高复杂度结构：保守放宽为大量 '?'+ '*' 以覆盖长度变化
      // Highly complex: conservative expansion using lots of '?' + '*'
      ok("p(abc-\\w+-x|(uuid-\\d+|id-\\d+)-y){8,}q", "p????????????????????????????????????????????????*q");
      ok("x((ab|cd|ef)\\d){4,}y", "x????????????*y"); // unit ~ 3 chars, 4× -> 12 '?' then '*'
      ok("p((uuid-\\d{8})|(id-\\d{4}-[a-z]{2})){3,5}q", "p??????????????????????????????*q"); // min unit ~ 10 chars, 3× -> 30 '?' then '*'
      ok("start((ab|a\\d|abc)z){6,}end", "start??????????????????*end"); // min unit 3 chars, 6× -> 18 '?' then '*'
    });

    it("8.7 simple structures -> exact-ish (additional)", () => {
      // 可提取明显前缀的情况给出“近似精确”的 glob
      // Extractable prefixes yield "exact-ish" globs
      ok("\\b(?:public|private|protected)\\s+(?!void|string|int|bool)(\\w+)\\s+", "p????????*");
      ok("(foo|foobar)\\.js", "foo*.js"); // (foo|foobar) -> "foo*"
      ok("^foo(bar|baz)qux$", "fooba?qux"); // common "fooba" + one-varying char
      ok("(ab|ac)def", "a?def"); // factor 'a' + '?' + 'def'
      ok("(cat|car|cap)\\.txt", "ca?.txt"); // prior pattern with fixed suffix
      ok("v(?:\\d{2}|latest)", "v??*"); // min 2 digits, or 'latest' -> '??*'
    });

    it("8.8 invalid regex from additional remain null", () => {
      // 继续确保无效正则 → null
      // Still invalid → null
      // 注：呼叫regexToGlob前，已经用 new RegExp 生成，所以不会出现非法RegEx字串
      bad("(ab");
      bad("test\\");
      bad("([a-z]"); // unbalanced () and []
      // bad("(?P<name>\\w+)"); // unsupported named group (PCRE-style)
      // bad("(?'name'\\w+)"); // unsupported named group (alternate syntax)
      // bad("(?|a|b)"); // branch reset group (PCRE), unsupported
      // bad("a**"); // consecutive quantifiers invalid
      // bad("*"); // bare quantifier invalid
    });
  });
});
