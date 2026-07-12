import { describe, it, expect } from "vitest";
import { buildSourceResourceUri, parseSourceResourceUri, SOURCE_RESOURCE_URI_TEMPLATE } from "./resources";

describe("buildSourceResourceUri / parseSourceResourceUri（doc 03 §5）", () => {
  const uuid = "00000000-0000-4000-8000-000000000000";

  it("build 与 parse 互为逆运算", () => {
    const uri = buildSourceResourceUri(uuid);
    expect(uri).toBe(`scriptcat://scripts/${uuid}/source`);
    expect(parseSourceResourceUri(uri)).toBe(uuid);
  });

  it("不匹配模板的 URI 返回 undefined", () => {
    expect(parseSourceResourceUri("scriptcat://scripts/not-a-uuid/source")).toBeUndefined();
    expect(parseSourceResourceUri("https://example.com")).toBeUndefined();
    expect(parseSourceResourceUri(`scriptcat://scripts/${uuid}/metadata`)).toBeUndefined();
  });

  it("URI 模板常量与实际格式一致", () => {
    expect(SOURCE_RESOURCE_URI_TEMPLATE).toBe("scriptcat://scripts/{uuid}/source");
  });
});
