import { describe, expect, it } from "vitest";
import manifest from "./manifest.json";

describe("扩展隐私上下文配置", () => {
  it("使用 spanning 让 CSP 状态只由一个 service worker 持有", () => {
    expect(manifest.incognito).toBe("spanning");
  });
});
