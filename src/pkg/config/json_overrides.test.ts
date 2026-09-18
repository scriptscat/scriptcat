import { describe, expect, it } from "vitest";
import { decodeJsonConfig, deepMerge, deepDiff, mergeJsonConfig, diffJsonConfig } from "./json_overrides";

describe("deepMerge 深度合并", () => {
  it("应以覆盖值优先合并嵌套对象", () => {
    const defaults = { a: 1, nested: { x: 1, y: 2 } };
    const overrides = { nested: { y: 3 } };
    expect(deepMerge(defaults, overrides)).toEqual({ a: 1, nested: { x: 1, y: 3 } });
  });

  it("数组应整体替换而非合并", () => {
    const defaults = { rule: ["error", { allow: true }] };
    const overrides = { rule: ["warn"] };
    expect(deepMerge(defaults, overrides)).toEqual({ rule: ["warn"] });
  });

  it("覆盖配置独有的键应保留", () => {
    expect(deepMerge({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
  });

  it("类型不同时应使用覆盖值", () => {
    expect(deepMerge({ a: { x: 1 } }, { a: false })).toEqual({ a: false });
  });
});

describe("deepDiff 稀疏差异", () => {
  it("与默认值一致时应返回 undefined", () => {
    const defaults = { a: 1, nested: { x: [1, 2], y: { z: true } } };
    expect(deepDiff(structuredClone(defaults), defaults)).toBeUndefined();
  });

  it("应只保留与默认值不同的部分", () => {
    const defaults = { a: 1, nested: { x: 1, y: 2 } };
    const value = { a: 1, nested: { x: 1, y: 3 } };
    expect(deepDiff(value, defaults)).toEqual({ nested: { y: 3 } });
  });

  it("深度相等的数组应被去除", () => {
    const defaults = { rule: ["error", { allow: true }], other: 1 };
    const value = { rule: ["error", { allow: true }], other: 2 };
    expect(deepDiff(value, defaults)).toEqual({ other: 2 });
  });

  it("用户新增的键应保留", () => {
    expect(deepDiff({ a: 1, custom: "x" }, { a: 1 })).toEqual({ custom: "x" });
  });

  it("__proto__ 键应作为普通 JSON 属性参与差异计算", () => {
    const value = JSON.parse('{"__proto__":{"polluted":true}}');

    expect(deepDiff(value, {})).toEqual(value);
    expect(deepMerge({}, value)).toEqual(value);
  });
});

describe("JSON 配置字符串编解码", () => {
  const defaultStr = JSON.stringify({ rules: { "no-debugger": ["error"], "no-eval": ["warn"] } });

  it("diffJsonConfig 应只保留差异，无差异时返回 undefined", () => {
    expect(diffJsonConfig(defaultStr, defaultStr)).toBeUndefined();
    const user = JSON.stringify({ rules: { "no-debugger": ["warn"], "no-eval": ["warn"] } });
    expect(JSON.parse(diffJsonConfig(defaultStr, user)!)).toEqual({
      format: "scriptcat-json-overrides",
      version: 1,
      overrides: { rules: { "no-debugger": ["warn"] } },
    });
  });

  it("mergeJsonConfig 应将用户差异合并到最新默认配置", () => {
    const stored = JSON.stringify({ rules: { "no-debugger": ["warn"] } });
    expect(JSON.parse(mergeJsonConfig(defaultStr, stored))).toEqual({
      rules: { "no-debugger": ["warn"], "no-eval": ["warn"] },
    });
  });

  it("合并 diff 结果应还原用户配置", () => {
    const user = JSON.stringify({ rules: { "no-debugger": ["off"], "custom/rule": ["error"], "no-eval": ["warn"] } });
    const diff = diffJsonConfig(defaultStr, user)!;
    expect(JSON.parse(mergeJsonConfig(defaultStr, diff))).toEqual(JSON.parse(user));
  });

  it("旧版全量配置迁移时应按旧默认值提取差异", () => {
    const legacyDefault = JSON.stringify({ a: 1, b: 1 });
    const currentDefault = JSON.stringify({ a: 3, b: 1 });
    const legacyValue = JSON.stringify({ a: 1, b: 2 });

    const decoded = decodeJsonConfig(currentDefault, legacyDefault, legacyValue);

    expect(JSON.parse(decoded.value)).toEqual({ a: 3, b: 2 });
    expect(JSON.parse(decoded.migration!.value!)).toEqual({
      format: "scriptcat-json-overrides",
      version: 1,
      overrides: { b: 2 },
    });
  });

  it("旧版配置中的 format 键不应被当作稀疏存储 envelope", () => {
    const decoded = decodeJsonConfig(
      JSON.stringify({ a: 2 }),
      JSON.stringify({ a: 1 }),
      JSON.stringify({ a: 1, format: "scriptcat-json-overrides" })
    );

    expect(JSON.parse(decoded.value)).toEqual({ a: 2, format: "scriptcat-json-overrides" });
  });

  it("未知的稀疏格式版本应拒绝解码", () => {
    expect(() =>
      mergeJsonConfig(
        defaultStr,
        JSON.stringify({
          format: "scriptcat-json-overrides",
          version: 2,
          overrides: {},
        })
      )
    ).toThrow("Unsupported JSON config storage version: 2");
  });
});
