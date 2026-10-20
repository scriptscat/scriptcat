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
  it("tag 的合并/替换语义与 match 一致", () => {
    const m: SCMetadata = { tag: ["orig"] };
    expect(overrideToSelfMetadata({ use_tags: ["te", "tag"], merge_tags: true }, m).tag).toEqual(["orig", "te", "tag"]);
    expect(overrideToSelfMetadata({ use_tags: ["only"], merge_tags: false }, m).tag).toEqual(["only"]);
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
  it("excludeMatch/origExcludeMatch 与 exclude/origExclude 各自独立归一", () => {
    const ov = vmCustomToOverride({ exclude: ["a"], excludeMatch: ["b"], origExclude: false, origExcludeMatch: true });
    expect(ov.use_excludes).toEqual(["a"]);
    expect(ov.merge_excludes).toBe(false);
    expect(ov.use_exclude_matches).toEqual(["b"]);
    expect(ov.merge_exclude_matches).toBe(true);
  });
  it("VM 关掉脚本自带 @exclude-match 时导入后以用户列表替换，不复活作者规则", () => {
    const m: SCMetadata = { exclude: ["https://a.com/x"], "exclude-match": ["*://a.com/admin/*"] };
    const self = overrideToSelfMetadata(vmCustomToOverride({ excludeMatch: [], origExcludeMatch: false }), m);
    expect(self["exclude-match"]).toEqual([]);
    expect(self.exclude).toBeUndefined();
  });
  it("把 VM custom 的 tag/origTag 归一到 override", () => {
    const ov = vmCustomToOverride({ tag: ["te", "tag"], origTag: true });
    expect(ov.use_tags).toEqual(["te", "tag"]);
    expect(ov.merge_tags).toBe(true);
    expect(vmCustomToOverride({ tag: ["x"], origTag: false }).merge_tags).toBe(false);
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
