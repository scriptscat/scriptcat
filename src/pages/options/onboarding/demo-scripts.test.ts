import { describe, it, expect } from "vitest";
import { getDemoScripts } from "./demo-scripts";
import { SCRIPT_TYPE_NORMAL, SCRIPT_TYPE_BACKGROUND, SCRIPT_STATUS_ENABLE } from "@App/app/repo/scripts";

const t = ((k: string) => k) as unknown as Parameters<typeof getDemoScripts>[0];

describe("演示脚本", () => {
  it("应产出 2 条：一普通启用脚本与一后台脚本", () => {
    const list = getDemoScripts(t);
    expect(list).toHaveLength(2);
    expect(list[0].type).toBe(SCRIPT_TYPE_NORMAL);
    expect(list[0].status).toBe(SCRIPT_STATUS_ENABLE);
    expect(list.some((s) => s.type === SCRIPT_TYPE_BACKGROUND)).toBe(true);
  });

  it("uuid 应带 demo 前缀且稳定", () => {
    const a = getDemoScripts(t);
    const b = getDemoScripts(t);
    expect(a.every((s) => s.uuid.startsWith("demo-"))).toBe(true);
    expect(a.map((s) => s.uuid)).toEqual(b.map((s) => s.uuid));
  });
});
