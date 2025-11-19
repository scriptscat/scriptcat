import { describe, it, expect } from "vitest";
import { shouldFnBind } from "./create_context";

describe("shouldFnBind", () => {
  it("处理Proxy Function #985", () => {
    // 例1: valueOf
    const targetFn1 = global.valueOf;
    expect(shouldFnBind(targetFn1)).toBe(true);
    const proxyFn1 = new Proxy(targetFn1, {});
    expect(shouldFnBind(proxyFn1)).toBe(true);
    // 例2: setTimeoutForTest1
    // @ts-ignore
    const targetFn2 = global.setTimeoutForTest1;
    expect(shouldFnBind(targetFn2)).toBe(true);
    const proxyFn2 = new Proxy(targetFn2, {
      apply: (target, thisArg, argArray) => {
        console.log("proxy call", { target, thisArg, argArray });
      },
    });
    expect(shouldFnBind(proxyFn2)).toBe(true);
  });
});

describe("shouldFnBind", () => {
  it("不处理非原生函数的Proxy Function", () => {
    const targetFn = function () {};
    expect(shouldFnBind(targetFn)).toBe(false);
    const proxyFn = new Proxy(targetFn, {});
    expect(shouldFnBind(proxyFn)).toBe(false);
  });
});
