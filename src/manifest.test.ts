import { describe, expect, it } from "vitest";
import manifest from "./manifest.json";
import { isCspRuleOwner } from "@App/app/repo/csp_rule";

describe("扩展隐私上下文配置", () => {
  it("保留 split 以支持现有隐私窗口流程，并只让普通后台持有 CSP 状态", () => {
    expect(manifest.incognito).toBe("split");
    expect(isCspRuleOwner({ inIncognitoContext: false, incognitoMode: "split" })).toBe(true);
    expect(isCspRuleOwner({ inIncognitoContext: true, incognitoMode: "split" })).toBe(false);
  });

  it("Firefox spanning 只有一个共享后台，隐身上下文同样持有 CSP 状态", () => {
    expect(isCspRuleOwner({ inIncognitoContext: true, incognitoMode: "spanning" })).toBe(true);
    expect(isCspRuleOwner({ inIncognitoContext: false, incognitoMode: "spanning" })).toBe(true);
  });
});
