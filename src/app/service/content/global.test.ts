import { describe, it, expect } from "vitest";
import { Native, nativeBind } from "./global";

describe("Native.bind", () => {
  it("delivers the receiver correctly under normal conditions", () => {
    const target = {
      value: 42,
      read(this: { value: number }) {
        return this.value;
      },
    };
    const bound = nativeBind(target.read, target);
    expect(bound()).toBe(42);
  });

  it("is not influenced by a hostile Array.prototype[Symbol.iterator]", () => {
    // 页面可替换 Array 迭代器影响基于 spread/apply 的绑定实现；
    // Native.bind 必须完全不依赖被绑定函数参数列表的迭代行为。
    const originalIterator = Array.prototype[Symbol.iterator];
    let hostileIteratorInvoked = false;
    let result: number | undefined;
    try {
      Array.prototype[Symbol.iterator] = () => {
        hostileIteratorInvoked = true;
        throw new Error("hostile iterator invoked");
      };

      const target = {
        value: 7,
        read(this: { value: number }) {
          return this.value;
        },
      };
      const bound = Native.bind(target.read, target);
      result = bound();
    } finally {
      Array.prototype[Symbol.iterator] = originalIterator;
    }

    expect(hostileIteratorInvoked).toBe(false);
    expect(result).toBe(7);
  });
});
