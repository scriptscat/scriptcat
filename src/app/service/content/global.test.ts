import { describe, it, expect } from "vitest";
import { installTrustedDataPropertiesStrict, Native, nativeBind, refreshExposedDataProperties } from "./global";

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

describe("installTrustedDataPropertiesStrict / refreshExposedDataProperties", () => {
  it("does not invoke a source getter", () => {
    let getterCalls = 0;
    const source: Record<string, unknown> = {};
    Object.defineProperty(source, "x", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return 123;
      },
    });

    expect(() => installTrustedDataPropertiesStrict({}, source)).toThrow();
    expect(getterCalls).toBe(0);
  });

  it("rejects a source accessor for both the strict and skip-on-blocked target policies", () => {
    const source: Record<string, unknown> = {};
    Object.defineProperty(source, "x", { enumerable: true, get: () => 1 });

    expect(() => installTrustedDataPropertiesStrict({}, source)).toThrow();
    expect(() => refreshExposedDataProperties({}, source)).toThrow();
  });

  it("transfers every enumerable own data property, including falsy values", () => {
    const target: Record<string, unknown> = {};
    installTrustedDataPropertiesStrict(target, { a: 1, b: undefined, c: null, d: false, e: 0, f: "" });

    expect(target).toEqual({ a: 1, b: undefined, c: null, d: false, e: 0, f: "" });
    expect(Object.hasOwn(target, "b")).toBe(true);
  });

  it("ignores non-enumerable source properties, matching Object.assign", () => {
    const source: Record<string, unknown> = {};
    Object.defineProperty(source, "hidden", { value: 1, enumerable: false });
    Object.defineProperty(source, "visible", { value: 2, enumerable: true });

    const target: Record<string, unknown> = {};
    installTrustedDataPropertiesStrict(target, source);

    expect(Object.hasOwn(target, "hidden")).toBe(false);
    expect(target.visible).toBe(2);
  });

  it("skips symbol-keyed source properties (string-keyed-only scope, matching copyOwnEnumerableDataProperties)", () => {
    const sym = Symbol("s");
    const source = { a: 1, [sym]: "symbol value" };
    const target: Record<string, unknown> = {};
    installTrustedDataPropertiesStrict(target, source);

    expect(target).toEqual({ a: 1 });
    expect(Object.hasOwn(target, sym)).toBe(false);
  });

  it("updates only the value of an existing writable non-configurable target data property, preserving its flags", () => {
    const target: Record<string, unknown> = {};
    Object.defineProperty(target, "x", { configurable: false, enumerable: true, writable: true, value: 1 });

    installTrustedDataPropertiesStrict(target, { x: 2 });

    const descriptor = Object.getOwnPropertyDescriptor(target, "x")!;
    expect(descriptor).toMatchObject({ value: 2, configurable: false, enumerable: true, writable: true });
  });

  it("installs an own '__proto__' data property without mutating the target's prototype", () => {
    const source: Record<string, unknown> = {};
    Object.defineProperty(source, "__proto__", { enumerable: true, configurable: true, value: { forged: true } });
    const target: Record<string, unknown> = {};
    const originalPrototype = Object.getPrototypeOf(target);

    installTrustedDataPropertiesStrict(target, source);

    expect(Object.getPrototypeOf(target)).toBe(originalPrototype);
    expect(Object.hasOwn(target, "__proto__")).toBe(true);
    expect((target as any).__proto__).toEqual({ forged: true });
  });

  it("strict policy throws on a non-configurable target accessor and never invokes its setter", () => {
    let setterCalls = 0;
    const target: Record<string, unknown> = {};
    Object.defineProperty(target, "x", {
      configurable: false,
      enumerable: true,
      get: () => 1,
      set: () => {
        setterCalls += 1;
      },
    });

    expect(() => installTrustedDataPropertiesStrict(target, { x: 2 })).toThrow();
    expect(setterCalls).toBe(0);
  });

  it("skip policy silently skips a non-configurable target accessor, never invokes its setter, and still installs the remaining fields", () => {
    let setterCalls = 0;
    const target: Record<string, unknown> = {};
    Object.defineProperty(target, "locked", {
      configurable: false,
      enumerable: true,
      get: () => "script-locked",
      set: () => {
        setterCalls += 1;
      },
    });

    refreshExposedDataProperties(target, { locked: "authoritative", open: "authoritative" });

    expect(setterCalls).toBe(0);
    expect(target.locked).toBe("script-locked");
    expect(target.open).toBe("authoritative");
  });

  it("both policies replace a configurable target accessor with an ordinary data property instead of invoking its setter", () => {
    for (const install of [installTrustedDataPropertiesStrict, refreshExposedDataProperties]) {
      let setterCalls = 0;
      const target: Record<string, unknown> = {};
      Object.defineProperty(target, "x", {
        configurable: true,
        enumerable: true,
        get: () => "old",
        set: () => {
          setterCalls += 1;
        },
      });

      install(target, { x: "new" });

      expect(setterCalls).toBe(0);
      const descriptor = Object.getOwnPropertyDescriptor(target, "x")!;
      expect(descriptor).toMatchObject({ value: "new", configurable: true, enumerable: true, writable: true });
    }
  });

  it("installs properties correctly even when Object.prototype.get is poisoned (descriptor literals must not inherit an accessor)", () => {
    // Object.defineProperty(target, key, descriptor) 的 descriptor 参数本身是普通对象，会继承
    // Object.prototype；若用对象字面量 {value} 之类构造它，页面预先在 Object.prototype 上放置的
    // get/set 会让这份字面量"看起来"同时具备 own value 和继承来的 accessor，导致 defineProperty
    // 抛 "Cannot both specify accessors and a value or writable attribute"。安装原语内部必须用
    // null 原型对象构造 descriptor，而不是对象字面量。
    // 断言必须在 finally 恢复 Object.prototype.get 之后才执行：vitest 自身的 expect() 机制在
    // 求值期间也可能构造 descriptor 风格的对象，在 Object.prototype 被污染时提前断言会被
    // 测试框架自身的内部实现（而不是被测代码）触发同一个 TypeError，制造假阳性。
    const originalDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, "get");
    let freshThrew: unknown;
    let existingThrew: unknown;
    const freshTarget: Record<string, unknown> = {};
    const existingTarget: Record<string, unknown> = { a: 1 };
    try {
      Object.defineProperty(Object.prototype, "get", { configurable: true, value: () => undefined });

      // 场景一：target 尚无 own key（走"整体重新定义"分支）。
      try {
        installTrustedDataPropertiesStrict(freshTarget, { a: 1 });
      } catch (e) {
        freshThrew = e;
      }

      // 场景二：target 已有可写 own data property（走"只替换 value"分支）。
      try {
        installTrustedDataPropertiesStrict(existingTarget, { a: 2 });
      } catch (e) {
        existingThrew = e;
      }
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(Object.prototype, "get", originalDescriptor);
      } else {
        delete (Object.prototype as any).get;
      }
    }

    expect(freshThrew).toBeUndefined();
    expect(freshTarget.a).toBe(1);
    expect(existingThrew).toBeUndefined();
    expect(existingTarget.a).toBe(2);
  });
});
