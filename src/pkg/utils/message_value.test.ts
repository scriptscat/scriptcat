import { describe, it, expect } from "vitest";
import { RType, R_UNDEFINED, R_NULL, decodeRValue, encodeRValue, type REncoded } from "./message_value";

describe.concurrent("encodeRValue 编码函数", () => {
  it.concurrent("应将 undefined 编码为 R_UNDEFINED", () => {
    const encoded = encodeRValue(undefined);
    expect(encoded).toEqual(R_UNDEFINED);
    expect(encoded[0]).toBe(RType.UNDEFINED);
  });

  it.concurrent("应将 null 编码为 R_NULL", () => {
    const encoded = encodeRValue(null);
    expect(encoded).toEqual(R_NULL);
    expect(encoded[0]).toBe(RType.NULL);
  });

  it.concurrent("应将数字编码为 STANDARD 类型元组", () => {
    const value = 123;
    const encoded = encodeRValue(value);
    expect(encoded[0]).toBe(RType.STANDARD);
    expect(encoded[1]).toBe(value);
  });

  it.concurrent("应将字符串编码为 STANDARD 类型元组", () => {
    const value = "测试字符串";
    const encoded = encodeRValue(value);
    expect(encoded[0]).toBe(RType.STANDARD);
    expect(encoded[1]).toBe(value);
  });

  it.concurrent("应将布尔值编码为 STANDARD 类型元组", () => {
    const value = true;
    const encoded = encodeRValue(value);
    expect(encoded[0]).toBe(RType.STANDARD);
    expect(encoded[1]).toBe(value);
  });

  it.concurrent("应将对象编码为 STANDARD 类型元组且保持引用", () => {
    const obj = { a: 1 };
    const encoded = encodeRValue(obj);
    expect(encoded[0]).toBe(RType.STANDARD);
    expect(encoded[1]).toBe(obj);
  });

  it.concurrent("应将 symbol 编码为 STANDARD 类型元组", () => {
    const sym = Symbol("测试");
    const encoded = encodeRValue(sym as any);
    expect(encoded[0]).toBe(RType.STANDARD);
    expect(encoded[1]).toBe(sym);
  });

  it.concurrent("应将 bigint 编码为 STANDARD 类型元组", () => {
    const big = 10n;
    const encoded = encodeRValue(big as any);
    expect(encoded[0]).toBe(RType.STANDARD);
    expect(encoded[1]).toBe(big);
  });

  it.concurrent("应正确处理联合类型的编码", () => {
    const value: string | null = "联合类型测试";
    const encoded = encodeRValue<string | null>(value);
    expect(encoded[0]).toBe(RType.STANDARD);
    expect(encoded[1]).toBe(value);
  });
});

describe.concurrent("decodeRValue 解码函数", () => {
  it.concurrent("应将 R_UNDEFINED 解码为 undefined", () => {
    const decoded = decodeRValue(R_UNDEFINED);
    expect(decoded).toBeUndefined();
  });

  it.concurrent("应将 R_NULL 解码为 null", () => {
    const decoded = decodeRValue(R_NULL);
    expect(decoded).toBeNull();
  });

  it.concurrent("应将 STANDARD 类型元组解码为原始值（数字）", () => {
    const encoded: REncoded<number> = [RType.STANDARD, 42];
    const decoded = decodeRValue(encoded);
    expect(decoded).toBe(42);
  });

  it.concurrent("应将 STANDARD 类型元组解码为原始值（字符串）", () => {
    const encoded: REncoded<string> = [RType.STANDARD, "解码测试"];
    const decoded = decodeRValue(encoded);
    expect(decoded).toBe("解码测试");
  });

  it.concurrent("应将 STANDARD 类型元组解码为原始值（布尔值）", () => {
    const encoded: REncoded<boolean> = [RType.STANDARD, false];
    const decoded = decodeRValue(encoded);
    expect(decoded).toBe(false);
  });

  it.concurrent("应将 STANDARD 类型元组解码为对象并保持引用", () => {
    const obj = { x: 99 };
    const encoded: REncoded<typeof obj> = [RType.STANDARD, obj];
    const decoded = decodeRValue(encoded);
    expect(decoded).toBe(obj);
  });

  it.concurrent("应将 STANDARD 类型元组解码为 symbol", () => {
    const sym = Symbol("解码 symbol");
    const encoded: REncoded<symbol> = [RType.STANDARD, sym];
    const decoded = decodeRValue(encoded);
    expect(decoded).toBe(sym);
  });

  it.concurrent("应将 STANDARD 类型元组解码为 bigint", () => {
    const big = 123n;
    const encoded: REncoded<bigint> = [RType.STANDARD, big];
    const decoded = decodeRValue(encoded);
    expect(decoded).toBe(big);
  });
});

describe.concurrent("encodeRValue 与 decodeRValue 组合行为", () => {
  it.concurrent("应保证编码解码往返后值保持不变", () => {
    const sym = Symbol("往返 symbol");
    const values: any[] = [
      undefined,
      null,
      0,
      -1,
      3.14,
      "往返测试",
      "",
      true,
      false,
      { foo: "bar" },
      [1, 2, 3],
      sym,
      999n,
    ];

    const roundTrip = values.map((v) => decodeRValue(encodeRValue(v)));

    roundTrip.forEach((decoded, index) => {
      const original = values[index];
      if (typeof original === "object" && original !== null) {
        expect(decoded).toBe(original);
      } else {
        expect(decoded).toBe(original);
      }
    });
  });

  it.concurrent("应对联合类型值进行正确的往返编码解码", () => {
    type Union = string | number | null | undefined;
    const values: Union[] = [undefined, null, 1, 0, 123, "abc", ""];

    const roundTrip = values.map((v) => decodeRValue<Union>(encodeRValue<Union>(v)));

    expect(roundTrip).toEqual(values);
  });
});

describe.concurrent("R_UNDEFINED 与 R_NULL 常量形状", () => {
  it.concurrent("R_UNDEFINED 应为只包含 UNDEFINED 类型的单元素元组", () => {
    expect(Array.isArray(R_UNDEFINED)).toBe(true);
    expect(R_UNDEFINED.length).toBe(1);
    expect(R_UNDEFINED[0]).toBe(RType.UNDEFINED);
  });

  it.concurrent("R_NULL 应为只包含 NULL 类型的单元素元组", () => {
    expect(Array.isArray(R_NULL)).toBe(true);
    expect(R_NULL.length).toBe(1);
    expect(R_NULL[0]).toBe(RType.NULL);
  });
});
