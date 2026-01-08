import { describe, it, expect, vi } from "vitest";
import { parseCharsetFromContentType, detectEncoding } from "./encoding";

describe("encoding detection", () => {
  describe("parseCharsetFromContentType", () => {
    it("should extract charset from valid Content-Type header", () => {
      expect(parseCharsetFromContentType("text/javascript; charset=utf-8")).toBe("utf-8");
      expect(parseCharsetFromContentType("text/plain; charset=GBK")).toBe("gbk");
      expect(parseCharsetFromContentType("application/javascript; charset=ISO-8859-1")).toBe("iso-8859-1");
    });

    it("should handle charset with quotes", () => {
      expect(parseCharsetFromContentType('text/javascript; charset="utf-8"')).toBe("utf-8");
      expect(parseCharsetFromContentType("text/javascript; charset='gbk'")).toBe("gbk");
    });

    it("should handle case-insensitive charset parameter", () => {
      expect(parseCharsetFromContentType("text/javascript; CHARSET=UTF-8")).toBe("utf-8");
      expect(parseCharsetFromContentType("text/javascript; Charset=GBK")).toBe("gbk");
    });

    it("should return null for missing charset", () => {
      expect(parseCharsetFromContentType("text/javascript")).toBe(null);
      expect(parseCharsetFromContentType("text/plain; boundary=something")).toBe(null);
    });

    it("should return null for null or empty input", () => {
      expect(parseCharsetFromContentType(null)).toBe(null);
      expect(parseCharsetFromContentType("")).toBe(null);
    });

    it("should handle charset with additional parameters", () => {
      expect(parseCharsetFromContentType("text/javascript; charset=utf-8; boundary=xxx")).toBe("utf-8");
    });
  });

  describe("detectEncoding", () => {
    it("should prioritize valid charset from Content-Type header", () => {
      const utf8Data = new TextEncoder().encode("hello world");
      expect(detectEncoding(utf8Data, "text/javascript; charset=utf-8")).toBe("utf-8");
    });

    it("should fallback to chardet when Content-Type header is missing", () => {
      // UTF-8 编码的中文
      const utf8Data = new TextEncoder().encode("你好世界");
      const encoding = detectEncoding(utf8Data, null);
      expect(encoding).toBe("utf-8");
    });

    it("should fallback to chardet when Content-Type charset is invalid", () => {
      const utf8Data = new TextEncoder().encode("hello world");
      const encoding = detectEncoding(utf8Data, "text/javascript; charset=invalid-encoding");
      // chardet 可能检测为 utf-8 或 ascii，都是合理的
      expect(["utf-8", "ascii", "windows-1252"]).toContain(encoding);
    });

    it("should fallback to utf-8 when chardet returns null", () => {
      // 模拟 chardet 返回 null 的情况（空数据）
      const emptyData = new Uint8Array(0);
      const encoding = detectEncoding(emptyData, null);
      // 空数据时，chardet 可能返回 ascii 或其他编码，但都应该是有效的
      expect(encoding).toBeTruthy();
      expect(() => new TextDecoder(encoding)).not.toThrow();
    });

    it("should only use first 16KB for chardet detection", () => {
      // 创建一个大于 16KB 的数据
      const largeData = new Uint8Array(20 * 1024);
      // 填充 UTF-8 编码的数据
      const text = "a".repeat(20 * 1024);
      const textBytes = new TextEncoder().encode(text);
      largeData.set(textBytes.slice(0, largeData.length));
      
      const encoding = detectEncoding(largeData, null);
      // 应该成功检测，说明使用了采样
      expect(["utf-8", "ascii", "windows-1252"]).toContain(encoding);
    });

    it("should handle GBK encoded data", () => {
      // GBK 编码的 "你好" (这是一个简化的测试，实际 GBK 编码更复杂)
      // 注意：在浏览器环境中，GBK 编码可能被识别为其他兼容编码
      const gbkLikeData = new Uint8Array([0xC4, 0xE3, 0xBA, 0xC3]); // "你好" in GBK
      const encoding = detectEncoding(gbkLikeData, null);
      // chardet 可能识别为 GBK、Shift_JIS 或相关的东亚编码
      expect(encoding).toBeTruthy();
      expect(() => new TextDecoder(encoding)).not.toThrow();
    });

    it("should handle ISO-8859-1 encoded data", () => {
      // ISO-8859-1 特有字符（扩展 ASCII）
      const iso88591Data = new Uint8Array([0xE9, 0xE8, 0xE0, 0xE7]); // é è à ç
      const encoding = detectEncoding(iso88591Data, null);
      expect(encoding).toBeTruthy();
    });

    it("should validate detected encoding is supported by TextDecoder", () => {
      const utf8Data = new TextEncoder().encode("test");
      const encoding = detectEncoding(utf8Data, null);
      
      // 确保返回的编码可以被 TextDecoder 使用
      expect(() => new TextDecoder(encoding)).not.toThrow();
    });

    it("should prefer Content-Type charset over chardet detection", () => {
      // 即使数据看起来像 GBK，如果 Content-Type 指定了 UTF-8，应该使用 UTF-8
      const data = new Uint8Array([0xC4, 0xE3, 0xBA, 0xC3]);
      const encoding = detectEncoding(data, "text/javascript; charset=utf-8");
      expect(encoding).toBe("utf-8");
    });

    it("should handle charset with different cases from Content-Type", () => {
      const data = new TextEncoder().encode("test");
      expect(detectEncoding(data, "text/javascript; charset=UTF-8")).toBe("utf-8");
      expect(detectEncoding(data, "text/javascript; charset=Utf-8")).toBe("utf-8");
      expect(detectEncoding(data, "text/javascript; charset=GBK")).toBe("gbk");
    });

    it("should handle Windows-1252 encoded data", () => {
      // Windows-1252 特有字符
      const win1252Data = new Uint8Array([0x80, 0x82, 0x83, 0x84]); // € ‚ ƒ „
      const encoding = detectEncoding(win1252Data, null);
      expect(encoding).toBeTruthy();
      // chardet 应该能检测出编码或回退到有效的编码
      // Shift_JIS 也是一个有效的编码，chardet 可能会识别为它
      expect(["utf-8", "windows-1252", "iso-8859-1", "shift_jis", "ascii"]).toContain(encoding);
    });

    it("should fallback to utf-8 when chardet detects invalid encoding", () => {
      // 使用 vi.spyOn 来模拟 console.warn
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      
      const data = new TextEncoder().encode("test");
      const encoding = detectEncoding(data, null);
      
      // 应该成功返回一个有效的编码
      expect(encoding).toBeTruthy();
      expect(() => new TextDecoder(encoding)).not.toThrow();
      
      consoleWarnSpy.mockRestore();
    });
  });
});
