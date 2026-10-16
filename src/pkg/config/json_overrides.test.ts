import { describe, expect, it } from "vitest";
import { decodeJsonConfig, deepDiff, deepMerge, encodeJsonConfig, type StoredJsonOverridesV1 } from "./json_overrides";

describe("deepMerge", () => {
  it("deeply merges nested objects with override values winning", () => {
    expect(deepMerge({ a: 1, nested: { x: 1, y: 2 } }, { nested: { y: 3 } })).toEqual({
      a: 1,
      nested: { x: 1, y: 3 },
    });
  });

  it("replaces arrays as whole values", () => {
    expect(deepMerge({ rule: ["error", { allow: true }] }, { rule: ["warn"] })).toEqual({ rule: ["warn"] });
  });

  it("lets overrides replace values when object and scalar types differ", () => {
    expect(deepMerge({ a: { x: 1 } }, { a: false })).toEqual({ a: false });
    expect(deepMerge({ a: false }, { a: { x: 1 } })).toEqual({ a: { x: 1 } });
  });

  it("preserves custom user keys", () => {
    expect(deepMerge({ a: 1 }, { custom: "x" })).toEqual({ a: 1, custom: "x" });
  });

  it("treats __proto__ as an ordinary JSON property", () => {
    const overrides = JSON.parse('{"__proto__":{"polluted":true}}');
    const merged = deepMerge({}, overrides) as Record<string, unknown>;

    expect(Object.prototype.hasOwnProperty.call(merged, "__proto__")).toBe(true);
    expect(merged.__proto__).toEqual({ polluted: true });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("deepDiff", () => {
  it("returns undefined for equal values", () => {
    const defaults = { a: 1, nested: { x: [1, 2], y: { z: true } } };
    expect(deepDiff(structuredClone(defaults), defaults)).toBeUndefined();
  });

  it("keeps only sparse nested differences", () => {
    expect(deepDiff({ a: 1, nested: { x: 1, y: 3 } }, { a: 1, nested: { x: 1, y: 2 } })).toEqual({
      nested: { y: 3 },
    });
  });

  it("replaces arrays instead of diffing their indexes", () => {
    expect(deepDiff({ rule: ["warn"], other: 1 }, { rule: ["error"], other: 1 })).toEqual({ rule: ["warn"] });
  });

  it("preserves custom keys and prototype-sensitive keys", () => {
    const value = JSON.parse('{"a":1,"custom":"x","__proto__":{"polluted":true}}');
    const diff = deepDiff(value, { a: 1 }) as Record<string, unknown>;

    expect(Object.prototype.hasOwnProperty.call(diff, "__proto__")).toBe(true);
    expect(diff).toEqual(JSON.parse('{"custom":"x","__proto__":{"polluted":true}}'));
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("JSON config storage codec", () => {
  const currentDefaultStr = JSON.stringify({ rules: { "no-debugger": ["error"], "no-eval": ["warn"] } });

  it("encodes a modified config as an object V1 envelope", () => {
    const value = JSON.stringify({ rules: { "no-debugger": ["off"], "no-eval": ["warn"] } });

    expect(encodeJsonConfig(currentDefaultStr, value)).toEqual<StoredJsonOverridesV1>({
      format: "scriptcat-json-overrides",
      version: 1,
      overrides: { rules: { "no-debugger": ["off"] } },
    });
  });

  it("returns undefined when the complete config equals current defaults", () => {
    expect(encodeJsonConfig(currentDefaultStr, JSON.stringify(JSON.parse(currentDefaultStr)))).toBeUndefined();
  });

  it("decodes a V1 envelope by merging overrides into current defaults", () => {
    const stored: StoredJsonOverridesV1 = {
      format: "scriptcat-json-overrides",
      version: 1,
      overrides: { rules: { "no-debugger": ["off"] } },
    };

    expect(JSON.parse(decodeJsonConfig(currentDefaultStr, stored))).toEqual({
      rules: { "no-debugger": ["off"], "no-eval": ["warn"] },
    });
  });

  it("uses a newer current default for fields without an override", () => {
    const stored: StoredJsonOverridesV1 = {
      format: "scriptcat-json-overrides",
      version: 1,
      overrides: { a: 9 },
    };

    expect(JSON.parse(decodeJsonConfig(JSON.stringify({ a: 2, b: 3, newField: true }), stored))).toEqual({
      a: 9,
      b: 3,
      newField: true,
    });
  });

  it("rejects an unsupported ScriptCat storage version", () => {
    expect(() =>
      decodeJsonConfig(currentDefaultStr, {
        format: "scriptcat-json-overrides",
        version: 2,
        overrides: {},
      })
    ).toThrow("Unsupported JSON config storage version: 2");
  });

  it("rejects malformed object storage representations", () => {
    expect(() => decodeJsonConfig(currentDefaultStr, { rules: {} })).toThrow("Invalid JSON config storage envelope");
    expect(() => decodeJsonConfig(currentDefaultStr, { format: "scriptcat-json-overrides", version: 1 })).toThrow(
      "Invalid JSON config storage envelope"
    );
  });

  it("preserves every field in a legacy full JSON string", () => {
    const current = JSON.stringify({ a: 2, b: 1, newField: true });
    const legacy = JSON.stringify({ a: 1, b: 2 });

    expect(JSON.parse(decodeJsonConfig(current, legacy))).toEqual({ a: 1, b: 2, newField: true });
  });

  it("does not infer historical defaults from a legacy full JSON string", () => {
    const current = JSON.stringify({ a: 2, b: 1 });
    const legacy = JSON.stringify({ a: 1, b: 2 });

    expect(JSON.parse(decodeJsonConfig(current, legacy))).not.toEqual({ a: 2, b: 2 });
  });

  it("adds current-only fields to a legacy full JSON string", () => {
    expect(JSON.parse(decodeJsonConfig(JSON.stringify({ a: 2, newField: true }), JSON.stringify({ a: 1 })))).toEqual({
      a: 1,
      newField: true,
    });
  });

  it("preserves custom legacy keys", () => {
    expect(JSON.parse(decodeJsonConfig(JSON.stringify({ a: 2 }), JSON.stringify({ a: 1, custom: "x" })))).toEqual({
      a: 1,
      custom: "x",
    });
  });

  it("treats format-like fields inside legacy strings as user config", () => {
    const legacy = JSON.stringify({
      a: 1,
      format: "scriptcat-json-overrides",
      version: 1,
      overrides: { a: 99 },
    });

    expect(JSON.parse(decodeJsonConfig(JSON.stringify({ a: 2 }), legacy))).toEqual({
      a: 1,
      format: "scriptcat-json-overrides",
      version: 1,
      overrides: { a: 99 },
    });
  });

  it("preserves legacy arrays and scalar/object replacements", () => {
    const current = JSON.stringify({ a: { x: 1 }, b: [1], c: 1 });
    const legacy = JSON.stringify({ a: false, b: [2], c: { x: 2 } });

    expect(JSON.parse(decodeJsonConfig(current, legacy))).toEqual({ a: false, b: [2], c: { x: 2 } });
  });
});
