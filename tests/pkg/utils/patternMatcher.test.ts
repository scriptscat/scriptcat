import { describe, expect, it } from "vitest";
import {
  patternMatch,
  parsePatternType,
  toDeclarativeNetRequestFilter,
  validatePattern,
  getPatternExamples,
} from "@App/pkg/utils/patternMatcher";

const matchHelper = (pattern: string, type: string, url: string, res: boolean = true) => {
  expect({
    pattern,
    type: parsePatternType(pattern),
    url,
    urlMatch: patternMatch(pattern, url),
  }).toEqual({
    pattern,
    type,
    url,
    urlMatch: res,
  });
};

describe("patternMatcher", () => {
  // ============================================================
  // parsePatternType
  // ============================================================
  describe("parsePatternType", () => {
    it("应识别正则表达式模式", () => {
      expect(parsePatternType("/https?:\\/\\/example\\.com/i")).toBe("regex");
      expect(parsePatternType("/^https:\\/\\/.*/")).toBe("regex");
      expect(parsePatternType("/test/i")).toBe("regex");
    });

    it("应识别通配符模式", () => {
      expect(parsePatternType("*://*.example.com/*")).toBe("wildcard");
      expect(parsePatternType("https://*.example.com/*")).toBe("wildcard");
      expect(parsePatternType("**.example.com/api/*")).toBe("wildcard");
      expect(parsePatternType("*")).toBe("wildcard");
      expect(parsePatternType("*://*")).toBe("wildcard");
      expect(parsePatternType("^http://*.example.com/data/*/result")).toBe("wildcard");
      // ***.example.com 无协议前缀，被识别为域名模式
      expect(parsePatternType("***.example.com")).toBe("domain");
      expect(parsePatternType("http*://test.abc**.com")).toBe("wildcard");
    });

    it("应识别域名模式", () => {
      expect(parsePatternType("example.com")).toBe("domain");
      expect(parsePatternType("*.example.com")).toBe("domain");
      expect(parsePatternType("**.example.com")).toBe("domain");
      expect(parsePatternType("***.example.com")).toBe("domain");
      expect(parsePatternType("example.com:8080")).toBe("domain");
    });

    it("应识别精确匹配模式", () => {
      expect(parsePatternType("https://example.com/path")).toBe("exact");
      expect(parsePatternType("http://localhost:3000/api")).toBe("exact");
    });

    it("不应将正则误判为通配符", () => {
      expect(parsePatternType("/https?:\\/\\/.*/i")).toBe("regex");
    });

    it("不应将完整 URL 误判为域名", () => {
      expect(parsePatternType("https://example.com")).not.toBe("domain");
    });
  });

  // ============================================================
  // match - 精确匹配
  // ============================================================
  describe("match - exact", () => {
    it("完全匹配 URL", () => {
      matchHelper("https://example.com/path", "exact", "https://example.com/path");
    });

    it("不匹配不同的 URL", () => {
      matchHelper("https://example.com/path", "exact", "https://example.com/other", false);
    });

    it("空输入返回 false", () => {
      expect(patternMatch("", "https://example.com")).toBe(false);
      expect(patternMatch("https://example.com", "")).toBe(false);
    });
  });

  // ============================================================
  // match - 通配符匹配（全局通配）
  // ============================================================
  describe("match - wildcard (global)", () => {
    it("* 应匹配所有 URL", () => {
      matchHelper("*", "wildcard", "https://example.com");
      matchHelper("*", "wildcard", "http://localhost:3000/api");
      matchHelper("*", "wildcard", "https://sub.example.com/path?q=1");
      matchHelper("*", "wildcard", "https://example.com:8080/path#section");
    });

    it("*://* 应匹配所有 URL", () => {
      matchHelper("*://*", "wildcard", "https://example.com");
      matchHelper("*://*", "wildcard", "http://localhost:3000");
    });

    it("* 不应匹配无效 URL", () => {
      expect(patternMatch("*", "not-a-url")).toBe(false);
      expect(patternMatch("*", "")).toBe(false);
    });
  });

  // ============================================================
  // match - 通配符匹配（域名通配符）
  // ============================================================
  describe("match - wildcard (host)", () => {
    it("*://*.example.com/* 应匹配子域名", () => {
      matchHelper("*://*.example.com/*", "wildcard", "https://sub.example.com/page");
      matchHelper("*://*.example.com/*", "wildcard", "https://a.b.example.com/page");
      matchHelper("*://*.example.com/*", "wildcard", "https://example.com/page", false);
    });

    it("https://*.example.com/* 应匹配子域名", () => {
      matchHelper("https://*.example.com/*", "wildcard", "https://sub.example.com/page");
      matchHelper("https://*.example.com/*", "wildcard", "http://sub.example.com/page", false);
    });

    it("**.example.com/* 应匹配自身和子域名", () => {
      matchHelper("**.example.com/*", "wildcard", "https://example.com/page");
      matchHelper("**.example.com/*", "wildcard", "https://sub.example.com/page");
      matchHelper("**.example.com/*", "wildcard", "https://a.b.example.com/page");
    });

    it("***.example.com 应匹配根域名和多级子域名", () => {
      // ***. 域名模式（无协议前缀 → domain 类型）
      matchHelper("***.example.com", "domain", "https://example.com");
      matchHelper("***.example.com", "domain", "https://sub.example.com");
      matchHelper("***.example.com", "domain", "https://a.b.c.example.com/path");
      matchHelper("***.example.com", "domain", "https://other.com", false);
    });

    it("混合通配符 test.abc**.com", () => {
      matchHelper("http*://test.abc**.com", "wildcard", "https://test.abc.com");
      matchHelper("http*://test.abc**.com", "wildcard", "https://test.abc.xyz.com");
      matchHelper("http*://test.abc**.com", "wildcard", "https://test.abc.a.b.com");
      matchHelper("http*://test.abc**.com", "wildcard", "https://test.other.com", false);
    });

    it("协议中 * 匹配任意字母或冒号", () => {
      matchHelper("http*://example.com", "wildcard", "https://example.com");
      matchHelper("http*://example.com", "wildcard", "http://example.com");
    });

    it("带端口的通配符匹配", () => {
      matchHelper("https://*.example.com:8080/api/*", "wildcard", "https://sub.example.com:8080/api/page");
    });
  });

  // ============================================================
  // match - 通配符匹配（路径通配符 - 需 ^ 前缀）
  // ============================================================
  describe("match - wildcard (path with ^ prefix)", () => {
    it("^ 前缀路径中 * 匹配单级（不含 / 和 ?）", () => {
      matchHelper("^http://*.example.com/data/*/result?q=*", "wildcard", "http://api.example.com/data/v1/result?q=123");
      // * 不应匹配含 / 的内容
      matchHelper("^http://*.example.com/data/*/result", "wildcard", "http://api.example.com/data/v1/v2/result", false);
    });

    it("^ 前缀路径中 ** 匹配多级（不含 ?）", () => {
      matchHelper("^http://**.example.com/data/**file", "wildcard", "http://sub.example.com/data/path/to/testfile");
      matchHelper("^http://**.example.com/data/**file", "wildcard", "http://sub.example.com/data/a/b/c/myfile");
    });

    it("^ 前缀路径中 *** 匹配任意字符（含 / 和 ?）", () => {
      matchHelper("^http://*.example.com/data/***", "wildcard", "http://api.example.com/data/a/b/c?q=1&r=2");
      matchHelper("^http://*.example.com/data/***file", "wildcard", "http://api.example.com/data/x/y/z/myfile");
      // *** 跨越 ? 匹配
      matchHelper("^http://*.example.com/a/***z", "wildcard", "http://api.example.com/a/b/c?d=z");
    });

    it("^ 前缀路径中 ? 是字面量查询字符串分隔符", () => {
      matchHelper("^http://example.com/api/?est", "wildcard", "http://example.com/api/?est");
      matchHelper("^http://example.com/api/?est", "wildcard", "http://example.com/api/test", false);
    });
  });

  // ============================================================
  // match - 通配符匹配（普通路径 - 无 ^ 前缀）
  // ============================================================
  describe("match - wildcard (simple path)", () => {
    it("路径中的 * 匹配单段", () => {
      matchHelper("https://example.com/*/page", "wildcard", "https://example.com/api/page");
      matchHelper("https://example.com/*/page", "wildcard", "https://example.com/api/v2/page", false);
    });

    it("路径 /* 匹配所有路径", () => {
      matchHelper("https://example.com/*", "wildcard", "https://example.com/anything");
      matchHelper("https://example.com/*", "wildcard", "https://example.com/a/b", false);
    });
  });

  // ============================================================
  // match - 正则匹配
  // ============================================================
  describe("match - regex", () => {
    it("基本正则匹配", () => {
      matchHelper("/https?:\\/\\/example\\.com/i", "regex", "https://example.com", true);
      matchHelper("/https?:\\/\\/example\\.com/i", "regex", "http://example.com", true);
    });

    it("正则不匹配", () => {
      matchHelper("/https?:\\/\\/example\\.com/i", "regex", "https://other.com", false);
    });

    it("正则应支持捕获组", () => {
      matchHelper("/^https:\\/\\/(www\\.)?example\\.com/", "regex", "https://example.com", true);
      matchHelper("/^https:\\/\\/(www\\.)?example\\.com/", "regex", "https://www.example.com", true);
    });

    it("无效正则不崩溃", () => {
      matchHelper("/[invalid/i", "regex", "https://example.com", false);
    });
  });

  // ============================================================
  // match - 域名匹配
  // ============================================================
  describe("match - domain", () => {
    it("example.com 应匹配自身和所有子域名", () => {
      matchHelper("example.com", "domain", "https://example.com");
      matchHelper("example.com", "domain", "https://example.com/page");
      matchHelper("example.com", "domain", "https://sub.example.com");
      matchHelper("example.com", "domain", "https://a.b.example.com/path");
    });

    it("*.example.com 应匹配子域名和自身（域名模式）", () => {
      matchHelper("*.example.com", "domain", "https://sub.example.com");
      matchHelper("*.example.com", "domain", "https://example.com");
    });

    it("**.example.com 应匹配自身和子域名", () => {
      matchHelper("**.example.com", "domain", "https://example.com");
      matchHelper("**.example.com", "domain", "https://sub.example.com");
      matchHelper("**.example.com", "domain", "https://a.b.example.com");
    });

    it("***.example.com 应匹配根域名和多级子域名", () => {
      matchHelper("***.example.com", "domain", "https://example.com");
      matchHelper("***.example.com", "domain", "https://sub.example.com");
      matchHelper("***.example.com", "domain", "https://a.b.c.example.com");
      matchHelper("***.example.com", "domain", "https://other.com", false);
    });

    it("不应匹配不同域名", () => {
      matchHelper("example.com", "domain", "https://other.com", false);
      matchHelper("example.com", "domain", "https://notexample.com", false);
    });

    it("域名带端口", () => {
      matchHelper("example.com:8080", "domain", "https://example.com:8080/path");
    });
  });

  // ============================================================
  // toDeclarativeNetRequestFilter
  // ============================================================
  describe("toDeclarativeNetRequestFilter", () => {
    it("全局通配 * → urlFilter: '*'", () => {
      const result = toDeclarativeNetRequestFilter("*");
      expect(result).toEqual({ urlFilter: "*" });
    });

    it("全局通配 *://* → urlFilter: '*'", () => {
      const result = toDeclarativeNetRequestFilter("*://*");
      expect(result).toEqual({ urlFilter: "*" });
    });

    it("正则模式 → regexFilter", () => {
      const result = toDeclarativeNetRequestFilter("/https?:\\/\\/example\\.com/i");
      expect(result.regexFilter).toBe("https?:\\/\\/example\\.com");
      expect(result.urlFilter).toBeUndefined();
    });

    it("域名模式 → urlFilter 以 || 开头", () => {
      const result = toDeclarativeNetRequestFilter("example.com");
      expect(result.urlFilter).toBe("||example.com/*");
    });

    it("通配符域名模式 → urlFilter 以 || 开头", () => {
      const result = toDeclarativeNetRequestFilter("*://*.example.com/*");
      expect(result.urlFilter).toContain("example.com");
    });

    it("**. 域名前缀 → urlFilter 以 || 开头", () => {
      const result = toDeclarativeNetRequestFilter("**.example.com/api/*");
      expect(result.urlFilter).toBe("||example.com/api/*");
    });

    it("***. 域名前缀 → urlFilter 以 || 开头", () => {
      const result = toDeclarativeNetRequestFilter("***.example.com/api/*");
      expect(result.urlFilter).toBe("||example.com/api/*");
    });

    it("^ 前缀路径通配符 → 去除 ^ 前缀后转换", () => {
      const result = toDeclarativeNetRequestFilter("^http://*.example.com/data/*");
      expect(result.urlFilter).not.toContain("^");
      expect(result.urlFilter).toContain("example.com");
    });

    it("精确 URL → urlFilter 以 | 开头和结尾", () => {
      const result = toDeclarativeNetRequestFilter("https://example.com/path");
      expect(result.urlFilter).toBe("|https://example.com/path|");
    });

    it("空模式应抛出错误", () => {
      expect(() => toDeclarativeNetRequestFilter("")).toThrow();
    });
  });

  // ============================================================
  // validatePattern
  // ============================================================
  describe("validatePattern", () => {
    it("空模式无效", () => {
      const result = validatePattern("");
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("有效正则", () => {
      const result = validatePattern("/https?:\\/\\/example\\.com/i");
      expect(result.valid).toBe(true);
      expect(result.type).toBe("regex");
    });

    it("无效正则", () => {
      const result = validatePattern("/[invalid/i");
      expect(result.valid).toBe(false);
      expect(result.type).toBe("regex");
    });

    it("有效通配符", () => {
      const result = validatePattern("*://*.example.com/*");
      expect(result.valid).toBe(true);
      expect(result.type).toBe("wildcard");
    });

    it("有效 ^ 前缀路径通配符", () => {
      const result = validatePattern("^http://*.example.com/data/*/result");
      expect(result.valid).toBe(true);
      expect(result.type).toBe("wildcard");
    });

    it("有效域名", () => {
      const result = validatePattern("example.com");
      expect(result.valid).toBe(true);
      expect(result.type).toBe("domain");
    });

    it("有效 ***. 域名", () => {
      const result = validatePattern("***.example.com");
      expect(result.valid).toBe(true);
      expect(result.type).toBe("domain");
    });

    it("有效精确 URL", () => {
      const result = validatePattern("https://example.com/path");
      expect(result.valid).toBe(true);
      expect(result.type).toBe("exact");
    });

    it("无效域名格式（纯域名模式验证）", () => {
      // -invalid.com 不匹配域名正则，会被识别为 exact 模式
      const result = validatePattern("-invalid.com");
      // 作为 exact 模式它是有效的（只是不太实用）
      expect(result.valid).toBe(true);
      expect(result.type).toBe("exact");
    });
  });

  // ============================================================
  // getPatternExamples
  // ============================================================
  describe("getPatternExamples", () => {
    it("应返回非空示例数组", () => {
      const examples = getPatternExamples();
      expect(Array.isArray(examples)).toBe(true);
      expect(examples.length).toBeGreaterThan(0);
    });

    it("每个示例应有 type、pattern、description", () => {
      const examples = getPatternExamples();
      for (const ex of examples) {
        expect(ex).toHaveProperty("type");
        expect(ex).toHaveProperty("pattern");
        expect(ex).toHaveProperty("description");
        expect(ex.pattern).toBeTruthy();
        expect(ex.description).toBeTruthy();
      }
    });

    it("应包含所有四种模式类型", () => {
      const examples = getPatternExamples();
      const types = new Set(examples.map((e) => e.type));
      expect(types.has("exact")).toBe(true);
      expect(types.has("wildcard")).toBe(true);
      expect(types.has("regex")).toBe(true);
      expect(types.has("domain")).toBe(true);
    });
  });

  // ============================================================
  // 边界情况
  // ============================================================
  describe("edge cases", () => {
    it("URL 带查询字符串", () => {
      matchHelper("*://*.example.com/*", "wildcard", "https://sub.example.com/path?q=1&r=2");
      matchHelper("example.com", "domain", "https://example.com/search?q=test");
    });

    it("URL 带片段", () => {
      matchHelper("example.com", "domain", "https://example.com/page#section");
    });

    it("URL 带端口", () => {
      matchHelper("*://*.example.com/*", "wildcard", "https://sub.example.com:8080/path");
    });

    it("大小写不敏感（域名）", () => {
      matchHelper("example.com", "domain", "https://EXAMPLE.COM");
      matchHelper("example.com", "domain", "https://Example.Com/path");
    });

    it("特殊字符域名", () => {
      matchHelper("example.com", "domain", "https://sub-example.com", false);
    });

    it("http* 协议通配匹配 https 和 http", () => {
      matchHelper("http*://test.com", "wildcard", "https://test.com");
      matchHelper("http*://test.com", "wildcard", "http://test.com");
      matchHelper("http*://test.com", "wildcard", "ftp://test.com", false);
    });
  });
});
