import { describe, expect, it } from "vitest";
import { MAX_RULE_DOMAINS, RuleDomainError, normalizeRuleDomain, parseRuleDomains } from "./network_rule_condition";

describe("网络规则域名规范化", () => {
  it("输入完整网址时只保存规范化 hostname", () => {
    expect(normalizeRuleDomain(" https://Example.com:8443/a?q=1#x ")).toBe("example.com");
  });

  it("输入 IDN 时保存 punycode 并可由 requestDomains 使用", () => {
    expect(normalizeRuleDomain("https://例子.测试")).toBe("xn--fsqu00a.xn--0zwm56d");
  });

  it("输入星号和单标签 hostname 时给出明确错误", () => {
    expect(() => normalizeRuleDomain("*.example.com")).toThrowError(RuleDomainError);
    expect(() => normalizeRuleDomain("localhost")).toThrowError(RuleDomainError);
  });

  it("拒绝 credentials、路径和非 HTTP(S) 地址", () => {
    for (const value of ["https://user:pass@example.com/", "example.com/path", "chrome://settings"]) {
      expect(() => normalizeRuleDomain(value)).toThrowError(RuleDomainError);
    }
  });

  it("保留规范 IPv6 的方括号并移除根域点", () => {
    expect(normalizeRuleDomain("https://[2001:db8::1]/")).toBe("[2001:db8::1]");
    expect(normalizeRuleDomain("example.com.")).toBe("example.com");
  });

  it("同一规则的重复域名被去重并保留首次出现顺序", () => {
    expect(parseRuleDomains("Example.com, example.com\nhttps://docs.example.com/path")).toEqual({
      domains: ["example.com", "docs.example.com"],
      errors: [],
    });
  });

  it("域名条数超过单条规则上限时给出可展示的错误，而不是静默接受", () => {
    const tooMany = Array.from({ length: MAX_RULE_DOMAINS + 1 }, (_, index) => `d${index}.example.com`).join("\n");
    expect(parseRuleDomains(tooMany).errors).toEqual([
      { tokenIndex: MAX_RULE_DOMAINS, input: `d${MAX_RULE_DOMAINS}.example.com`, messageKey: "domain_count_invalid" },
    ]);
    const atLimit = Array.from({ length: MAX_RULE_DOMAINS }, (_, index) => `d${index}.example.com`).join("\n");
    expect(parseRuleDomains(atLimit).errors).toEqual([]);
  });

  it("规范化失败的 token 保留位置并提示输入根域名", () => {
    expect(parseRuleDomains("*.example.com, localhost").errors).toEqual([
      { tokenIndex: 0, input: "*.example.com", messageKey: "domain_wildcard" },
      { tokenIndex: 1, input: "localhost", messageKey: "domain_single_label" },
    ]);
  });
});
