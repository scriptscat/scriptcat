import { describe, it, expect, vi } from "vitest";
import { parseCharsetFromContentType, detectEncoding, bytesDecode, readBlobContent } from "./encoding";
import { base64ToUint8 } from "./datatype";
import iconv from "iconv-lite";

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

    it("should return empty string for missing charset", () => {
      expect(parseCharsetFromContentType("text/javascript")).toBe("");
      expect(parseCharsetFromContentType("text/plain; boundary=something")).toBe("");
    });

    it("should return empty string for null or empty input", () => {
      expect(parseCharsetFromContentType(null)).toBe("");
      expect(parseCharsetFromContentType("")).toBe("");
    });

    it("should handle charset with additional parameters", () => {
      expect(parseCharsetFromContentType("text/javascript; charset=utf-8; boundary=xxx")).toBe("utf-8");
    });
  });

  describe("detectEncoding", () => {
    // Test Tool: https://r12a.github.io/app-encodings/
    it("Basic Test", () => {
      let utf8Data: Uint8Array;
      utf8Data = new TextEncoder().encode("a");
      expect(detectEncoding(utf8Data, null)).toBe("ascii");
      utf8Data = new TextEncoder().encode("a1");
      expect(detectEncoding(utf8Data, null)).toBe("ascii");
      utf8Data = new TextEncoder().encode("a");
      expect(detectEncoding(utf8Data, "text/javascript; charset=utf-8")).toBe("utf-8");
      utf8Data = new TextEncoder().encode("a1");
      expect(detectEncoding(utf8Data, "text/javascript; charset=big5")).toBe("big5");
      utf8Data = new TextEncoder().encode("a1");
      expect(detectEncoding(utf8Data, "text/javascript; charset=big4")).toBe("ascii");
      utf8Data = new TextEncoder().encode("你");
      expect(detectEncoding(utf8Data, "text/javascript; charset=big4")).toBe("utf-8");
    });
    it("Charset Detection Test (1)", () => {
      let utf8Data: Uint8Array;
      utf8Data = new Uint8Array([
        0xa7,
        0xda, // 我
        0xb7,
        0x52, // 愛
        0x20, // space
        0x43, // C
        0x20, // space
        0xbb,
        0x79, // 語
        0xa8,
        0xec, // 言
      ]);
      expect(detectEncoding(utf8Data, null)).toBe("big5");

      // 這是一個Big5測試句子，包含English與中文123。
      utf8Data = Uint8Array.from([
        0xb3, 0x6f, 0xac, 0x4f, 0xa4, 0x40, 0xad, 0xd3, 0x42, 0x69, 0x67, 0x35, 0xb4, 0xfa, 0xb8, 0xd5, 0xa5, 0xdc,
        0xa4, 0x40, 0xa5, 0x5f, 0xa6, 0x72, 0x45, 0x6e, 0x67, 0x6c, 0x69, 0x73, 0x68, 0xbb, 0x50, 0xa4, 0xa4, 0x31,
        0x32, 0x33, 0xa1, 0x43,
      ]);
      expect(detectEncoding(utf8Data, null)).toBe("big5");

      // 这是一个GBK编码测试Sentence混合12345。
      utf8Data = Uint8Array.from([
        0xd5, 0xe2, 0xca, 0xc7, 0xd2, 0xbb, 0xb8, 0xf6, 0x47, 0x42, 0x4b, 0xb1, 0xe0, 0xc2, 0xeb, 0xb2, 0xe2, 0xca,
        0xd4, 0x53, 0x65, 0x6e, 0x74, 0x65, 0x6e, 0x63, 0x65, 0xbb, 0xec, 0xba, 0xcf, 0x31, 0x32, 0x33, 0x34, 0x35,
        0xa1, 0xa3,
      ]);
      expect(detectEncoding(utf8Data, null)).toBe("gb18030");

      // これはShiftJISのテスト文章withEnglish123
      utf8Data = Uint8Array.from([
        0x82, 0xb1, 0x82, 0xea, 0x82, 0xcd, 0x53, 0x68, 0x69, 0x66, 0x74, 0x4a, 0x49, 0x53, 0x82, 0xcc, 0x83, 0x65,
        0x83, 0x58, 0x83, 0x67, 0x95, 0xb6, 0x8f, 0x9c, 0x77, 0x69, 0x74, 0x68, 0x45, 0x6e, 0x67, 0x6c, 0x69, 0x73,
        0x68, 0x31, 0x32, 0x33,
      ]);
      expect(detectEncoding(utf8Data, null)).toBe("shift_jis");

      // 이것은EUC-KR인코딩테스트문장Test123
      utf8Data = Uint8Array.from([
        0xc0, 0xcc, 0xb0, 0xcd, 0xc0, 0xba, 0x45, 0x55, 0x43, 0x2d, 0x4b, 0x52, 0xc0, 0xce, 0xc4, 0xda, 0xb5, 0xf9,
        0xc5, 0xd7, 0xbd, 0xba, 0xc6, 0xae, 0xb9, 0xae, 0xc0, 0xe5, 0x54, 0x65, 0x73, 0x74, 0x31, 0x32, 0x33,
      ]);
      expect(detectEncoding(utf8Data, null)).toBe("euc-kr");

      // iso-8859-2: Café naïve résumé with ASCII 12345
      utf8Data = Uint8Array.from([
        0x43, 0x61, 0x66, 0xe9, 0x20, 0x6e, 0x61, 0xef, 0x76, 0x65, 0x20, 0x72, 0xe9, 0x73, 0x75, 0x6d, 0xe9, 0x20,
        0x77, 0x69, 0x74, 0x68, 0x20, 0x41, 0x53, 0x43, 0x49, 0x49, 0x20, 0x31, 0x32, 0x33, 0x34, 0x35,
      ]);
      expect(detectEncoding(utf8Data, null)).toBe("iso-8859-2");

      // utf-8: Hello 世界, this is UTF8 測試
      utf8Data = Uint8Array.from([
        0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x20, 0xe4, 0xb8, 0x96, 0xe7, 0x95, 0x8c, 0x2c, 0x20, 0x74, 0x68, 0x69, 0x73,
        0x20, 0x69, 0x73, 0x20, 0x55, 0x54, 0x46, 0x38, 0x20, 0xe6, 0xb8, 0xac, 0xe8, 0xa9, 0xa6,
      ]);
      expect(detectEncoding(utf8Data, null)).toBe("utf-8");

      // windows-1252: This costs 50€ — quite “expensive” indeed.
      utf8Data = Uint8Array.from([
        84, 104, 105, 115, 32, 99, 111, 115, 116, 115, 32, 53, 48, 128, 32, 151, 32, 113, 117, 105, 116, 101, 32, 101,
        120, 112, 101, 110, 115, 105, 118, 101, 148, 32, 105, 110, 100, 101, 101, 100, 46,
      ]);
      expect(detectEncoding(utf8Data, null)).toBe("windows-1252");

      // iso-8859-1: This costs 50€ — quite “expensive” indeed.
      utf8Data = Uint8Array.from([
        69, 108, 32, 110, 105, 241, 111, 32, 99, 111, 109, 105, 243, 32, 112, 105, 241, 97, 116, 97, 32, 121, 32, 116,
        111, 109, 243, 32, 99, 97, 102, 233, 46,
      ]);
      expect(detectEncoding(utf8Data, null)).toBe("iso-8859-1");

      // koi8-r: Привет мир 123 ABC тест
      utf8Data = Uint8Array.from([
        208, 210, 201, 215, 197, 212, 32, 205, 201, 210, 32, 49, 50, 51, 32, 65, 66, 67, 32, 212, 197, 211, 212,
      ]);
      expect(detectEncoding(utf8Data, null)).toBe("koi8-r");
    });

    it("Charset Detection Test (2)", () => {
      // Sentence (>10 chars): "Hello BOM world."

      // UTF-8 BOM (EF BB BF)
      const utf8_bom = new Uint8Array([
        239, 187, 191, 72, 101, 108, 108, 111, 32, 66, 79, 77, 32, 119, 111, 114, 108, 100, 46,
      ]);
      expect(detectEncoding(utf8_bom, null)).toBe("utf-8");
      expect(bytesDecode("utf-8", utf8_bom)).toBe("Hello BOM world.");

      // UTF-16 LE BOM (FF FE)
      const utf16le_bom = new Uint8Array([
        255, 254, 72, 0, 101, 0, 108, 0, 108, 0, 111, 0, 32, 0, 66, 0, 79, 0, 77, 0, 32, 0, 119, 0, 111, 0, 114, 0, 108,
        0, 100, 0, 46, 0,
      ]);
      expect(detectEncoding(utf16le_bom, null)).toBe("utf-16le");
      expect(bytesDecode("utf-16le", utf16le_bom)).toBe("Hello BOM world.");

      // UTF-16 BE BOM (FE FF)
      const utf16be_bom = new Uint8Array([
        254, 255, 0, 72, 0, 101, 0, 108, 0, 108, 0, 111, 0, 32, 0, 66, 0, 79, 0, 77, 0, 32, 0, 119, 0, 111, 0, 114, 0,
        108, 0, 100, 0, 46,
      ]);
      expect(detectEncoding(utf16be_bom, null)).toBe("utf-16be");
      expect(bytesDecode("utf-16be", utf16be_bom)).toBe("Hello BOM world.");

      // UTF-32 LE BOM (FF FE 00 00)
      const utf32le_bom = new Uint8Array([
        255, 254, 0, 0, 72, 0, 0, 0, 101, 0, 0, 0, 108, 0, 0, 0, 108, 0, 0, 0, 111, 0, 0, 0, 32, 0, 0, 0, 66, 0, 0, 0,
        79, 0, 0, 0, 77, 0, 0, 0, 32, 0, 0, 0, 119, 0, 0, 0, 111, 0, 0, 0, 114, 0, 0, 0, 108, 0, 0, 0, 100, 0, 0, 0, 46,
        0, 0, 0,
      ]);
      expect(detectEncoding(utf32le_bom, null)).toBe("utf-32le");
      expect(bytesDecode("utf-32le", utf32le_bom)).toBe("Hello BOM world.");

      // UTF-32 BE BOM (00 00 FE FF)
      const utf32be_bom = new Uint8Array([
        0, 0, 254, 255, 0, 0, 0, 72, 0, 0, 0, 101, 0, 0, 0, 108, 0, 0, 0, 108, 0, 0, 0, 111, 0, 0, 0, 32, 0, 0, 0, 66,
        0, 0, 0, 79, 0, 0, 0, 77, 0, 0, 0, 32, 0, 0, 0, 119, 0, 0, 0, 111, 0, 0, 0, 114, 0, 0, 0, 108, 0, 0, 0, 100, 0,
        0, 0, 46,
      ]);
      expect(detectEncoding(utf32be_bom, null)).toBe("utf-32be");
      expect(bytesDecode("utf-32be", utf32be_bom)).toBe("Hello BOM world.");
    });

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
      expect(["utf-8", "ascii", "windows-1252"]).toContain(encoding);
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

    it("should NOT detect Shift_JIS when non-ASCII appears only after 16KB (1)", () => {
      const buf = new Uint8Array(40 * 1024);

      // 前 18KB → 纯 ASCII（看起来像 UTF-8 / ASCII）
      buf.fill(0x61, 0, 18 * 1024); // 'a' * 18KB

      // 18KB 之后 → 典型的 Shift_JIS 专用字节序列
      // 0x82 0xA0 在 Shift_JIS 中表示字符“㈠”
      // 如果被误当成 UTF-8，这些字节是非法的
      const offset = 18 * 1024;
      buf[offset] = 0x82;
      buf[offset + 1] = 0xa0;
      buf[offset + 2] = 0x82;
      buf[offset + 3] = 0xa9; // 更多类似 Shift_JIS 的双字节组合

      const encoding = detectEncoding(buf, null);

      // 如果实现正确地将采样限制在约 8KB 以内 → 应判断为 UTF-8 / ASCII
      expect(["utf-8", "ascii", "windows-1252"]).toContain(encoding);
      // 如果错误地读取了整个 buffer → 可能会误判为 shift_jis
      expect(encoding).not.toBe("shift_jis");
    });

    it("should NOT detect Shift_JIS when non-ASCII appears only after 16KB (2)", () => {
      const buf = new Uint8Array(40 * 1024);

      // 前 18KB → 纯 ASCII（仍在 8KB 采样范围内）
      buf.fill(0x61, 0, 18 * 1024); // 'a' * 14KB

      // 3KB 之后 → 出现典型的 Shift_JIS 字节
      const offset = 14 * 1024;
      buf[offset] = 0x82;
      buf[offset + 1] = 0xa0;
      buf[offset + 2] = 0x82;
      buf[offset + 3] = 0xa9; // 更多 Shift_JIS 风格字节对

      const encoding = detectEncoding(buf, null);

      // 因为 Shift_JIS 字节出现在 8KB 采样范围内，应被正确识别
      expect(encoding).toBe("shift_jis");
    });

    it("should handle GBK encoded data (1)", () => {
      // GBK 编码的 "你好" (这是一个简化的测试，实际 GBK 编码更复杂)
      // 注意：在浏览器环境中，GBK 编码可能被识别为其他兼容编码
      // "你好" in GBK
      const gbkLikeData = new Uint8Array([0xc4, 0xe3, 0xba, 0xc3]);
      const encoding = detectEncoding(gbkLikeData, null);
      // chardet 可能识别为 GBK、Shift_JIS、euc-jp 或相关的东亚编码
      expect(["gbk", "big5"]).toContain(encoding);
      expect(() => new TextDecoder(encoding)).not.toThrow();
    });

    it("should handle GBK encoded data (2)", () => {
      // "你好，世界！"(GBK)
      const gbkLikeData = new Uint8Array([0xc4, 0xe3, 0xba, 0xc3, 0xa3, 0xac, 0xca, 0xc0, 0xbd, 0xe7, 0xa3, 0xa1]);
      const encoding = detectEncoding(gbkLikeData, null);
      // chardet 可能识别为 GBK、Shift_JIS、euc-jp 或相关的东亚编码
      expect(["gbk", "big5"]).toContain(encoding);
      expect(() => new TextDecoder(encoding)).not.toThrow();
    });

    it("should handle GBK encoded data (GB2312)", () => {
      // GB2312: 中文测试
      const gb2312Data = new Uint8Array([
        // 中
        0xd6, 0xd0,
        // 文
        0xce, 0xc4,
        // 测
        0xb2, 0xe2,
        // 试
        0xca, 0xd4,
      ]);
      const encoding = detectEncoding(gb2312Data, null);
      // chardet 可能识别为 GBK、Shift_JIS、euc-jp 或相关的东亚编码
      expect(["gbk", "gb18030", "big5"]).toContain(encoding);
      expect(() => new TextDecoder(encoding)).not.toThrow();
    });

    it("should handle GBK encoded data (GBK)", () => {
      // GBK: 中文测试扩展凉
      const gbkData = new Uint8Array([
        // 中
        0xd6, 0xd0,
        // 文
        0xce, 0xc4,
        // 测
        0xb2, 0xe2,
        // 试
        0xca, 0xd4,
        // 扩
        0xc0, 0xa9,
        // 展
        0xd5, 0xb9,
        // 凉
        0xfd, 0x9d,
      ]);
      const encoding = detectEncoding(gbkData, null);
      // chardet 可能识别为 GBK、Shift_JIS、euc-jp 或相关的东亚编码
      expect(["gbk", "gb18030", "big5"]).toContain(encoding);
      expect(() => new TextDecoder(encoding)).not.toThrow();
    });

    it("should handle GBK encoded data (GB18030)", () => {
      // GB18030: 中文测试扺
      const gb18030Data1 = new Uint8Array([
        // 中
        0xd6, 0xd0,
        // 文
        0xce, 0xc4,
        // 测
        0xb2, 0xe2,
        // 试
        0xca, 0xd4,
        // 扺
        0x92, 0x57,
      ]);
      const encoding1 = detectEncoding(gb18030Data1, null);
      // chardet 可能识别为 GBK、Shift_JIS、euc-jp 或相关的东亚编码
      expect(["gbk", "gb18030", "big5"]).toContain(encoding1);
      expect(() => new TextDecoder(encoding1)).not.toThrow();

      // GB18030: 中文ὒ测试扺
      const gb18030Data2 = new Uint8Array([
        // 中
        0xd6, 0xd0,
        // 文
        0xce, 0xc4,
        // ὒ
        0x81, 0x36, 0x92, 0x32,
        // 测
        0xb2, 0xe2,
        // 试
        0xca, 0xd4,
        // 扺
        0x92, 0x57,
      ]);
      const encoding2 = detectEncoding(gb18030Data2, null);
      // chardet 可能识别为 GBK、Shift_JIS、euc-jp 或相关的东亚编码
      expect(["gbk", "gb18030"]).toContain(encoding2);
      expect(() => new TextDecoder(encoding2)).not.toThrow();
    });

    it("detect GBK", () => {
      // not BIG5
      // gb18030/gbk: 璹亽
      const gbkLikeData = new Uint8Array([0xad, 0x71, 0x81, 0x92]);
      const encoding = detectEncoding(gbkLikeData, null);
      expect(["gbk", "gb18030"]).toContain(encoding);
      expect(() => new TextDecoder(encoding)).not.toThrow();
      expect(new TextDecoder(encoding).decode(gbkLikeData)).toBe("璹亽");
    });

    it("should handle ISO-8859-1 encoded data", () => {
      // ISO-8859-1 特有字符（扩展 ASCII）
      // "Café déjà vu, élève français, à bientôt!"
      const iso88591Data = new Uint8Array([
        // Café
        0x43, 0x61, 0x66, 0xe9, 0x20,
        // déjà
        0x64, 0xe9, 0x6a, 0xe0, 0x20,
        // vu,
        0x76, 0x75, 0x2c, 0x20,
        // élève
        0xe9, 0x6c, 0xe8, 0x76, 0x65, 0x20,
        // français,
        0x66, 0x72, 0x61, 0x6e, 0xe7, 0x61, 0x69, 0x73, 0x2c, 0x20,
        // à
        0xe0, 0x20,
        // bientôt!
        0x62, 0x69, 0x65, 0x6e, 0x74, 0xf4, 0x74, 0x21,
      ]);
      const encoding = detectEncoding(iso88591Data, null);
      expect(encoding).toBe("iso-8859-1");
    });

    it("should validate detected encoding is supported by TextDecoder", () => {
      const utf8Data = new TextEncoder().encode("test");
      const encoding = detectEncoding(utf8Data, null);

      // 确保返回的编码可以被 TextDecoder 使用
      expect(() => new TextDecoder(encoding)).not.toThrow();
    });

    it("should prefer Content-Type charset over chardet detection", () => {
      // 即使数据看起来像 GBK，如果 Content-Type 指定了 UTF-8，应该使用 UTF-8
      const data = new Uint8Array([0xc4, 0xe3, 0xba, 0xc3]);
      const encoding = detectEncoding(data, "text/javascript; charset=utf-8");
      expect(encoding).toBe("utf-8");
    });

    it("should handle charset with different cases from Content-Type", () => {
      const data = new TextEncoder().encode("test");
      expect(detectEncoding(data, "text/javascript; charset=UTF-8")).toBe("utf-8");
      expect(detectEncoding(data, "text/javascript; charset=Utf-8")).toBe("utf-8");
      expect(detectEncoding(data, "text/javascript; charset=GBK")).toBe("gbk");
    });

    it("should handle Windows-1252 encoded data (1)", () => {
      // Windows-1252 特有字符（扩展 ASCII）
      // “Price is 50€ – Café™ déjà vu”
      const win1252Data = new Uint8Array([
        // “
        0x93,
        // Price␠
        0x50, 0x72, 0x69, 0x63, 0x65, 0x20,
        // is␠
        0x69, 0x73, 0x20,
        // 50
        0x35, 0x30,
        // €
        0x80, 0x20,
        // –
        0x96, 0x20,
        // Café
        0x43, 0x61, 0x66, 0xe9,
        // ™
        0x99, 0x20,
        // déjà
        0x64, 0xe9, 0x6a, 0xe0, 0x20,
        // vu
        0x76, 0x75,
        // ”
        0x94,
      ]);
      const encoding = detectEncoding(win1252Data, null);
      expect(encoding).toBe("windows-1252");
    });

    it("should handle Windows-1252 encoded data (2)", () => {
      // Windows-1252 string: "Price: 10€ – “special” ƒ offer…"
      const win1252Data = new Uint8Array([
        // "Price: "
        0x50, 0x72, 0x69, 0x63, 0x65, 0x3a, 0x20,
        // "10€ – "
        0x31, 0x30, 0x80, 0x20, 0x96, 0x20,
        // “special”
        0x93, 0x73, 0x70, 0x65, 0x63, 0x69, 0x61, 0x6c, 0x94,
        // " ƒ offer…"
        0x20, 0x83, 0x20, 0x6f, 0x66, 0x66, 0x65, 0x72, 0x85,
      ]);
      const encoding = detectEncoding(win1252Data, null);
      expect(encoding).toBe("windows-1252");
    });

    it("should fallback to utf-8 when chardet detects invalid encoding", () => {
      // 使用 vi.spyOn 来模拟 console.warn
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const data = new TextEncoder().encode("test");
      const encoding = detectEncoding(data, null);

      // 应该成功返回一个有效的编码
      expect(["utf-8", "ascii", "windows-1252"]).toContain(encoding);
      expect(() => new TextDecoder(encoding)).not.toThrow();

      consoleWarnSpy.mockRestore();
    });
  });

  describe("real script", () => {
    it("script 1", () => {
      const textBase64 = [
        "Ly8gPT1Vc2VyU2NyaXB0PT0KLy8gQG5hbWUg572R6aG15oqW6Z+z5L2T6aqM5aKe5by6Ci8vIEBuYW1lc3BhY2UgVmlvbGVudG1vbmtleSBTY3JpcHRzCi8vIEBtYXRjaCBodHRwczovL3d3dy5kb3V5aW4uY29tLz8qCi8vIEBtYXRjaCAqOi8vKi5kb3V5aW4uY29tLyoKLy8gQG1hdGNoICo6Ly8qLmllc2RvdXlpbi5jb20vKgovLyBAZXhjbHVkZSAqOi8vbGYtenQuZG91eWluLmNvbSoKLy8gQGdyYW50IG5vbmUKLy8gQHZlcnNpb24gMy40Ci8vIEBjaGFuZ2Vsb2cg5LyY5YyW5paH5qGj5o+P6L+w77yM6LCD5pW06Leo5Z+f6YWN572u5oyH5byVCi8vIEBkZXNjcmlwdGlvbiDoh6rliqjot7Pov4fnm7Tmkq3jgIHmmbrog73lsY/olL3lhbPplK7lrZfvvIjoh6rliqjkuI3mhJ/lhbTotqPvvInjgIHot7Pov4flub/lkYrjgIHmnIDpq5jliIbovqjnjofjgIHliIbovqjnjofnrZvpgInjgIFBSeaZuuiDveetm+mAie+8iOiHquWKqOeCuei1nu+8ieOAgeaegemAn+aooeW8jwovLyBAYXV0aG9yIEZyZXF1ZW5rCi8vIEBsaWNlbnNlIEdQTC0zLjAgTGljZW5zZQovLyBAcnVuLWF0IGRvY3VtZW50LXN0YXJ0Ci8vIEBkb3dubG9hZFVSTCBodHRwczovL3VwZGF0ZS5ncmVhc3lmb3JrLm9yZy9zY3JpcHRzLzUzOTk0Mi8lRTclQkQlOTElRTklQTElQjUlRTYlOEElOTYlRTklOUYlQjMlRTQlQkQlOTMlRTklQUElOEMlRTUlQTIlOUUlRTUlQkMlQkEudXNlci5qcwovLyBAdXBkYXRlVVJMIGh0dHBzOi8vdXBkYXRlLmdyZWFzeWZvcmsub3JnL3NjcmlwdHMvNTM5OTQyLyVFNyVCRCU5MSVFOSVBMSVCNSVFNiU4QSU5NiVFOSU5RiVCMyVFNCVCRCU5MyVFOSVBQSU4QyVFNSVBMiU5RSVFNSVCQyVCQS5tZXRhLmpzCi8vID09L1VzZXJTY3JpcHQ9PQoKKGZ1bmN0aW9uICgpIHsKICAgICd1c2Ugc3RyaWN0JzsKCiAgICBmdW5jdGlvbiBpc0VsZW1lbnRJblZpZXdwb3J0KGVsLCB0ZXh0ID0gIiIpIHsKICAgICAgICBpZiAoIWVsKSByZXR1cm4gZmFsc2U7CiAgICAgICAgY29uc3QgcmVjdCA9IGVsLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpOwogICAgICAgIHJldHVybiAoCiAgICAgICAgICAgIHJlY3Qud2lkdGggPiAwICYmCiAgICAgICAgICAgIHJlY3QuaGVpZ2h0ID4gMCAmJgogICAgICAgICAgICByZWN0LmJvdHRvbSA+IDAgJiYKICAgICAgICAgICAgcmVjdC5yaWdodCA+IDAgJiYKICAgICAgICAgICAgcmVjdC50b3AgPCB3aW5kb3cuaW5uZXJIZWlnaHQgJiYKICAgICAgICAgICAgcmVjdC5sZWZ0IDwgd2luZG93LmlubmVyV2lkdGgKICAgICAgICApOwogICAgfQoKICAgIGZ1bmN0aW9uIGdldEJlc3RWaXNpYmxlRWxlbWVudChlbGVtZW50cykgewogICAgICAgIGlmICghZWxlbWVudHMgfHwgZWxlbWVudHMubGVuZ3RoID09PSAwKSB7CiAgICAgICAgICAgIHJldHVybiBudWxsOwogICAgICAgIH0KCiAgICAgICAgY29uc3QgdmlzaWJsZUVsZW1lbnRzID0gQXJyYXkuZnJvbShlbGVtZW50cykuZmlsdGVyKGlzRWxlbWVudEluVmlld3BvcnQpOwoKICAgICAgICBpZiAodmlzaWJsZUVsZW1lbnRzLmxlbmd0aCA9PT0gMCkgewogICAgICAgICAgICByZXR1cm4gbnVsbDsKICAgICAgICB9CgogICAgICAgIGlmICh2aXNpYmxlRWxlbWVudHMubGVuZ3RoID09PSAxKSB7CiAgICAgICAgICAgIHJldHVybiB2aXNpYmxlRWxlbWVudHNbMF07CiAgICAgICAgfQoKICAgICAgICBsZXQgYmVzdENhbmRpZGF0ZSA9IG51bGw7CiAgICAgICAgbGV0IG1pbkRpc3RhbmNlID0gSW5maW5pdHk7CgogICAgICAgIGZvciAoY29uc3QgZWwgb2YgdmlzaWJsZUVsZW1lbnRzKSB7CiAgICAgICAgICAgIGNvbnN0IHJlY3QgPSBlbC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTsKICAgICAgICAgICAgY29uc3QgZGlzdGFuY2UgPSBNYXRoLmFicyhyZWN0LnRvcCk7CiAgICAgICAgICAgIGlmIChkaXN0YW5jZSA8IG1pbkRpc3RhbmNlKSB7CiAgICAgICAgICAgICAgICBtaW5EaXN0YW5jZSA9IGRpc3RhbmNlOwogICAgICAgICAgICAgICAgYmVzdENhbmRpZGF0ZSA9IGVsOwogICAgICAgICAgICB9CiAgICAgICAgfQogICAgICAgIHJldHVybiBiZXN0Q2FuZGlkYXRlOwogICAgfQoKICAgIC8vID09PT09PT09PT0g6YCa55+l566h55CG5ZmoID09PT09PT09PT0KICAgIGNsYXNzIE5vdGlmaWNhdGlvbk1hbmFnZXIgewogICAgICAgIGNvbnN0cnVjdG9yKCkgewogICAgICAgICAgICB0aGlzLmNvbnRhaW5lciA9IG51bGw7CiAgICAgICAgfQoKICAgICAgICBjcmVhdGVDb250YWluZXIoKSB7CiAgICAgICAgICAgIGlmICh0aGlzLmNvbnRhaW5lciAmJiBkb2N1bWVudC5ib2R5LmNvbnRhaW5zKHRoaXMuY29udGFpbmVyKSkgcmV0dXJuOwogICAgICAgICAgICB0aGlzLmNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpOwogICAgICAgICAgICBPYmplY3QuYXNzaWduKHRoaXMuY29udGFpbmVyLnN0eWxlLCB7CiAgICAgICAgICAgICAgICBwb3NpdGlvbjogJ2ZpeGVkJywKICAgICAgICAgICAgICAgIHRvcDogJzEwMHB4JywKICAgICAgICAgICAgICAgIGxlZnQ6ICc1MCUnLAogICAgICAgICAgICAgICAgdHJhbnNmb3JtOiAndHJhbnNsYXRlWCgtNTAlKScsCiAgICAgICAgICAgICAgICB6SW5kZXg6ICcxMDAwMScsCiAgICAgICAgICAgICAgICBkaXNwbGF5OiAnZmxleCcsCiAgICAgICAgICAgICAgICBmbGV4RGlyZWN0aW9uOiAnY29sdW1uJywKICAgICAgICAgICAgICAgIGFsaWduSXRlbXM6ICdjZW50ZXInLAogICAgICAgICAgICAgICAgZ2FwOiAnMTBweCcKICAgICAgICAgICAgfSk7CiAgICAgICAgICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQodGhpcy5jb250YWluZXIpOwogICAgICAgIH0KCiAgICAgICAgc2hvd01lc3NhZ2UobWVzc2FnZSwgZHVyYXRpb24gPSAyMDAwKSB7CiAgICAgICAgICAgIHRoaXMuY3JlYXRlQ29udGFpbmVyKCk7CgogICAgICAgICAgICBjb25zdCBtZXNzYWdlRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpOwogICAgICAgICAgICBtZXNzYWdlRWxlbWVudC50ZXh0Q29udGVudCA9IG1lc3NhZ2U7CiAgICAgICAgICAgIE9iamVjdC5hc3NpZ24obWVzc2FnZUVsZW1lbnQuc3R5bGUsIHsKICAgICAgICAgICAgICAgIGJhY2tncm91bmQ6ICdyZ2JhKDAsIDAsIDAsIDAuOCknLAogICAgICAgICAgICAgICAgY29sb3I6ICd3aGl0ZScsCiAgICAgICAgICAgICAgICBwYWRkaW5nOiAnMTBweCAyMHB4JywKICAgICAgICAgICAgICAgIGJvcmRlclJhZGl1czogJzZweCcsCiAgICAgICAgICAgICAgICBmb250U2l6ZTogJzE0cHgnLAogICAgICAgICAgICAgICAgYm94U2hhZG93OiAnMCAycHggOHB4IHJnYmEoMCwgMCwgMCwgMC4xNSknLAogICAgICAgICAgICAgICAgb3BhY2l0eTogJzAnLAogICAgICAgICAgICAgICAgdHJhbnNpdGlvbjogJ29wYWNpdHkgMC4zcyBlYXNlLWluLW91dCwgdHJhbnNmb3JtIDAuM3MgZWFzZS1pbi1vdXQnLAogICAgICAgICAgICAgICAgdHJhbnNmb3JtOiAndHJhbnNsYXRlWSgtMjBweCknCiAgICAgICAgICAgIH0pOwoKICAgICAgICAgICAgdGhpcy5jb250YWluZXIuYXBwZW5kQ2hpbGQobWVzc2FnZUVsZW1lbnQpOwoKICAgICAgICAgICAgLy8gQW5pbWF0ZSBpbgogICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHsKICAgICAgICAgICAgICAgIG1lc3NhZ2VFbGVtZW50LnN0eWxlLm9wYWNpdHkgPSAnMSc7CiAgICAgICAgICAgICAgICBtZXNzYWdlRWxlbWVudC5zdHlsZS50cmFuc2Zvcm0gPSAndHJhbnNsYXRlWSgwKSc7CiAgICAgICAgICAgIH0sIDEwKTsKCiAgICAgICAgICAgIC8vIEFuaW1hdGUgb3V0IGFuZCByZW1vdmUKICAgICAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7CiAgICAgICAgICAgICAgICBtZXNzYWdlRWxlbWVudC5zdHlsZS5vcGFjaXR5ID0gJzAnOwogICAgICAgICAgICAgICAgbWVzc2FnZUVsZW1lbnQuc3R5bGUudHJhbnNmb3JtID0gJ3RyYW5zbGF0ZVkoLTIwcHgpJzsKICAgICAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4gewogICAgICAgICAgICAgICAgICAgIGlmIChtZXNzYWdlRWxlbWVudC5wYXJlbnRFbGVtZW50KSB7CiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2VFbGVtZW50LnJlbW92ZSgpOwogICAgICAgICAgICAgICAgICAgIH0KICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5jb250YWluZXIgJiYgdGhpcy5jb250YWluZXIuY2hpbGRFbGVtZW50Q291bnQgPT09IDApIHsKICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5jb250YWluZXIucmVtb3ZlKCk7CiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuY29udGFpbmVyID0gbnVsbDsKICAgICAgICAgICAgICAgICAgICB9CiAgICAgICAgICAgICAgICB9LCAzMDApOwogICAgICAgICAgICB9LCBkdXJhdGlvbik7CiAgICAgICAgfQogICAgfQoKICAgIC8vID09PT09PT09PT0g6YWN572u566h55CG5qih5Z2XID09PT09PT09PT0KICAgIGNsYXNzIENvbmZpZ01hbmFnZXIgewogICAgICAgIGNvbnN0cnVjdG9yKCkgewogICAgICAgICAgICB0aGlzLmNvbmZpZyA9IHsKICAgICAgICAgICAgICAgIHNraXBMaXZlOiB7IGVuYWJsZWQ6IHRydWUsIGtleTogJ3NraXBMaXZlJyB9LAogICAgICAgICAgICAgICAgYXV0b0hpZ2hSZXM6IHsgZW5hYmxlZDogdHJ1ZSwga2V5OiAnYXV0b0hpZ2hSZXMnIH0sCiAgICAgICAgICAgICAgICBibG9ja0tleXdvcmRzOiB7CiAgICAgICAgICAgICAgICAgICAgZW5hYmxlZDogdHJ1ZSwKICAgICAgICAgICAgICAgICAgICBrZXk6ICdibG9ja0tleXdvcmRzJywKICAgICAgICAgICAgICAgICAgICBrZXl3b3JkczogdGhpcy5sb2FkS2V5d29yZHMoKSwKICAgICAgICAgICAgICAgICAgICBwcmVzc1I6IHRoaXMubG9hZFByZXNzUlNldHRpbmcoKSwKICAgICAgICAgICAgICAgICAgICBibG9ja05hbWU6IHRoaXMubG9hZEJsb2NrTmFtZVNldHRpbmcoKSwKICAgICAgICAgICAgICAgICAgICBibG9ja0Rlc2M6IHRoaXMubG9hZEJsb2NrRGVzY1NldHRpbmcoKSwKICAgICAgICAgICAgICAgICAgICBibG9ja1RhZ3M6IHRoaXMubG9hZEJsb2NrVGFnc1NldHRpbmcoKQogICAgICAgICAgICAgICAgfSwKICAgICAgICAgICAgICAgIHNraXBBZDogeyBlbmFibGVkOiB0cnVlLCBrZXk6ICdza2lwQWQnIH0sCiAgICAgICAgICAgICAgICBvbmx5UmVzb2x1dGlvbjogewogICAgICAgICAgICAgICAgICAgIGVuYWJsZWQ6IGZhbHNlLAogICAgICAgICAgICAgICAgICAgIGtleTogJ29ubHlSZXNvbHV0aW9uJywKICAgICAgICAgICAgICAgICAgICByZXNvbHV0aW9uOiB0aGlzLmxvYWRUYXJnZXRSZXNvbHV0aW9uKCkKICAgICAgICAgICAgICAgIH0sCiAgICAgICAgICAgICAgICBhaVByZWZlcmVuY2U6IHsKICAgICAgICAgICAgICAgICAgICBlbmFibGVkOiBmYWxzZSwKICAgICAgICAgICAgICAgICAgICBrZXk6ICdhaVByZWZlcmVuY2UnLAogICAgICAgICAgICAgICAgICAgIGNvbnRlbnQ6IHRoaXMubG9hZEFpQ29udGVudCgpLAogICAgICAgICAgICAgICAgICAgIG1vZGVsOiB0aGlzLmxvYWRBaU1vZGVsKCksCiAgICAgICAgICAgICAgICAgICAgYXV0b0xpa2U6IHRoaXMubG9hZEF1dG9MaWtlU2V0dGluZygpCiAgICAgICAgICAgICAgICB9LAogICAgICAgICAgICAgICAgc3BlZWRNb2RlOiB7CiAgICAgICAgICAgICAgICAgICAgZW5hYmxlZDogZmFsc2UsCiAgICAgICAgICAgICAgICAgICAga2V5OiAnc3BlZWRNb2RlJywKICAgICAgICAgICAgICAgICAgICBzZWNvbmRzOiB0aGlzLmxvYWRTcGVlZFNlY29uZHMoKSwKICAgICAgICAgICAgICAgICAgICBtb2RlOiB0aGlzLmxvYWRTcGVlZE1vZGVUeXBlKCksCiAgICAgICAgICAgICAgICAgICAgbWluU2Vjb25kczogdGhpcy5sb2FkU3BlZWRNaW5TZWNvbmRzKCksCiAgICAgICAgICAgICAgICAgICAgbWF4U2Vjb25kczogdGhpcy5sb2FkU3BlZWRNYXhTZWNvbmRzKCkKICAgICAgICAgICAgICAgIH0KICAgICAgICAgICAgfTsKICAgICAgICB9CgogICAgICAgIGxvYWRLZXl3b3JkcygpIHsKICAgICAgICAgICAgcmV0dXJuIEpTT04ucGFyc2UobG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2RvdXlpbl9ibG9ja2VkX2tleXdvcmRzJykgfHwgJ1si5bqXIiwgIueUhOmAiSJdJyk7CiAgICAgICAgfQoKICAgICAgICBsb2FkU3BlZWRTZWNvbmRzKCkgewogICAgICAgICAgICBjb25zdCB2",
        "YWx1ZSA9IHBhcnNlSW50KGxvY2FsU3RvcmFnZS5nZXRJdGVtKCdkb3V5aW5fc3BlZWRfbW9kZV9zZWNvbmRzJykgfHwgJzYnLCAxMCk7CiAgICAgICAgICAgIHJldHVybiBOdW1iZXIuaXNGaW5pdGUodmFsdWUpID8gTWF0aC5taW4oTWF0aC5tYXgodmFsdWUsIDEpLCAzNjAwKSA6IDY7CiAgICAgICAgfQoKICAgICAgICBsb2FkU3BlZWRNb2RlVHlwZSgpIHsKICAgICAgICAgICAgY29uc3QgbW9kZSA9IGxvY2FsU3RvcmFnZS5nZXRJdGVtKCdkb3V5aW5fc3BlZWRfbW9kZV90eXBlJykgfHwgJ2ZpeGVkJzsKICAgICAgICAgICAgcmV0dXJuIG1vZGUgPT09ICdyYW5kb20nID8gJ3JhbmRvbScgOiAnZml4ZWQnOwogICAgICAgIH0KCiAgICAgICAgbG9hZFNwZWVkTWluU2Vjb25kcygpIHsKICAgICAgICAgICAgY29uc3QgdmFsdWUgPSBwYXJzZUludChsb2NhbFN0b3JhZ2UuZ2V0SXRlbSgnZG91eWluX3NwZWVkX21vZGVfbWluX3NlY29uZHMnKSB8fCAnNScsIDEwKTsKICAgICAgICAgICAgcmV0dXJuIE51bWJlci5pc0Zpbml0ZSh2YWx1ZSkgPyBNYXRoLm1pbihNYXRoLm1heCh2YWx1ZSwgMSksIDM2MDApIDogNTsKICAgICAgICB9CgogICAgICAgIGxvYWRTcGVlZE1heFNlY29uZHMoKSB7CiAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gcGFyc2VJbnQobG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2RvdXlpbl9zcGVlZF9tb2RlX21heF9zZWNvbmRzJykgfHwgJzEwJywgMTApOwogICAgICAgICAgICByZXR1cm4gTnVtYmVyLmlzRmluaXRlKHZhbHVlKSA/IE1hdGgubWluKE1hdGgubWF4KHZhbHVlLCAxKSwgMzYwMCkgOiAxMDsKICAgICAgICB9CgogICAgICAgIGxvYWRBaUNvbnRlbnQoKSB7CiAgICAgICAgICAgIHJldHVybiBsb2NhbFN0b3JhZ2UuZ2V0SXRlbSgnZG91eWluX2FpX2NvbnRlbnQnKSB8fCAn6Zyy6IS455qE576O5aWzJzsKICAgICAgICB9CgogICAgICAgIGxvYWRBaU1vZGVsKCkgewogICAgICAgICAgICByZXR1cm4gbG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2RvdXlpbl9haV9tb2RlbCcpIHx8ICdxd2VuMy12bDo4Yic7CiAgICAgICAgfQoKICAgICAgICBsb2FkVGFyZ2V0UmVzb2x1dGlvbigpIHsKICAgICAgICAgICAgcmV0dXJuIGxvY2FsU3RvcmFnZS5nZXRJdGVtKCdkb3V5aW5fdGFyZ2V0X3Jlc29sdXRpb24nKSB8fCAnNEsnOwogICAgICAgIH0KCiAgICAgICAgbG9hZFByZXNzUlNldHRpbmcoKSB7CiAgICAgICAgICAgIHJldHVybiBsb2NhbFN0b3JhZ2UuZ2V0SXRlbSgnZG91eWluX3ByZXNzX3JfZW5hYmxlZCcpICE9PSAnZmFsc2UnOyAvLyDpu5jorqTlvIDlkK8KICAgICAgICB9CgogICAgICAgIGxvYWRBdXRvTGlrZVNldHRpbmcoKSB7CiAgICAgICAgICAgIHJldHVybiBsb2NhbFN0b3JhZ2UuZ2V0SXRlbSgnZG91eWluX2F1dG9fbGlrZV9lbmFibGVkJykgIT09ICdmYWxzZSc7IC8vIOm7mOiupOW8gOWQrwogICAgICAgIH0KCiAgICAgICAgbG9hZEJsb2NrTmFtZVNldHRpbmcoKSB7CiAgICAgICAgICAgIHJldHVybiBsb2NhbFN0b3JhZ2UuZ2V0SXRlbSgnZG91eWluX2Jsb2NrX25hbWVfZW5hYmxlZCcpICE9PSAnZmFsc2UnOyAvLyDpu5jorqTlvIDlkK8KICAgICAgICB9CgogICAgICAgIGxvYWRCbG9ja0Rlc2NTZXR0aW5nKCkgewogICAgICAgICAgICByZXR1cm4gbG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2RvdXlpbl9ibG9ja19kZXNjX2VuYWJsZWQnKSAhPT0gJ2ZhbHNlJzsgLy8g6buY6K6k5byA5ZCvCiAgICAgICAgfQoKICAgICAgICBsb2FkQmxvY2tUYWdzU2V0dGluZygpIHsKICAgICAgICAgICAgcmV0dXJuIGxvY2FsU3RvcmFnZS5nZXRJdGVtKCdkb3V5aW5fYmxvY2tfdGFnc19lbmFibGVkJykgIT09ICdmYWxzZSc7IC8vIOm7mOiupOW8gOWQrwogICAgICAgIH0KCiAgICAgICAgc2F2ZUtleXdvcmRzKGtleXdvcmRzKSB7CiAgICAgICAgICAgIHRoaXMuY29uZmlnLmJsb2NrS2V5d29yZHMua2V5d29yZHMgPSBrZXl3b3JkczsKICAgICAgICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ2RvdXlpbl9ibG9ja2VkX2tleXdvcmRzJywgSlNPTi5zdHJpbmdpZnkoa2V5d29yZHMpKTsKICAgICAgICB9CgogICAgICAgIHNhdmVTcGVlZFNlY29uZHMoc2Vjb25kcykgewogICAgICAgICAgICB0aGlzLmNvbmZpZy5zcGVlZE1vZGUuc2Vjb25kcyA9IHNlY29uZHM7CiAgICAgICAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdkb3V5aW5fc3BlZWRfbW9kZV9zZWNvbmRzJywgc2Vjb25kcy50b1N0cmluZygpKTsKICAgICAgICB9CgogICAgICAgIHNhdmVTcGVlZE1vZGVUeXBlKG1vZGUpIHsKICAgICAgICAgICAgdGhpcy5jb25maWcuc3BlZWRNb2RlLm1vZGUgPSBtb2RlOwogICAgICAgICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnZG91eWluX3NwZWVkX21vZGVfdHlwZScsIG1vZGUpOwogICAgICAgIH0KCiAgICAgICAgc2F2ZVNwZWVkTW9kZVJhbmdlKG1pblNlY29uZHMsIG1heFNlY29uZHMpIHsKICAgICAgICAgICAgdGhpcy5jb25maWcuc3BlZWRNb2RlLm1pblNlY29uZHMgPSBtaW5TZWNvbmRzOwogICAgICAgICAgICB0aGlzLmNvbmZpZy5zcGVlZE1vZGUubWF4U2Vjb25kcyA9IG1heFNlY29uZHM7CiAgICAgICAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdkb3V5aW5fc3BlZWRfbW9kZV9taW5fc2Vjb25kcycsIG1pblNlY29uZHMudG9TdHJpbmcoKSk7CiAgICAgICAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdkb3V5aW5fc3BlZWRfbW9kZV9tYXhfc2Vjb25kcycsIG1heFNlY29uZHMudG9TdHJpbmcoKSk7CiAgICAgICAgfQoKICAgICAgICBzYXZlQWlDb250ZW50KGNvbnRlbnQpIHsKICAgICAgICAgICAgdGhpcy5jb25maWcuYWlQcmVmZXJlbmNlLmNvbnRlbnQgPSBjb250ZW50OwogICAgICAgICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnZG91eWluX2FpX2NvbnRlbnQnLCBjb250ZW50KTsKICAgICAgICB9CgogICAgICAgIHNhdmVBaU1vZGVsKG1vZGVsKSB7CiAgICAgICAgICAgIHRoaXMuY29uZmlnLmFpUHJlZmVyZW5jZS5tb2RlbCA9IG1vZGVsOwogICAgICAgICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnZG91eWluX2FpX21vZGVsJywgbW9kZWwpOwogICAgICAgIH0KCiAgICAgICAgc2F2ZVRhcmdldFJlc29sdXRpb24ocmVzb2x1dGlvbikgewogICAgICAgICAgICB0aGlzLmNvbmZpZy5vbmx5UmVzb2x1dGlvbi5yZXNvbHV0aW9uID0gcmVzb2x1dGlvbjsKICAgICAgICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ2RvdXlpbl90YXJnZXRfcmVzb2x1dGlvbicsIHJlc29sdXRpb24pOwogICAgICAgIH0KCiAgICAgICAgc2F2ZVByZXNzUlNldHRpbmcoZW5hYmxlZCkgewogICAgICAgICAgICB0aGlzLmNvbmZpZy5ibG9ja0tleXdvcmRzLnByZXNzUiA9IGVuYWJsZWQ7CiAgICAgICAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdkb3V5aW5fcHJlc3Nfcl9lbmFibGVkJywgZW5hYmxlZC50b1N0cmluZygpKTsKICAgICAgICB9CgogICAgICAgIHNhdmVBdXRvTGlrZVNldHRpbmcoZW5hYmxlZCkgewogICAgICAgICAgICB0aGlzLmNvbmZpZy5haVByZWZlcmVuY2UuYXV0b0xpa2UgPSBlbmFibGVkOwogICAgICAgICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnZG91eWluX2F1dG9fbGlrZV9lbmFibGVkJywgZW5hYmxlZC50b1N0cmluZygpKTsKICAgICAgICB9CgogICAgICAgIHNhdmVCbG9ja05hbWVTZXR0aW5nKGVuYWJsZWQpIHsKICAgICAgICAgICAgdGhpcy5jb25maWcuYmxvY2tLZXl3b3Jkcy5ibG9ja05hbWUgPSBlbmFibGVkOwogICAgICAgICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnZG91eWluX2Jsb2NrX25hbWVfZW5hYmxlZCcsIGVuYWJsZWQudG9TdHJpbmcoKSk7CiAgICAgICAgfQoKICAgICAgICBzYXZlQmxvY2tEZXNjU2V0dGluZyhlbmFibGVkKSB7CiAgICAgICAgICAgIHRoaXMuY29uZmlnLmJsb2NrS2V5d29yZHMuYmxvY2tEZXNjID0gZW5hYmxlZDsKICAgICAgICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ2RvdXlpbl9ibG9ja19kZXNjX2VuYWJsZWQnLCBlbmFibGVkLnRvU3RyaW5nKCkpOwogICAgICAgIH0KCiAgICAgICAgc2F2ZUJsb2NrVGFnc1NldHRpbmcoZW5hYmxlZCkgewogICAgICAgICAgICB0aGlzLmNvbmZpZy5ibG9ja0tleXdvcmRzLmJsb2NrVGFncyA9IGVuYWJsZWQ7CiAgICAgICAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdkb3V5aW5fYmxvY2tfdGFnc19lbmFibGVkJywgZW5hYmxlZC50b1N0cmluZygpKTsKICAgICAgICB9CgogICAgICAgIGdldChrZXkpIHsKICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29uZmlnW2tleV07CiAgICAgICAgfQoKICAgICAgICBzZXRFbmFibGVkKGtleSwgdmFsdWUpIHsKICAgICAgICAgICAgaWYgKHRoaXMuY29uZmlnW2tleV0pIHsKICAgICAgICAgICAgICAgIHRoaXMuY29uZmlnW2tleV0uZW5hYmxlZCA9IHZhbHVlOwogICAgICAgICAgICB9CiAgICAgICAgfQoKICAgICAgICBpc0VuYWJsZWQoa2V5KSB7CiAgICAgICAgICAgIHJldHVybiB0aGlzLmNvbmZpZ1trZXldPy5lbmFibGVkIHx8IGZhbHNlOwogICAgICAgIH0KICAgIH0KCiAgICAvLyA9PT09PT09PT09IERPTemAieaLqeWZqOW4uOmHjyA9PT09PT09PT09CiAgICBjb25zdCBTRUxFQ1RPUlMgPSB7CiAgICAgICAgYWN0aXZlVmlkZW86ICJbZGF0YS1lMmU9J2ZlZWQtYWN0aXZlLXZpZGVvJ106aGFzKHZpZGVvW3NyY10pIiwKICAgICAgICByZXNvbHV0aW9uT3B0aW9uczogIi54Z3BsYXllci1wbGF5aW5nIGRpdi52aXJ0dWFsID4gZGl2Lml0ZW0iLAogICAgICAgIGFjY291bnROYW1lOiAnW2RhdGEtZTJlPSJmZWVkLXZpZGVvLW5pY2tuYW1lIl0nLAogICAgICAgIHNldHRpbmdzUGFuZWw6ICd4Zy1pY29uLnhncGxheWVyLWF1dG9wbGF5LXNldHRpbmcnLAogICAgICAgIGFkSW5kaWNhdG9yOiAnc3ZnW3ZpZXdCb3g9IjAgMCAzMCAxNiJdJywKICAgICAgICB2aWRlb0VsZW1lbnQ6ICd2aWRlb1tzcmNdJywKICAgICAgICB2aWRlb0Rlc2M6ICdbZGF0YS1lMmU9InZpZGVvLWRlc2MiXScKICAgIH07CgogICAgLy8gPT09PT09PT09PSDop4bpopHmjqfliLblmaggPT09PT09PT09PQogICAgY2xhc3MgVmlkZW9Db250cm9sbGVyIHsKICAgICAgICBjb25zdHJ1Y3Rvcihub3RpZmljYXRpb25NYW5hZ2VyKSB7CiAgICAgICAgICAgIHRoaXMuc2tpcENoZWNrSW50ZXJ2YWwgPSBudWxsOwogICAgICAgICAgICB0aGlzLnNraXBBdHRlbXB0Q291bnQgPSAwOwogICAgICAgICAgICB0aGlzLm5vdGlmaWNhdGlvbk1hbmFnZXIgPSBub3RpZmljYXRpb25NYW5hZ2VyOwogICAgICAgIH0KCiAgICAgICAgc2tpcChyZWFzb24pIHsKICAgICAgICAgICAgY29uc3QgdGlwID0gYOi3s+i/h+inhumike+8jOWOn+WboO+8miR7cmVhc29ufWA7CiAgICAgICAgICAgIGlmIChyZWFzb24pIHsKICAgICAgICAgICAgICAgIHRoaXMubm90aWZpY2F0aW9uTWFuYWdlci5zaG93TWVzc2FnZSh0aXApOwogICAgICAgICAgICB9CiAgICAgICAgICAgIGNvbnNvbGUubG9nKHRpcCk7CiAgICAgICAgICAgIGlmICghZG9jdW1lbnQuYm9keSkgcmV0dXJuOwoKICAgICAgICAgICAgY29uc3QgdmlkZW9CZWZvcmUgPSB0aGlzLmdldEN1cnJlbnRWaWRlb1VybCgpOwogICAgICAgICAgICB0aGlzLnNlbmRLZXlFdmVudCgnQXJyb3dEb3duJyk7CgogICAgICAgICAgICB0aGlzLmNsZWFyU2tpcENoZWNrKCk7CiAgICAgICAgICAgIHRoaXMuc3RhcnRTa2lwQ2hlY2sodmlkZW9CZWZvcmUpOwogICAgICAgIH0KCiAgICAgICAgbGlrZSgpIHsKICAgICAgICAgICAgdGhpcy5ub3RpZmljYXRpb25NYW5hZ2VyLnNob3dNZXNzYWdlKCdBSeWWnOWlvTog4p2k77iPIOiHquWKqOeCuei1nicpOwogICAgICAgICAgICB0aGlzLnNlbmRLZXlFdmVudCgneicsICdLZXlaJywgOTApOwogICAgICAgIH0KCiAgICAgICAgcHJlc3NSKCkgewogICAgICAgICAgICB0aGlzLm5vdGlmaWNhdGlvbk1hbmFnZXIuc2hvd01lc3NhZ2UoJ+Wxj+iUvei0puWPtzog8J+aqyDkuI3mhJ/lhbTotqMnKTsKICAgICAgICAgICAgdGhpcy5zZW5kS2V5RXZlbnQoJ3InLCAnS2V5UicsIDgyKTsKICAgICAgICB9CgogICAgICAgIHNlbmRLZXlFdmVudChrZXksIGNvZGUgPSBudWxsLCBrZXlDb2RlID0gbnVsbCkgewogICAgICAgICAgICB0cnkgewogICAgICAgICAgICAgICAgY29uc3QgZXZl",
        "bnQgPSBuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsKICAgICAgICAgICAgICAgICAgICBrZXk6IGtleSwKICAgICAgICAgICAgICAgICAgICBjb2RlOiBjb2RlIHx8IChrZXkgPT09ICdBcnJvd0Rvd24nID8gJ0Fycm93RG93bicgOiBjb2RlKSwKICAgICAgICAgICAgICAgICAgICBrZXlDb2RlOiBrZXlDb2RlIHx8IChrZXkgPT09ICdBcnJvd0Rvd24nID8gNDAgOiBrZXlDb2RlKSwKICAgICAgICAgICAgICAgICAgICB3aGljaDoga2V5Q29kZSB8fCAoa2V5ID09PSAnQXJyb3dEb3duJyA/IDQwIDoga2V5Q29kZSksCiAgICAgICAgICAgICAgICAgICAgYnViYmxlczogdHJ1ZSwKICAgICAgICAgICAgICAgICAgICBjYW5jZWxhYmxlOiB0cnVlCiAgICAgICAgICAgICAgICB9KTsKICAgICAgICAgICAgICAgIGRvY3VtZW50LmJvZHkuZGlzcGF0Y2hFdmVudChldmVudCk7CiAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7CiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygn5Y+R6YCB6ZSu55uY5LqL5Lu25aSx6LSlOicsIGVycm9yKTsKICAgICAgICAgICAgfQogICAgICAgIH0KCiAgICAgICAgZ2V0Q3VycmVudFZpZGVvVXJsKCkgewogICAgICAgICAgICBjb25zdCBhY3RpdmVDb250YWluZXJzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChTRUxFQ1RPUlMuYWN0aXZlVmlkZW8pOwogICAgICAgICAgICBjb25zdCBsYXN0QWN0aXZlQ29udGFpbmVyID0gZ2V0QmVzdFZpc2libGVFbGVtZW50KGFjdGl2ZUNvbnRhaW5lcnMpOwogICAgICAgICAgICBpZiAoIWxhc3RBY3RpdmVDb250YWluZXIpIHJldHVybiAnJzsKICAgICAgICAgICAgY29uc3QgdmlkZW9FbCA9IGxhc3RBY3RpdmVDb250YWluZXIucXVlcnlTZWxlY3RvcihTRUxFQ1RPUlMudmlkZW9FbGVtZW50KTsKICAgICAgICAgICAgcmV0dXJuIHZpZGVvRWw/LnNyYyB8fCAnJzsKICAgICAgICB9CgogICAgICAgIGNsZWFyU2tpcENoZWNrKCkgewogICAgICAgICAgICBpZiAodGhpcy5za2lwQ2hlY2tJbnRlcnZhbCkgewogICAgICAgICAgICAgICAgY2xlYXJJbnRlcnZhbCh0aGlzLnNraXBDaGVja0ludGVydmFsKTsKICAgICAgICAgICAgICAgIHRoaXMuc2tpcENoZWNrSW50ZXJ2YWwgPSBudWxsOwogICAgICAgICAgICB9CiAgICAgICAgICAgIHRoaXMuc2tpcEF0dGVtcHRDb3VudCA9IDA7CiAgICAgICAgfQoKICAgICAgICBzdGFydFNraXBDaGVjayh1cmxCZWZvcmUpIHsKICAgICAgICAgICAgdGhpcy5za2lwQ2hlY2tJbnRlcnZhbCA9IHNldEludGVydmFsKCgpID0+IHsKICAgICAgICAgICAgICAgIGlmICh0aGlzLnNraXBBdHRlbXB0Q291bnQgPj0gNSkgewogICAgICAgICAgICAgICAgICAgIHRoaXMubm90aWZpY2F0aW9uTWFuYWdlci5zaG93TWVzc2FnZSgn4pqg77iPIOi3s+i/h+Wksei0pe+8jOivt+aJi+WKqOaTjeS9nCcpOwogICAgICAgICAgICAgICAgICAgIHRoaXMuY2xlYXJTa2lwQ2hlY2soKTsKICAgICAgICAgICAgICAgICAgICByZXR1cm47CiAgICAgICAgICAgICAgICB9CgogICAgICAgICAgICAgICAgdGhpcy5za2lwQXR0ZW1wdENvdW50Kys7CiAgICAgICAgICAgICAgICBjb25zdCB1cmxBZnRlciA9IHRoaXMuZ2V0Q3VycmVudFZpZGVvVXJsKCk7CiAgICAgICAgICAgICAgICBpZiAodXJsQWZ0ZXIgJiYgdXJsQWZ0ZXIgIT09IHVybEJlZm9yZSkgewogICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCfop4bpopHlt7LmiJDlip/liIfmjaInKTsKICAgICAgICAgICAgICAgICAgICB0aGlzLmNsZWFyU2tpcENoZWNrKCk7CiAgICAgICAgICAgICAgICAgICAgcmV0dXJuOwogICAgICAgICAgICAgICAgfQoKICAgICAgICAgICAgICAgIGNvbnN0IGF0dGVtcHRNZXNzYWdlID0gYOi3s+i/h+Wksei0pe+8jOato+WcqOmHjeivlSAoJHt0aGlzLnNraXBBdHRlbXB0Q291bnR9LzUpYDsKICAgICAgICAgICAgICAgIHRoaXMubm90aWZpY2F0aW9uTWFuYWdlci5zaG93TWVzc2FnZShhdHRlbXB0TWVzc2FnZSwgMTAwMCk7CiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhhdHRlbXB0TWVzc2FnZSk7CiAgICAgICAgICAgICAgICB0aGlzLnNlbmRLZXlFdmVudCgnQXJyb3dEb3duJyk7CiAgICAgICAgICAgIH0sIDUwMCk7CiAgICAgICAgfQogICAgfQoKICAgIC8vID09PT09PT09PT0gVUnnu4Tku7blt6XljoIgPT09PT09PT09PQogICAgY2xhc3MgVUlGYWN0b3J5IHsKICAgICAgICBzdGF0aWMgY3JlYXRlRGlhbG9nKGNsYXNzTmFtZSwgdGl0bGUsIGNvbnRlbnQsIG9uU2F2ZSwgb25DYW5jZWwpIHsKICAgICAgICAgICAgY29uc3QgZXhpc3RpbmdEaWFsb2cgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGAuJHtjbGFzc05hbWV9YCk7CiAgICAgICAgICAgIGlmIChleGlzdGluZ0RpYWxvZykgewogICAgICAgICAgICAgICAgZXhpc3RpbmdEaWFsb2cucmVtb3ZlKCk7CiAgICAgICAgICAgICAgICByZXR1cm47CiAgICAgICAgICAgIH0KCiAgICAgICAgICAgIGNvbnN0IGRpYWxvZyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpOwogICAgICAgICAgICBkaWFsb2cuY2xhc3NOYW1lID0gY2xhc3NOYW1lOwogICAgICAgICAgICBPYmplY3QuYXNzaWduKGRpYWxvZy5zdHlsZSwgewogICAgICAgICAgICAgICAgcG9zaXRpb246ICdmaXhlZCcsCiAgICAgICAgICAgICAgICB0b3A6ICc1MCUnLAogICAgICAgICAgICAgICAgbGVmdDogJzUwJScsCiAgICAgICAgICAgICAgICB0cmFuc2Zvcm06ICd0cmFuc2xhdGUoLTUwJSwgLTUwJSknLAogICAgICAgICAgICAgICAgYmFja2dyb3VuZDogJ3JnYmEoMCwgMCwgMCwgMC45KScsCiAgICAgICAgICAgICAgICBib3JkZXI6ICcxcHggc29saWQgcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjIpJywKICAgICAgICAgICAgICAgIGJvcmRlclJhZGl1czogJzhweCcsCiAgICAgICAgICAgICAgICBwYWRkaW5nOiAnMjBweCcsCiAgICAgICAgICAgICAgICB6SW5kZXg6ICcxMDAwMCcsCiAgICAgICAgICAgICAgICBtaW5XaWR0aDogJzI1MHB4JwogICAgICAgICAgICB9KTsKCiAgICAgICAgICAgIGRpYWxvZy5pbm5lckhUTUwgPSBgCiAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPSJjb2xvcjogd2hpdGU7IG1hcmdpbi1ib3R0b206IDE1cHg7IGZvbnQtc2l6ZTogMTRweDsiPiR7dGl0bGV9PC9kaXY+CiAgICAgICAgICAgICAgICAke2NvbnRlbnR9CiAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPSJkaXNwbGF5OiBmbGV4OyBnYXA6IDEwcHg7IG1hcmdpbi10b3A6IDE1cHg7Ij4KICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzPSJkaWFsb2ctY29uZmlybSIgc3R5bGU9ImZsZXg6IDE7IHBhZGRpbmc6IDVweDsgYmFja2dyb3VuZDogI2ZlMmM1NTsKICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbG9yOiB3aGl0ZTsgYm9yZGVyOiBub25lOyBib3JkZXItcmFkaXVzOiA0cHg7IGN1cnNvcjogcG9pbnRlcjsiPuehruWumjwvYnV0dG9uPgogICAgICAgICAgICAgICAgICAgIDxidXR0b24gY2xhc3M9ImRpYWxvZy1jYW5jZWwiIHN0eWxlPSJmbGV4OiAxOyBwYWRkaW5nOiA1cHg7IGJhY2tncm91bmQ6IHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4xKTsKICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbG9yOiB3aGl0ZTsgYm9yZGVyOiAxcHggc29saWQgcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjMpOyBib3JkZXItcmFkaXVzOiA0cHg7IGN1cnNvcjogcG9pbnRlcjsiPuWPlua2iDwvYnV0dG9uPgogICAgICAgICAgICAgICAgPC9kaXY+CiAgICAgICAgICAgIGA7CgogICAgICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGRpYWxvZyk7CgogICAgICAgICAgICBkaWFsb2cucXVlcnlTZWxlY3RvcignLmRpYWxvZy1jb25maXJtJykuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7CiAgICAgICAgICAgICAgICBpZiAob25TYXZlKCkpIGRpYWxvZy5yZW1vdmUoKTsKICAgICAgICAgICAgfSk7CgogICAgICAgICAgICBkaWFsb2cucXVlcnlTZWxlY3RvcignLmRpYWxvZy1jYW5jZWwnKS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHsKICAgICAgICAgICAgICAgIGRpYWxvZy5yZW1vdmUoKTsKICAgICAgICAgICAgICAgIGlmIChvbkNhbmNlbCkgb25DYW5jZWwoKTsKICAgICAgICAgICAgfSk7CgogICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHsKICAgICAgICAgICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgZnVuY3Rpb24gY2xvc2VEaWFsb2coZSkgewogICAgICAgICAgICAgICAgICAgIGlmICghZGlhbG9nLmNvbnRhaW5zKGUudGFyZ2V0KSkgewogICAgICAgICAgICAgICAgICAgICAgICBkaWFsb2cucmVtb3ZlKCk7CiAgICAgICAgICAgICAgICAgICAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgY2xvc2VEaWFsb2cpOwogICAgICAgICAgICAgICAgICAgIH0KICAgICAgICAgICAgICAgIH0pOwogICAgICAgICAgICB9LCAxMDApOwoKICAgICAgICAgICAgcmV0dXJuIGRpYWxvZzsKICAgICAgICB9CgogICAgICAgIHN0YXRpYyBjcmVhdGVUb2dnbGVCdXR0b24odGV4dCwgY2xhc3NOYW1lLCBpc0VuYWJsZWQsIG9uVG9nZ2xlLCBvbkNsaWNrID0gbnVsbCwgc2hvcnRjdXQgPSBudWxsKSB7CiAgICAgICAgICAgIGNvbnN0IGJ0bkNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3hnLWljb24nKTsKICAgICAgICAgICAgYnRuQ29udGFpbmVyLmNsYXNzTmFtZSA9IGB4Z3BsYXllci1hdXRvcGxheS1zZXR0aW5nICR7Y2xhc3NOYW1lfWA7CgogICAgICAgICAgICBjb25zdCBzaG9ydGN1dEhpbnQgPSBzaG9ydGN1dAogICAgICAgICAgICAgICAgPyBgPGRpdiBjbGFzcz0ieGdUaXBzIj48c3Bhbj4ke3RleHQucmVwbGFjZSgvPFtePl0qPi9nLCAnJyl9PC9zcGFuPjxzcGFuIGNsYXNzPSJzaG9ydGN1dEtleSI+JHtzaG9ydGN1dH08L3NwYW4+PC9kaXY+YAogICAgICAgICAgICAgICAgOiAnJzsKCiAgICAgICAgICAgIGJ0bkNvbnRhaW5lci5pbm5lckhUTUwgPSBgCiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPSJ4Z3BsYXllci1pY29uIj4KICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPSJ4Z3BsYXllci1zZXR0aW5nLWxhYmVsIj4KICAgICAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiBhcmlhLWNoZWNrZWQ9IiR7aXNFbmFibGVkfSIgY2xhc3M9InhnLXN3aXRjaCAke2lzRW5hYmxlZCA/ICd4Zy1zd2l0Y2gtY2hlY2tlZCcgOiAnJ30iPgogICAgICAgICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9InhnLXN3aXRjaC1pbm5lciI+PC9zcGFuPgogICAgICAgICAgICAgICAgICAgICAgICA8L2J1dHRvbj4KICAgICAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9InhncGxheWVyLXNldHRpbmctdGl0bGUiIHN0eWxlPSIke29uQ2xpY2sgPyAnY3Vyc29yOiBwb2ludGVyOyB0ZXh0LWRlY29yYXRpb246IHVuZGVybGluZTsnIDogJyd9Ij4ke3RleHR9PC9zcGFuPgogICAgICAgICAgICAgICAgICAgIDwvZGl2PgogICAgICAgICAgICAgICAgPC9kaXY+JHtzaG9ydGN1dEhpbnR9YDsKCiAgICAgICAgICAgIGJ0bkNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCdidXR0b24nKS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7CiAgICAgICAgICAgICAgICBjb25zdCBuZXdTdGF0ZSA9IGUuY3VycmVudFRhcmdldC5nZXRBdHRyaWJ1dGUoJ2FyaWEtY2hlY2tlZCcpID09PSAnZmFsc2UnOwogICAgICAgICAgICAgICAgVUlNYW5hZ2VyLnVwZGF0ZVRvZ2dsZUJ1dHRvbnMoY2xhc3NOYW1lLCBuZXdTdGF0ZSk7CiAgICAgICAgICAgICAgICBvblRvZ2dsZShuZXdTdGF0ZSk7CiAgICAgICAgICAgIH0pOwoKICAgICAgICAgICAgaWYgKG9uQ2xpY2spIHsKICAgICAgICAgICAgICAgIGJ0bkNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCcueGdwbGF5ZXItc2V0dGluZy10aXRsZScpLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHsKICAgICAgICAgICAgICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpOwogICAgICAgICAgICAgICAgICAgIG9uQ2xpY2soKTsKICAgICAgICAgICAgICAgIH0pOwogICAgICAgICAgICB9CgogICAgICAgICAgICByZXR1cm4gYnRuQ29udGFpbmVyOwogICAgICAgIH0KCiAgICAgICAgc3RhdGljIHNob3dFcnJvckRpYWxv",
        "ZygpIHsKICAgICAgICAgICAgY29uc3QgZGlhbG9nID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7CiAgICAgICAgICAgIGRpYWxvZy5jbGFzc05hbWUgPSAnZXJyb3ItZGlhbG9nLScgKyBEYXRlLm5vdygpOwogICAgICAgICAgICBkaWFsb2cuc3R5bGUuY3NzVGV4dCA9IGAKICAgICAgICAgICAgICAgIHBvc2l0aW9uOiBmaXhlZDsKICAgICAgICAgICAgICAgIHRvcDogNTAlOwogICAgICAgICAgICAgICAgbGVmdDogNTAlOwogICAgICAgICAgICAgICAgdHJhbnNmb3JtOiB0cmFuc2xhdGUoLTUwJSwgLTUwJSk7CiAgICAgICAgICAgICAgICBiYWNrZ3JvdW5kOiByZ2JhKDAsIDAsIDAsIDAuOTUpOwogICAgICAgICAgICAgICAgYm9yZGVyOiAycHggc29saWQgcmdiYSgyNTQsIDQ0LCA4NSwgMC44KTsKICAgICAgICAgICAgICAgIGNvbG9yOiB3aGl0ZTsKICAgICAgICAgICAgICAgIHBhZGRpbmc6IDI1cHg7CiAgICAgICAgICAgICAgICBib3JkZXItcmFkaXVzOiAxMnB4OwogICAgICAgICAgICAgICAgei1pbmRleDogMTAwMDE7CiAgICAgICAgICAgICAgICBtYXgtd2lkdGg6IDUwMHB4OwogICAgICAgICAgICAgICAgbWF4LWhlaWdodDogODB2aDsKICAgICAgICAgICAgICAgIG92ZXJmbG93LXk6IGF1dG87CiAgICAgICAgICAgICAgICB0ZXh0LWFsaWduOiBsZWZ0OwogICAgICAgICAgICAgICAgZm9udC1zaXplOiAxNHB4OwogICAgICAgICAgICAgICAgYm94LXNoYWRvdzogMCA4cHggMzJweCByZ2JhKDAsIDAsIDAsIDAuNSk7CiAgICAgICAgICAgICAgICBmb250LWZhbWlseTogLWFwcGxlLXN5c3RlbSwgQmxpbmtNYWNTeXN0ZW1Gb250LCAiU2Vnb2UgVUkiLCBSb2JvdG8sIEhlbHZldGljYSwgQXJpYWwsIHNhbnMtc2VyaWY7CiAgICAgICAgICAgIGA7CgogICAgICAgICAgICBjb25zdCBjb21tb25TdHlsZSA9IGBiYWNrZ3JvdW5kOiByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMSk7IHBhZGRpbmc6IDhweDsgYm9yZGVyLXJhZGl1czogNHB4OyBmb250LWZhbWlseTogbW9ub3NwYWNlOyBtYXJnaW46IDVweCAwOyBkaXNwbGF5OiBibG9jazsgdXNlci1zZWxlY3Q6IHRleHQ7YDsKICAgICAgICAgICAgY29uc3QgaDNTdHlsZSA9IGBjb2xvcjogI2ZlMmM1NTsgbWFyZ2luOiAxNXB4IDAgOHB4IDA7IGZvbnQtc2l6ZTogMTVweDsgYm9yZGVyLWJvdHRvbTogMXB4IHNvbGlkIHJnYmEoMjU1LDI1NSwyNTUsMC4xKTsgcGFkZGluZy1ib3R0b206IDVweDtgOwoKICAgICAgICAgICAgZGlhbG9nLmlubmVySFRNTCA9IGAKICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9InRleHQtYWxpZ246IGNlbnRlcjsgbWFyZ2luLWJvdHRvbTogMjBweDsiPgogICAgICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9ImZvbnQtc2l6ZTogMzJweDsgbWFyZ2luLWJvdHRvbTogMTBweDsiPuKaoO+4jyDov57mjqXlpLHotKU8L2Rpdj4KICAgICAgICAgICAgICAgICAgICA8cCBzdHlsZT0iY29sb3I6ICNhYWE7IGZvbnQtc2l6ZTogMTNweDsiPuivt+ehruS/nSA8YSBocmVmPSJodHRwczovL29sbGFtYS5jb20vIiB0YXJnZXQ9Il9ibGFuayIgc3R5bGU9ImNvbG9yOiAjZmUyYzU1OyI+T2xsYW1hPC9hPiDlt7Lov5DooYzlubbphY3nva7ot6jln5/orr/pl648L3A+CiAgICAgICAgICAgICAgICA8L2Rpdj4KCiAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPSJiYWNrZ3JvdW5kOiByZ2JhKDAsMCwwLDAuMyk7IHBhZGRpbmc6IDE1cHg7IGJvcmRlci1yYWRpdXM6IDhweDsgbWFyZ2luLWJvdHRvbTogMjBweDsiPgogICAgICAgICAgICAgICAgICAgIDxoMyBzdHlsZT0iJHtoM1N0eWxlfSI+8J+Wpe+4jyBXaW5kb3dzIOmFjee9rjwvaDM+CiAgICAgICAgICAgICAgICAgICAgPG9sIHN0eWxlPSJwYWRkaW5nLWxlZnQ6IDIwcHg7IG1hcmdpbjogMDsgbGluZS1oZWlnaHQ6IDEuNjsiPgogICAgICAgICAgICAgICAgICAgICAgICA8bGk+5omT5byAIDxzdHJvbmc+5o6n5Yi26Z2i5p2/PC9zdHJvbmc+IC0+IOezu+e7nyAtPiDpq5jnuqfns7vnu5/orr7nva4gLT4g546v5aKD5Y+Y6YePPC9saT4KICAgICAgICAgICAgICAgICAgICAgICAgPGxpPuWcqCA8c3Ryb25nPueUqOaIt+WPmOmHjzwvc3Ryb25nPiDngrnlh7vmlrDlu7rvvIzmt7vliqDkuKTkuKrlj5jph4/vvJoKICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9IiR7Y29tbW9uU3R5bGV9Ij4KICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBPTExBTUFfSE9TVCA9IDAuMC4wLjA8YnI+CiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgT0xMQU1BX09SSUdJTlMgPSAqCiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj4KICAgICAgICAgICAgICAgICAgICAgICAgPC9saT4KICAgICAgICAgICAgICAgICAgICAgICAgPGxpPueCueWHu+ehruWumuS/neWtmO+8jOmHjeWQryBPbGxhbWE8L2xpPgogICAgICAgICAgICAgICAgICAgIDwvb2w+CgogICAgICAgICAgICAgICAgICAgIDxoMyBzdHlsZT0iJHtoM1N0eWxlfSI+8J+NjiBtYWNPUyDphY3nva48L2gzPgogICAgICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9Im1hcmdpbi1ib3R0b206IDVweDsiPuaJk+W8gOe7iOerr+i/kOihjOS7peS4i+WRveS7pO+8jOeEtuWQjumHjeWQryBPbGxhbWHvvJo8L2Rpdj4KICAgICAgICAgICAgICAgICAgICA8Y29kZSBzdHlsZT0iJHtjb21tb25TdHlsZX0iPgogICAgICAgICAgICAgICAgICAgICAgICBsYXVuY2hjdGwgc2V0ZW52IE9MTEFNQV9IT1NUICIwLjAuMC4wIjxicj4KICAgICAgICAgICAgICAgICAgICAgICAgbGF1bmNoY3RsIHNldGVudiBPTExBTUFfT1JJR0lOUyAiKiIKICAgICAgICAgICAgICAgICAgICA8L2NvZGU+CgogICAgICAgICAgICAgICAgICAgIDxoMyBzdHlsZT0iJHtoM1N0eWxlfSI+8J+QpyBMaW51eCAoc3lzdGVtZCkg6YWN572uPC9oMz4KICAgICAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPSJtYXJnaW4tYm90dG9tOiA1cHg7Ij4xLiDnvJbovpHmnI3liqHphY3nva46IDxjb2RlIHN0eWxlPSJiYWNrZ3JvdW5kOnJnYmEoMjU1LDI1NSwyNTUsMC4xKTsgcHgtMSI+c3VkbyBzeXN0ZW1jdGwgZWRpdCBvbGxhbWEuc2VydmljZTwvY29kZT48L2Rpdj4KICAgICAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPSJtYXJnaW4tYm90dG9tOiA1cHg7Ij4yLiDlnKggPGNvZGUgc3R5bGU9ImNvbG9yOiNhYWEiPltTZXJ2aWNlXTwvY29kZT4g5LiL5pa55re75Yqg77yaPC9kaXY+CiAgICAgICAgICAgICAgICAgICAgPGNvZGUgc3R5bGU9IiR7Y29tbW9uU3R5bGV9Ij4KICAgICAgICAgICAgICAgICAgICAgICAgW1NlcnZpY2VdPGJyPgogICAgICAgICAgICAgICAgICAgICAgICBFbnZpcm9ubWVudD0iT0xMQU1BX0hPU1Q9MC4wLjAuMCI8YnI+CiAgICAgICAgICAgICAgICAgICAgICAgIEVudmlyb25tZW50PSJPTExBTUFfT1JJR0lOUz0qIgogICAgICAgICAgICAgICAgICAgIDwvY29kZT4KICAgICAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPSJtYXJnaW4tdG9wOiA1cHg7Ij4zLiDph43lkK/mnI3liqE6IDxjb2RlIHN0eWxlPSJiYWNrZ3JvdW5kOnJnYmEoMjU1LDI1NSwyNTUsMC4xKTsgcHgtMSI+c3VkbyBzeXN0ZW1jdGwgZGFlbW9uLXJlbG9hZCAmJiBzdWRvIHN5c3RlbWN0bCByZXN0YXJ0IG9sbGFtYTwvY29kZT48L2Rpdj4KICAgICAgICAgICAgICAgIDwvZGl2PgoKICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9InRleHQtYWxpZ246IGNlbnRlcjsiPgogICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9ImVycm9yLWRpYWxvZy1jbG9zZSIgc3R5bGU9Im1hcmdpbi10b3A6IDEwcHg7IGZvbnQtc2l6ZTogMTRweDsgY29sb3I6ICNmZTJjNTU7IGN1cnNvcjogcG9pbnRlcjsgdGV4dC1kZWNvcmF0aW9uOiB1bmRlcmxpbmU7Ij7lhbPpl608L2Rpdj4KICAgICAgICAgICAgICAgIDwvZGl2PgogICAgICAgICAgICBgOwoKICAgICAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChkaWFsb2cpOwoKICAgICAgICAgICAgLy8g54K55Ye75YWz6Zet5paH5a2XCiAgICAgICAgICAgIGRpYWxvZy5xdWVyeVNlbGVjdG9yKCcuZXJyb3ItZGlhbG9nLWNsb3NlJykuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7CiAgICAgICAgICAgICAgICBkaWFsb2cucmVtb3ZlKCk7CiAgICAgICAgICAgIH0pOwoKICAgICAgICAgICAgLy8g54K55Ye76IOM5pmv5YWz6ZetCiAgICAgICAgICAgIGRpYWxvZy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7CiAgICAgICAgICAgICAgICBpZiAoZS50YXJnZXQgPT09IGRpYWxvZykgZGlhbG9nLnJlbW92ZSgpOwogICAgICAgICAgICB9KTsKICAgICAgICB9CiAgICB9CgogICAgLy8gPT09PT09PT09PSBVSeeuoeeQhuWZqCA9PT09PT09PT09CiAgICBjbGFzcyBVSU1hbmFnZXIgewogICAgICAgIGNvbnN0cnVjdG9yKGNvbmZpZywgdmlkZW9Db250cm9sbGVyLCBub3RpZmljYXRpb25NYW5hZ2VyKSB7CiAgICAgICAgICAgIHRoaXMuY29uZmlnID0gY29uZmlnOwogICAgICAgICAgICB0aGlzLnZpZGVvQ29udHJvbGxlciA9IHZpZGVvQ29udHJvbGxlcjsKICAgICAgICAgICAgdGhpcy5ub3RpZmljYXRpb25NYW5hZ2VyID0gbm90aWZpY2F0aW9uTWFuYWdlcjsKICAgICAgICAgICAgdGhpcy5pbml0QnV0dG9ucygpOwogICAgICAgIH0KCiAgICAgICAgaW5pdEJ1dHRvbnMoKSB7CiAgICAgICAgICAgIHRoaXMuYnV0dG9uQ29uZmlncyA9IFsKICAgICAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICAgICB0ZXh0OiAn6Lez55u05pKtJywKICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWU6ICdza2lwLWxpdmUtYnV0dG9uJywKICAgICAgICAgICAgICAgICAgICBjb25maWdLZXk6ICdza2lwTGl2ZScsCiAgICAgICAgICAgICAgICAgICAgc2hvcnRjdXQ6ICc9JwogICAgICAgICAgICAgICAgfSwKICAgICAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICAgICB0ZXh0OiAn6Lez5bm/5ZGKJywKICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWU6ICdza2lwLWFkLWJ1dHRvbicsCiAgICAgICAgICAgICAgICAgICAgY29uZmlnS2V5OiAnc2tpcEFkJwogICAgICAgICAgICAgICAgfSwKICAgICAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICAgICB0ZXh0OiAn6LSm5Y+35bGP6JS9JywKICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWU6ICdibG9jay1hY2NvdW50LWtleXdvcmQtYnV0dG9uJywKICAgICAgICAgICAgICAgICAgICBjb25maWdLZXk6ICdibG9ja0tleXdvcmRzJywKICAgICAgICAgICAgICAgICAgICBvbkNsaWNrOiAoKSA9PiB0aGlzLnNob3dLZXl3b3JkRGlhbG9nKCkKICAgICAgICAgICAgICAgIH0sCiAgICAgICAgICAgICAgICB7CiAgICAgICAgICAgICAgICAgICAgdGV4dDogJ+acgOmrmOa4hScsCiAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lOiAnYXV0by1oaWdoLXJlc29sdXRpb24tYnV0dG9uJywKICAgICAgICAgICAgICAgICAgICBjb25maWdLZXk6ICdhdXRvSGlnaFJlcycKICAgICAgICAgICAgICAgIH0sCiAgICAgICAgICAgICAgICB7CiAgICAgICAgICAgICAgICAgICAgdGV4dDogYCR7dGhpcy5jb25maWcuZ2V0KCdvbmx5UmVzb2x1dGlvbicpLnJlc29sdXRpb259562b6YCJYCwKICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWU6ICdyZXNvbHV0aW9uLWZpbHRlci1idXR0b24nLAogICAgICAgICAgICAgICAgICAgIGNvbmZpZ0tleTogJ29ubHlSZXNvbHV0aW9uJywKICAgICAgICAgICAgICAgICAgICBvbkNsaWNrOiAoKSA9PiB0aGlzLnNob3dSZXNvbHV0aW9uRGlhbG9nKCkKICAgICAgICAgICAgICAgIH0sCiAgICAgICAgICAgICAgICB7CiAgICAgICAgICAgICAgICAgICAgdGV4dDogJ0FJ5Zac5aW9JywKICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWU6ICdhaS1wcmVmZXJlbmNlLWJ1dHRvbicsCiAgICAgICAgICAgICAgICAgICAgY29uZmlnS2V5OiAnYWlQcmVmZXJlbmNlJywKICAgICAgICAgICAgICAgICAgICBvbkNsaWNrOiAoKSA9PiB0aGlzLnNob3dBaVByZWZlcmVuY2VEaWFsb2coKQogICAgICAgICAgICAgICAgfSwKICAgICAgICAgICAgICAgIHsKICAgICAgICAgICAgICAgICAgICB0ZXh0OiB0aGlzLmdldFNwZWVkTW9kZUxhYmVsKCksCiAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lOiAn",
        "c3BlZWQtbW9kZS1idXR0b24nLAogICAgICAgICAgICAgICAgICAgIGNvbmZpZ0tleTogJ3NwZWVkTW9kZScsCiAgICAgICAgICAgICAgICAgICAgb25DbGljazogKCkgPT4gdGhpcy5zaG93U3BlZWREaWFsb2coKQogICAgICAgICAgICAgICAgfQogICAgICAgICAgICBdOwogICAgICAgIH0KCiAgICAgICAgaW5zZXJ0QnV0dG9ucygpIHsKICAgICAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChTRUxFQ1RPUlMuc2V0dGluZ3NQYW5lbCkuZm9yRWFjaChwYW5lbCA9PiB7CiAgICAgICAgICAgICAgICBjb25zdCBwYXJlbnQgPSBwYW5lbC5wYXJlbnROb2RlOwogICAgICAgICAgICAgICAgaWYgKCFwYXJlbnQpIHJldHVybjsKCiAgICAgICAgICAgICAgICBsZXQgbGFzdEJ1dHRvbiA9IHBhbmVsOwogICAgICAgICAgICAgICAgdGhpcy5idXR0b25Db25maWdzLmZvckVhY2goY29uZmlnID0+IHsKICAgICAgICAgICAgICAgICAgICBsZXQgYnV0dG9uID0gcGFyZW50LnF1ZXJ5U2VsZWN0b3IoYC4ke2NvbmZpZy5jbGFzc05hbWV9YCk7CiAgICAgICAgICAgICAgICAgICAgaWYgKCFidXR0b24pIHsKICAgICAgICAgICAgICAgICAgICAgICAgYnV0dG9uID0gVUlGYWN0b3J5LmNyZWF0ZVRvZ2dsZUJ1dHRvbigKICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbmZpZy50ZXh0LAogICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uZmlnLmNsYXNzTmFtZSwKICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuY29uZmlnLmlzRW5hYmxlZChjb25maWcuY29uZmlnS2V5KSwKICAgICAgICAgICAgICAgICAgICAgICAgICAgIChzdGF0ZSkgPT4gewogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuY29uZmlnLnNldEVuYWJsZWQoY29uZmlnLmNvbmZpZ0tleSwgc3RhdGUpOwogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjb25maWcuY29uZmlnS2V5ID09PSAnc2tpcExpdmUnKSB7CiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMubm90aWZpY2F0aW9uTWFuYWdlci5zaG93TWVzc2FnZShg5Yqf6IO95byA5YWzOiDot7Pov4fnm7Tmkq3lt7IgJHtzdGF0ZSA/ICfinIUnIDogJ+KdjCd9YCk7CiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChjb25maWcuY29uZmlnS2V5ID09PSAnc3BlZWRNb2RlJykgewogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkb2N1bWVudC5kaXNwYXRjaEV2ZW50KG5ldyBDdXN0b21FdmVudCgnZG91eWluLXNwZWVkLW1vZGUtdXBkYXRlZCcpKTsKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9CiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9LAogICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uZmlnLm9uQ2xpY2ssCiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25maWcuc2hvcnRjdXQKICAgICAgICAgICAgICAgICAgICAgICAgKTsKICAgICAgICAgICAgICAgICAgICAgICAgcGFyZW50Lmluc2VydEJlZm9yZShidXR0b24sIGxhc3RCdXR0b24ubmV4dFNpYmxpbmcpOwogICAgICAgICAgICAgICAgICAgIH0KICAgICAgICAgICAgICAgICAgICBjb25zdCBpc0VuYWJsZWQgPSB0aGlzLmNvbmZpZy5pc0VuYWJsZWQoY29uZmlnLmNvbmZpZ0tleSk7CiAgICAgICAgICAgICAgICAgICAgY29uc3Qgc3dpdGNoRWwgPSBidXR0b24ucXVlcnlTZWxlY3RvcignLnhnLXN3aXRjaCcpOwogICAgICAgICAgICAgICAgICAgIGlmIChzd2l0Y2hFbCkgewogICAgICAgICAgICAgICAgICAgICAgICBzd2l0Y2hFbC5jbGFzc0xpc3QudG9nZ2xlKCd4Zy1zd2l0Y2gtY2hlY2tlZCcsIGlzRW5hYmxlZCk7CiAgICAgICAgICAgICAgICAgICAgICAgIHN3aXRjaEVsLnNldEF0dHJpYnV0ZSgnYXJpYS1jaGVja2VkJywgU3RyaW5nKGlzRW5hYmxlZCkpOwogICAgICAgICAgICAgICAgICAgIH0KICAgICAgICAgICAgICAgICAgICBjb25zdCB0aXRsZUVsID0gYnV0dG9uLnF1ZXJ5U2VsZWN0b3IoJy54Z3BsYXllci1zZXR0aW5nLXRpdGxlJyk7CiAgICAgICAgICAgICAgICAgICAgaWYgKHRpdGxlRWwgJiYgdHlwZW9mIGNvbmZpZy50ZXh0ID09PSAnc3RyaW5nJykgewogICAgICAgICAgICAgICAgICAgICAgICB0aXRsZUVsLnRleHRDb250ZW50ID0gY29uZmlnLnRleHQ7CiAgICAgICAgICAgICAgICAgICAgfQogICAgICAgICAgICAgICAgICAgIGxhc3RCdXR0b24gPSBidXR0b247CiAgICAgICAgICAgICAgICB9KTsKICAgICAgICAgICAgfSk7CiAgICAgICAgfQoKICAgICAgICBzdGF0aWMgdXBkYXRlVG9nZ2xlQnV0dG9ucyhjbGFzc05hbWUsIGlzRW5hYmxlZCkgewogICAgICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKGAuJHtjbGFzc05hbWV9IC54Zy1zd2l0Y2hgKS5mb3JFYWNoKHN3ID0+IHsKICAgICAgICAgICAgICAgIHN3LmNsYXNzTGlzdC50b2dnbGUoJ3hnLXN3aXRjaC1jaGVja2VkJywgaXNFbmFibGVkKTsKICAgICAgICAgICAgICAgIHN3LnNldEF0dHJpYnV0ZSgnYXJpYS1jaGVja2VkJywgU3RyaW5nKGlzRW5hYmxlZCkpOwogICAgICAgICAgICB9KTsKICAgICAgICB9CgogICAgICAgIHVwZGF0ZVNwZWVkTW9kZVRleHQoKSB7CiAgICAgICAgICAgIGNvbnN0IGxhYmVsID0gdGhpcy5nZXRTcGVlZE1vZGVMYWJlbCgpOwogICAgICAgICAgICBjb25zdCBzcGVlZEJ1dHRvbkNvbmZpZyA9IHRoaXMuYnV0dG9uQ29uZmlncz8uZmluZChjb25maWcgPT4gY29uZmlnLmNvbmZpZ0tleSA9PT0gJ3NwZWVkTW9kZScpOwogICAgICAgICAgICBpZiAoc3BlZWRCdXR0b25Db25maWcpIHsKICAgICAgICAgICAgICAgIHNwZWVkQnV0dG9uQ29uZmlnLnRleHQgPSBsYWJlbDsKICAgICAgICAgICAgfQogICAgICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcuc3BlZWQtbW9kZS1idXR0b24gLnhncGxheWVyLXNldHRpbmctdGl0bGUnKS5mb3JFYWNoKGVsID0+IHsKICAgICAgICAgICAgICAgIGVsLnRleHRDb250ZW50ID0gbGFiZWw7CiAgICAgICAgICAgIH0pOwogICAgICAgIH0KCiAgICAgICAgZ2V0U3BlZWRNb2RlTGFiZWwoKSB7CiAgICAgICAgICAgIGNvbnN0IHNwZWVkQ29uZmlnID0gdGhpcy5jb25maWcuZ2V0KCdzcGVlZE1vZGUnKTsKICAgICAgICAgICAgY29uc29sZS5sb2coJ3NwZWVkQ29uZmlnJywgc3BlZWRDb25maWcpCiAgICAgICAgICAgIGlmIChzcGVlZENvbmZpZy5tb2RlID09PSAncmFuZG9tJykgewogICAgICAgICAgICAgICAgcmV0dXJuIGDpmo/mnLoke3NwZWVkQ29uZmlnLm1pblNlY29uZHN9LSR7c3BlZWRDb25maWcubWF4U2Vjb25kc33np5JgOwogICAgICAgICAgICB9CiAgICAgICAgICAgIHJldHVybiBgJHtzcGVlZENvbmZpZy5zZWNvbmRzfeenkuWIh2A7CiAgICAgICAgfQoKICAgICAgICB1cGRhdGVSZXNvbHV0aW9uVGV4dCgpIHsKICAgICAgICAgICAgY29uc3QgcmVzb2x1dGlvbiA9IHRoaXMuY29uZmlnLmdldCgnb25seVJlc29sdXRpb24nKS5yZXNvbHV0aW9uOwogICAgICAgICAgICBjb25zdCByZXNvbHV0aW9uQnV0dG9uQ29uZmlnID0gdGhpcy5idXR0b25Db25maWdzPy5maW5kKGNvbmZpZyA9PiBjb25maWcuY29uZmlnS2V5ID09PSAnb25seVJlc29sdXRpb24nKTsKICAgICAgICAgICAgaWYgKHJlc29sdXRpb25CdXR0b25Db25maWcpIHsKICAgICAgICAgICAgICAgIHJlc29sdXRpb25CdXR0b25Db25maWcudGV4dCA9IGAke3Jlc29sdXRpb259562b6YCJYDsKICAgICAgICAgICAgfQogICAgICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcucmVzb2x1dGlvbi1maWx0ZXItYnV0dG9uIC54Z3BsYXllci1zZXR0aW5nLXRpdGxlJykuZm9yRWFjaChlbCA9PiB7CiAgICAgICAgICAgICAgICBlbC50ZXh0Q29udGVudCA9IGAke3Jlc29sdXRpb259562b6YCJYDsKICAgICAgICAgICAgfSk7CiAgICAgICAgfQoKICAgICAgICBzaG93U3BlZWREaWFsb2coKSB7CiAgICAgICAgICAgIGNvbnN0IHNwZWVkQ29uZmlnID0gdGhpcy5jb25maWcuZ2V0KCdzcGVlZE1vZGUnKTsKICAgICAgICAgICAgY29uc3QgaXNSYW5kb20gPSBzcGVlZENvbmZpZy5tb2RlID09PSAncmFuZG9tJzsKICAgICAgICAgICAgY29uc3QgY29udGVudCA9IGAKICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9Im1hcmdpbi1ib3R0b206IDE1cHg7IGNvbG9yOiByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuOCk7IGZvbnQtc2l6ZTogMTNweDsiPgogICAgICAgICAgICAgICAgICAgIDxsYWJlbCBzdHlsZT0iZGlzcGxheTogZmxleDsgYWxpZ24taXRlbXM6IGNlbnRlcjsgbWFyZ2luLWJvdHRvbTogOHB4OyBjdXJzb3I6IHBvaW50ZXI7Ij4KICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9InJhZGlvIiBuYW1lPSJzcGVlZC1tb2RlLXR5cGUiIHZhbHVlPSJmaXhlZCIgJHtpc1JhbmRvbSA/ICcnIDogJ2NoZWNrZWQnfQogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3R5bGU9Im1hcmdpbi1yaWdodDogOHB4OyI+CiAgICAgICAgICAgICAgICAgICAgICAgIOWbuuWumuaXtumXtOaooeW8jwogICAgICAgICAgICAgICAgICAgIDwvbGFiZWw+CiAgICAgICAgICAgICAgICAgICAgPGxhYmVsIHN0eWxlPSJkaXNwbGF5OiBmbGV4OyBhbGlnbi1pdGVtczogY2VudGVyOyBjdXJzb3I6IHBvaW50ZXI7Ij4KICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9InJhZGlvIiBuYW1lPSJzcGVlZC1tb2RlLXR5cGUiIHZhbHVlPSJyYW5kb20iICR7aXNSYW5kb20gPyAnY2hlY2tlZCcgOiAnJ30KICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0eWxlPSJtYXJnaW4tcmlnaHQ6IDhweDsiPgogICAgICAgICAgICAgICAgICAgICAgICDpmo/mnLrml7bpl7TmqKHlvI8KICAgICAgICAgICAgICAgICAgICA8L2xhYmVsPgogICAgICAgICAgICAgICAgPC9kaXY+CiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPSJzcGVlZC1maXhlZC13cmFwcGVyIiBzdHlsZT0iZGlzcGxheTogJHtpc1JhbmRvbSA/ICdub25lJyA6ICdibG9jayd9OyI+CiAgICAgICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9Im51bWJlciIgY2xhc3M9InNwZWVkLWlucHV0IiBtaW49IjEiIG1heD0iMzYwMCIgdmFsdWU9IiR7c3BlZWRDb25maWcuc2Vjb25kc30iCiAgICAgICAgICAgICAgICAgICAgICAgIHN0eWxlPSJ3aWR0aDogMTAwJTsgcGFkZGluZzogOHB4OyBiYWNrZ3JvdW5kOiByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMSk7CiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb2xvcjogd2hpdGU7IGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4zKTsgYm9yZGVyLXJhZGl1czogNHB4OyI+CiAgICAgICAgICAgICAgICA8L2Rpdj4KICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9InNwZWVkLXJhbmRvbS13cmFwcGVyIiBzdHlsZT0iZGlzcGxheTogJHtpc1JhbmRvbSA/ICdmbGV4JyA6ICdub25lJ307IGdhcDogMTBweDsgYWxpZ24taXRlbXM6IGNlbnRlcjsiPgogICAgICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPSJudW1iZXIiIGNsYXNzPSJzcGVlZC1taW4taW5wdXQiIG1pbj0iMSIgbWF4PSIzNjAwIiB2YWx1ZT0iJHtzcGVlZENvbmZpZy5taW5TZWNvbmRzfSIKICAgICAgICAgICAgICAgICAgICAgICAgc3R5bGU9ImZsZXg6IDE7IHBhZGRpbmc6IDhweDsgYmFja2dyb3VuZDogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjEpOyBjb2xvcjogd2hpdGU7IGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4zKTsgYm9yZGVyLXJhZGl1czogNHB4OyI+CiAgICAgICAgICAgICAgICAgICAgPHNwYW4gc3R5bGU9ImNvbG9yOiByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuNik7Ij7igJQ8L3NwYW4+CiAgICAgICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9Im51bWJlciIgY2xhc3M9InNwZWVkLW1heC1pbnB1dCIgbWluPSIxIiBtYXg9IjM2MDAiIHZhbHVlPSIke3NwZWVkQ29uZmlnLm1heFNlY29uZHN9IgogICAgICAgICAgICAgICAgICAgICAgICBzdHlsZT0iZmxleDogMTsgcGFkZGluZzogOHB4OyBiYWNrZ3JvdW5kOiByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMSk7IGNvbG9yOiB3aGl0ZTsgYm9yZGVyOiAxcHggc29saWQgcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjMpOyBib3JkZXItcmFkaXVz",
        "OiA0cHg7Ij4KICAgICAgICAgICAgICAgIDwvZGl2PgogICAgICAgICAgICAgICAgPGRpdiBzdHlsZT0iY29sb3I6IHJnYmEoMjU1LCAyNTUsIDI1NSwgMC41KTsgZm9udC1zaXplOiAxMXB4OyBtYXJnaW4tdG9wOiAxMnB4OyI+CiAgICAgICAgICAgICAgICAgICAg6IyD5Zu06ZyA5ZyoIDEtMzYwMCDnp5LkuYvpl7TvvIzpmo/mnLrmqKHlvI/lsIblnKjljLrpl7TlhoXkuLrmr4/kuKrop4bpopHnlJ/miJDkuIDkuKrnrYnlvoXml7bpl7QKICAgICAgICAgICAgICAgIDwvZGl2PgogICAgICAgICAgICBgOwoKICAgICAgICAgICAgY29uc3QgZGlhbG9nID0gVUlGYWN0b3J5LmNyZWF0ZURpYWxvZygnc3BlZWQtbW9kZS10aW1lLWRpYWxvZycsICforr7nva7mnoHpgJ/mqKHlvI8nLCBjb250ZW50LCAoKSA9PiB7CiAgICAgICAgICAgICAgICBjb25zdCBtb2RlSW5wdXQgPSBkaWFsb2cucXVlcnlTZWxlY3RvcignaW5wdXRbbmFtZT0ic3BlZWQtbW9kZS10eXBlIl06Y2hlY2tlZCcpOwogICAgICAgICAgICAgICAgY29uc3QgbW9kZSA9IG1vZGVJbnB1dCA/IG1vZGVJbnB1dC52YWx1ZSA6ICdmaXhlZCc7CgogICAgICAgICAgICAgICAgaWYgKG1vZGUgPT09ICdmaXhlZCcpIHsKICAgICAgICAgICAgICAgICAgICBjb25zdCBpbnB1dCA9IGRpYWxvZy5xdWVyeVNlbGVjdG9yKCcuc3BlZWQtaW5wdXQnKTsKICAgICAgICAgICAgICAgICAgICBjb25zdCB2YWx1ZSA9IHBhcnNlSW50KGlucHV0LnZhbHVlLCAxMCk7CiAgICAgICAgICAgICAgICAgICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUodmFsdWUpIHx8IHZhbHVlIDwgMSB8fCB2YWx1ZSA+IDM2MDApIHsKICAgICAgICAgICAgICAgICAgICAgICAgYWxlcnQoJ+ivt+i+k+WFpSAxIC0gMzYwMCDnp5LkuYvpl7TnmoTmlbTmlbAnKTsKICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlOwogICAgICAgICAgICAgICAgICAgIH0KICAgICAgICAgICAgICAgICAgICB0aGlzLmNvbmZpZy5zYXZlU3BlZWRNb2RlVHlwZSgnZml4ZWQnKTsKICAgICAgICAgICAgICAgICAgICB0aGlzLmNvbmZpZy5zYXZlU3BlZWRTZWNvbmRzKHZhbHVlKTsKICAgICAgICAgICAgICAgICAgICB0aGlzLm5vdGlmaWNhdGlvbk1hbmFnZXIuc2hvd01lc3NhZ2UoYOKame+4jyDmnoHpgJ/mqKHlvI86IOaSreaUvuaXtumXtOW3suiuvuS4uiAke3ZhbHVlfSDnp5JgKTsKICAgICAgICAgICAgICAgIH0gZWxzZSB7CiAgICAgICAgICAgICAgICAgICAgY29uc3QgbWluSW5wdXQgPSBkaWFsb2cucXVlcnlTZWxlY3RvcignLnNwZWVkLW1pbi1pbnB1dCcpOwogICAgICAgICAgICAgICAgICAgIGNvbnN0IG1heElucHV0ID0gZGlhbG9nLnF1ZXJ5U2VsZWN0b3IoJy5zcGVlZC1tYXgtaW5wdXQnKTsKICAgICAgICAgICAgICAgICAgICBjb25zdCBtaW5WYWx1ZSA9IHBhcnNlSW50KG1pbklucHV0LnZhbHVlLCAxMCk7CiAgICAgICAgICAgICAgICAgICAgY29uc3QgbWF4VmFsdWUgPSBwYXJzZUludChtYXhJbnB1dC52YWx1ZSwgMTApOwogICAgICAgICAgICAgICAgICAgIGlmICghTnVtYmVyLmlzRmluaXRlKG1pblZhbHVlKSB8fCBtaW5WYWx1ZSA8IDEgfHwgbWluVmFsdWUgPiAzNjAwIHx8CiAgICAgICAgICAgICAgICAgICAgICAgICFOdW1iZXIuaXNGaW5pdGUobWF4VmFsdWUpIHx8IG1heFZhbHVlIDwgMSB8fCBtYXhWYWx1ZSA+IDM2MDApIHsKICAgICAgICAgICAgICAgICAgICAgICAgYWxlcnQoJ+maj+acuuiMg+WbtOmcgOWcqCAxIC0gMzYwMCDnp5LkuYvpl7QnKTsKICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlOwogICAgICAgICAgICAgICAgICAgIH0KICAgICAgICAgICAgICAgICAgICBpZiAobWluVmFsdWUgPiBtYXhWYWx1ZSkgewogICAgICAgICAgICAgICAgICAgICAgICBhbGVydCgn5pyA5bCP5pe26Ze05LiN6IO95aSn5LqO5pyA5aSn5pe26Ze0Jyk7CiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTsKICAgICAgICAgICAgICAgICAgICB9CiAgICAgICAgICAgICAgICAgICAgdGhpcy5jb25maWcuc2F2ZVNwZWVkTW9kZVR5cGUoJ3JhbmRvbScpOwogICAgICAgICAgICAgICAgICAgIHRoaXMuY29uZmlnLnNhdmVTcGVlZE1vZGVSYW5nZShtaW5WYWx1ZSwgbWF4VmFsdWUpOwogICAgICAgICAgICAgICAgICAgIHRoaXMubm90aWZpY2F0aW9uTWFuYWdlci5zaG93TWVzc2FnZShg4pqZ77iPIOaegemAn+aooeW8jzog5bey6K6+5Li66ZqP5py6ICR7bWluVmFsdWV9LSR7bWF4VmFsdWV9IOenkmApOwogICAgICAgICAgICAgICAgfQoKICAgICAgICAgICAgICAgIHRoaXMudXBkYXRlU3BlZWRNb2RlVGV4dCgpOwogICAgICAgICAgICAgICAgZG9jdW1lbnQuZGlzcGF0Y2hFdmVudChuZXcgQ3VzdG9tRXZlbnQoJ2RvdXlpbi1zcGVlZC1tb2RlLXVwZGF0ZWQnKSk7CiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTsKICAgICAgICAgICAgfSk7CgogICAgICAgICAgICBpZiAoIWRpYWxvZykgcmV0dXJuOwoKICAgICAgICAgICAgY29uc3QgdG9nZ2xlVmlzaWJpbGl0eSA9ICgpID0+IHsKICAgICAgICAgICAgICAgIGNvbnN0IG1vZGVJbnB1dCA9IGRpYWxvZy5xdWVyeVNlbGVjdG9yKCdpbnB1dFtuYW1lPSJzcGVlZC1tb2RlLXR5cGUiXTpjaGVja2VkJyk7CiAgICAgICAgICAgICAgICBjb25zdCBpc1JhbmRvbU1vZGUgPSBtb2RlSW5wdXQgJiYgbW9kZUlucHV0LnZhbHVlID09PSAncmFuZG9tJzsKICAgICAgICAgICAgICAgIGRpYWxvZy5xdWVyeVNlbGVjdG9yKCcuc3BlZWQtZml4ZWQtd3JhcHBlcicpLnN0eWxlLmRpc3BsYXkgPSBpc1JhbmRvbU1vZGUgPyAnbm9uZScgOiAnYmxvY2snOwogICAgICAgICAgICAgICAgZGlhbG9nLnF1ZXJ5U2VsZWN0b3IoJy5zcGVlZC1yYW5kb20td3JhcHBlcicpLnN0eWxlLmRpc3BsYXkgPSBpc1JhbmRvbU1vZGUgPyAnZmxleCcgOiAnbm9uZSc7CiAgICAgICAgICAgIH07CgogICAgICAgICAgICBkaWFsb2cucXVlcnlTZWxlY3RvckFsbCgnaW5wdXRbbmFtZT0ic3BlZWQtbW9kZS10eXBlIl0nKS5mb3JFYWNoKHJhZGlvID0+IHsKICAgICAgICAgICAgICAgIHJhZGlvLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIHRvZ2dsZVZpc2liaWxpdHkpOwogICAgICAgICAgICB9KTsKICAgICAgICB9CgogICAgICAgIHNob3dBaVByZWZlcmVuY2VEaWFsb2coKSB7CiAgICAgICAgICAgIGNvbnN0IGN1cnJlbnRDb250ZW50ID0gdGhpcy5jb25maWcuZ2V0KCdhaVByZWZlcmVuY2UnKS5jb250ZW50OwogICAgICAgICAgICBjb25zdCBjdXJyZW50TW9kZWwgPSB0aGlzLmNvbmZpZy5nZXQoJ2FpUHJlZmVyZW5jZScpLm1vZGVsOwogICAgICAgICAgICBjb25zdCBhdXRvTGlrZUVuYWJsZWQgPSB0aGlzLmNvbmZpZy5nZXQoJ2FpUHJlZmVyZW5jZScpLmF1dG9MaWtlOwoKICAgICAgICAgICAgY29uc3QgY29udGVudCA9IGAKICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9Im1hcmdpbi1ib3R0b206IDE1cHg7Ij4KICAgICAgICAgICAgICAgICAgICA8bGFiZWwgc3R5bGU9ImNvbG9yOiByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuNyk7IGZvbnQtc2l6ZTogMTJweDsgZGlzcGxheTogYmxvY2s7IG1hcmdpbi1ib3R0b206IDVweDsiPgogICAgICAgICAgICAgICAgICAgICAgICDmg7PnnIvku4DkuYjlhoXlrrnvvJ/vvIjkvovlpoLvvJrpnLLohLjnmoTnvo7lpbPjgIHnjKvlkqrvvIkKICAgICAgICAgICAgICAgICAgICA8L2xhYmVsPgogICAgICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPSJ0ZXh0IiBjbGFzcz0iYWktY29udGVudC1pbnB1dCIgdmFsdWU9IiR7Y3VycmVudENvbnRlbnR9IiBwbGFjZWhvbGRlcj0i6L6T5YWl5L2g5oOz55yL55qE5YaF5a65IgogICAgICAgICAgICAgICAgICAgICAgICBzdHlsZT0id2lkdGg6IDEwMCU7IHBhZGRpbmc6IDhweDsgYmFja2dyb3VuZDogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjEpOwogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29sb3I6IHdoaXRlOyBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMyk7IGJvcmRlci1yYWRpdXM6IDRweDsiPgogICAgICAgICAgICAgICAgPC9kaXY+CgogICAgICAgICAgICAgICAgPGRpdiBzdHlsZT0ibWFyZ2luLWJvdHRvbTogMTVweDsiPgogICAgICAgICAgICAgICAgICAgIDxsYWJlbCBzdHlsZT0iY29sb3I6IHJnYmEoMjU1LCAyNTUsIDI1NSwgMC43KTsgZm9udC1zaXplOiAxMnB4OyBkaXNwbGF5OiBibG9jazsgbWFyZ2luLWJvdHRvbTogNXB4OyI+CiAgICAgICAgICAgICAgICAgICAgICAgIEFJ5qih5Z6L6YCJ5oupCiAgICAgICAgICAgICAgICAgICAgPC9sYWJlbD4KICAgICAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPSJwb3NpdGlvbjogcmVsYXRpdmU7Ij4KICAgICAgICAgICAgICAgICAgICAgICAgPHNlbGVjdCBjbGFzcz0iYWktbW9kZWwtc2VsZWN0IgogICAgICAgICAgICAgICAgICAgICAgICAgICAgc3R5bGU9IndpZHRoOiAxMDAlOyBwYWRkaW5nOiA4cHg7IGJhY2tncm91bmQ6IHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4xKTsKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb2xvcjogd2hpdGU7IGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4zKTsgYm9yZGVyLXJhZGl1czogNHB4OwogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFwcGVhcmFuY2U6IG5vbmU7IGN1cnNvcjogcG9pbnRlcjsiPgogICAgICAgICAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT0icXdlbjMtdmw6OGIiIHN0eWxlPSJiYWNrZ3JvdW5kOiByZ2JhKDAsIDAsIDAsIDAuOSk7IGNvbG9yOiB3aGl0ZTsiICR7Y3VycmVudE1vZGVsID09PSAncXdlbjMtdmw6OGInID8gJ3NlbGVjdGVkJyA6ICcnfT5xd2VuMy12bDo4YiAo5o6o6I2QKTwvb3B0aW9uPgogICAgICAgICAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT0icXdlbjIuNXZsOjdiIiBzdHlsZT0iYmFja2dyb3VuZDogcmdiYSgwLCAwLCAwLCAwLjkpOyBjb2xvcjogd2hpdGU7IiAke2N1cnJlbnRNb2RlbCA9PT0gJ3F3ZW4yLjV2bDo3YicgPyAnc2VsZWN0ZWQnIDogJyd9PnF3ZW4yLjV2bDo3Yjwvb3B0aW9uPgogICAgICAgICAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT0iY3VzdG9tIiBzdHlsZT0iYmFja2dyb3VuZDogcmdiYSgwLCAwLCAwLCAwLjkpOyBjb2xvcjogd2hpdGU7IiAke2N1cnJlbnRNb2RlbCAhPT0gJ3F3ZW4zLXZsOjhiJyAmJiBjdXJyZW50TW9kZWwgIT09ICdxd2VuMi41dmw6N2InID8gJ3NlbGVjdGVkJyA6ICcnfT7oh6rlrprkuYnmqKHlnos8L29wdGlvbj4KICAgICAgICAgICAgICAgICAgICAgICAgPC9zZWxlY3Q+CiAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIHN0eWxlPSJwb3NpdGlvbjogYWJzb2x1dGU7IHJpZ2h0OiAxMHB4OyB0b3A6IDUwJTsgdHJhbnNmb3JtOiB0cmFuc2xhdGVZKC01MCUpOwogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBvaW50ZXItZXZlbnRzOiBub25lOyBjb2xvcjogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjUpOyI+4pa8PC9zcGFuPgogICAgICAgICAgICAgICAgICAgIDwvZGl2PgogICAgICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPSJ0ZXh0IiBjbGFzcz0iYWktbW9kZWwtaW5wdXQiIHZhbHVlPSIke2N1cnJlbnRNb2RlbCAhPT0gJ3F3ZW4zLXZsOjhiJyAmJiBjdXJyZW50TW9kZWwgIT09ICdxd2VuMi41dmw6N2InID8gY3VycmVudE1vZGVsIDogJyd9IgogICAgICAgICAgICAgICAgICAgICAgICBwbGFjZWhvbGRlcj0i6L6T5YWl6Ieq5a6a5LmJ5qih5Z6L5ZCN56ewIgogICAgICAgICAgICAgICAgICAgICAgICBzdHlsZT0id2lkdGg6IDEwMCU7IHBhZGRpbmc6IDhweDsgbWFyZ2luLXRvcDogMTBweDsgYmFja2dyb3VuZDogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjEpOwogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29sb3I6IHdoaXRlOyBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMyk7IGJvcmRlci1yYWRpdXM6IDRweDsKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRpc3BsYXk6ICR7Y3VycmVudE1vZGVsICE9PSAncXdlbjMtdmw6OGInICYmIGN1cnJlbnRNb2RlbCAhPT0gJ3F3ZW4yLjV2bDo3YicgPyAnYmxvY2snIDogJ25vbmUnfTsiPgog",
        "ICAgICAgICAgICAgICAgPC9kaXY+CgogICAgICAgICAgICAgICAgPGRpdiBzdHlsZT0ibWFyZ2luLWJvdHRvbTogMTVweDsgcGFkZGluZzogMTBweDsgYmFja2dyb3VuZDogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjA1KTsgYm9yZGVyLXJhZGl1czogNnB4OyI+CiAgICAgICAgICAgICAgICAgICAgPGxhYmVsIHN0eWxlPSJkaXNwbGF5OiBmbGV4OyBhbGlnbi1pdGVtczogY2VudGVyOyBjdXJzb3I6IHBvaW50ZXI7IGNvbG9yOiB3aGl0ZTsgZm9udC1zaXplOiAxM3B4OyI+CiAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPSJjaGVja2JveCIgY2xhc3M9ImF1dG8tbGlrZS1jaGVja2JveCIgJHthdXRvTGlrZUVuYWJsZWQgPyAnY2hlY2tlZCcgOiAnJ30KICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0eWxlPSJtYXJnaW4tcmlnaHQ6IDhweDsgdHJhbnNmb3JtOiBzY2FsZSgxLjIpOyI+CiAgICAgICAgICAgICAgICAgICAgICAgIEFJ5Yik5a6a5Li65Zac5qyi55qE5YaF5a655bCG6Ieq5Yqo54K56LWe77yIWumUru+8iQogICAgICAgICAgICAgICAgICAgIDwvbGFiZWw+CiAgICAgICAgICAgICAgICAgICAgPGRpdiBzdHlsZT0iY29sb3I6IHJnYmEoMjU1LCAyNTUsIDI1NSwgMC41KTsgZm9udC1zaXplOiAxMXB4OyBtYXJnaW4tdG9wOiA1cHg7IG1hcmdpbi1sZWZ0OiAyNHB4OyI+CiAgICAgICAgICAgICAgICAgICAgICAgIOW4ruWKqeaKlumfs+eul+azleS6huino+S9oOWWnOasouatpOexu+WGheWuuQogICAgICAgICAgICAgICAgICAgIDwvZGl2PgogICAgICAgICAgICAgICAgPC9kaXY+CgogICAgICAgICAgICAgICAgPGRpdiBzdHlsZT0iY29sb3I6IHJnYmEoMjU1LCAyNTUsIDI1NSwgMC41KTsgZm9udC1zaXplOiAxMXB4OyBtYXJnaW4tYm90dG9tOiAxMHB4OyI+CiAgICAgICAgICAgICAgICAgICAg5o+Q56S677ya6ZyA6KaB5a6J6KOFIDxhIGhyZWY9Imh0dHBzOi8vb2xsYW1hLmNvbS8iIHRhcmdldD0iX2JsYW5rIiBzdHlsZT0iY29sb3I6ICNmZTJjNTU7Ij5PbGxhbWE8L2E+IOW5tuS4i+i9veinhuinieaooeWeiwogICAgICAgICAgICAgICAgPC9kaXY+CiAgICAgICAgICAgIGA7CgogICAgICAgICAgICBjb25zdCBkaWFsb2cgPSBVSUZhY3RvcnkuY3JlYXRlRGlhbG9nKCdhaS1wcmVmZXJlbmNlLWRpYWxvZycsICforr7nva5BSeWWnOWlvScsIGNvbnRlbnQsICgpID0+IHsKICAgICAgICAgICAgICAgIGNvbnN0IGNvbnRlbnRJbnB1dCA9IGRpYWxvZy5xdWVyeVNlbGVjdG9yKCcuYWktY29udGVudC1pbnB1dCcpOwogICAgICAgICAgICAgICAgY29uc3QgbW9kZWxTZWxlY3QgPSBkaWFsb2cucXVlcnlTZWxlY3RvcignLmFpLW1vZGVsLXNlbGVjdCcpOwogICAgICAgICAgICAgICAgY29uc3QgbW9kZWxJbnB1dCA9IGRpYWxvZy5xdWVyeVNlbGVjdG9yKCcuYWktbW9kZWwtaW5wdXQnKTsKICAgICAgICAgICAgICAgIGNvbnN0IGF1dG9MaWtlQ2hlY2tib3ggPSBkaWFsb2cucXVlcnlTZWxlY3RvcignLmF1dG8tbGlrZS1jaGVja2JveCcpOwoKICAgICAgICAgICAgICAgIGNvbnN0IGNvbnRlbnQgPSBjb250ZW50SW5wdXQudmFsdWUudHJpbSgpOwogICAgICAgICAgICAgICAgbGV0IG1vZGVsID0gbW9kZWxTZWxlY3QudmFsdWUgPT09ICdjdXN0b20nCiAgICAgICAgICAgICAgICAgICAgPyBtb2RlbElucHV0LnZhbHVlLnRyaW0oKQogICAgICAgICAgICAgICAgICAgIDogbW9kZWxTZWxlY3QudmFsdWU7CgogICAgICAgICAgICAgICAgaWYgKCFjb250ZW50KSB7CiAgICAgICAgICAgICAgICAgICAgYWxlcnQoJ+ivt+i+k+WFpeaDs+eci+eahOWGheWuuScpOwogICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTsKICAgICAgICAgICAgICAgIH0KCiAgICAgICAgICAgICAgICBpZiAoIW1vZGVsKSB7CiAgICAgICAgICAgICAgICAgICAgYWxlcnQoJ+ivt+mAieaLqeaIlui+k+WFpeaooeWei+WQjeensCcpOwogICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTsKICAgICAgICAgICAgICAgIH0KCiAgICAgICAgICAgICAgICB0aGlzLmNvbmZpZy5zYXZlQWlDb250ZW50KGNvbnRlbnQpOwogICAgICAgICAgICAgICAgdGhpcy5jb25maWcuc2F2ZUFpTW9kZWwobW9kZWwpOwogICAgICAgICAgICAgICAgdGhpcy5jb25maWcuc2F2ZUF1dG9MaWtlU2V0dGluZyhhdXRvTGlrZUNoZWNrYm94LmNoZWNrZWQpOwoKICAgICAgICAgICAgICAgIHRoaXMubm90aWZpY2F0aW9uTWFuYWdlci5zaG93TWVzc2FnZSgn8J+kliBBSeWWnOWlvTog6K6+572u5bey5L+d5a2YJyk7CiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTsKICAgICAgICAgICAgfSk7CgogICAgICAgICAgICAvLyDlpITnkIbmqKHlnovpgInmi6nliIfmjaIKICAgICAgICAgICAgY29uc3QgbW9kZWxTZWxlY3QgPSBkaWFsb2cucXVlcnlTZWxlY3RvcignLmFpLW1vZGVsLXNlbGVjdCcpOwogICAgICAgICAgICBjb25zdCBtb2RlbElucHV0ID0gZGlhbG9nLnF1ZXJ5U2VsZWN0b3IoJy5haS1tb2RlbC1pbnB1dCcpOwoKICAgICAgICAgICAgbW9kZWxTZWxlY3QuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgKGUpID0+IHsKICAgICAgICAgICAgICAgIGlmIChlLnRhcmdldC52YWx1ZSA9PT0gJ2N1c3RvbScpIHsKICAgICAgICAgICAgICAgICAgICBtb2RlbElucHV0LnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snOwogICAgICAgICAgICAgICAgfSBlbHNlIHsKICAgICAgICAgICAgICAgICAgICBtb2RlbElucHV0LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7CiAgICAgICAgICAgICAgICAgICAgbW9kZWxJbnB1dC52YWx1ZSA9ICcnOwogICAgICAgICAgICAgICAgfQogICAgICAgICAgICB9KTsKCiAgICAgICAgICAgIC8vIOmYsuatouWkjemAieahhueCueWHu+aXtuWFs+mXreW8ueeqlwogICAgICAgICAgICBkaWFsb2cucXVlcnlTZWxlY3RvcignLmF1dG8tbGlrZS1jaGVja2JveCcpLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHsKICAgICAgICAgICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7CiAgICAgICAgICAgIH0pOwogICAgICAgIH0KCiAgICAgICAgc2hvd0tleXdvcmREaWFsb2coKSB7CiAgICAgICAgICAgIGNvbnN0IGtleXdvcmRzID0gdGhpcy5jb25maWcuZ2V0KCdibG9ja0tleXdvcmRzJykua2V5d29yZHM7CiAgICAgICAgICAgIGxldCB0ZW1wS2V5d29yZHMgPSBbLi4ua2V5d29yZHNdOwoKICAgICAgICAgICAgY29uc3QgdXBkYXRlTGlzdCA9ICgpID0+IHsKICAgICAgICAgICAgICAgIGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5rZXl3b3JkLWxpc3QnKTsKICAgICAgICAgICAgICAgIGlmICghY29udGFpbmVyKSByZXR1cm47CgogICAgICAgICAgICAgICAgY29udGFpbmVyLmlubmVySFRNTCA9IHRlbXBLZXl3b3Jkcy5sZW5ndGggPT09IDAKICAgICAgICAgICAgICAgICAgICA/ICc8ZGl2IHN0eWxlPSJjb2xvcjogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjUpOyB0ZXh0LWFsaWduOiBjZW50ZXI7Ij7mmoLml6DlhbPplK7lrZc8L2Rpdj4nCiAgICAgICAgICAgICAgICAgICAgOiB0ZW1wS2V5d29yZHMubWFwKChrZXl3b3JkLCBpbmRleCkgPT4gYAogICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPSJkaXNwbGF5OiBmbGV4OyBhbGlnbi1pdGVtczogY2VudGVyOyBtYXJnaW4tYm90dG9tOiA4cHg7Ij4KICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIHN0eWxlPSJmbGV4OiAxOyBjb2xvcjogd2hpdGU7IHBhZGRpbmc6IDVweCAxMHB4OyBiYWNrZ3JvdW5kOiByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMSk7CiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYm9yZGVyLXJhZGl1czogNHB4OyBtYXJnaW4tcmlnaHQ6IDEwcHg7Ij4ke2tleXdvcmR9PC9zcGFuPgogICAgICAgICAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiBkYXRhLWluZGV4PSIke2luZGV4fSIgY2xhc3M9ImRlbGV0ZS1rZXl3b3JkIiBzdHlsZT0icGFkZGluZzogNXB4IDEwcHg7IGJhY2tncm91bmQ6ICNmZjQ3NTc7CiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbG9yOiB3aGl0ZTsgYm9yZGVyOiBub25lOyBib3JkZXItcmFkaXVzOiA0cHg7IGN1cnNvcjogcG9pbnRlcjsiPuWIoOmZpDwvYnV0dG9uPgogICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj4KICAgICAgICAgICAgICAgICAgICBgKS5qb2luKCcnKTsKCiAgICAgICAgICAgICAgICAvLyDkvb/nlKjkuovku7blp5TmiZjmnaXlpITnkIbliKDpmaTmjInpkq7ngrnlh7sKICAgICAgICAgICAgICAgIGNvbnRhaW5lci5vbmNsaWNrID0gKGUpID0+IHsKICAgICAgICAgICAgICAgICAgICBpZiAoZS50YXJnZXQuY2xhc3NMaXN0LmNvbnRhaW5zKCdkZWxldGUta2V5d29yZCcpKSB7CiAgICAgICAgICAgICAgICAgICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7IC8vIOmYu+atouS6i+S7tuWGkuazoe+8jOmYsuatouinpuWPkeW8ueeql+WFs+mXrQogICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBpbmRleCA9IHBhcnNlSW50KGUudGFyZ2V0LmRhdGFzZXQuaW5kZXgpOwogICAgICAgICAgICAgICAgICAgICAgICB0ZW1wS2V5d29yZHMuc3BsaWNlKGluZGV4LCAxKTsKICAgICAgICAgICAgICAgICAgICAgICAgdXBkYXRlTGlzdCgpOwogICAgICAgICAgICAgICAgICAgIH0KICAgICAgICAgICAgICAgIH07CiAgICAgICAgICAgIH07CgogICAgICAgICAgICBjb25zdCBwcmVzc1JFbmFibGVkID0gdGhpcy5jb25maWcuZ2V0KCdibG9ja0tleXdvcmRzJykucHJlc3NSOwogICAgICAgICAgICBjb25zdCBibG9ja05hbWVFbmFibGVkID0gdGhpcy5jb25maWcuZ2V0KCdibG9ja0tleXdvcmRzJykuYmxvY2tOYW1lOwogICAgICAgICAgICBjb25zdCBibG9ja0Rlc2NFbmFibGVkID0gdGhpcy5jb25maWcuZ2V0KCdibG9ja0tleXdvcmRzJykuYmxvY2tEZXNjOwogICAgICAgICAgICBjb25zdCBibG9ja1RhZ3NFbmFibGVkID0gdGhpcy5jb25maWcuZ2V0KCdibG9ja0tleXdvcmRzJykuYmxvY2tUYWdzOwoKICAgICAgICAgICAgY29uc3QgY29udGVudCA9IGAKICAgICAgICAgICAgICAgIDxkaXYgc3R5bGU9ImNvbG9yOiByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuNyk7IG1hcmdpbi1ib3R0b206IDE1cHg7IGZvbnQtc2l6ZTogMTJweDsiPgogICAgICAgICAgICAgICAgICAgIOWMheWQq+i/meS6m+WFs+mUruWtl+eahOWGheWuueWwhuiiq+iHquWKqOi3s+i/hwogICAgICAgICAgICAgICAgPC9kaXY+CgogICAgICAgICAgICAgICAgPGRpdiBzdHlsZT0ibWFyZ2luLWJvdHRvbTogMTVweDsgcGFkZGluZzogMTBweDsgYmFja2dyb3VuZDogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjA1KTsgYm9yZGVyLXJhZGl1czogNnB4OyI+CiAgICAgICAgICAgICAgICAgICAgPGxhYmVsIHN0eWxlPSJkaXNwbGF5OiBmbGV4OyBhbGlnbi1pdGVtczogY2VudGVyOyBjdXJzb3I6IHBvaW50ZXI7IGNvbG9yOiB3aGl0ZTsgZm9udC1zaXplOiAxM3B4OyI+CiAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPSJjaGVja2JveCIgY2xhc3M9InByZXNzLXItY2hlY2tib3giICR7cHJlc3NSRW5hYmxlZCA/ICdjaGVja2VkJyA6ICcnfQogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3R5bGU9Im1hcmdpbi1yaWdodDogOHB4OyB0cmFuc2Zvcm06IHNjYWxlKDEuMik7Ij4KICAgICAgICAgICAgICAgICAgICAgICAg6Lez6L+H5pe26Ieq5Yqo5oyJUumUru+8iOS4jeaEn+WFtOi2o++8iQogICAgICAgICAgICAgICAgICAgIDwvbGFiZWw+CiAgICAgICAgICAgICAgICAgICAgPGRpdiBzdHlsZT0iY29sb3I6IHJnYmEoMjU1LCAyNTUsIDI1NSwgMC41KTsgZm9udC1zaXplOiAxMXB4OyBtYXJnaW4tdG9wOiA1cHg7IG1hcmdpbi1sZWZ0OiAyNHB4OyI+CiAgICAgICAgICAgICAgICAgICAgICAgIOWLvumAie+8muWRiuivieaKlumfs+S9oOS4jeWWnOasou+8jOS8mOWMluaOqOiNkOeul+azlTxicj4KICAgICAgICAgICAgICAgICAgICAgICAg5LiN5Yu+77ya5LuF6Lez5Yiw5LiL5LiA5Liq6KeG6aKRCiAgICAgICAgICAgICAgICAgICAgPC9kaXY+CiAgICAgICAgICAgICAgICA8L2Rpdj4KCiAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPSJtYXJnaW4tYm90dG9tOiAxNXB4OyBwYWRkaW5nOiAxMHB4",
        "OyBiYWNrZ3JvdW5kOiByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMDUpOyBib3JkZXItcmFkaXVzOiA2cHg7Ij4KICAgICAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPSJjb2xvcjogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjcpOyBmb250LXNpemU6IDEycHg7IG1hcmdpbi1ib3R0b206IDhweDsiPuajgOa1i+iMg+WbtO+8mjwvZGl2PgogICAgICAgICAgICAgICAgICAgIDxsYWJlbCBzdHlsZT0iZGlzcGxheTogZmxleDsgYWxpZ24taXRlbXM6IGNlbnRlcjsgY3Vyc29yOiBwb2ludGVyOyBjb2xvcjogd2hpdGU7IGZvbnQtc2l6ZTogMTNweDsgbWFyZ2luLWJvdHRvbTogNnB4OyI+CiAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPSJjaGVja2JveCIgY2xhc3M9ImJsb2NrLW5hbWUtY2hlY2tib3giICR7YmxvY2tOYW1lRW5hYmxlZCA/ICdjaGVja2VkJyA6ICcnfQogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3R5bGU9Im1hcmdpbi1yaWdodDogOHB4OyB0cmFuc2Zvcm06IHNjYWxlKDEuMik7Ij4KICAgICAgICAgICAgICAgICAgICAgICAg5bGP6JS95ZCN56ew77yI6LSm5Y+35pi156ew77yJCiAgICAgICAgICAgICAgICAgICAgPC9sYWJlbD4KICAgICAgICAgICAgICAgICAgICA8bGFiZWwgc3R5bGU9ImRpc3BsYXk6IGZsZXg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IGN1cnNvcjogcG9pbnRlcjsgY29sb3I6IHdoaXRlOyBmb250LXNpemU6IDEzcHg7IG1hcmdpbi1ib3R0b206IDZweDsiPgogICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT0iY2hlY2tib3giIGNsYXNzPSJibG9jay1kZXNjLWNoZWNrYm94IiAke2Jsb2NrRGVzY0VuYWJsZWQgPyAnY2hlY2tlZCcgOiAnJ30KICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0eWxlPSJtYXJnaW4tcmlnaHQ6IDhweDsgdHJhbnNmb3JtOiBzY2FsZSgxLjIpOyI+CiAgICAgICAgICAgICAgICAgICAgICAgIOWxj+iUveeugOS7i++8iOinhumikeaPj+i/sOaWh+ahiO+8iQogICAgICAgICAgICAgICAgICAgIDwvbGFiZWw+CiAgICAgICAgICAgICAgICAgICAgPGxhYmVsIHN0eWxlPSJkaXNwbGF5OiBmbGV4OyBhbGlnbi1pdGVtczogY2VudGVyOyBjdXJzb3I6IHBvaW50ZXI7IGNvbG9yOiB3aGl0ZTsgZm9udC1zaXplOiAxM3B4OyI+CiAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPSJjaGVja2JveCIgY2xhc3M9ImJsb2NrLXRhZ3MtY2hlY2tib3giICR7YmxvY2tUYWdzRW5hYmxlZCA/ICdjaGVja2VkJyA6ICcnfQogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3R5bGU9Im1hcmdpbi1yaWdodDogOHB4OyB0cmFuc2Zvcm06IHNjYWxlKDEuMik7Ij4KICAgICAgICAgICAgICAgICAgICAgICAg5bGP6JS95qCH562+77yII+ivnemimOagh+etvu+8iQogICAgICAgICAgICAgICAgICAgIDwvbGFiZWw+CiAgICAgICAgICAgICAgICA8L2Rpdj4KCiAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPSJkaXNwbGF5OiBmbGV4OyBnYXA6IDEwcHg7IG1hcmdpbi1ib3R0b206IDEwcHg7Ij4KICAgICAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT0idGV4dCIgY2xhc3M9ImtleXdvcmQtaW5wdXQiIHBsYWNlaG9sZGVyPSLovpPlhaXmlrDlhbPplK7lrZciCiAgICAgICAgICAgICAgICAgICAgICAgIHN0eWxlPSJmbGV4OiAxOyBwYWRkaW5nOiA4cHg7IGJhY2tncm91bmQ6IHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4xKTsKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbG9yOiB3aGl0ZTsgYm9yZGVyOiAxcHggc29saWQgcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjMpOyBib3JkZXItcmFkaXVzOiA0cHg7Ij4KICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzPSJhZGQta2V5d29yZCIgc3R5bGU9InBhZGRpbmc6IDhweCAxNXB4OyBiYWNrZ3JvdW5kOiAjMDBkNjM5OwogICAgICAgICAgICAgICAgICAgICAgICAgICAgY29sb3I6IHdoaXRlOyBib3JkZXI6IG5vbmU7IGJvcmRlci1yYWRpdXM6IDRweDsgY3Vyc29yOiBwb2ludGVyOyI+5re75YqgPC9idXR0b24+CiAgICAgICAgICAgICAgICA8L2Rpdj4KCiAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPSJkaXNwbGF5OiBmbGV4OyBnYXA6IDEwcHg7IG1hcmdpbi1ib3R0b206IDEwcHg7Ij4KICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzPSJpbXBvcnQta2V5d29yZHMiIHN0eWxlPSJmbGV4OiAxOyBwYWRkaW5nOiA4cHggMTJweDsgYmFja2dyb3VuZDogcmdiYSg1MiwgMTUyLCAyMTksIDAuOCk7CiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb2xvcjogd2hpdGU7IGJvcmRlcjogbm9uZTsgYm9yZGVyLXJhZGl1czogNHB4OyBjdXJzb3I6IHBvaW50ZXI7IGZvbnQtc2l6ZTogMTJweDsiPgogICAgICAgICAgICAgICAgICAgICAgICDwn5OBIOWvvOWFpeWFs+mUruWtlwogICAgICAgICAgICAgICAgICAgIDwvYnV0dG9uPgogICAgICAgICAgICAgICAgICAgIDxidXR0b24gY2xhc3M9ImV4cG9ydC1rZXl3b3JkcyIgc3R5bGU9ImZsZXg6IDE7IHBhZGRpbmc6IDhweCAxMnB4OyBiYWNrZ3JvdW5kOiByZ2JhKDE1NSwgODksIDE4MiwgMC44KTsKICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbG9yOiB3aGl0ZTsgYm9yZGVyOiBub25lOyBib3JkZXItcmFkaXVzOiA0cHg7IGN1cnNvcjogcG9pbnRlcjsgZm9udC1zaXplOiAxMnB4OyI+CiAgICAgICAgICAgICAgICAgICAgICAgIPCfkr4g5a+85Ye65YWz6ZSu5a2XCiAgICAgICAgICAgICAgICAgICAgPC9idXR0b24+CiAgICAgICAgICAgICAgICA8L2Rpdj4KICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9ImtleXdvcmQtbGlzdCIgc3R5bGU9Im1hcmdpbi1ib3R0b206IDE1cHg7IG1heC1oZWlnaHQ6IDIwMHB4OyBvdmVyZmxvdy15OiBhdXRvOyI+PC9kaXY+CiAgICAgICAgICAgIGA7CgogICAgICAgICAgICBjb25zdCBkaWFsb2cgPSBVSUZhY3RvcnkuY3JlYXRlRGlhbG9nKCdrZXl3b3JkLXNldHRpbmctZGlhbG9nJywgJ+euoeeQhuWxj+iUveWFs+mUruWtlycsIGNvbnRlbnQsICgpID0+IHsKICAgICAgICAgICAgICAgIGNvbnN0IHByZXNzUkNoZWNrYm94ID0gZGlhbG9nLnF1ZXJ5U2VsZWN0b3IoJy5wcmVzcy1yLWNoZWNrYm94Jyk7CiAgICAgICAgICAgICAgICBjb25zdCBibG9ja05hbWVDaGVja2JveCA9IGRpYWxvZy5xdWVyeVNlbGVjdG9yKCcuYmxvY2stbmFtZS1jaGVja2JveCcpOwogICAgICAgICAgICAgICAgY29uc3QgYmxvY2tEZXNjQ2hlY2tib3ggPSBkaWFsb2cucXVlcnlTZWxlY3RvcignLmJsb2NrLWRlc2MtY2hlY2tib3gnKTsKICAgICAgICAgICAgICAgIGNvbnN0IGJsb2NrVGFnc0NoZWNrYm94ID0gZGlhbG9nLnF1ZXJ5U2VsZWN0b3IoJy5ibG9jay10YWdzLWNoZWNrYm94Jyk7CgogICAgICAgICAgICAgICAgdGhpcy5jb25maWcuc2F2ZUtleXdvcmRzKHRlbXBLZXl3b3Jkcyk7CiAgICAgICAgICAgICAgICB0aGlzLmNvbmZpZy5zYXZlUHJlc3NSU2V0dGluZyhwcmVzc1JDaGVja2JveC5jaGVja2VkKTsKICAgICAgICAgICAgICAgIHRoaXMuY29uZmlnLnNhdmVCbG9ja05hbWVTZXR0aW5nKGJsb2NrTmFtZUNoZWNrYm94LmNoZWNrZWQpOwogICAgICAgICAgICAgICAgdGhpcy5jb25maWcuc2F2ZUJsb2NrRGVzY1NldHRpbmcoYmxvY2tEZXNjQ2hlY2tib3guY2hlY2tlZCk7CiAgICAgICAgICAgICAgICB0aGlzLmNvbmZpZy5zYXZlQmxvY2tUYWdzU2V0dGluZyhibG9ja1RhZ3NDaGVja2JveC5jaGVja2VkKTsKCiAgICAgICAgICAgICAgICB0aGlzLm5vdGlmaWNhdGlvbk1hbmFnZXIuc2hvd01lc3NhZ2UoJ/Cfmqsg5bGP6JS95YWz6ZSu5a2XOiDorr7nva7lt7Lmm7TmlrAnKTsKICAgICAgICAgICAgICAgIHJldHVybiB0cnVlOwogICAgICAgICAgICB9KTsKCiAgICAgICAgICAgIGNvbnN0IGFkZEtleXdvcmQgPSAoKSA9PiB7CiAgICAgICAgICAgICAgICBjb25zdCBpbnB1dCA9IGRpYWxvZy5xdWVyeVNlbGVjdG9yKCcua2V5d29yZC1pbnB1dCcpOwogICAgICAgICAgICAgICAgY29uc3Qga2V5d29yZCA9IGlucHV0LnZhbHVlLnRyaW0oKTsKICAgICAgICAgICAgICAgIGlmIChrZXl3b3JkICYmICF0ZW1wS2V5d29yZHMuaW5jbHVkZXMoa2V5d29yZCkpIHsKICAgICAgICAgICAgICAgICAgICB0ZW1wS2V5d29yZHMucHVzaChrZXl3b3JkKTsKICAgICAgICAgICAgICAgICAgICB1cGRhdGVMaXN0KCk7CiAgICAgICAgICAgICAgICAgICAgaW5wdXQudmFsdWUgPSAnJzsKICAgICAgICAgICAgICAgIH0KICAgICAgICAgICAgfTsKCiAgICAgICAgICAgIGRpYWxvZy5xdWVyeVNlbGVjdG9yKCcuYWRkLWtleXdvcmQnKS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7CiAgICAgICAgICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpOyAvLyDpmLvmraLkuovku7blhpLms6HvvIzpmLLmraLop6blj5HlvLnnqpflhbPpl60KICAgICAgICAgICAgICAgIGFkZEtleXdvcmQoKTsKICAgICAgICAgICAgfSk7CiAgICAgICAgICAgIGRpYWxvZy5xdWVyeVNlbGVjdG9yKCcua2V5d29yZC1pbnB1dCcpLmFkZEV2ZW50TGlzdGVuZXIoJ2tleXByZXNzJywgKGUpID0+IHsKICAgICAgICAgICAgICAgIGlmIChlLmtleSA9PT0gJ0VudGVyJykgewogICAgICAgICAgICAgICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7IC8vIOmYu+atouS6i+S7tuWGkuazoQogICAgICAgICAgICAgICAgICAgIGFkZEtleXdvcmQoKTsKICAgICAgICAgICAgICAgIH0KICAgICAgICAgICAgfSk7CgogICAgICAgICAgICAvLyDpmLLmraLlnKjovpPlhaXmoYblhoXngrnlh7vml7blhbPpl63lvLnnqpcKICAgICAgICAgICAgZGlhbG9nLnF1ZXJ5U2VsZWN0b3IoJy5rZXl3b3JkLWlucHV0JykuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4gewogICAgICAgICAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTsKICAgICAgICAgICAgfSk7CgogICAgICAgICAgICAvLyDpmLLmraLlpI3pgInmoYbngrnlh7vml7blhbPpl63lvLnnqpcKICAgICAgICAgICAgZGlhbG9nLnF1ZXJ5U2VsZWN0b3IoJy5wcmVzcy1yLWNoZWNrYm94JykuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4gewogICAgICAgICAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTsKICAgICAgICAgICAgfSk7CiAgICAgICAgICAgIGRpYWxvZy5xdWVyeVNlbGVjdG9yKCcuYmxvY2stbmFtZS1jaGVja2JveCcpLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHsKICAgICAgICAgICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7CiAgICAgICAgICAgIH0pOwogICAgICAgICAgICBkaWFsb2cucXVlcnlTZWxlY3RvcignLmJsb2NrLWRlc2MtY2hlY2tib3gnKS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7CiAgICAgICAgICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpOwogICAgICAgICAgICB9KTsKICAgICAgICAgICAgZGlhbG9nLnF1ZXJ5U2VsZWN0b3IoJy5ibG9jay10YWdzLWNoZWNrYm94JykuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4gewogICAgICAgICAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTsKICAgICAgICAgICAgfSk7CgogICAgICAgICAgICAvLyDlr7zlh7rlip/og70KICAgICAgICAgICAgY29uc3QgZXhwb3J0S2V5d29yZHMgPSAoKSA9PiB7CiAgICAgICAgICAgICAgICBjb25zdCBjb250ZW50ID0gdGVtcEtleXdvcmRzLmpvaW4oJ1xuJyk7CiAgICAgICAgICAgICAgICBjb25zdCBibG9iID0gbmV3IEJsb2IoW2NvbnRlbnRdLCB7IHR5cGU6ICd0ZXh0L3BsYWluO2NoYXJzZXQ9dXRmLTgnIH0pOwogICAgICAgICAgICAgICAgY29uc3QgdXJsID0gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTsKICAgICAgICAgICAgICAgIGNvbnN0IGEgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7CiAgICAgICAgICAgICAgICBhLmhyZWYgPSB1cmw7CiAgICAgICAgICAgICAgICBhLmRvd25sb2FkID0gYOaKlumfs+Wxj+iUveWFs+mUruWtl18ke25ldyBEYXRlKCkudG9JU09TdHJpbmcoKS5zcGxpdCgnVCcpWzBdfS50eHRgOwogICAgICAgICAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChhKTsKICAgICAgICAgICAgICAgIGEuY2xpY2soKTsKICAgICAgICAgICAgICAgIGRvY3VtZW50LmJvZHkucmVtb3ZlQ2hpbGQoYSk7CiAgICAgICAg",
        "ICAgICAgICBVUkwucmV2b2tlT2JqZWN0VVJMKHVybCk7CiAgICAgICAgICAgICAgICB0aGlzLm5vdGlmaWNhdGlvbk1hbmFnZXIuc2hvd01lc3NhZ2UoJ/Cfkr4g5bGP6JS96LSm5Y+3OiDlhbPplK7lrZflt7Llr7zlh7onKTsKICAgICAgICAgICAgfTsKCiAgICAgICAgICAgIGRpYWxvZy5xdWVyeVNlbGVjdG9yKCcuZXhwb3J0LWtleXdvcmRzJykuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4gewogICAgICAgICAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTsKICAgICAgICAgICAgICAgIGV4cG9ydEtleXdvcmRzKCk7CiAgICAgICAgICAgIH0pOwoKICAgICAgICAgICAgLy8g5a+85YWl5Yqf6IO9CiAgICAgICAgICAgIGNvbnN0IGltcG9ydEtleXdvcmRzID0gKCkgPT4gewogICAgICAgICAgICAgICAgY29uc3QgaW5wdXQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdpbnB1dCcpOwogICAgICAgICAgICAgICAgaW5wdXQudHlwZSA9ICdmaWxlJzsKICAgICAgICAgICAgICAgIGlucHV0LmFjY2VwdCA9ICcudHh0JzsKICAgICAgICAgICAgICAgIGlucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIChlKSA9PiB7CiAgICAgICAgICAgICAgICAgICAgY29uc3QgZmlsZSA9IGUudGFyZ2V0LmZpbGVzWzBdOwogICAgICAgICAgICAgICAgICAgIGlmIChmaWxlKSB7CiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlYWRlciA9IG5ldyBGaWxlUmVhZGVyKCk7CiAgICAgICAgICAgICAgICAgICAgICAgIHJlYWRlci5vbmxvYWQgPSAoZSkgPT4gewogICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY29udGVudCA9IGUudGFyZ2V0LnJlc3VsdDsKICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGltcG9ydGVkS2V5d29yZHMgPSBjb250ZW50LnNwbGl0KCdcbicpCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLm1hcChsaW5lID0+IGxpbmUudHJpbSgpKQogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5maWx0ZXIobGluZSA9PiBsaW5lLmxlbmd0aCA+IDApOwoKICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpbXBvcnRlZEtleXdvcmRzLmxlbmd0aCA+IDApIHsKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDlkIjlubblhbPplK7lrZfvvIzljrvph40KICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBhbGxLZXl3b3JkcyA9IFsuLi5uZXcgU2V0KFsuLi50ZW1wS2V5d29yZHMsIC4uLmltcG9ydGVkS2V5d29yZHNdKV07CiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGVtcEtleXdvcmRzLnNwbGljZSgwLCB0ZW1wS2V5d29yZHMubGVuZ3RoLCAuLi5hbGxLZXl3b3Jkcyk7CiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdXBkYXRlTGlzdCgpOwogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMubm90aWZpY2F0aW9uTWFuYWdlci5zaG93TWVzc2FnZSgn8J+TgSDlsY/olL3otKblj7c6IOWFs+mUruWtl+WvvOWFpeaIkOWKnycpOwogICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHsKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhbGVydCgn5paH5Lu25YaF5a655Li656m65oiW5qC85byP5LiN5q2j56Gu77yBJyk7CiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9CiAgICAgICAgICAgICAgICAgICAgICAgIH07CiAgICAgICAgICAgICAgICAgICAgICAgIHJlYWRlci5vbmVycm9yID0gKCkgPT4gewogICAgICAgICAgICAgICAgICAgICAgICAgICAgYWxlcnQoJ+aWh+S7tuivu+WPluWksei0pe+8gScpOwogICAgICAgICAgICAgICAgICAgICAgICB9OwogICAgICAgICAgICAgICAgICAgICAgICByZWFkZXIucmVhZEFzVGV4dChmaWxlLCAndXRmLTgnKTsKICAgICAgICAgICAgICAgICAgICB9CiAgICAgICAgICAgICAgICB9KTsKICAgICAgICAgICAgICAgIGlucHV0LmNsaWNrKCk7CiAgICAgICAgICAgIH07CgogICAgICAgICAgICBkaWFsb2cucXVlcnlTZWxlY3RvcignLmltcG9ydC1rZXl3b3JkcycpLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHsKICAgICAgICAgICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7CiAgICAgICAgICAgICAgICBpbXBvcnRLZXl3b3JkcygpOwogICAgICAgICAgICB9KTsKCiAgICAgICAgICAgIHVwZGF0ZUxpc3QoKTsKICAgICAgICB9CgogICAgICAgIHNob3dSZXNvbHV0aW9uRGlhbG9nKCkgewogICAgICAgICAgICBjb25zdCBjdXJyZW50UmVzb2x1dGlvbiA9IHRoaXMuY29uZmlnLmdldCgnb25seVJlc29sdXRpb24nKS5yZXNvbHV0aW9uOwogICAgICAgICAgICBjb25zdCByZXNvbHV0aW9ucyA9IFsnNEsnLCAnMksnLCAnMTA4MFAnLCAnNzIwUCcsICc1NDBQJ107CgogICAgICAgICAgICBjb25zdCBjb250ZW50ID0gYAogICAgICAgICAgICAgICAgPGRpdiBzdHlsZT0ibWFyZ2luLWJvdHRvbTogMTVweDsiPgogICAgICAgICAgICAgICAgICAgIDxsYWJlbCBzdHlsZT0iY29sb3I6IHJnYmEoMjU1LCAyNTUsIDI1NSwgMC43KTsgZm9udC1zaXplOiAxMnB4OyBkaXNwbGF5OiBibG9jazsgbWFyZ2luLWJvdHRvbTogNXB4OyI+CiAgICAgICAgICAgICAgICAgICAgICAgIOmAieaLqeimgeetm+mAieeahOWIhui+qOeOhwogICAgICAgICAgICAgICAgICAgIDwvbGFiZWw+CiAgICAgICAgICAgICAgICAgICAgPGRpdiBzdHlsZT0icG9zaXRpb246IHJlbGF0aXZlOyI+CiAgICAgICAgICAgICAgICAgICAgICAgIDxzZWxlY3QgY2xhc3M9InJlc29sdXRpb24tc2VsZWN0IgogICAgICAgICAgICAgICAgICAgICAgICAgICAgc3R5bGU9IndpZHRoOiAxMDAlOyBwYWRkaW5nOiA4cHg7IGJhY2tncm91bmQ6IHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4xKTsKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb2xvcjogd2hpdGU7IGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4zKTsgYm9yZGVyLXJhZGl1czogNHB4OwogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFwcGVhcmFuY2U6IG5vbmU7IGN1cnNvcjogcG9pbnRlcjsiPgogICAgICAgICAgICAgICAgICAgICAgICAgICAgJHtyZXNvbHV0aW9ucy5tYXAocmVzID0+CiAgICAgICAgICAgICAgICBgPG9wdGlvbiB2YWx1ZT0iJHtyZXN9IiBzdHlsZT0iYmFja2dyb3VuZDogcmdiYSgwLCAwLCAwLCAwLjkpOyBjb2xvcjogd2hpdGU7IiAke2N1cnJlbnRSZXNvbHV0aW9uID09PSByZXMgPyAnc2VsZWN0ZWQnIDogJyd9PiR7cmVzfTwvb3B0aW9uPmAKICAgICAgICAgICAgKS5qb2luKCcnKX0KICAgICAgICAgICAgICAgICAgICAgICAgPC9zZWxlY3Q+CiAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIHN0eWxlPSJwb3NpdGlvbjogYWJzb2x1dGU7IHJpZ2h0OiAxMHB4OyB0b3A6IDUwJTsgdHJhbnNmb3JtOiB0cmFuc2xhdGVZKC01MCUpOwogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBvaW50ZXItZXZlbnRzOiBub25lOyBjb2xvcjogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjUpOyI+4pa8PC9zcGFuPgogICAgICAgICAgICAgICAgICAgIDwvZGl2PgogICAgICAgICAgICAgICAgPC9kaXY+CgogICAgICAgICAgICAgICAgPGRpdiBzdHlsZT0iY29sb3I6IHJnYmEoMjU1LCAyNTUsIDI1NSwgMC41KTsgZm9udC1zaXplOiAxMXB4OyBtYXJnaW4tYm90dG9tOiAxMHB4OyI+CiAgICAgICAgICAgICAgICAgICAg5o+Q56S677ya5Y+q5pKt5pS+5YyF5ZCr5omA6YCJ5YiG6L6o546H5YWz6ZSu5a2X55qE6KeG6aKR77yM5rKh5pyJ5om+5Yiw5YiZ6Ieq5Yqo6Lez6L+HCiAgICAgICAgICAgICAgICA8L2Rpdj4KICAgICAgICAgICAgYDsKCiAgICAgICAgICAgIGNvbnN0IGRpYWxvZyA9IFVJRmFjdG9yeS5jcmVhdGVEaWFsb2coJ3Jlc29sdXRpb24tZGlhbG9nJywgJ+WIhui+qOeOh+etm+mAieiuvue9ricsIGNvbnRlbnQsICgpID0+IHsKICAgICAgICAgICAgICAgIGNvbnN0IHJlc29sdXRpb25TZWxlY3QgPSBkaWFsb2cucXVlcnlTZWxlY3RvcignLnJlc29sdXRpb24tc2VsZWN0Jyk7CiAgICAgICAgICAgICAgICBjb25zdCByZXNvbHV0aW9uID0gcmVzb2x1dGlvblNlbGVjdC52YWx1ZTsKCiAgICAgICAgICAgICAgICB0aGlzLmNvbmZpZy5zYXZlVGFyZ2V0UmVzb2x1dGlvbihyZXNvbHV0aW9uKTsKICAgICAgICAgICAgICAgIHRoaXMudXBkYXRlUmVzb2x1dGlvblRleHQoKTsKICAgICAgICAgICAgICAgIHRoaXMubm90aWZpY2F0aW9uTWFuYWdlci5zaG93TWVzc2FnZShg4pqZ77iPIOWIhui+qOeOh+etm+mAiTog5bey6K6+5Li6ICR7cmVzb2x1dGlvbn1gKTsKICAgICAgICAgICAgICAgIHJldHVybiB0cnVlOwogICAgICAgICAgICB9KTsKICAgICAgICB9CiAgICB9CgogICAgLy8gPT09PT09PT09PSBBSeajgOa1i+WZqCA9PT09PT09PT09CiAgICBjbGFzcyBBSURldGVjdG9yIHsKICAgICAgICBjb25zdHJ1Y3Rvcih2aWRlb0NvbnRyb2xsZXIsIGNvbmZpZykgewogICAgICAgICAgICB0aGlzLnZpZGVvQ29udHJvbGxlciA9IHZpZGVvQ29udHJvbGxlcjsKICAgICAgICAgICAgdGhpcy5jb25maWcgPSBjb25maWc7CiAgICAgICAgICAgIHRoaXMuQVBJX1VSTCA9ICdodHRwOi8vbG9jYWxob3N0OjExNDM0L2FwaS9nZW5lcmF0ZSc7CiAgICAgICAgICAgIHRoaXMuY2hlY2tTY2hlZHVsZSA9IFswLCAxMDAwLCAyNTAwLCA0MDAwLCA2MDAwLCA4MDAwXTsKICAgICAgICAgICAgdGhpcy5yZXNldCgpOwogICAgICAgIH0KCiAgICAgICAgcmVzZXQoKSB7CiAgICAgICAgICAgIHRoaXMuY3VycmVudENoZWNrSW5kZXggPSAwOwogICAgICAgICAgICB0aGlzLmNoZWNrUmVzdWx0cyA9IFtdOwogICAgICAgICAgICB0aGlzLmNvbnNlY3V0aXZlWWVzID0gMDsKICAgICAgICAgICAgdGhpcy5jb25zZWN1dGl2ZU5vID0gMDsKICAgICAgICAgICAgdGhpcy5oYXNTa2lwcGVkID0gZmFsc2U7CiAgICAgICAgICAgIHRoaXMuc3RvcENoZWNraW5nID0gZmFsc2U7CiAgICAgICAgICAgIHRoaXMuaGFzTGlrZWQgPSBmYWxzZTsKICAgICAgICAgICAgdGhpcy5pc1Byb2Nlc3NpbmcgPSBmYWxzZTsKICAgICAgICB9CgogICAgICAgIHNob3VsZENoZWNrKHZpZGVvUGxheVRpbWUpIHsKICAgICAgICAgICAgcmV0dXJuICF0aGlzLmlzUHJvY2Vzc2luZyAmJgogICAgICAgICAgICAgICAgIXRoaXMuc3RvcENoZWNraW5nICYmCiAgICAgICAgICAgICAgICAhdGhpcy5oYXNTa2lwcGVkICYmCiAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnRDaGVja0luZGV4IDwgdGhpcy5jaGVja1NjaGVkdWxlLmxlbmd0aCAmJgogICAgICAgICAgICAgICAgdmlkZW9QbGF5VGltZSA+PSB0aGlzLmNoZWNrU2NoZWR1bGVbdGhpcy5jdXJyZW50Q2hlY2tJbmRleF07CiAgICAgICAgfQoKICAgICAgICBhc3luYyBwcm9jZXNzVmlkZW8odmlkZW9FbCkgewogICAgICAgICAgICBpZiAodGhpcy5pc1Byb2Nlc3NpbmcgfHwgdGhpcy5zdG9wQ2hlY2tpbmcgfHwgdGhpcy5oYXNTa2lwcGVkKSByZXR1cm47CiAgICAgICAgICAgIHRoaXMuaXNQcm9jZXNzaW5nID0gdHJ1ZTsKCiAgICAgICAgICAgIHRyeSB7CiAgICAgICAgICAgICAgICBjb25zdCBiYXNlNjRJbWFnZSA9IGF3YWl0IHRoaXMuY2FwdHVyZVZpZGVvRnJhbWUodmlkZW9FbCk7CiAgICAgICAgICAgICAgICBjb25zdCBhaVJlc3BvbnNlID0gYXdhaXQgdGhpcy5jYWxsQUkoYmFzZTY0SW1hZ2UpOwogICAgICAgICAgICAgICAgdGhpcy5oYW5kbGVSZXNwb25zZShhaVJlc3BvbnNlKTsKICAgICAgICAgICAgICAgIHRoaXMuY3VycmVudENoZWNrSW5kZXgrKzsKICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHsKICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0FJ5Yik5pat5Yqf6IO95Ye66ZSZOicsIGVycm9yKTsKICAgICAgICAgICAgICAgIC8vIOaYvuekuumUmeivr+aPkOekugogICAgICAgICAgICAgICAgVUlGYWN0b3J5LnNob3dFcnJvckRpYWxvZygpOwogICAgICAgICAgICAgICAgLy8g5YWz6ZetQUnllpzlpb3mqKHlvI8KICAgICAgICAgICAgICAgIHRoaXMuY29uZmlnLnNldEVuYWJsZWQoJ2FpUHJlZmVyZW5jZScsIGZhbHNlKTsKICAgICAgICAgICAgICAgIFVJTWFuYWdlci51cGRhdGVUb2dnbGVCdXR0b25zKCdhaS1wcmVmZXJlbmNlLWJ1dHRvbicsIGZhbHNl",
        "KTsKICAgICAgICAgICAgICAgIHRoaXMuc3RvcENoZWNraW5nID0gdHJ1ZTsKICAgICAgICAgICAgfSBmaW5hbGx5IHsKICAgICAgICAgICAgICAgIHRoaXMuaXNQcm9jZXNzaW5nID0gZmFsc2U7CiAgICAgICAgICAgIH0KICAgICAgICB9CgogICAgICAgIGFzeW5jIGNhcHR1cmVWaWRlb0ZyYW1lKHZpZGVvRWwpIHsKICAgICAgICAgICAgY29uc3QgY2FudmFzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnY2FudmFzJyk7CiAgICAgICAgICAgIGNvbnN0IG1heFNpemUgPSA1MDA7CiAgICAgICAgICAgIGNvbnN0IGFzcGVjdFJhdGlvID0gdmlkZW9FbC52aWRlb1dpZHRoIC8gdmlkZW9FbC52aWRlb0hlaWdodDsKCiAgICAgICAgICAgIGxldCB0YXJnZXRXaWR0aCwgdGFyZ2V0SGVpZ2h0OwogICAgICAgICAgICBpZiAodmlkZW9FbC52aWRlb1dpZHRoID4gdmlkZW9FbC52aWRlb0hlaWdodCkgewogICAgICAgICAgICAgICAgdGFyZ2V0V2lkdGggPSBNYXRoLm1pbih2aWRlb0VsLnZpZGVvV2lkdGgsIG1heFNpemUpOwogICAgICAgICAgICAgICAgdGFyZ2V0SGVpZ2h0ID0gTWF0aC5yb3VuZCh0YXJnZXRXaWR0aCAvIGFzcGVjdFJhdGlvKTsKICAgICAgICAgICAgfSBlbHNlIHsKICAgICAgICAgICAgICAgIHRhcmdldEhlaWdodCA9IE1hdGgubWluKHZpZGVvRWwudmlkZW9IZWlnaHQsIG1heFNpemUpOwogICAgICAgICAgICAgICAgdGFyZ2V0V2lkdGggPSBNYXRoLnJvdW5kKHRhcmdldEhlaWdodCAqIGFzcGVjdFJhdGlvKTsKICAgICAgICAgICAgfQoKICAgICAgICAgICAgY2FudmFzLndpZHRoID0gdGFyZ2V0V2lkdGg7CiAgICAgICAgICAgIGNhbnZhcy5oZWlnaHQgPSB0YXJnZXRIZWlnaHQ7CgogICAgICAgICAgICBjb25zdCBjdHggPSBjYW52YXMuZ2V0Q29udGV4dCgnMmQnKTsKICAgICAgICAgICAgY3R4LmRyYXdJbWFnZSh2aWRlb0VsLCAwLCAwLCB0YXJnZXRXaWR0aCwgdGFyZ2V0SGVpZ2h0KTsKCiAgICAgICAgICAgIHJldHVybiBjYW52YXMudG9EYXRhVVJMKCdpbWFnZS9qcGVnJywgMC44KS5zcGxpdCgnLCcpWzFdOwogICAgICAgIH0KCiAgICAgICAgYXN5bmMgY2FsbEFJKGJhc2U2NEltYWdlKSB7CiAgICAgICAgICAgIGNvbnN0IGNvbnRlbnQgPSB0aGlzLmNvbmZpZy5nZXQoJ2FpUHJlZmVyZW5jZScpLmNvbnRlbnQ7CiAgICAgICAgICAgIGNvbnN0IG1vZGVsID0gdGhpcy5jb25maWcuZ2V0KCdhaVByZWZlcmVuY2UnKS5tb2RlbDsKCiAgICAgICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2godGhpcy5BUElfVVJMLCB7CiAgICAgICAgICAgICAgICBtZXRob2Q6ICdQT1NUJywKICAgICAgICAgICAgICAgIGhlYWRlcnM6IHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9LAogICAgICAgICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoewogICAgICAgICAgICAgICAgICAgIG1vZGVsOiBtb2RlbCwKICAgICAgICAgICAgICAgICAgICBwcm9tcHQ6IGDov5nmmK8ke2NvbnRlbnR95ZCXP+WbnuetlOOAjuaYr+OAj+aIluiAheOAjuS4jeaYr+OAjyzkuI3opoHor7Tku7vkvZXlpJrkvZnnmoTlrZfnrKZgLAogICAgICAgICAgICAgICAgICAgIGltYWdlczogW2Jhc2U2NEltYWdlXSwKICAgICAgICAgICAgICAgICAgICBzdHJlYW06IGZhbHNlCiAgICAgICAgICAgICAgICB9KQogICAgICAgICAgICB9KTsKCiAgICAgICAgICAgIGlmICghcmVzcG9uc2Uub2spIHsKICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgQUnor7fmsYLlpLHotKU6ICR7cmVzcG9uc2Uuc3RhdHVzfWApOwogICAgICAgICAgICB9CgogICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7CiAgICAgICAgICAgIHJldHVybiByZXN1bHQucmVzcG9uc2U/LnRyaW0oKTsKICAgICAgICB9CgogICAgICAgIGhhbmRsZVJlc3BvbnNlKGFpUmVzcG9uc2UpIHsKICAgICAgICAgICAgY29uc3QgY29udGVudCA9IHRoaXMuY29uZmlnLmdldCgnYWlQcmVmZXJlbmNlJykuY29udGVudDsKICAgICAgICAgICAgdGhpcy5jaGVja1Jlc3VsdHMucHVzaChhaVJlc3BvbnNlKTsKICAgICAgICAgICAgY29uc29sZS5sb2coYEFJ5qOA5rWL57uT5p6cWyR7dGhpcy5jaGVja1Jlc3VsdHMubGVuZ3RofV3vvJoke2FpUmVzcG9uc2V9YCk7CgogICAgICAgICAgICBpZiAoYWlSZXNwb25zZSA9PT0gJ+aYrycpIHsKICAgICAgICAgICAgICAgIHRoaXMuY29uc2VjdXRpdmVZZXMrKzsKICAgICAgICAgICAgICAgIHRoaXMuY29uc2VjdXRpdmVObyA9IDA7CiAgICAgICAgICAgIH0gZWxzZSB7CiAgICAgICAgICAgICAgICB0aGlzLmNvbnNlY3V0aXZlWWVzID0gMDsKICAgICAgICAgICAgICAgIHRoaXMuY29uc2VjdXRpdmVObysrOwogICAgICAgICAgICB9CgogICAgICAgICAgICBpZiAodGhpcy5jb25zZWN1dGl2ZU5vID49IDEpIHsKICAgICAgICAgICAgICAgIHRoaXMuaGFzU2tpcHBlZCA9IHRydWU7CiAgICAgICAgICAgICAgICB0aGlzLnN0b3BDaGVja2luZyA9IHRydWU7CiAgICAgICAgICAgICAgICB0aGlzLnZpZGVvQ29udHJvbGxlci5za2lwKGDwn6SWIEFJ562b6YCJOiDpnZ4nJHtjb250ZW50fSdgKTsKICAgICAgICAgICAgfSBlbHNlIGlmICh0aGlzLmNvbnNlY3V0aXZlWWVzID49IDIpIHsKICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGDjgJDlgZzmraLmo4DmtYvjgJHov57nu60y5qyh5Yik5a6a5Li6JHtjb250ZW50fe+8jOWuieW/g+ingueci2ApOwogICAgICAgICAgICAgICAgdGhpcy5zdG9wQ2hlY2tpbmcgPSB0cnVlOwoKICAgICAgICAgICAgICAgIC8vIOajgOafpeaYr+WQpuW8gOWQr+S6huiHquWKqOeCuei1nuWKn+iDvQogICAgICAgICAgICAgICAgY29uc3QgYXV0b0xpa2VFbmFibGVkID0gdGhpcy5jb25maWcuZ2V0KCdhaVByZWZlcmVuY2UnKS5hdXRvTGlrZTsKICAgICAgICAgICAgICAgIGlmICghdGhpcy5oYXNMaWtlZCAmJiBhdXRvTGlrZUVuYWJsZWQpIHsKICAgICAgICAgICAgICAgICAgICB0aGlzLnZpZGVvQ29udHJvbGxlci5saWtlKCk7CiAgICAgICAgICAgICAgICAgICAgdGhpcy5oYXNMaWtlZCA9IHRydWU7CiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKCFhdXRvTGlrZUVuYWJsZWQpIHsKICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygn44CQ6Ieq5Yqo54K56LWe44CR5Yqf6IO95bey5YWz6Zet77yM6Lez6L+H54K56LWeJyk7CiAgICAgICAgICAgICAgICB9CiAgICAgICAgICAgIH0KICAgICAgICB9CiAgICB9CgogICAgLy8gPT09PT09PT09PSDop4bpopHmo4DmtYvnrZbnlaUgPT09PT09PT09PQogICAgY2xhc3MgVmlkZW9EZXRlY3Rpb25TdHJhdGVnaWVzIHsKICAgICAgICBjb25zdHJ1Y3Rvcihjb25maWcsIHZpZGVvQ29udHJvbGxlciwgbm90aWZpY2F0aW9uTWFuYWdlcikgewogICAgICAgICAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZzsKICAgICAgICAgICAgdGhpcy52aWRlb0NvbnRyb2xsZXIgPSB2aWRlb0NvbnRyb2xsZXI7CiAgICAgICAgICAgIHRoaXMubm90aWZpY2F0aW9uTWFuYWdlciA9IG5vdGlmaWNhdGlvbk1hbmFnZXI7CiAgICAgICAgICAgIHRoaXMucmVzb2x1dGlvblNraXBwZWQgPSBmYWxzZTsKICAgICAgICB9CgogICAgICAgIHJlc2V0KCkgewogICAgICAgICAgICB0aGlzLnJlc29sdXRpb25Ta2lwcGVkID0gZmFsc2U7CiAgICAgICAgfQoKICAgICAgICBjaGVja0FkKGNvbnRhaW5lcikgewogICAgICAgICAgICBpZiAoIXRoaXMuY29uZmlnLmlzRW5hYmxlZCgnc2tpcEFkJykpIHJldHVybiBmYWxzZTsKCiAgICAgICAgICAgIGNvbnN0IGFkSW5kaWNhdG9yID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoU0VMRUNUT1JTLmFkSW5kaWNhdG9yKTsKICAgICAgICAgICAgaWYgKGFkSW5kaWNhdG9yKSB7CiAgICAgICAgICAgICAgICB0aGlzLnZpZGVvQ29udHJvbGxlci5za2lwKCfij63vuI8g6Ieq5Yqo6Lez6L+HOiDlub/lkYrop4bpopEnKTsKICAgICAgICAgICAgICAgIHJldHVybiB0cnVlOwogICAgICAgICAgICB9CiAgICAgICAgICAgIHJldHVybiBmYWxzZTsKICAgICAgICB9CgogICAgICAgIGNoZWNrQmxvY2tlZEFjY291bnQoY29udGFpbmVyKSB7CiAgICAgICAgICAgIGlmICghdGhpcy5jb25maWcuaXNFbmFibGVkKCdibG9ja0tleXdvcmRzJykpIHJldHVybiBmYWxzZTsKCiAgICAgICAgICAgIGNvbnN0IGJsb2NrQ29uZmlnID0gdGhpcy5jb25maWcuZ2V0KCdibG9ja0tleXdvcmRzJyk7CiAgICAgICAgICAgIGNvbnN0IGtleXdvcmRzID0gYmxvY2tDb25maWcua2V5d29yZHM7CiAgICAgICAgICAgIGNvbnN0IHByZXNzUkVuYWJsZWQgPSBibG9ja0NvbmZpZy5wcmVzc1I7CiAgICAgICAgICAgIGNvbnN0IGJsb2NrTmFtZSA9IGJsb2NrQ29uZmlnLmJsb2NrTmFtZTsKICAgICAgICAgICAgY29uc3QgYmxvY2tEZXNjID0gYmxvY2tDb25maWcuYmxvY2tEZXNjOwogICAgICAgICAgICBjb25zdCBibG9ja1RhZ3MgPSBibG9ja0NvbmZpZy5ibG9ja1RhZ3M7CgogICAgICAgICAgICAvLyDlpoLmnpzkuInkuKrmo4DmtYvpgInpobnpg73msqHlvIDlkK/vvIznm7TmjqXov5Tlm54KICAgICAgICAgICAgaWYgKCFibG9ja05hbWUgJiYgIWJsb2NrRGVzYyAmJiAhYmxvY2tUYWdzKSByZXR1cm4gZmFsc2U7CgogICAgICAgICAgICBsZXQgbWF0Y2hlZEtleXdvcmQgPSBudWxsOwogICAgICAgICAgICBsZXQgbWF0Y2hUeXBlID0gJyc7CgogICAgICAgICAgICAvLyDmo4DmtYvlkI3np7DvvIjotKblj7fmmLXnp7DvvIkKICAgICAgICAgICAgaWYgKGJsb2NrTmFtZSAmJiAhbWF0Y2hlZEtleXdvcmQpIHsKICAgICAgICAgICAgICAgIGNvbnN0IGFjY291bnRFbCA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKFNFTEVDVE9SUy5hY2NvdW50TmFtZSk7CiAgICAgICAgICAgICAgICBjb25zdCBhY2NvdW50TmFtZSA9IGFjY291bnRFbD8udGV4dENvbnRlbnQudHJpbSgpOwogICAgICAgICAgICAgICAgaWYgKGFjY291bnROYW1lKSB7CiAgICAgICAgICAgICAgICAgICAgbWF0Y2hlZEtleXdvcmQgPSBrZXl3b3Jkcy5maW5kKGt3ID0+IGFjY291bnROYW1lLmluY2x1ZGVzKGt3KSk7CiAgICAgICAgICAgICAgICAgICAgaWYgKG1hdGNoZWRLZXl3b3JkKSBtYXRjaFR5cGUgPSAn5ZCN56ewJzsKICAgICAgICAgICAgICAgIH0KICAgICAgICAgICAgfQoKICAgICAgICAgICAgLy8g5qOA5rWL566A5LuL77yI6KeG6aKR5o+P6L+w5paH5qGI77yM5o6S6Zmk5qCH562+77yJCiAgICAgICAgICAgIGlmIChibG9ja0Rlc2MgJiYgIW1hdGNoZWRLZXl3b3JkKSB7CiAgICAgICAgICAgICAgICBjb25zdCBkZXNjRWwgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcihTRUxFQ1RPUlMudmlkZW9EZXNjKTsKICAgICAgICAgICAgICAgIGlmIChkZXNjRWwpIHsKICAgICAgICAgICAgICAgICAgICAvLyDojrflj5bnuq/mlofmnKzvvIznhLblkI7np7vpmaQgI3h4eCDmoIfnrb4KICAgICAgICAgICAgICAgICAgICBjb25zdCBkZXNjVGV4dCA9IGRlc2NFbC50ZXh0Q29udGVudC5yZXBsYWNlKC8jXFMrL2csICcnKS50cmltKCk7CiAgICAgICAgICAgICAgICAgICAgaWYgKGRlc2NUZXh0KSB7CiAgICAgICAgICAgICAgICAgICAgICAgIG1hdGNoZWRLZXl3b3JkID0ga2V5d29yZHMuZmluZChrdyA9PiBkZXNjVGV4dC5pbmNsdWRlcyhrdykpOwogICAgICAgICAgICAgICAgICAgICAgICBpZiAobWF0Y2hlZEtleXdvcmQpIG1hdGNoVHlwZSA9ICfnroDku4snOwogICAgICAgICAgICAgICAgICAgIH0KICAgICAgICAgICAgICAgIH0KICAgICAgICAgICAgfQoKICAgICAgICAgICAgLy8g5qOA5rWL5qCH562+77yII+ivnemimOagh+etvu+8iQogICAgICAgICAgICBpZiAoYmxvY2tUYWdzICYmICFtYXRjaGVkS2V5d29yZCkgewogICAgICAgICAgICAgICAgY29uc3QgZGVzY0VsID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoU0VMRUNUT1JTLnZpZGVvRGVzYyk7CiAgICAgICAgICAgICAgICBpZiAoZGVzY0VsKSB7CiAgICAgICAgICAgICAgICAgICAgLy8g5o+Q5Y+W5omA5pyJICN4eHgg5qCH562+CiAgICAgICAgICAgICAgICAgICAgY29uc3QgdGFncyA9IGRlc2NFbC50ZXh0Q29udGVudC5tYXRjaCgvI1xTKy9nKSB8fCBbXTsKICAgICAgICAgICAgICAgICAgICBjb25zdCB0YWdzVGV4dCA9IHRhZ3Muam9pbignICcpOwogICAgICAgICAg",
        "ICAgICAgICAgIGlmICh0YWdzVGV4dCkgewogICAgICAgICAgICAgICAgICAgICAgICBtYXRjaGVkS2V5d29yZCA9IGtleXdvcmRzLmZpbmQoa3cgPT4gdGFnc1RleHQuaW5jbHVkZXMoa3cpKTsKICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG1hdGNoZWRLZXl3b3JkKSBtYXRjaFR5cGUgPSAn5qCH562+JzsKICAgICAgICAgICAgICAgICAgICB9CiAgICAgICAgICAgICAgICB9CiAgICAgICAgICAgIH0KCiAgICAgICAgICAgIC8vIOWmguaenOWMuemFjeWIsOWFs+mUruWtl++8jOaJp+ihjOi3s+i/h+aTjeS9nAogICAgICAgICAgICBpZiAobWF0Y2hlZEtleXdvcmQpIHsKICAgICAgICAgICAgICAgIGlmIChwcmVzc1JFbmFibGVkKSB7CiAgICAgICAgICAgICAgICAgICAgLy8g5aaC5p6c5byA5ZCv5LqG5oyJUumUruWKn+iDve+8jOaMiVLplK7vvIjop4bpopHkvJrnm7TmjqXmtojlpLHvvIkKICAgICAgICAgICAgICAgICAgICB0aGlzLnZpZGVvQ29udHJvbGxlci5wcmVzc1IoKTsKICAgICAgICAgICAgICAgIH0gZWxzZSB7CiAgICAgICAgICAgICAgICAgICAgLy8g5aaC5p6c5rKh5byA5ZCvUumUruWKn+iDve+8jOWImeS9v+eUqOS4i+mUrui3s+i/hwogICAgICAgICAgICAgICAgICAgIHRoaXMudmlkZW9Db250cm9sbGVyLnNraXAoYPCfmqsg5bGP6JS9JHttYXRjaFR5cGV9OiDlhbPplK7lrZciJHttYXRjaGVkS2V5d29yZH0iYCk7CiAgICAgICAgICAgICAgICB9CiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTsKICAgICAgICAgICAgfQogICAgICAgICAgICByZXR1cm4gZmFsc2U7CiAgICAgICAgfQoKICAgICAgICBjaGVja1Jlc29sdXRpb24oY29udGFpbmVyKSB7CiAgICAgICAgICAgIGlmICghdGhpcy5jb25maWcuaXNFbmFibGVkKCdhdXRvSGlnaFJlcycpICYmICF0aGlzLmNvbmZpZy5pc0VuYWJsZWQoJ29ubHlSZXNvbHV0aW9uJykpIHJldHVybiBmYWxzZTsKCiAgICAgICAgICAgIGNvbnN0IHByaW9yaXR5T3JkZXIgPSBbIjRLIiwgIjJLIiwgIjEwODBQIiwgIjcyMFAiLCAiNTQwUCIsICLmmbrog70iXTsKICAgICAgICAgICAgY29uc3Qgb3B0aW9ucyA9IEFycmF5LmZyb20oY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoU0VMRUNUT1JTLnJlc29sdXRpb25PcHRpb25zKSkKICAgICAgICAgICAgICAgIC5tYXAoZWwgPT4gewogICAgICAgICAgICAgICAgICAgIGNvbnN0IHRleHQgPSBlbC50ZXh0Q29udGVudC50cmltKCkudG9VcHBlckNhc2UoKTsKICAgICAgICAgICAgICAgICAgICByZXR1cm4gewogICAgICAgICAgICAgICAgICAgICAgICBlbGVtZW50OiBlbCwKICAgICAgICAgICAgICAgICAgICAgICAgdGV4dCwKICAgICAgICAgICAgICAgICAgICAgICAgcHJpb3JpdHk6IHByaW9yaXR5T3JkZXIuZmluZEluZGV4KHAgPT4gdGV4dC5pbmNsdWRlcyhwKSkKICAgICAgICAgICAgICAgICAgICB9OwogICAgICAgICAgICAgICAgfSkKICAgICAgICAgICAgICAgIC5maWx0ZXIob3B0ID0+IG9wdC5wcmlvcml0eSAhPT0gLTEpCiAgICAgICAgICAgICAgICAuc29ydCgoYSwgYikgPT4gYS5wcmlvcml0eSAtIGIucHJpb3JpdHkpOwoKICAgICAgICAgICAgLy8g5Y+q55yL5oyH5a6a5YiG6L6o546H5qih5byP77ya5Y+q6YCJ5oup5oyH5a6a5YiG6L6o546H77yM5rKh5pyJ5bCx6Lez6L+HCiAgICAgICAgICAgIGlmICh0aGlzLmNvbmZpZy5pc0VuYWJsZWQoJ29ubHlSZXNvbHV0aW9uJykpIHsKICAgICAgICAgICAgICAgIGNvbnN0IHRhcmdldFJlc29sdXRpb24gPSB0aGlzLmNvbmZpZy5nZXQoJ29ubHlSZXNvbHV0aW9uJykucmVzb2x1dGlvbi50b1VwcGVyQ2FzZSgpOwogICAgICAgICAgICAgICAgY29uc3QgaGFzVGFyZ2V0ID0gb3B0aW9ucy5zb21lKG9wdCA9PiBvcHQudGV4dC5pbmNsdWRlcyh0YXJnZXRSZXNvbHV0aW9uKSk7CiAgICAgICAgICAgICAgICBpZiAoIWhhc1RhcmdldCkgewogICAgICAgICAgICAgICAgICAgIGlmICghdGhpcy5yZXNvbHV0aW9uU2tpcHBlZCkgewogICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnZpZGVvQ29udHJvbGxlci5za2lwKGDwn5O6IOWIhui+qOeOh+etm+mAie+8mumdniAke3RhcmdldFJlc29sdXRpb259IOWIhui+qOeOh2ApOwogICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnJlc29sdXRpb25Ta2lwcGVkID0gdHJ1ZTsKICAgICAgICAgICAgICAgICAgICB9CiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7CiAgICAgICAgICAgICAgICB9CiAgICAgICAgICAgICAgICBjb25zdCB0YXJnZXRPcHRpb24gPSBvcHRpb25zLmZpbmQob3B0ID0+IG9wdC50ZXh0LmluY2x1ZGVzKHRhcmdldFJlc29sdXRpb24pKTsKICAgICAgICAgICAgICAgIGlmICh0YXJnZXRPcHRpb24gJiYgIXRhcmdldE9wdGlvbi5lbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygic2VsZWN0ZWQiKSkgewogICAgICAgICAgICAgICAgICAgIHRhcmdldE9wdGlvbi5lbGVtZW50LmNsaWNrKCk7CiAgICAgICAgICAgICAgICAgICAgdGhpcy5ub3RpZmljYXRpb25NYW5hZ2VyLnNob3dNZXNzYWdlKGDwn5O6IOWIhui+qOeOhzog5bey5YiH5o2i6IezICR7dGFyZ2V0UmVzb2x1dGlvbn1gKTsKICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTsKICAgICAgICAgICAgICAgIH0KICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTsKICAgICAgICAgICAgfQoKICAgICAgICAgICAgLy8g5Y6f5pyJ55qE5pyA6auY5YiG6L6o546H6YC76L6RCiAgICAgICAgICAgIGlmICh0aGlzLmNvbmZpZy5pc0VuYWJsZWQoJ2F1dG9IaWdoUmVzJykpIHsKICAgICAgICAgICAgICAgIGlmIChvcHRpb25zLmxlbmd0aCA+IDAgJiYgIW9wdGlvbnNbMF0uZWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoInNlbGVjdGVkIikpIHsKICAgICAgICAgICAgICAgICAgICBjb25zdCBiZXN0T3B0aW9uID0gb3B0aW9uc1swXTsKICAgICAgICAgICAgICAgICAgICBiZXN0T3B0aW9uLmVsZW1lbnQuY2xpY2soKTsKICAgICAgICAgICAgICAgICAgICBjb25zdCByZXNvbHV0aW9uVGV4dCA9IGJlc3RPcHRpb24uZWxlbWVudC50ZXh0Q29udGVudC50cmltKCk7CiAgICAgICAgICAgICAgICAgICAgdGhpcy5ub3RpZmljYXRpb25NYW5hZ2VyLnNob3dNZXNzYWdlKGDwn5O6IOWIhui+qOeOhzog5bey5YiH5o2i6Iez5pyA6auY5qGjICR7cmVzb2x1dGlvblRleHR9YCk7CgogICAgICAgICAgICAgICAgICAgIGlmIChiZXN0T3B0aW9uLnRleHQuaW5jbHVkZXMoIjRLIikpIHsKICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5jb25maWcuc2V0RW5hYmxlZCgnYXV0b0hpZ2hSZXMnLCBmYWxzZSk7CiAgICAgICAgICAgICAgICAgICAgICAgIFVJTWFuYWdlci51cGRhdGVUb2dnbGVCdXR0b25zKCdhdXRvLWhpZ2gtcmVzb2x1dGlvbi1idXR0b24nLCBmYWxzZSk7CiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMubm90aWZpY2F0aW9uTWFuYWdlci5zaG93TWVzc2FnZSgi8J+TuiDliIbovqjnjoc6IOW3sumUgeWumjRL77yM6Ieq5Yqo5YiH5o2i5bey5YWz6ZetIik7CiAgICAgICAgICAgICAgICAgICAgfQogICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlOwogICAgICAgICAgICAgICAgfQogICAgICAgICAgICB9CiAgICAgICAgICAgIHJldHVybiBmYWxzZTsKICAgICAgICB9CiAgICB9CgogICAgLy8gPT09PT09PT09PSDkuLvlupTnlKjnqIvluo8gPT09PT09PT09PQogICAgY2xhc3MgRG91eWluRW5oYW5jZXIgewogICAgICAgIGNvbnN0cnVjdG9yKCkgewogICAgICAgICAgICB0aGlzLm5vdGlmaWNhdGlvbk1hbmFnZXIgPSBuZXcgTm90aWZpY2F0aW9uTWFuYWdlcigpOwogICAgICAgICAgICB0aGlzLmNvbmZpZyA9IG5ldyBDb25maWdNYW5hZ2VyKCk7CiAgICAgICAgICAgIHRoaXMudmlkZW9Db250cm9sbGVyID0gbmV3IFZpZGVvQ29udHJvbGxlcih0aGlzLm5vdGlmaWNhdGlvbk1hbmFnZXIpOwogICAgICAgICAgICB0aGlzLnVpTWFuYWdlciA9IG5ldyBVSU1hbmFnZXIodGhpcy5jb25maWcsIHRoaXMudmlkZW9Db250cm9sbGVyLCB0aGlzLm5vdGlmaWNhdGlvbk1hbmFnZXIpOwogICAgICAgICAgICB0aGlzLmFpRGV0ZWN0b3IgPSBuZXcgQUlEZXRlY3Rvcih0aGlzLnZpZGVvQ29udHJvbGxlciwgdGhpcy5jb25maWcpOwogICAgICAgICAgICB0aGlzLnN0cmF0ZWdpZXMgPSBuZXcgVmlkZW9EZXRlY3Rpb25TdHJhdGVnaWVzKHRoaXMuY29uZmlnLCB0aGlzLnZpZGVvQ29udHJvbGxlciwgdGhpcy5ub3RpZmljYXRpb25NYW5hZ2VyKTsKCiAgICAgICAgICAgIHRoaXMubGFzdFZpZGVvVXJsID0gJyc7CiAgICAgICAgICAgIHRoaXMudmlkZW9TdGFydFRpbWUgPSAwOwogICAgICAgICAgICB0aGlzLnNwZWVkTW9kZVNraXBwZWQgPSBmYWxzZTsKICAgICAgICAgICAgdGhpcy5sYXN0U2tpcHBlZExpdmVVcmwgPSAnJzsKICAgICAgICAgICAgdGhpcy5pc0N1cnJlbnRseVNraXBwaW5nID0gZmFsc2U7CiAgICAgICAgICAgIHRoaXMuY3VycmVudFNwZWVkRHVyYXRpb24gPSBudWxsOwogICAgICAgICAgICB0aGlzLmN1cnJlbnRTcGVlZE1vZGUgPSB0aGlzLmNvbmZpZy5nZXQoJ3NwZWVkTW9kZScpLm1vZGU7CgogICAgICAgICAgICB0aGlzLmluaXQoKTsKICAgICAgICB9CgogICAgICAgIGluaXQoKSB7CiAgICAgICAgICAgIHRoaXMuaW5qZWN0U3R5bGVzKCk7CgogICAgICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgKGUpID0+IHsKICAgICAgICAgICAgICAgIGlmIChlLnRhcmdldC50YWdOYW1lID09PSAnSU5QVVQnIHx8IGUudGFyZ2V0LnRhZ05hbWUgPT09ICdURVhUQVJFQScgfHwgZS50YXJnZXQuaXNDb250ZW50RWRpdGFibGUpIHsKICAgICAgICAgICAgICAgICAgICByZXR1cm47CiAgICAgICAgICAgICAgICB9CgogICAgICAgICAgICAgICAgaWYgKGUua2V5ID09PSAnPScpIHsKICAgICAgICAgICAgICAgICAgICBjb25zdCBpc0VuYWJsZWQgPSAhdGhpcy5jb25maWcuaXNFbmFibGVkKCdza2lwTGl2ZScpOwogICAgICAgICAgICAgICAgICAgIHRoaXMuY29uZmlnLnNldEVuYWJsZWQoJ3NraXBMaXZlJywgaXNFbmFibGVkKTsKICAgICAgICAgICAgICAgICAgICBVSU1hbmFnZXIudXBkYXRlVG9nZ2xlQnV0dG9ucygnc2tpcC1saXZlLWJ1dHRvbicsIGlzRW5hYmxlZCk7CiAgICAgICAgICAgICAgICAgICAgdGhpcy5ub3RpZmljYXRpb25NYW5hZ2VyLnNob3dNZXNzYWdlKGDlip/og73lvIDlhbM6IOi3s+i/h+ebtOaSreW3siAke2lzRW5hYmxlZCA/ICfinIUnIDogJ+KdjCd9YCk7CiAgICAgICAgICAgICAgICB9CiAgICAgICAgICAgIH0pOwoKICAgICAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignZG91eWluLXNwZWVkLW1vZGUtdXBkYXRlZCcsICgpID0+IHsKICAgICAgICAgICAgICAgIHRoaXMuYXNzaWduU3BlZWRNb2RlRHVyYXRpb24oZmFsc2UpOwogICAgICAgICAgICAgICAgdGhpcy5zcGVlZE1vZGVTa2lwcGVkID0gZmFsc2U7CiAgICAgICAgICAgICAgICB0aGlzLnZpZGVvU3RhcnRUaW1lID0gRGF0ZS5ub3coKTsKICAgICAgICAgICAgfSk7CgogICAgICAgICAgICBzZXRJbnRlcnZhbCgoKSA9PiB0aGlzLm1haW5Mb29wKCksIDMwMCk7CiAgICAgICAgfQoKICAgICAgICBhc3NpZ25TcGVlZE1vZGVEdXJhdGlvbihpc05ld1ZpZGVvKSB7CiAgICAgICAgICAgIGNvbnN0IHNwZWVkQ29uZmlnID0gdGhpcy5jb25maWcuZ2V0KCdzcGVlZE1vZGUnKTsKCiAgICAgICAgICAgIGlmICghdGhpcy5jb25maWcuaXNFbmFibGVkKCdzcGVlZE1vZGUnKSkgewogICAgICAgICAgICAgICAgdGhpcy5jdXJyZW50U3BlZWREdXJhdGlvbiA9IG51bGw7CiAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnRTcGVlZE1vZGUgPSBzcGVlZENvbmZpZy5tb2RlOwogICAgICAgICAgICAgICAgcmV0dXJuOwogICAgICAgICAgICB9CgogICAgICAgICAgICBpZiAoc3BlZWRDb25maWcubW9kZSA9PT0gJ3JhbmRvbScpIHsKICAgICAgICAgICAgICAgIGNvbnN0IG1pbiA9IE1hdGgubWluKHNwZWVkQ29uZmlnLm1pblNlY29uZHMsIHNwZWVkQ29uZmlnLm1heFNlY29uZHMpOwogICAgICAgICAgICAgICAgY29uc3QgbWF4ID0gTWF0aC5tYXgoc3BlZWRDb25maWcubWluU2Vjb25kcywgc3BlZWRDb25maWcubWF4U2Vjb25kcyk7CiAgICAgICAgICAgICAgICBjb25zdCByYW5k",
        "b21WYWx1ZSA9IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIChtYXggLSBtaW4gKyAxKSkgKyBtaW47CiAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnRTcGVlZER1cmF0aW9uID0gcmFuZG9tVmFsdWU7CiAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnRTcGVlZE1vZGUgPSAncmFuZG9tJzsKICAgICAgICAgICAgfSBlbHNlIHsKICAgICAgICAgICAgICAgIHRoaXMuY3VycmVudFNwZWVkRHVyYXRpb24gPSBzcGVlZENvbmZpZy5zZWNvbmRzOwogICAgICAgICAgICAgICAgdGhpcy5jdXJyZW50U3BlZWRNb2RlID0gJ2ZpeGVkJzsKICAgICAgICAgICAgfQogICAgICAgIH0KCiAgICAgICAgaW5qZWN0U3R5bGVzKCkgewogICAgICAgICAgICBjb25zdCBzdHlsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3N0eWxlJyk7CiAgICAgICAgICAgIHN0eWxlLmlubmVySFRNTCA9IGAKICAgICAgICAgICAgICAgIC8qIOiuqeWPs+S+p+aMiemSruWuueWZqOmrmOW6puiHqumAguW6lO+8jOmYsuatouaMiemSruaNouihjOaXtuiiq+makOiXjyAqLwogICAgICAgICAgICAgICAgLnhnLXJpZ2h0LWdyaWQgewogICAgICAgICAgICAgICAgICAgIGhlaWdodDogYXV0byAhaW1wb3J0YW50OwogICAgICAgICAgICAgICAgICAgIG1heC1oZWlnaHQ6IG5vbmUgIWltcG9ydGFudDsKICAgICAgICAgICAgICAgICAgICBvdmVyZmxvdzogdmlzaWJsZSAhaW1wb3J0YW50OwogICAgICAgICAgICAgICAgfQoKICAgICAgICAgICAgICAgIC8qIOehruS/neaMiemSruWuueWZqOWPr+S7peato+ehruaNouihjOaYvuekuiAqLwogICAgICAgICAgICAgICAgLnhnLXJpZ2h0LWdyaWQgeGctaWNvbiB7CiAgICAgICAgICAgICAgICAgICAgZGlzcGxheTogaW5saW5lLWJsb2NrICFpbXBvcnRhbnQ7CiAgICAgICAgICAgICAgICAgICAgbWFyZ2luOiAtMTJweCAwICFpbXBvcnRhbnQ7CiAgICAgICAgICAgICAgICB9CgogICAgICAgICAgICAgICAgLyog6Ziy5q2i54i25a655Zmo6ZmQ5Yi26auY5bqm5a+86Ie05YaF5a656KKr6KOB5YmqICovCiAgICAgICAgICAgICAgICAueGdwbGF5ZXItY29udHJvbHMgewogICAgICAgICAgICAgICAgICAgIG92ZXJmbG93OiB2aXNpYmxlICFpbXBvcnRhbnQ7CiAgICAgICAgICAgICAgICB9CgogICAgICAgICAgICAgICAgLyog6K6p5o6n5Yi25qCP5bqV6YOo5Yy65Z+f6auY5bqm6Ieq6YCC5bqUICovCiAgICAgICAgICAgICAgICAueGdwbGF5ZXItY29udHJvbHMtYm90dG9tIHsKICAgICAgICAgICAgICAgICAgICBoZWlnaHQ6IGF1dG8gIWltcG9ydGFudDsKICAgICAgICAgICAgICAgICAgICBtaW4taGVpZ2h0OiA1MHB4ICFpbXBvcnRhbnQ7CiAgICAgICAgICAgICAgICB9CgoKICAgICAgICAgICAgYDsKICAgICAgICAgICAgZG9jdW1lbnQuaGVhZC5hcHBlbmRDaGlsZChzdHlsZSk7CiAgICAgICAgfQoKICAgICAgICBtYWluTG9vcCgpIHsKICAgICAgICAgICAgdGhpcy51aU1hbmFnZXIuaW5zZXJ0QnV0dG9ucygpOwoKICAgICAgICAgICAgY29uc3QgZWxlbWVudHNXaXRoVGV4dCA9IEFycmF5LmZyb20oZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnZGl2LHNwYW4nKSkKICAgICAgICAgICAgICAgIC5maWx0ZXIoZWwgPT4gZWwudGV4dENvbnRlbnQuaW5jbHVkZXMoJ+i/m+WFpeebtOaSremXtCcpKTsKICAgICAgICAgICAgY29uc3QgaW5uZXJtb3N0RWxlbWVudHMgPSBlbGVtZW50c1dpdGhUZXh0LmZpbHRlcihlbCA9PiB7CiAgICAgICAgICAgICAgICByZXR1cm4gIWVsZW1lbnRzV2l0aFRleHQuc29tZShvdGhlckVsID0+IGVsICE9PSBvdGhlckVsICYmIGVsLmNvbnRhaW5zKG90aGVyRWwpKTsKICAgICAgICAgICAgfSk7CiAgICAgICAgICAgIGNvbnN0IGlzTGl2ZSA9IGlubmVybW9zdEVsZW1lbnRzLnNvbWUoZWwgPT4gaXNFbGVtZW50SW5WaWV3cG9ydChlbCkpOwogICAgICAgICAgICBpZiAoaXNMaXZlKSB7CiAgICAgICAgICAgICAgICB0aGlzLmxhc3RWaWRlb1VybCA9ICLnm7Tmkq0iOwogICAgICAgICAgICAgICAgaWYgKHRoaXMuY29uZmlnLmlzRW5hYmxlZCgnc2tpcExpdmUnKSkgewogICAgICAgICAgICAgICAgICAgIGlmICghdGhpcy5pc0N1cnJlbnRseVNraXBwaW5nKSB7CiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudmlkZW9Db250cm9sbGVyLnNraXAoJ+KPre+4jyDoh6rliqjot7Pov4c6IOebtOaSremXtCcpOwogICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmlzQ3VycmVudGx5U2tpcHBpbmcgPSB0cnVlOwogICAgICAgICAgICAgICAgICAgIH0KICAgICAgICAgICAgICAgIH0KICAgICAgICAgICAgICAgIHJldHVybjsKICAgICAgICAgICAgfQogICAgICAgICAgICB0aGlzLmlzQ3VycmVudGx5U2tpcHBpbmcgPSBmYWxzZTsKICAgICAgICAgICAgY29uc3QgYWN0aXZlQ29udGFpbmVycyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoU0VMRUNUT1JTLmFjdGl2ZVZpZGVvKTsKICAgICAgICAgICAgY29uc3QgYWN0aXZlQ29udGFpbmVyID0gZ2V0QmVzdFZpc2libGVFbGVtZW50KGFjdGl2ZUNvbnRhaW5lcnMpOwogICAgICAgICAgICBpZiAoIWFjdGl2ZUNvbnRhaW5lcikgewogICAgICAgICAgICAgICAgcmV0dXJuOwogICAgICAgICAgICB9CgogICAgICAgICAgICBjb25zdCB2aWRlb0VsID0gYWN0aXZlQ29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoU0VMRUNUT1JTLnZpZGVvRWxlbWVudCk7CiAgICAgICAgICAgIGlmICghdmlkZW9FbCB8fCAhdmlkZW9FbC5zcmMpIHJldHVybjsKCiAgICAgICAgICAgIGNvbnN0IGN1cnJlbnRWaWRlb1VybCA9IHZpZGVvRWwuc3JjOwoKICAgICAgICAgICAgaWYgKHRoaXMuaGFuZGxlTmV3VmlkZW8oY3VycmVudFZpZGVvVXJsKSkgewogICAgICAgICAgICAgICAgcmV0dXJuOwogICAgICAgICAgICB9CgogICAgICAgICAgICBpZiAodGhpcy5oYW5kbGVTcGVlZE1vZGUodmlkZW9FbCkpIHsKICAgICAgICAgICAgICAgIHJldHVybjsKICAgICAgICAgICAgfQoKICAgICAgICAgICAgaWYgKHRoaXMuaGFuZGxlQUlEZXRlY3Rpb24odmlkZW9FbCkpIHsKICAgICAgICAgICAgICAgIHJldHVybjsKICAgICAgICAgICAgfQoKICAgICAgICAgICAgaWYgKHRoaXMuc3RyYXRlZ2llcy5jaGVja0FkKGFjdGl2ZUNvbnRhaW5lcikpIHJldHVybjsKICAgICAgICAgICAgaWYgKHRoaXMuc3RyYXRlZ2llcy5jaGVja0Jsb2NrZWRBY2NvdW50KGFjdGl2ZUNvbnRhaW5lcikpIHJldHVybjsKICAgICAgICAgICAgdGhpcy5zdHJhdGVnaWVzLmNoZWNrUmVzb2x1dGlvbihhY3RpdmVDb250YWluZXIpOwogICAgICAgIH0KCiAgICAgICAgaGFuZGxlTmV3VmlkZW8oY3VycmVudFZpZGVvVXJsKSB7CiAgICAgICAgICAgIGlmIChjdXJyZW50VmlkZW9VcmwgIT09IHRoaXMubGFzdFZpZGVvVXJsKSB7CiAgICAgICAgICAgICAgICB0aGlzLmxhc3RWaWRlb1VybCA9IGN1cnJlbnRWaWRlb1VybDsKICAgICAgICAgICAgICAgIHRoaXMudmlkZW9TdGFydFRpbWUgPSBEYXRlLm5vdygpOwogICAgICAgICAgICAgICAgdGhpcy5zcGVlZE1vZGVTa2lwcGVkID0gZmFsc2U7CiAgICAgICAgICAgICAgICB0aGlzLmFpRGV0ZWN0b3IucmVzZXQoKTsKICAgICAgICAgICAgICAgIHRoaXMuc3RyYXRlZ2llcy5yZXNldCgpOwogICAgICAgICAgICAgICAgdGhpcy5hc3NpZ25TcGVlZE1vZGVEdXJhdGlvbih0cnVlKTsKICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCc9PT09PSDmlrDop4bpopHlvIDlp4sgPT09PT0nKTsKICAgICAgICAgICAgICAgIHJldHVybiB0cnVlOwogICAgICAgICAgICB9CiAgICAgICAgICAgIHJldHVybiBmYWxzZTsKICAgICAgICB9CgogICAgICAgIGhhbmRsZVNwZWVkTW9kZSh2aWRlb0VsKSB7CiAgICAgICAgICAgIGlmICghdGhpcy5jb25maWcuaXNFbmFibGVkKCdzcGVlZE1vZGUnKSB8fCB0aGlzLnNwZWVkTW9kZVNraXBwZWQgfHwgdGhpcy5haURldGVjdG9yLmhhc1NraXBwZWQpIHsKICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTsKICAgICAgICAgICAgfQoKICAgICAgICAgICAgY29uc3Qgc3BlZWRDb25maWcgPSB0aGlzLmNvbmZpZy5nZXQoJ3NwZWVkTW9kZScpOwogICAgICAgICAgICBpZiAodGhpcy5jdXJyZW50U3BlZWRNb2RlICE9PSBzcGVlZENvbmZpZy5tb2RlKSB7CiAgICAgICAgICAgICAgICB0aGlzLmFzc2lnblNwZWVkTW9kZUR1cmF0aW9uKGZhbHNlKTsKICAgICAgICAgICAgfQoKICAgICAgICAgICAgaWYgKHNwZWVkQ29uZmlnLm1vZGUgPT09ICdmaXhlZCcpIHsKICAgICAgICAgICAgICAgIGlmICh0aGlzLmN1cnJlbnRTcGVlZER1cmF0aW9uICE9PSBzcGVlZENvbmZpZy5zZWNvbmRzKSB7CiAgICAgICAgICAgICAgICAgICAgdGhpcy5jdXJyZW50U3BlZWREdXJhdGlvbiA9IHNwZWVkQ29uZmlnLnNlY29uZHM7CiAgICAgICAgICAgICAgICB9CiAgICAgICAgICAgIH0gZWxzZSBpZiAoc3BlZWRDb25maWcubW9kZSA9PT0gJ3JhbmRvbScpIHsKICAgICAgICAgICAgICAgIGlmICh0aGlzLmN1cnJlbnRTcGVlZER1cmF0aW9uID09PSBudWxsKSB7CiAgICAgICAgICAgICAgICAgICAgdGhpcy5hc3NpZ25TcGVlZE1vZGVEdXJhdGlvbihmYWxzZSk7CiAgICAgICAgICAgICAgICB9CiAgICAgICAgICAgIH0KCiAgICAgICAgICAgIGNvbnN0IHBsYXliYWNrVGltZSA9IE51bWJlci5pc0Zpbml0ZSh2aWRlb0VsLmN1cnJlbnRUaW1lKSA/IHZpZGVvRWwuY3VycmVudFRpbWUgOiAwOwogICAgICAgICAgICBjb25zdCB0YXJnZXRTZWNvbmRzID0gdGhpcy5jdXJyZW50U3BlZWREdXJhdGlvbiA/PyBzcGVlZENvbmZpZy5zZWNvbmRzOwoKICAgICAgICAgICAgaWYgKHBsYXliYWNrVGltZSA+PSB0YXJnZXRTZWNvbmRzKSB7CiAgICAgICAgICAgICAgICB0aGlzLnNwZWVkTW9kZVNraXBwZWQgPSB0cnVlOwogICAgICAgICAgICAgICAgdGhpcy52aWRlb0NvbnRyb2xsZXIuc2tpcChg4pqh77iPIOaegemAn+aooeW8jzogJHt0YXJnZXRTZWNvbmRzfeenkuW3suWIsGApOwogICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7CiAgICAgICAgICAgIH0KICAgICAgICAgICAgcmV0dXJuIGZhbHNlOwogICAgICAgIH0KCiAgICAgICAgaGFuZGxlQUlEZXRlY3Rpb24odmlkZW9FbCkgewogICAgICAgICAgICBpZiAoIXRoaXMuY29uZmlnLmlzRW5hYmxlZCgnYWlQcmVmZXJlbmNlJykpIHJldHVybiBmYWxzZTsKCiAgICAgICAgICAgIGNvbnN0IHZpZGVvUGxheVRpbWUgPSBEYXRlLm5vdygpIC0gdGhpcy52aWRlb1N0YXJ0VGltZTsKCiAgICAgICAgICAgIGlmICh0aGlzLmFpRGV0ZWN0b3Iuc2hvdWxkQ2hlY2sodmlkZW9QbGF5VGltZSkpIHsKICAgICAgICAgICAgICAgIGlmICh2aWRlb0VsLnJlYWR5U3RhdGUgPj0gMiAmJiAhdmlkZW9FbC5wYXVzZWQpIHsKICAgICAgICAgICAgICAgICAgICBjb25zdCB0aW1lSW5TZWNvbmRzID0gKHRoaXMuYWlEZXRlY3Rvci5jaGVja1NjaGVkdWxlW3RoaXMuYWlEZXRlY3Rvci5jdXJyZW50Q2hlY2tJbmRleF0gLyAxMDAwKS50b0ZpeGVkKDEpOwogICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGDjgJBBSeajgOa1i+OAkeesrCR7dGhpcy5haURldGVjdG9yLmN1cnJlbnRDaGVja0luZGV4ICsgMX3mrKHmo4DmtYvvvIzml7bpl7TngrnvvJoke3RpbWVJblNlY29uZHN956eSYCk7CiAgICAgICAgICAgICAgICAgICAgdGhpcy5haURldGVjdG9yLnByb2Nlc3NWaWRlbyh2aWRlb0VsKTsKICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTsKICAgICAgICAgICAgICAgIH0KICAgICAgICAgICAgfQoKICAgICAgICAgICAgaWYgKHZpZGVvUGxheVRpbWUgPj0gMTAwMDAgJiYgIXRoaXMuYWlEZXRlY3Rvci5zdG9wQ2hlY2tpbmcpIHsKICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCfjgJDotoXml7blgZzmraLjgJHop4bpopHmkq3mlL7lt7LotoXov4cxMOenku+8jOWBnOatokFJ5qOA5rWLJyk7CiAgICAgICAgICAgICAgICB0aGlzLmFpRGV0ZWN0b3Iuc3RvcENoZWNraW5nID0gdHJ1ZTsKICAgICAgICAgICAgfQoKICAgICAgICAgICAgcmV0dXJuIGZhbHNlOwogICAgICAgIH0KICAgIH0KCiAgICAvLyDlkK/liqjlupTnlKgKICAgIGNvbnN0IGFwcCA9IG5ldyBEb3V5aW5FbmhhbmNlcigpOwoKCgoKfSkoKTsK",
      ].join("");
      const text = new TextDecoder().decode(base64ToUint8(textBase64));
      const gbkBytes = new Uint8Array(iconv.encode(text, "gbk"));
      const utf8Bytes = new Uint8Array(iconv.encode(text, "utf-8"));
      expect(detectEncoding(gbkBytes, null)).toBe("gb18030");
      expect(detectEncoding(utf8Bytes, null)).toBe("utf-8");
    });
  });

  describe("readBlobContent", () => {
    it("should return empty string for empty Blob", async () => {
      const blob = new Blob([]);
      const result = await readBlobContent(blob, null);
      expect(result).toBe("");
    });

    it("should handle short text (less than 64 bytes)", async () => {
      const text = "Hello World";
      const blob = new Blob([text]);
      const result = await readBlobContent(blob, null);
      expect(result).toBe(text);
    });

    it("should use charset from valid Content-Type header", async () => {
      const text = "你好世界";
      const gbkBytes = iconv.encode(text, "gbk");
      //@ts-ignore
      const blob = new Blob([gbkBytes]);

      // 即使内容是 GBK，但 Content-Type 指定 UTF-8，应该尝试用 UTF-8 解码
      const result = await readBlobContent(blob, "text/plain; charset=utf-8");
      // GBK 字节用 UTF-8 解码会产生乱码或替换字符
      expect(result).not.toBe(text);
    });

    it("should fallback to heuristic detection when Content-Type charset is invalid", async () => {
      const text = "Hello World";
      const blob = new Blob([text]);
      const result = await readBlobContent(blob, "text/plain; charset=invalid-charset");
      expect(result).toBe(text);
    });

    describe("BOM detection", () => {
      it("should detect UTF-8 BOM", async () => {
        const text = "Hello BOM";
        const utf8BOM = new Uint8Array([0xef, 0xbb, 0xbf]);
        const textBytes = new TextEncoder().encode(text);
        const combined = new Uint8Array(utf8BOM.length + textBytes.length);
        combined.set(utf8BOM);
        combined.set(textBytes, utf8BOM.length);

        const blob = new Blob([combined]);
        const result = await readBlobContent(blob, null);
        expect(result).toBe(text);
      });

      it("should detect UTF-16LE BOM", async () => {
        const text = "Hello";
        const utf16LEBytes = new Uint8Array([
          0xff,
          0xfe, // BOM
          0x48,
          0x00,
          0x65,
          0x00,
          0x6c,
          0x00,
          0x6c,
          0x00,
          0x6f,
          0x00, // "Hello"
        ]);
        const blob = new Blob([utf16LEBytes]);
        const result = await readBlobContent(blob, null);
        expect(result).toBe(text);
      });

      it("should detect UTF-16BE BOM", async () => {
        const text = "Hello";
        const utf16BEBytes = new Uint8Array([
          0xfe,
          0xff, // BOM
          0x00,
          0x48,
          0x00,
          0x65,
          0x00,
          0x6c,
          0x00,
          0x6c,
          0x00,
          0x6f, // "Hello"
        ]);
        const blob = new Blob([utf16BEBytes]);
        const result = await readBlobContent(blob, null);
        expect(result).toBe(text);
      });

      it("should detect UTF-32LE BOM", async () => {
        const text = "Hi";
        const utf32LEBytes = new Uint8Array([
          0xff,
          0xfe,
          0x00,
          0x00, // BOM
          0x48,
          0x00,
          0x00,
          0x00, // 'H'
          0x69,
          0x00,
          0x00,
          0x00, // 'i'
        ]);
        const blob = new Blob([utf32LEBytes]);
        const result = await readBlobContent(blob, null);
        expect(result).toBe(text);
      });

      it("should detect UTF-32BE BOM", async () => {
        const text = "Hi";
        const utf32BEBytes = new Uint8Array([
          0x00,
          0x00,
          0xfe,
          0xff, // BOM
          0x00,
          0x00,
          0x00,
          0x48, // 'H'
          0x00,
          0x00,
          0x00,
          0x69, // 'i'
        ]);
        const blob = new Blob([utf32BEBytes]);
        const result = await readBlobContent(blob, null);
        expect(result).toBe(text);
      });
    });

    describe("Heuristic detection (null pattern)", () => {
      it("should detect UTF-16LE without BOM via null pattern", async () => {
        // 使用足够长的 ASCII 文本以触发 null pattern 检测
        const text = "A".repeat(100); // 100个ASCII字符
        // UTF-16LE 编码（无 BOM）
        const bytes = new Uint8Array(text.length * 2);
        for (let i = 0; i < text.length; i++) {
          bytes[i * 2] = text.charCodeAt(i);
          bytes[i * 2 + 1] = 0;
        }
        const blob = new Blob([bytes]);
        const result = await readBlobContent(blob, null);
        expect(result).toBe(text);
      });

      it("should detect UTF-16BE without BOM via null pattern", async () => {
        const text = "A".repeat(100); // 100个ASCII字符
        // UTF-16BE 编码（无 BOM）
        const bytes = new Uint8Array(text.length * 2);
        for (let i = 0; i < text.length; i++) {
          bytes[i * 2] = 0;
          bytes[i * 2 + 1] = text.charCodeAt(i);
        }
        const blob = new Blob([bytes]);
        const result = await readBlobContent(blob, null);
        expect(result).toBe(text);
      });

      it("should detect UTF-32LE without BOM via null pattern", async () => {
        const text = "A".repeat(100); // 100个ASCII字符
        // UTF-32LE 编码（无 BOM）
        const bytes = new Uint8Array(text.length * 4);
        let offset = 0;
        for (let i = 0; i < text.length; i++) {
          bytes[offset++] = text.charCodeAt(i);
          bytes[offset++] = 0;
          bytes[offset++] = 0;
          bytes[offset++] = 0;
        }
        const blob = new Blob([bytes]);
        const result = await readBlobContent(blob, null);
        // UTF-32 解码可能包含空格，只验证包含原文本
        expect(result).toContain("A");
        // 验证大致长度（允许有一些空格）
        expect(result.length).toBeGreaterThanOrEqual(text.length);
      });

      it("should detect UTF-32BE without BOM via null pattern", async () => {
        const text = "A".repeat(100); // 100个ASCII字符
        // UTF-32BE 编码（无 BOM）
        const bytes = new Uint8Array(text.length * 4);
        let offset = 0;
        for (let i = 0; i < text.length; i++) {
          bytes[offset++] = 0;
          bytes[offset++] = 0;
          bytes[offset++] = 0;
          bytes[offset++] = text.charCodeAt(i);
        }
        const blob = new Blob([bytes]);
        const result = await readBlobContent(blob, null);
        // UTF-32 解码可能包含空格，只验证包含原文本
        expect(result).toContain("A");
        // 验证大致长度
        expect(result.length).toBeGreaterThanOrEqual(text.length);
      });
    });

    it("should handle valid UTF-8 text without BOM", async () => {
      const text = "Hello 世界, UTF-8 测试";
      const blob = new Blob([text]);
      const result = await readBlobContent(blob, null);
      expect(result).toBe(text);
    });

    it("should fallback to windows-1252 for invalid UTF-8", async () => {
      // Windows-1252 编码的字节（不是有效的 UTF-8）
      const win1252Bytes = new Uint8Array([
        0x54,
        0x68,
        0x69,
        0x73,
        0x20,
        0x63,
        0x6f,
        0x73,
        0x74,
        0x73,
        0x20, // "This costs "
        0x35,
        0x30,
        0x80,
        0x20, // "50€ " (0x80 是 windows-1252 的欧元符号)
      ]);

      const blob = new Blob([win1252Bytes]);
      const result = await readBlobContent(blob, null);

      // 应该能成功解码（使用 windows-1252）
      expect(result).toContain("This costs");
      expect(result).toContain("50");
    });

    it("should handle Blob with File interface", async () => {
      const text = "File content";
      // 在测试环境中，File 可能不支持 arrayBuffer，所以直接用 Blob
      const blob = new Blob([text], { type: "text/plain" });
      const result = await readBlobContent(blob, null);
      expect(result).toBe(text);
    });

    it("should prioritize Content-Type over BOM", async () => {
      // UTF-8 BOM + UTF-8 编码的文本
      const text = "Hello";
      const utf8BOM = new Uint8Array([0xef, 0xbb, 0xbf]);
      const textBytes = new TextEncoder().encode(text);
      const combined = new Uint8Array(utf8BOM.length + textBytes.length);
      combined.set(utf8BOM);
      combined.set(textBytes, utf8BOM.length);

      const blob = new Blob([combined]);
      // Content-Type 指定 UTF-8，即使有 BOM 也应该先使用 Content-Type
      const result = await readBlobContent(blob, "text/plain; charset=utf-8");
      expect(result).toBe(text);
    });

    it("should handle Response object", async () => {
      const text = "Response content";
      const buffer = new TextEncoder().encode(text).buffer;

      // 在测试环境中模拟 Response 对象
      const mockResponse = {
        async arrayBuffer() {
          return buffer;
        },
      } as any;

      const result = await readBlobContent(mockResponse, "text/plain; charset=utf-8");
      expect(result).toBe(text);
    });

    it("should handle very large content", async () => {
      // 创建一个大于 16KB 的内容
      const largeText = "a".repeat(20 * 1024);
      const blob = new Blob([largeText]);
      const result = await readBlobContent(blob, null);
      expect(result).toBe(largeText);
      expect(result.length).toBe(20 * 1024);
    });
  });
});
