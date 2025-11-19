import { describe, it, expect } from "vitest";
import { shouldFnBind } from "./create_context";

describe("shouldFnBind", () => {
  it("处理Proxy Function #985", () => {
    const proxyFn = new Proxy(function () {}, {});
    expect(shouldFnBind(proxyFn)).toBe(false);
    const valueOf = global.valueOf;
    expect(shouldFnBind(valueOf)).toBe(true);
    const proxyValueOf = new Proxy(valueOf, {});
    expect(shouldFnBind(proxyValueOf)).toBe(true);
  });
});
