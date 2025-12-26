import { describe, it, expect } from "vitest";
import { shouldFnBind } from "./create_context";

describe.concurrent("shouldFnBind", () => {
  it.concurrent("不处理非原生函数", () => {
    const o: Record<string, any> = {};
    o.targetArrowFn = () => {};
    expect(shouldFnBind(o.targetArrowFn)).toBe(false);
    o.targetArrowFn = new Proxy(o.targetArrowFn, {});
    expect(shouldFnBind(o.targetArrowFn)).toBe(false);
    o.targetFn1 = function () {};
    expect(shouldFnBind(o.targetFn1)).toBe(false);
    o.targetFn1 = new Proxy(o.targetFn1, {});
    expect(shouldFnBind(o.targetFn1)).toBe(false);
    o.targetFn2 = function targetFn2() {};
    expect(shouldFnBind(o.targetFn2)).toBe(false);
    o.targetFn2 = new Proxy(o.targetFn2, {});
    expect(shouldFnBind(o.targetFn2)).toBe(false);
  });
  it.concurrent("处理Proxy Function #985", () => {
    const o: Record<string, any> = {};
    // 例1: valueOf
    o.valueOf = global.valueOf;
    expect(shouldFnBind(o.valueOf)).toBe(true);
    o.valueOf = new Proxy(o.valueOf, {});
    expect(shouldFnBind(o.valueOf)).toBe(true);
    // 例2: setTimeoutForTest1: 验证一次拦截
    // @ts-ignore
    o.setTimeoutForTest1 = global.setTimeoutForTest1;
    expect(shouldFnBind(o.setTimeoutForTest1)).toBe(true);
    o.setTimeoutForTest1 = new Proxy(o.setTimeoutForTest1, {
      apply: (target, thisArg, argArray) => {
        console.log("proxy call", { target, thisArg, argArray });
      },
    });
    expect(shouldFnBind(o.setTimeoutForTest1)).toBe(true);
    // 例2: setTimeoutForTest2: 验证二次拦截
    // @ts-ignore
    o.setTimeoutForTest2 = global.setTimeoutForTest2;
    expect(shouldFnBind(o.setTimeoutForTest2)).toBe(true);
    o.setTimeoutForTest2 = new Proxy(o.setTimeoutForTest2, {
      apply: (target, thisArg, argArray) => {
        console.log("proxy call", { target, thisArg, argArray });
      },
    });
    expect(shouldFnBind(o.setTimeoutForTest2)).toBe(true);
  });
});
