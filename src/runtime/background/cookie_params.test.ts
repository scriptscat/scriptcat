import { cookieParams } from "./cookie_params";

// 用于模拟 Firefox 环境的辅助函数
const mockFirefox = () => {
  (globalThis as any).mozInnerScreenX = 0;
};

const mockNonFirefox = () => {
  delete (globalThis as any).mozInnerScreenX;
};

describe("cookieParams", () => {

  afterEach(() => {
    mockNonFirefox();
  });

  describe("undefined 过滤", () => {
    it("从参数中移除 undefined 值", () => {
      const result = cookieParams({ domain: "example.com", name: undefined });
      expect(result).toEqual({ domain: "example.com" });
    });

    it("保留 null 和 false 值", () => {
      const result = cookieParams({ domain: null, secure: false, name: undefined });
      expect(result).toEqual({ domain: null, secure: false });
    });

    it("保留空字符串值", () => {
      const result = cookieParams({ domain: "", name: "test" });
      expect(result).toEqual({ domain: "", name: "test" });
    });

    it("当所有值都是 undefined 时返回空对象", () => {
      const result = cookieParams({ domain: undefined, name: undefined });
      expect(result).toEqual({});
    });
  });

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

  describe("Firefox：注入 firstPartyDomain", () => {
    it("在 Firefox 中注入 firstPartyDomain: null（情况1）", () => {
      mockFirefox();
      const result = cookieParams({ domain: "example.com" });
      expect(result).toEqual({ domain: "example.com", firstPartyDomain: null });
    });

    it("在 Firefox 中注入 firstPartyDomain: null（情况2）", () => {
      mockFirefox();
      const result = cookieParams({ url: "https://example.com" });
      expect(result).toEqual({ url: "https://example.com", firstPartyDomain: null });
    });

    it("在 Firefox 中覆盖已有的 firstPartyDomain（情况1）", () => {
      mockFirefox();
      const result = cookieParams({ domain: "example.com", firstPartyDomain: "other.com" });
      expect(result.firstPartyDomain).toBeNull();
    });

    it("在 Firefox 中覆盖已有的 firstPartyDomain（情况2）", () => {
      mockFirefox();
      const result = cookieParams({ url: "https://example.com", firstPartyDomain: "other.com" });
      expect(result.firstPartyDomain).toBeNull();
    });

    it("在非 Firefox 环境下不注入 firstPartyDomain（情况1）", () => {
      mockNonFirefox();
      const result = cookieParams({ domain: "example.com" });
      expect(result).not.toHaveProperty("firstPartyDomain");
    });

    it("在非 Firefox 环境下不注入 firstPartyDomain（情况2）", () => {
      mockNonFirefox();
      const result = cookieParams({ url: "https://example.com" });
      expect(result).not.toHaveProperty("firstPartyDomain");
    });
  });

  describe("真实 GM_cookie 使用场景", () => {
    it("处理带有可选字段的列表查询", () => {
      const result = cookieParams({
        domain: "example.com",
        name: undefined,
        path: undefined,
        secure: true,
        session: undefined,
        url: undefined,
        storeId: undefined,
      });
      expect(result).toEqual({ domain: "example.com", secure: true });
    });

    it("处理删除查询", () => {
      const result = cookieParams({
        name: "session",
        url: "https://example.com",
        storeId: undefined,
      });
      expect(result).toEqual({ name: "session", url: "https://example.com" });
    });
  });

});
