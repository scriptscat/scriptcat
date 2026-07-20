import { describe, expect, it } from "vitest";
import { CspDomainError, normalizeCspDomain, parseCspDomains } from "./csp_domain";

describe("CSP 域名规范化", () => {
  it("输入完整网址时只保存规范化 hostname", () => {
    expect(normalizeCspDomain(" https://Example.com:8443/a?q=1#x ")).toBe("example.com");
  });

  it("输入 IDN 时保存 punycode 并可由 requestDomains 使用", () => {
    expect(normalizeCspDomain("https://例子.测试")).toBe("xn--fsqu00a.xn--0zwm56d");
  });

  it("输入星号和单标签 hostname 时给出明确错误", () => {
    expect(() => normalizeCspDomain("*.example.com")).toThrowError(CspDomainError);
    expect(() => normalizeCspDomain("localhost")).toThrowError(CspDomainError);
  });

  it("拒绝 credentials、路径和非 HTTP(S) 地址", () => {
    for (const value of ["https://user:pass@example.com/", "example.com/path", "chrome://settings"]) {
      expect(() => normalizeCspDomain(value)).toThrowError(CspDomainError);
    }
  });

  it("保留规范 IPv6 的方括号并移除根域点", () => {
    expect(normalizeCspDomain("https://[2001:db8::1]/")).toBe("[2001:db8::1]");
    expect(normalizeCspDomain("example.com.")).toBe("example.com");
  });

  it("同一规则的重复域名被去重并保留首次出现顺序", () => {
    expect(parseCspDomains("Example.com, example.com\nhttps://docs.example.com/path")).toEqual({
      domains: ["example.com", "docs.example.com"],
      errors: [],
    });
  });

  it("规范化失败的 token 保留位置并提示输入根域名", () => {
    expect(parseCspDomains("*.example.com, localhost").errors).toEqual([
      { tokenIndex: 0, input: "*.example.com", messageKey: "domain_wildcard" },
      { tokenIndex: 1, input: "localhost", messageKey: "domain_single_label" },
    ]);
  });
});
