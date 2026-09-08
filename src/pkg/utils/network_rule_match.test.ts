import { describe, expect, it } from "vitest";
import { cspRemovalAction, type NetworkRule, type NetworkRuleAction } from "@App/app/repo/network_rule";
import type { NetworkRuleCondition } from "@App/app/repo/network_rule";
import { matchRuleUrl, simulateNetworkRules } from "./network_rule_match";

function rule(id: string, condition: NetworkRuleCondition, action: NetworkRuleAction, enabled = true): NetworkRule {
  return { id, name: id, enabled, condition, action, createdAt: 1, updatedAt: 1 };
}

// 场景固定为主框架请求，条件都显式列出 resourceTypes；缺省语义单独由一条用例覆盖。
const allSites: NetworkRuleCondition = { urlFilter: "*", resourceTypes: ["main_frame"] };
const github: NetworkRuleCondition = { requestDomains: ["github.com"], resourceTypes: ["main_frame"] };

function hits(simulation: ReturnType<typeof simulateNetworkRules>) {
  return simulation.hits.map((hit) => [hit.position, hit.rule.id, hit.status, hit.causedBy]);
}

describe("simulateNetworkRules", () => {
  it("命中规则按列表顺序返回，位次取自完整列表", () => {
    const rules = [
      rule("a", { requestDomains: ["example.com"], resourceTypes: ["main_frame"] }, { type: "block" }),
      rule("b", github, cspRemovalAction()),
      rule("c", allSites, { type: "modifyResponseHeaders", headers: [{ header: "x-a", operation: "remove" }] }),
    ];
    const result = simulateNetworkRules(rules, { url: "https://github.com/a", resourceType: "main_frame" });
    expect(hits(result)).toEqual([
      [2, "b", "applied", undefined],
      [3, "c", "applied", undefined],
    ]);
    expect(result.outcome).toBe("modified");
  });

  it("命中的 block 短路整个请求，顺序更靠前的改头规则也不执行", () => {
    const rules = [
      rule("csp", github, cspRemovalAction()),
      rule("other", { requestDomains: ["example.com"], resourceTypes: ["main_frame"] }, { type: "block" }),
      rule("block", allSites, { type: "block" }),
    ];
    const result = simulateNetworkRules(rules, { url: "https://github.com/a", resourceType: "main_frame" });
    expect(result.outcome).toBe("blocked");
    expect(hits(result)).toEqual([
      [1, "csp", "blocked", 3],
      [3, "block", "applied", undefined],
    ]);
  });

  it("顺序更靠前的 allow 压过靠后的 block，请求放行", () => {
    const rules = [rule("allow", github, { type: "allow" }), rule("block", allSites, { type: "block" })];
    const result = simulateNetworkRules(rules, { url: "https://github.com/a", resourceType: "main_frame" });
    expect(result.outcome).toBe("allowed");
    expect(hits(result)).toEqual([
      [1, "allow", "applied", undefined],
      [2, "block", "overridden", 1],
    ]);
  });

  it("靠前的 allow 让顺序更靠后的改头规则不执行，靠前的仍然执行", () => {
    const headers = {
      type: "modifyResponseHeaders" as const,
      headers: [{ header: "x-a", operation: "remove" as const }],
    };
    const rules = [
      rule("before", allSites, headers),
      rule("allow", github, { type: "allow" }),
      rule("after", allSites, headers),
    ];
    const result = simulateNetworkRules(rules, { url: "https://github.com/a", resourceType: "main_frame" });
    expect(result.outcome).toBe("allowed");
    expect(hits(result)).toEqual([
      [1, "before", "applied", undefined],
      [2, "allow", "applied", undefined],
      [3, "after", "allowed", 2],
    ]);
  });

  it("多条 modifyHeaders 规则按列表顺序全部叠加", () => {
    const rules = [
      rule("ua", allSites, {
        type: "modifyRequestHeaders",
        headers: [{ header: "user-agent", operation: "set", value: "x" }],
      }),
      rule("csp", allSites, cspRemovalAction()),
    ];
    const result = simulateNetworkRules(rules, { url: "https://github.com/a", resourceType: "main_frame" });
    expect(result.outcome).toBe("modified");
    expect(hits(result).every(([, , status]) => status === "applied")).toBe(true);
  });

  it("redirect 命中时给出目标地址", () => {
    const rules = [rule("r", github, { type: "redirect", url: "https://example.com/" })];
    const result = simulateNetworkRules(rules, { url: "https://github.com/a", resourceType: "main_frame" });
    expect(result.outcome).toBe("redirected");
    expect(result.redirectUrl).toBe("https://example.com/");
  });

  it("请求被 redirect 之后，顺序更靠后的改头规则同样不执行", () => {
    const headers = {
      type: "modifyResponseHeaders" as const,
      headers: [{ header: "x-a", operation: "remove" as const }],
    };
    const rules = [
      rule("before", allSites, headers),
      rule("redirect", github, { type: "redirect", url: "https://example.com/" }),
      rule("after", allSites, headers),
    ];
    const result = simulateNetworkRules(rules, { url: "https://github.com/a", resourceType: "main_frame" });
    expect(result.outcome).toBe("redirected");
    expect(hits(result)).toEqual([
      [1, "before", "applied", undefined],
      [2, "redirect", "applied", undefined],
      [3, "after", "overridden", 2],
    ]);
  });

  // 编译器（network_rule_compiler.ts）在未显式指定时会把受控集合列全，含 main_frame，
  // 模拟必须跟着编译结果走，而不是跟着 DNR 自身「默认排除主文档」的语义走。
  it("未指定 resourceTypes 的规则与编译结果一致，主文档同样命中", () => {
    const rules = [rule("b", { requestDomains: ["github.com"] }, { type: "block" })];
    expect(simulateNetworkRules(rules, { url: "https://github.com/a", resourceType: "main_frame" }).hits).toHaveLength(
      1
    );
    expect(simulateNetworkRules(rules, { url: "https://github.com/a", resourceType: "script" }).hits).toHaveLength(1);
  });

  it("指定了 resourceTypes 时只匹配列出的类型", () => {
    const rules = [rule("b", { ...github, resourceTypes: ["main_frame", "sub_frame"] }, { type: "block" })];
    expect(simulateNetworkRules(rules, { url: "https://github.com/a", resourceType: "main_frame" }).hits).toHaveLength(
      1
    );
    expect(simulateNetworkRules(rules, { url: "https://github.com/a", resourceType: "image" }).hits).toHaveLength(0);
  });

  it("停用的规则不参与模拟", () => {
    const rules = [rule("b", allSites, { type: "block" }, false)];
    const result = simulateNetworkRules(rules, { url: "https://github.com/a", resourceType: "main_frame" });
    expect(result.outcome).toBe("none");
    expect(result.hits).toHaveLength(0);
  });

  it("无法解析为 http(s) 的地址标记为无效", () => {
    const rules = [rule("b", allSites, { type: "block" })];
    expect(simulateNetworkRules(rules, { url: "not a url", resourceType: "main_frame" }).valid).toBe(false);
    expect(simulateNetworkRules(rules, { url: "ftp://x.com/a", resourceType: "main_frame" }).valid).toBe(false);
    expect(simulateNetworkRules(rules, { url: "https://x.com/a", resourceType: "main_frame" }).valid).toBe(true);
  });

  it("urlFilter 按 DNR 语义匹配：通配符、域名锚点与结尾锚点", () => {
    const request = (urlFilter: string, url: string) =>
      simulateNetworkRules([rule("b", { urlFilter, resourceTypes: ["main_frame"] }, { type: "block" })], {
        url,
        resourceType: "main_frame",
      }).hits.length;
    expect(request("/ads/*.js", "https://a.com/ads/x.js")).toBe(1);
    expect(request("/ads/*.js", "https://a.com/x.js")).toBe(0);
    expect(request("||example.com/", "https://cdn.example.com/a")).toBe(1);
    expect(request("||example.com/", "https://notexample.com/a")).toBe(0);
    expect(request("/track|", "https://a.com/track")).toBe(1);
    expect(request("/track|", "https://a.com/track/x")).toBe(0);
  });

  it("请求方法未指定时按 GET 模拟", () => {
    const rules = [
      rule("b", { ...github, requestMethods: ["post"], resourceTypes: ["main_frame"] }, { type: "block" }),
    ];
    expect(simulateNetworkRules(rules, { url: "https://github.com/a", resourceType: "main_frame" }).hits).toHaveLength(
      0
    );
    expect(
      simulateNetworkRules(rules, { url: "https://github.com/a", resourceType: "main_frame", method: "post" }).hits
    ).toHaveLength(1);
  });
});

