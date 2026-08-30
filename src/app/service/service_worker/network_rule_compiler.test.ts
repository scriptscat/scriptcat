import { describe, expect, it, vi } from "vitest";
import type { NetworkRule, NetworkRuleState } from "@App/app/repo/network_rule";
import { compileNetworkRules, DeclarativeNetRequestUserRuleApplier } from "./network_rule_compiler";
import { INTERNAL_DNR_PRIORITY, MAX_USER_RULES, USER_RULE_ID_MIN, isUserRuleId } from "./dnr_rule_ids";

type DnrMock = typeof chrome.declarativeNetRequest & {
  resetMock(): void;
  dynamicUpdateError?: string;
  getDynamicRules(): Promise<chrome.declarativeNetRequest.Rule[]>;
};

const dnr = chrome.declarativeNetRequest as DnrMock;

function rule(id: string, action: NetworkRule["action"], enabled = true): NetworkRule {
  return {
    id,
    name: id,
    enabled,
    condition: { requestDomains: [`${id}.example.com`] },
    action,
    createdAt: 1,
    updatedAt: 1,
  };
}

function state(rules: NetworkRule[], overrides: Partial<NetworkRuleState> = {}): NetworkRuleState {
  return {
    schemaVersion: 1,
    revision: 1,
    masterEnabled: true,
    rules,
    order: rules.map((item) => item.id),
    ...overrides,
  };
}

// chrome.declarativeNetRequest 的匹配裁决：先比 priority，只有 priority 相同才按动作序裁决。
// 见 https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest#matching-algorithm
const ACTION_PRECEDENCE = ["allowAllRequests", "allow", "block", "upgradeScheme", "redirect"];
function arbitrate(rules: chrome.declarativeNetRequest.Rule[]): chrome.declarativeNetRequest.Rule {
  return [...rules].sort(
    (a, b) =>
      (b.priority ?? 1) - (a.priority ?? 1) ||
      ACTION_PRECEDENCE.indexOf(a.action.type) - ACTION_PRECEDENCE.indexOf(b.action.type)
  )[0];
}

// script.ts 注册的 .user.js 安装重定向，用登记表的内部优先级。
const installRedirect: chrome.declarativeNetRequest.Rule = {
  id: 1000,
  priority: INTERNAL_DNR_PRIORITY,
  action: { type: "redirect" as chrome.declarativeNetRequest.RuleActionType, redirect: { url: "install.html" } },
  condition: { regexFilter: "^(https?://.+?\\.user\\.js)" },
};

