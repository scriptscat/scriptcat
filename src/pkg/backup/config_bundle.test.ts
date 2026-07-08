import { describe, expect, it } from "vitest";
import { pickBundleKeys, toBundleConfig } from "./config_bundle";

describe("config bundle", () => {
  it("pickBundleKeys 过滤掉 undefined 值并保留其余键值", () => {
    expect(pickBundleKeys({ a: 1, b: undefined, c: "x" })).toEqual({ a: 1, c: "x" });
  });
  it("pickBundleKeys 保留 null / false / 0 / 空串等有效值", () => {
    expect(pickBundleKeys({ a: null, b: false, c: 0, d: "" })).toEqual({ a: null, b: false, c: 0, d: "" });
  });
  it("toBundleConfig 排除云同步凭据键(cloud_sync/backup/cat_file_storage)", () => {
    expect(
      toBundleConfig({ language: "zh-CN", cloud_sync: { p: 1 }, backup: { p: 2 }, cat_file_storage: { p: 3 } })
    ).toEqual({ language: "zh-CN" });
  });
});
