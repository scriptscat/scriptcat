import { describe, expect, it } from "vitest";
import manifest from "./manifest.json";
import { isCspRuleOwner } from "@App/app/service/service_worker/csp_rule";

describe("扩展隐私上下文配置", () => {
  it("保留 split 以支持现有隐私窗口流程，并只让普通后台持有 CSP 状态", () => {
    expect(manifest.incognito).toBe("split");
    expect(isCspRuleOwner(false)).toBe(true);
    expect(isCspRuleOwner(true)).toBe(false);
  });
});
