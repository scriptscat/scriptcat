import { extractFaviconsDomain } from "@App/pages/store/favicons";
import { describe, it, expect } from "vitest";

describe("extractFaviconsDomain", () => {
  it("应该正确提取各种URL模式的域名", () => {
    const result = extractFaviconsDomain(
      [
        "https://example.com/*", // 基本的match模式
        "https://*.sub.com/*", // 通配符域名模式 -> sub.com
        "https://a.*.domain.com/*", // 多个通配符 -> domain.com
        "https://.site.com/*", // 以点开头的域名 -> site.com
        "https://web.cn*/*", // 以通配符结尾的域名 -> web.cn
        "*://test.com/*", // 通配符协议
        "https://sub.domain.com/*", // 子域名
        "https://host.com:8080/*", // 带端口号
        "simple.com", // 纯域名字符串
        "invalid-pattern", // 无效的模式
      ],
      []
    );

    expect(result).toHaveLength(10);
    expect(result[0]).toEqual({ match: "https://example.com/*", domain: "example.com" });
    expect(result[1]).toEqual({ match: "https://*.sub.com/*", domain: "sub.com" });
    expect(result[2]).toEqual({ match: "https://a.*.domain.com/*", domain: "domain.com" });
    expect(result[3]).toEqual({ match: "https://.site.com/*", domain: "site.com" });
    expect(result[4]).toEqual({ match: "https://web.cn*/*", domain: "web.cn" });
    expect(result[5]).toEqual({ match: "*://test.com/*", domain: "test.com" });
    expect(result[6]).toEqual({ match: "https://sub.domain.com/*", domain: "sub.domain.com" });
    expect(result[7]).toEqual({ match: "https://host.com:8080/*", domain: "host.com:8080" });
    expect(result[8]).toEqual({ match: "simple.com", domain: "simple.com" });
    expect(result[9]).toEqual({ match: "invalid-pattern", domain: "" });

    // 同时处理match和include规则
    const result2 = extractFaviconsDomain(["https://match.com/*"], ["https://include.com/*"]);
    expect(result2).toHaveLength(2);
    expect(result2[0]).toEqual({ match: "https://match.com/*", domain: "match.com" });
    expect(result2[1]).toEqual({ match: "https://include.com/*", domain: "include.com" });

    // 空数组和默认参数
    expect(extractFaviconsDomain([], [])).toEqual([]);
    expect(extractFaviconsDomain()).toEqual([]);
  });
});
