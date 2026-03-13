import { describe, it, expect } from "vitest";

describe("agent_dom_cdp", () => {
  it("模块可正常导入", async () => {
    const mod = await import("./agent_dom_cdp");
    expect(mod.withDebugger).toBeDefined();
    expect(mod.cdpClick).toBeDefined();
    expect(mod.cdpFill).toBeDefined();
    expect(mod.cdpScreenshot).toBeDefined();
  });
});
