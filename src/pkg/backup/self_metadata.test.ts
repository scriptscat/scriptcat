import { describe, expect, it } from "vitest";
import { overrideToSelfMetadata, vmCustomToOverride, vmValueUri, encodeVmFilename } from "./self_metadata";
import type { SCMetadata } from "@App/app/repo/metadata";

const meta: SCMetadata = { match: ["https://example.com/*"], exclude: ["https://example.com/admin/*"] };

describe("overrideToSelfMetadata", () => {
  it("merge=true 且 use 非空时合并脚本自带与用户新增", () => {
    const self = overrideToSelfMetadata(
      { use_excludes: ["https://example.com/private/*"], merge_excludes: true },
      meta
    );
    expect(self.exclude).toEqual(["https://example.com/admin/*", "https://example.com/private/*"]);
    expect(self.match).toBeUndefined();
  });
  it("merge=false 时用用户列表替换脚本自带", () => {
    const self = overrideToSelfMetadata({ use_matches: ["https://only.here/*"], merge_matches: false }, meta);
    expect(self.match).toEqual(["https://only.here/*"]);
  });
  it("use 为空且 merge=true 时不产生该键", () => {
    const self = overrideToSelfMetadata({ use_matches: [], merge_matches: true }, meta);
    expect(self.match).toBeUndefined();
  });
  it("映射 run-at 与 noframes", () => {
    const self = overrideToSelfMetadata({ run_at: "document-start", noframes: true }, meta);
    expect(self["run-at"]).toEqual(["document-start"]);
    expect(self.noframes).toEqual([""]);
  });
});

describe("vmCustomToOverride", () => {
  it("把 VM custom 的 exclude/origExclude 归一到 override", () => {
    const ov = vmCustomToOverride({
      exclude: ["https://example.com/private/*"],
      origExclude: true,
      runAt: "document-start",
    });
    expect(ov.use_excludes).toEqual(["https://example.com/private/*"]);
    expect(ov.merge_excludes).toBe(true);
    expect(ov.run_at).toBe("document-start");
  });
  it("excludeMatch 折入 exclude", () => {
    const ov = vmCustomToOverride({ exclude: ["a"], excludeMatch: ["b"], origExclude: false, origExcludeMatch: true });
    expect(ov.use_excludes).toEqual(["a", "b"]);
    expect(ov.merge_excludes).toBe(false); // origExclude=false → 不再合并
  });
});

describe("vmValueUri", () => {
  it("按 encodeFilename 规则编码 namespace+name（与真实 VM 键一致）", () => {
    expect(vmValueUri("http://tampermonkey.net/", "Example Color Highlighter")).toBe(
      "http-3a-2f-2ftampermonkey.net-2f-0aExample-20Color-20Highlighter-0a"
    );
    expect(encodeVmFilename(":/ \n")).toBe("-3a-2f-20-0a");
  });
});