describe("网络规则 DNR 编译与对账", () => {
  it("一次应用把两条不同动作的规则编译成保留段内的两条 DNR 规则，回收段内陈旧 ID 并保留段外规则", async () => {
    dnr.resetMock();
    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules: [
        { id: 2, priority: INTERNAL_DNR_PRIORITY, action: { type: "allow" }, condition: {} },
        { id: USER_RULE_ID_MIN + 7, priority: 1, action: { type: "block" }, condition: {} },
      ] as chrome.declarativeNetRequest.Rule[],
    });

    const compiled = compileNetworkRules(
      state([
        rule("csp", { type: "removeResponseHeaders", headers: ["content-security-policy"] }),
        rule("blocked", { type: "block" }),
      ])
    );
    await new DeclarativeNetRequestUserRuleApplier().apply(compiled);

    const applied = await dnr.getDynamicRules();
    const userRules = applied.filter((item) => isUserRuleId(item.id));
    expect(userRules.map((item) => item.id)).toEqual([USER_RULE_ID_MIN, USER_RULE_ID_MIN + 1]);
    expect(userRules.map((item) => item.priority)).toEqual([2, 1]);
    expect(userRules.map((item) => item.action.type)).toEqual(["modifyHeaders", "block"]);
    expect(userRules[0].action.responseHeaders).toEqual([{ header: "content-security-policy", operation: "remove" }]);
    expect(applied.some((item) => item.id === USER_RULE_ID_MIN + 7)).toBe(false);
    expect(applied.find((item) => item.id === 2)).toEqual({
      id: 2,
      priority: INTERNAL_DNR_PRIORITY,
      action: { type: "allow" },
      condition: {},
    });
  });

  it("用户 block 规则排在列表首位也压不过 .user.js 安装重定向", () => {
    const compiled = compileNetworkRules(
      state([
        rule("blocked", { type: "block" }),
        rule("csp", { type: "removeResponseHeaders", headers: ["content-security-policy"] }),
      ])
    );
    expect(compiled[0].action.type).toBe("block");
    expect(arbitrate([...compiled, installRedirect]).id).toBe(installRedirect.id);
    // 保留段写满时的用户优先级上界仍严格低于内部段，因此不存在同优先级动作序裁决的机会。
    expect(MAX_USER_RULES).toBeLessThan(INTERNAL_DNR_PRIORITY);
  });

  it("按动作可辨识联合翻译成对应的 DNR action", () => {
    const compiled = compileNetworkRules(
      state([
        rule("req", {
          type: "modifyRequestHeaders",
          headers: [{ header: "x-flag", operation: "set", value: "1" }],
        }),
        rule("res", { type: "modifyResponseHeaders", headers: [{ header: "x-frame-options", operation: "remove" }] }),
        rule("go", { type: "redirect", url: "https://example.com/target" }),
        rule("pass", { type: "allow" }),
      ])
    );
    expect(compiled.map((item) => item.action)).toEqual([
      { type: "modifyHeaders", requestHeaders: [{ header: "x-flag", operation: "set", value: "1" }] },
      { type: "modifyHeaders", responseHeaders: [{ header: "x-frame-options", operation: "remove" }] },
      { type: "redirect", redirect: { url: "https://example.com/target" } },
      { type: "allow" },
    ]);
  });

  it("条件按受控子集原样翻译", () => {
    const [compiled] = compileNetworkRules(
      state([
        {
          ...rule("cond", { type: "block" }),
          condition: {
            urlFilter: "*/api/*",
            requestDomains: ["example.com"],
            excludedRequestDomains: ["cdn.example.com"],
            initiatorDomains: ["app.example.com"],
            excludedInitiatorDomains: ["intranet.example.com"],
            resourceTypes: ["xmlhttprequest"],
            requestMethods: ["post"],
          },
        },
      ])
    );
    expect(compiled.condition).toEqual({
      urlFilter: "*/api/*",
      requestDomains: ["example.com"],
      excludedRequestDomains: ["cdn.example.com"],
      initiatorDomains: ["app.example.com"],
      excludedInitiatorDomains: ["intranet.example.com"],
      resourceTypes: ["xmlhttprequest"],
      requestMethods: ["post"],
    });
  });

  it("停用的规则不占用 ID，但保留其余规则的相对优先级", () => {
    const compiled = compileNetworkRules(
      state([rule("first", { type: "block" }), rule("off", { type: "block" }, false), rule("last", { type: "allow" })])
    );
    expect(compiled.map((item) => [item.id, item.priority])).toEqual([
      [USER_RULE_ID_MIN, 3],
      [USER_RULE_ID_MIN + 1, 1],
    ]);
  });

  it("总开关关闭或没有启用规则时编译为空规则", () => {
    expect(compileNetworkRules(state([rule("one", { type: "block" })], { masterEnabled: false }))).toEqual([]);
    expect(compileNetworkRules(state([rule("off", { type: "block" }, false)]))).toEqual([]);
  });

  it("对账读取动态规则失败时不改动任何规则", async () => {
    dnr.resetMock();
    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules: [
        { id: 2, priority: 1, action: { type: "allow" }, condition: {} },
      ] as chrome.declarativeNetRequest.Rule[],
    });
    const getDynamicRules = vi
      .spyOn(chrome.declarativeNetRequest, "getDynamicRules")
      .mockRejectedValueOnce(new Error("read failed"));

    await expect(new DeclarativeNetRequestUserRuleApplier().apply([])).rejects.toThrow("read failed");
    getDynamicRules.mockRestore();
    expect((await dnr.getDynamicRules()).map((item) => item.id)).toEqual([2]);
  });

  it("DNR 更新失败时保留现有规则", async () => {
    dnr.resetMock();
    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules: [
        { id: 2, priority: 1, action: { type: "allow" }, condition: {} },
      ] as chrome.declarativeNetRequest.Rule[],
    });
    const before = await dnr.getDynamicRules();
    dnr.dynamicUpdateError = "permission denied";
    await expect(new DeclarativeNetRequestUserRuleApplier().apply([])).rejects.toThrow("permission denied");
    expect(await dnr.getDynamicRules()).toEqual(before);
  });
});
