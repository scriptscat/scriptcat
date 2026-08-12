import { describe, it, expect } from "vitest";
import { DESKTOP_STEPS, MOBILE_STEPS } from "./steps";

describe("巡览步骤配置", () => {
  it("桌面应有 6 个步骤", () => {
    expect(DESKTOP_STEPS).toHaveLength(6);
  });

  it("移动端应为更精简的 3 个步骤", () => {
    expect(MOBILE_STEPS).toHaveLength(3);
  });

  it("每个步骤都应带 guide 命名空间的标题与正文 key", () => {
    for (const s of [...DESKTOP_STEPS, ...MOBILE_STEPS]) {
      expect(s.titleKey.startsWith("guide:")).toBe(true);
      expect(s.contentKey.startsWith("guide:")).toBe(true);
      expect(typeof s.target).toBe("string");
    }
  });

  it("移动端步骤 id 应是桌面步骤 id 与 subscribe 的子集", () => {
    const allowed = new Set([...DESKTOP_STEPS.map((s) => s.id), "subscribe"]);
    for (const s of MOBILE_STEPS) expect(allowed.has(s.id)).toBe(true);
  });
});
