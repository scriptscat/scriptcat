import { cookieParams } from "./cookie_params";

describe("buildCookieFilter", () => {
  it("过滤掉 undefined 属性", () => {
    const result = cookieParams({
      url: "https://example.com",
      domain: undefined,
      name: undefined,
      path: "/",
      secure: undefined,
    });
    expect(result).toEqual({ url: "https://example.com", path: "/" });
    expect("domain" in result).toBe(false);
    expect("name" in result).toBe(false);
    expect("secure" in result).toBe(false);
  });

  it("保留所有非 undefined 的属性（包括 null 和 false）", () => {
    const result = cookieParams({
      url: "https://example.com",
      secure: false,
      session: false,
      storeId: null as unknown as string,
    });
    expect(result).toEqual({
      url: "https://example.com",
      secure: false,
      session: false,
      storeId: null,
    });
  });

  it("Firefox 下添加 firstPartyDomain: null", () => {
    // 模拟 Firefox 环境
    (globalThis as any).mozInnerScreenX = 0;
    try {
      const result = cookieParams({ url: "https://example.com" });
      expect(result).toEqual({
        url: "https://example.com",
        firstPartyDomain: null,
      });
    } finally {
      delete (globalThis as any).mozInnerScreenX;
    }
  });

  it("非 Firefox 下不添加 firstPartyDomain", () => {
    const result = cookieParams({ url: "https://example.com" });
    expect("firstPartyDomain" in result).toBe(false);
  });
});
