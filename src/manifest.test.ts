import { describe, expect, it } from "vitest";
import manifest from "./manifest.json";
import { isNetworkRuleOwner } from "@App/app/repo/network_rule";

describe("扩展隐私上下文配置", () => {
  it("保留 split 以支持现有隐私窗口流程，并只让普通后台持有网络规则状态", () => {
    expect(manifest.incognito).toBe("split");
    expect(isNetworkRuleOwner({ inIncognitoContext: false, incognitoMode: "split" })).toBe(true);
    expect(isNetworkRuleOwner({ inIncognitoContext: true, incognitoMode: "split" })).toBe(false);
  });

  it("Firefox spanning 只有一个共享后台，隐身上下文同样持有网络规则状态", () => {
    expect(isNetworkRuleOwner({ inIncognitoContext: true, incognitoMode: "spanning" })).toBe(true);
    expect(isNetworkRuleOwner({ inIncognitoContext: false, incognitoMode: "spanning" })).toBe(true);
  });
});

describe("网络规则所需权限", () => {
  it("匹配测试是纯前端模拟，不申请 declarativeNetRequestFeedback", () => {
    const permissions: string[] = [...manifest.permissions, ...manifest.optional_permissions];
    expect(permissions).toContain("declarativeNetRequest");
    expect(permissions).not.toContain("declarativeNetRequestFeedback");
  });
});
