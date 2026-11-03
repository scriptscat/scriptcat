import { describe, expect, it } from "vitest";
import { DocumentationSite } from "@App/app/const";
import { getIncompleteContextFallbackUrl } from "./context_fallback";

describe("getIncompleteContextFallbackUrl", () => {
  it("扩展 API 不完整的 ?url= 安装页转到文档站安装中间页，脚本地址原样带上（含其自身的查询串）", () => {
    const scriptUrl = "https://example.com/a.user.js?v=1&lang=zh";
    expect(getIncompleteContextFallbackUrl(`?url=${scriptUrl}`, false)).toBe(
      `${DocumentationSite}/docs/script_installation/#url=${scriptUrl}`
    );
  });

  it("扩展 API 完整时不转跳，正常浏览器照常在本页安装", () => {
    expect(getIncompleteContextFallbackUrl("?url=https://example.com/a.user.js", true)).toBeUndefined();
  });

  it("没有 ?url= 的入口（如 SW 新建的 ?uuid=）不转跳", () => {
    expect(getIncompleteContextFallbackUrl("?uuid=8f3c2a10-0000-4000-8000-000000000000", false)).toBeUndefined();
  });
});