describe("matchRuleUrl", () => {
  it("域名条件包含子域名并排除 excludedRequestDomains", () => {
    expect(matchRuleUrl(github, "https://gist.github.com/a")).toBe("match");
    expect(matchRuleUrl(github, "https://notgithub.com/a")).toBe("no-match");
    expect(matchRuleUrl({ requestDomains: ["a.com"], excludedRequestDomains: ["x.a.com"] }, "https://x.a.com/")).toBe(
      "no-match"
    );
  });

  it("「所有网站」匹配任意 http(s) 地址，非 http(s) 判为无效", () => {
    expect(matchRuleUrl(allSites, "https://anything.example/a")).toBe("match");
    expect(matchRuleUrl(allSites, "chrome://settings")).toBe("invalid");
  });

  it("与模拟器共用匹配核心：urlFilter 通配符不退化为子串比较", () => {
    expect(matchRuleUrl({ urlFilter: "/ads/*.js" }, "https://a.com/ads/x.js")).toBe("match");
    expect(matchRuleUrl({ urlFilter: "/ads/*.js" }, "https://a.com/adsjs")).toBe("no-match");
  });

  it("按主文档 GET 判定：未指定 resourceTypes 时与编译结果一致地命中", () => {
    expect(matchRuleUrl({ requestDomains: ["github.com"] }, "https://github.com/a")).toBe("match");
    expect(
      matchRuleUrl({ requestDomains: ["github.com"], resourceTypes: ["main_frame"] }, "https://github.com/a")
    ).toBe("match");
  });

  it("高级区限定的资源类型或请求方法排除这次请求时报 scope-only，而不是谎报匹配", () => {
    expect(matchRuleUrl({ requestDomains: ["github.com"], resourceTypes: ["image"] }, "https://github.com/a")).toBe(
      "scope-only"
    );
    expect(matchRuleUrl({ requestDomains: ["github.com"], requestMethods: ["post"] }, "https://github.com/a")).toBe(
      "scope-only"
    );
    // 范围之外仍然是 no-match：资源类型不该把「域名都不对」说成「只是类型不对」。
    expect(matchRuleUrl({ requestDomains: ["github.com"], resourceTypes: ["image"] }, "https://other.com/a")).toBe(
      "no-match"
    );
  });
});
