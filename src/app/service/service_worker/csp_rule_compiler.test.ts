import { describe, expect, it } from "vitest";
import { compileCspRules, CSP_RULE_ID, DeclarativeNetRequestCspApplier } from "./csp_rule_compiler";
import type { CspRuleState } from "@App/app/repo/csp_rule";

const baseState: CspRuleState = {
  schemaVersion: 1,
  revision: 1,
  masterEnabled: true,
  rules: [],
};

const rule = (id: string, target: CspRuleState["rules"][number]["target"], enabled = true) => ({
  id,
  name: id,
  enabled,
  target,
  action: { type: "removeCspHeaders" as const },
  createdAt: 1,
  updatedAt: 1,
});

describe("CSP DNR 编译", () => {
  it("多个规则的域名合并为一条 DNR 规则并按 ASCII 排序", () => {
    expect(
      compileCspRules({
        ...baseState,
        rules: [
          rule("one", { type: "domains", domains: ["z.example.com", "example.com"] }),
          rule("two", { type: "domains", domains: ["example.com", "a.example.com"] }),
        ],
      })
    ).toEqual([
      expect.objectContaining({
        id: CSP_RULE_ID,
        priority: 1,
        action: {
          type: "modifyHeaders",
          responseHeaders: [
            { header: "content-security-policy", operation: "remove" },
            { header: "content-security-policy-report-only", operation: "remove" },
            { header: "x-content-security-policy", operation: "remove" },
            { header: "x-webkit-csp", operation: "remove" },
          ],
        },
        condition: {
          requestDomains: ["a.example.com", "example.com", "z.example.com"],
          resourceTypes: ["main_frame", "sub_frame"],
        },
      }),
    ]);
  });

  it("存在所有网站规则时编译为 urlFilter 星号", () => {
    expect(
      compileCspRules({
        ...baseState,
        rules: [rule("all", { type: "allSites" })],
      })[0].condition
    ).toEqual({ urlFilter: "*", resourceTypes: ["main_frame", "sub_frame"] });
  });

  it("总开关关闭或没有启用规则时编译为空规则", () => {
    expect(compileCspRules({ ...baseState, masterEnabled: false })).toEqual([]);
    expect(
      compileCspRules({ ...baseState, rules: [rule("off", { type: "domains", domains: ["example.com"] }, false)] })
    ).toEqual([]);
  });

  it("更新只拥有 ID 2001 且不会移除脚本安装 dynamic rule ID 2", async () => {
    const dnr = chrome.declarativeNetRequest as typeof chrome.declarativeNetRequest & {
      resetMock(): void;
      dynamicUpdateError?: string;
      getDynamicRules(): Promise<chrome.declarativeNetRequest.Rule[]>;
    };
    dnr.resetMock();
    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules: [{ id: 2, priority: 1, action: { type: "allow" }, condition: {} }],
    });
    const applier = new DeclarativeNetRequestCspApplier();
    await applier.apply(
      compileCspRules({ ...baseState, rules: [rule("one", { type: "domains", domains: ["example.com"] })] })
    );
    expect((await dnr.getDynamicRules()).map((item) => item.id)).toEqual([2, CSP_RULE_ID]);
    await applier.apply([]);
    expect((await dnr.getDynamicRules()).map((item) => item.id)).toEqual([2]);
  });

  it("DNR 更新失败时保留现有规则", async () => {
    const dnr = chrome.declarativeNetRequest as typeof chrome.declarativeNetRequest & {
      dynamicUpdateError?: string;
      getDynamicRules(): Promise<chrome.declarativeNetRequest.Rule[]>;
    };
    const before = await dnr.getDynamicRules();
    dnr.dynamicUpdateError = "permission denied";
    await expect(new DeclarativeNetRequestCspApplier().apply([])).rejects.toThrow("permission denied");
    expect(await dnr.getDynamicRules()).toEqual(before);
  });
});
