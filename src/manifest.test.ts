import { describe, expect, it } from "vitest";
import manifest from "./manifest.json";

describe("扩展隐私上下文配置", () => {
  it("保留 split 以支持现有隐私窗口流程", () => {
    expect(manifest.incognito).toBe("split");
  });
});

describe("网络规则所需权限", () => {
  it("匹配测试是纯前端模拟，不申请 declarativeNetRequestFeedback", () => {
    const permissions: string[] = [...manifest.permissions, ...manifest.optional_permissions];
    expect(permissions).toContain("declarativeNetRequest");
    expect(permissions).not.toContain("declarativeNetRequestFeedback");
  });
});
