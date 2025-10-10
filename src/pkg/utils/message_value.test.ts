// message_value.test.ts
import { describe, it, expect, vi } from "vitest";
import { encodeMessage, decodeMessage, type TEncodedMessage } from "./message_value";

describe("encodeMessage / decodeMessage", () => {
  it("应能正确编码与解码包含 undefined 和 null 的对象", () => {
    const input = {
      a: undefined,
      b: null,
      c: 1,
      d: "text",
      e: [undefined, null, 2, "ok"],
      f: { x: undefined, y: null, z: [1, undefined] },
    };
    const encoded = encodeMessage(input);
    const decoded = decodeMessage(encoded);
    expect(decoded).toEqual(input);
  });

  it("应保持输入对象未被修改", () => {
    const input = { a: undefined, b: { c: null } };
    encodeMessage(input);
    expect("a" in input).toBe(true);
    expect(input.a).toBeUndefined();
    expect("b" in input).toBe(true);
    expect("c" in input.b).toBe(true);
    expect(input.b.c).toBeNull();
  });

  it("数组中的 undefined 与 null 可被正确往返且索引不丢失", () => {
    const input = [1, undefined, null, "x", [undefined, null]];
    const encoded = encodeMessage(input);
    const decoded = decodeMessage(encoded) as any[];
    expect(decoded).toEqual(input);
    expect(1 in decoded).toBe(true);
    expect(4 in decoded).toBe(true);
    expect(5 in decoded).toBe(false);
    expect(decoded.length).toBe(5);
    expect(Array.isArray(decoded)).toBe(true);
  });

  it("原始类型应能保持相等", () => {
    const nums = 42;
    const strs = "hello";
    const bools = false;
    expect(decodeMessage(encodeMessage(nums))).toBe(nums);
    expect(decodeMessage(encodeMessage(strs))).toBe(strs);
    expect(decodeMessage(encodeMessage(bools))).toBe(bools);
  });

  it("应能正确处理深层嵌套结构", () => {
    const input = { a: { b: { c: { d: undefined, e: null, f: [1, { g: undefined }] } } } };
    const decoded = decodeMessage(encodeMessage(input));
    expect(decoded).toEqual(input);
  });

  it("应生成唯一的随机键并正确还原", () => {
    const r1 = 0.123456789;
    const r2 = 0.987654321;
    const spy = vi.spyOn(Math, "random").mockReturnValueOnce(r1).mockReturnValueOnce(r2);
    const encoded = encodeMessage({ v: undefined });
    expect(encoded.k.startsWith("##")).toBe(true);
    expect(encoded.k.endsWith("##")).toBe(true);
    expect(encoded.k.includes(String(r1))).toBe(true);
    expect(encoded.k.includes(String(r2))).toBe(true);
    const decoded = decodeMessage(encoded as TEncodedMessage<{ v: unknown }>);
    expect(decoded).toEqual({ v: undefined });
    spy.mockRestore();
  });

  it("无效输入应抛出异常", () => {
    expect(() => decodeMessage({ k: "##x##" } as any)).toThrowError("invalid decodeMessage");
    expect(() => decodeMessage({ m: {} } as any)).toThrowError("invalid decodeMessage");
    expect(() => decodeMessage({ m: {}, k: 123 } as any)).toThrowError("invalid decodeMessage");
  });

  it("不同随机键的占位符不应互相干扰", () => {
    const aKey = "##A##";
    const bKey = "##B##";
    const aUndefined = `${aKey}undefined`;
    const bNull = `${bKey}null`;
    const encodedA: TEncodedMessage<any> = {
      k: aKey,
      m: {
        shouldStayString: bNull,
        willBecomeUndef: aUndefined,
      },
    };
    const decodedA = decodeMessage(encodedA);
    expect(decodedA).toEqual({
      shouldStayString: bNull,
      willBecomeUndef: undefined,
    });
  });

  it("普通字符串包含 'undefined' 或 'null' 时不应被误替换", () => {
    const input = {
      s1: "undefined",
      s2: "null",
      s3: "##not-the-same##undefined",
    };
    const decoded = decodeMessage(encodeMessage(input));
    expect(decoded).toEqual(input);
  });
});
