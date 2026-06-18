// can be tested with vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { bytesDecode, decodeUTF32, parseCharsetFromContentType, readRawContent } from "./encoding";

const blobFromBytes = (bytes: Uint8Array) =>
  new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer]);

const expectReadBlobContentDecodesAs = async (
  bytes: Uint8Array,
  encoding: string,
  contentType: string | null = null
) => {
  await expect(readRawContent(blobFromBytes(bytes), contentType)).resolves.toBe(bytesDecode(encoding, bytes));
};

describe.concurrent("encoding", () => {
  describe.concurrent("parseCharsetFromContentType", () => {
    it.concurrent("extracts charset from Content-Type header", () => {
      expect(parseCharsetFromContentType("text/javascript; charset=utf-8")).toBe("utf-8");
      expect(parseCharsetFromContentType("text/plain; charset=GBK")).toBe("gbk");
      expect(parseCharsetFromContentType("application/javascript; charset=ISO-8859-1")).toBe("iso-8859-1");
    });

    it.concurrent("handles quotes and case-insensitive charset parameter", () => {
      expect(parseCharsetFromContentType('text/javascript; charset="utf-8"')).toBe("utf-8");
      expect(parseCharsetFromContentType("text/javascript; charset='gbk'")).toBe("gbk");
      expect(parseCharsetFromContentType("text/javascript; CHARSET=UTF-8")).toBe("utf-8");
      expect(parseCharsetFromContentType("text/javascript; Charset=GBK")).toBe("gbk");
    });

    it.concurrent("returns empty string when charset is missing", () => {
      expect(parseCharsetFromContentType("text/javascript")).toBe("");
      expect(parseCharsetFromContentType("text/plain; boundary=something")).toBe("");
      expect(parseCharsetFromContentType(null)).toBe("");
      expect(parseCharsetFromContentType("")).toBe("");
    });

    it.concurrent("handles charset with additional parameters", () => {
      expect(parseCharsetFromContentType("text/javascript; charset=utf-8; boundary=xxx")).toBe("utf-8");
    });

    it.concurrent("handles whitespace around charset assignment", () => {
      expect(parseCharsetFromContentType("text/plain; charset = UTF-8")).toBe("utf-8");
      expect(parseCharsetFromContentType("text/plain; charset = UTF-8 boundary=foo")).toBe("utf-8");
      expect(parseCharsetFromContentType("text/html; charset =  UTF-8  ; next=param")).toBe("utf-8");
    });
  });

  describe.concurrent("bytesDecode", () => {
    it.concurrent("decodes UTF-8 and strips UTF-8 BOM", () => {
      const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0x48, 0x69]);
      expect(bytesDecode("utf-8", bytes)).toBe("Hi");
    });

    it.concurrent("normalizes charset labels before decoding", () => {
      const bytes = new Uint8Array([0xff, 0xfe, 0x00, 0x00, 0x48, 0x00, 0x00, 0x00]);

      expect(bytesDecode("UTF-32LE", bytes)).toBe("H");
    });

    it.concurrent("decodes UTF-16 and UTF-32 variants", () => {
      const utf16le = new Uint8Array([0xff, 0xfe, 0x48, 0x00, 0x69, 0x00]);
      const utf16be = new Uint8Array([0xfe, 0xff, 0x00, 0x48, 0x00, 0x69]);
      const utf32le = new Uint8Array([0xff, 0xfe, 0x00, 0x00, 0x48, 0x00, 0x00, 0x00, 0x69, 0x00, 0x00, 0x00]);
      const utf32be = new Uint8Array([0x00, 0x00, 0xfe, 0xff, 0x00, 0x00, 0x00, 0x48, 0x00, 0x00, 0x00, 0x69]);

      expect(bytesDecode("utf-16le", utf16le)).toBe("Hi");
      expect(bytesDecode("utf-16be", utf16be)).toBe("Hi");
      expect(bytesDecode("utf-32le", utf32le)).toBe("Hi");
      expect(bytesDecode("utf-32be", utf32be)).toBe("Hi");
    });
  });

  describe.concurrent("decodeUTF32", () => {
    it.concurrent("decodes UTF-32LE and UTF-32BE without BOM", () => {
      const le = new Uint8Array([0x48, 0x00, 0x00, 0x00, 0x69, 0x00, 0x00, 0x00]);
      const be = new Uint8Array([0x00, 0x00, 0x00, 0x48, 0x00, 0x00, 0x00, 0x69]);

      expect(decodeUTF32(le, true)).toBe("Hi");
      expect(decodeUTF32(be, false)).toBe("Hi");
    });

    it.concurrent("strips UTF-32 BOM", () => {
      const le = new Uint8Array([0xff, 0xfe, 0x00, 0x00, 0x48, 0x00, 0x00, 0x00]);
      const be = new Uint8Array([0x00, 0x00, 0xfe, 0xff, 0x00, 0x00, 0x00, 0x48]);

      expect(decodeUTF32(le, true)).toBe("H");
      expect(decodeUTF32(be, false)).toBe("H");
    });

    it.concurrent("decodes astral code points", () => {
      const le = new Uint8Array([0x80, 0xf6, 0x01, 0x00, 0x20, 0x00, 0x00, 0x00, 0x0d, 0x00, 0x01, 0x00]);
      const be = new Uint8Array([0x00, 0x01, 0xf6, 0x80, 0x00, 0x00, 0x00, 0x20, 0x00, 0x01, 0x00, 0x0d]);

      expect(decodeUTF32(le, true)).toBe("🚀 𐀍");
      expect(decodeUTF32(be, false)).toBe("🚀 𐀍");
    });

    it.concurrent("throws for non-Uint8Array input", () => {
      expect(() => decodeUTF32([0, 0, 0, 0] as unknown as Uint8Array)).toThrow(TypeError);
    });

    it.concurrent("throws when byte length is not a multiple of 4", () => {
      expect(() => decodeUTF32(new Uint8Array([0x48, 0x00, 0x00]))).toThrow(RangeError);
    });

    it.concurrent("decodes UTF-32LE from a subarray with non-zero byteOffset", () => {
      const padded = new Uint8Array([0x00, 0x48, 0x00, 0x00, 0x00, 0x69, 0x00, 0x00, 0x00]);

      expect(decodeUTF32(padded.subarray(1), true)).toBe("Hi");
    });

    it.concurrent("decodes UTF-32 across chunk boundaries", () => {
      const count = 16384 * 2 + 1;
      const le = new Uint8Array(count * 4);
      for (let i = 0; i < count; i++) {
        le.set([0x61, 0x00, 0x00, 0x00], i * 4);
      }

      const result = decodeUTF32(le, true);

      expect(result.length).toBe(count);
      expect(result[16383]).toBe("a");
      expect(result[16384]).toBe("a");
      expect(result[count - 1]).toBe("a");
    });
  });

  describe.concurrent("readBlobContent", () => {
    it.concurrent("returns empty string for empty Blob", async () => {
      await expect(readRawContent(new Blob([]), null)).resolves.toBe("");
    });

    it.concurrent("decodes short UTF-8 text without charset", async () => {
      const text = "Hello World";
      const blob = new Blob([text]);

      await expect(readRawContent(blob, null)).resolves.toBe(text);
    });

    it.concurrent("uses charset from valid Content-Type header", async () => {
      const text = "你好世界";
      const gbkBytes = new Uint8Array([0xc4, 0xe3, 0xba, 0xc3, 0xca, 0xc0, 0xbd, 0xe7]);
      const blob = new Blob([gbkBytes.buffer]);

      await expect(readRawContent(blob, "text/plain; charset=gbk")).resolves.toBe(text);
    });

    it.concurrent("falls back when Content-Type charset is invalid", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const text = "Hello World";

      await expect(readRawContent(new Blob([text]), "text/plain; charset=invalid-charset")).resolves.toBe(text);

      warn.mockRestore();
    });

    it.concurrent("falls back when invalid Content-Type charset is used with CJK bytes", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const text = "这是一个GBK编码测试Sentence混合12345。";
      const gbkBytes = new Uint8Array([
        0xd5, 0xe2, 0xca, 0xc7, 0xd2, 0xbb, 0xb8, 0xf6, 0x47, 0x42, 0x4b, 0xb1, 0xe0, 0xc2, 0xeb, 0xb2, 0xe2, 0xca,
        0xd4, 0x53, 0x65, 0x6e, 0x74, 0x65, 0x6e, 0x63, 0x65, 0xbb, 0xec, 0xba, 0xcf, 0x31, 0x32, 0x33, 0x34, 0x35,
        0xa1, 0xa3,
      ]);

      await expect(readRawContent(blobFromBytes(gbkBytes), "text/plain; charset=bogus")).resolves.toBe(text);

      warn.mockRestore();
    });

    it.concurrent("prioritizes Content-Type over BOM", async () => {
      const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0x48, 0x65, 0x6c, 0x6c, 0x6f]);
      const blob = new Blob([bytes.buffer]);

      await expect(readRawContent(blob, "text/plain; charset=utf-8")).resolves.toBe("Hello");
    });

    it.concurrent("detects UTF-8 BOM", async () => {
      const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0x48, 0x65, 0x6c, 0x6c, 0x6f]);
      const blob = new Blob([bytes.buffer]);

      await expect(readRawContent(blob, null)).resolves.toBe("Hello");
    });

    it.concurrent("detects UTF-16 BOM", async () => {
      const utf16le = new Uint8Array([0xff, 0xfe, 0x48, 0x00, 0x69, 0x00]);
      const utf16be = new Uint8Array([0xfe, 0xff, 0x00, 0x48, 0x00, 0x69]);

      await expect(readRawContent(new Blob([utf16le.buffer]), null)).resolves.toBe("Hi");
      await expect(readRawContent(new Blob([utf16be.buffer]), null)).resolves.toBe("Hi");
    });

    it.concurrent("detects UTF-32 BOM", async () => {
      const utf32le = new Uint8Array([0xff, 0xfe, 0x00, 0x00, 0x48, 0x00, 0x00, 0x00, 0x69, 0x00, 0x00, 0x00]);
      const utf32be = new Uint8Array([0x00, 0x00, 0xfe, 0xff, 0x00, 0x00, 0x00, 0x48, 0x00, 0x00, 0x00, 0x69]);

      await expect(readRawContent(new Blob([utf32le.buffer]), null)).resolves.toBe("Hi");
      await expect(readRawContent(new Blob([utf32be.buffer]), null)).resolves.toBe("Hi");
    });

    it.concurrent("detects UTF-16 without BOM via null pattern", async () => {
      const text = "A".repeat(100);
      const le = new Uint8Array(text.length * 2);
      const be = new Uint8Array(text.length * 2);
      for (let i = 0; i < text.length; i++) {
        le[i * 2] = text.charCodeAt(i);
        le[i * 2 + 1] = 0;
        be[i * 2] = 0;
        be[i * 2 + 1] = text.charCodeAt(i);
      }

      await expect(readRawContent(new Blob([le.buffer]), null)).resolves.toBe(text);
      await expect(readRawContent(new Blob([be.buffer]), null)).resolves.toBe(text);
    });

    it.concurrent("detects UTF-32 without BOM via null pattern", async () => {
      const text = "A".repeat(100);
      const le = new Uint8Array(text.length * 4);
      const be = new Uint8Array(text.length * 4);
      for (let i = 0; i < text.length; i++) {
        le[i * 4] = text.charCodeAt(i);
        le[i * 4 + 1] = 0;
        le[i * 4 + 2] = 0;
        le[i * 4 + 3] = 0;
        be[i * 4] = 0;
        be[i * 4 + 1] = 0;
        be[i * 4 + 2] = 0;
        be[i * 4 + 3] = text.charCodeAt(i);
      }

      await expect(readRawContent(new Blob([le.buffer]), null)).resolves.toBe(text);
      await expect(readRawContent(new Blob([be.buffer]), null)).resolves.toBe(text);
    });

    it.concurrent("falls through on invalid UTF null-pattern guesses", async () => {
      const bytes = new Uint8Array(66);
      for (let i = 0; i < bytes.length; i += 4) {
        bytes[i] = 0x61;
        if (i + 1 < bytes.length) bytes[i + 1] = 0x00;
        if (i + 2 < bytes.length) bytes[i + 2] = 0x00;
        if (i + 3 < bytes.length) bytes[i + 3] = 0x00;
      }

      await expect(readRawContent(blobFromBytes(bytes), null)).resolves.toBe(bytesDecode("utf-8", bytes));
    });

    it.concurrent("rejects binary-looking false positive UTF-16 null patterns", async () => {
      const bytes = new Uint8Array(200);
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = i % 2 === 0 ? 0x01 : 0x00;
      }

      const result = await readRawContent(blobFromBytes(bytes), null);

      expect(result).not.toBe(bytesDecode("utf-16le", bytes));
      expect(result).not.toBe(bytesDecode("utf-16be", bytes));
    });

    it.concurrent("does not treat borderline null-byte density as UTF-16", async () => {
      const bytes = new Uint8Array(128);
      bytes.fill(0x61);
      for (let i = 0; i < bytes.length; i += 13) {
        bytes[i] = 0;
      }

      await expect(readRawContent(blobFromBytes(bytes), null)).resolves.toBe(bytesDecode("utf-8", bytes));
    });

    it.concurrent("does not misclassify even-length legacy CJK bytes as UTF-16 or UTF-32", async () => {
      const gbkBytes = new Uint8Array([
        0xd5, 0xe2, 0xca, 0xc7, 0xd2, 0xbb, 0xb8, 0xf6, 0x47, 0x42, 0x4b, 0xb1, 0xe0, 0xc2, 0xeb, 0xb2, 0xe2, 0xca,
        0xd4, 0x53, 0x65, 0x6e, 0x74, 0x65, 0x6e, 0x63, 0x65, 0xbb, 0xec, 0xba, 0xcf, 0x31, 0x32, 0x33, 0x34, 0x35,
        0xa1, 0xa3,
      ]);

      await expect(readRawContent(blobFromBytes(gbkBytes), null)).resolves.toBe(
        "这是一个GBK编码测试Sentence混合12345。"
      );
    });

    it.concurrent("decodes valid UTF-8 text without BOM", async () => {
      const text = "Hello 世界, UTF-8 测试";
      const blob = new Blob([text]);

      await expect(readRawContent(blob, null)).resolves.toBe(text);
    });

    it.concurrent("keeps mostly valid UTF-8 with a small corrupt byte as UTF-8", async () => {
      const prefix = "正常中文内容 ";
      const suffix = " 继续 Emoji 🚀 测试";
      const prefixBytes = new TextEncoder().encode(prefix);
      const suffixBytes = new TextEncoder().encode(suffix);
      const bytes = new Uint8Array(prefixBytes.length + 1 + suffixBytes.length);
      bytes.set(prefixBytes);
      bytes[prefixBytes.length] = 0xff;
      bytes.set(suffixBytes, prefixBytes.length + 1);

      await expect(readRawContent(blobFromBytes(bytes), null)).resolves.toBe(`${prefix}\ufffd${suffix}`);
    });

    it.concurrent("handles GitHub release-like UTF-8 text without charset", async () => {
      const text = [
        "// ==UserScript==",
        "// @name         Video Speed Controller",
        "// @namespace    test",
        "// @version      1.0.0",
        "// @description  Adjust and remember video speed using keyboard shortcuts",
        "// ==/UserScript==",
        "const padding = 'ascii only';",
        "/*",
        "a".repeat(17 * 1024),
        "*/",
        'const vi = "Giảm tốc độ";',
        'const saved = "Đã lưu!";',
        'const menu = "🛠️ Mở cấu hình";',
      ].join("\n");
      const blob = new Blob([text], { type: "application/octet-stream" });

      const result = await readRawContent(blob, "application/octet-stream");

      expect(result).toContain("Giảm tốc độ");
      expect(result).toContain("Đã lưu!");
      expect(result).toContain("🛠️ Mở cấu hình");
      expect(result).not.toContain("Giáº£m tá»‘c Ä‘á»™");
      expect(result).not.toContain("ðŸ› ");
    });

    it.concurrent("keeps valid UTF-8 multilingual userscripts intact without charset", async () => {
      const cases = [
        {
          name: "Vietnamese",
          text: "Tiếng Việt: Giảm tốc độ, Đã lưu, Mở cấu hình",
          mojibake: ["Tiáº¿ng Viá»‡t", "Giáº£m"],
        },
        {
          name: "Chinese",
          text: "中文: 网页抖音体验增强，配置管理器",
          mojibake: ["ç½‘é¡µ", "é…ç½®"],
        },
        {
          name: "Japanese",
          text: "日本語: これはテスト文章です",
          mojibake: ["ã“ã‚Œ", "ãƒ†ã‚¹ãƒˆ"],
        },
        {
          name: "Korean",
          text: "한국어: 이것은 테스트 문장입니다",
          mojibake: ["í•œêµ­ì–´", "í…ŒìŠ¤íŠ¸"],
        },
        {
          name: "Cyrillic",
          text: "Русский: Привет мир, тест кодировки",
          mojibake: ["Ð ÑƒÑ", "ÐŸÑ€Ð¸Ð²ÐµÑ‚"],
        },
        {
          name: "Arabic",
          text: "العربية: اختبار ترميز النص",
          mojibake: ["Ø§Ù„Ø¹Ø±Ø¨ÙŠØ©", "Ø§Ø®ØªØ¨Ø§Ø±"],
        },
        {
          name: "Greek",
          text: "Ελληνικά: δοκιμή κωδικοποίησης",
          mojibake: ["Î•Î»Î»", "Î´Î¿ÎºÎ¹Î¼Î®"],
        },
        {
          name: "Hebrew",
          text: "עברית: בדיקת קידוד טקסט",
          mojibake: ["×¢×‘×¨×™×ª", "×‘×“×™×§×ª"],
        },
        {
          name: "Thai",
          text: "ไทย: ทดสอบการเข้ารหัสข้อความ",
          mojibake: ["à¹„à¸—à¸¢", "à¸—à¸”à¸ªà¸­à¸š"],
        },
        {
          name: "Indic",
          text: "हिन्दी: पाठ एन्कोडिंग परीक्षण",
          mojibake: ["à¤¹à¤¿à¤¨", "à¤ªà¤°à¥€à¤•à¥à¤·à¤£"],
        },
        {
          name: "Latin accents",
          text: "Français/Español/Português: déjà vu, niño, ação",
          mojibake: ["FranÃ§ais", "EspaÃ±ol", "aÃ§Ã£o"],
        },
        {
          name: "Emoji",
          text: "Emoji: 🛠️ 🔄 🚀 🎬",
          mojibake: ["ðŸ› ", "ðŸš€", "ðŸŽ¬"],
        },
      ];

      for (const item of cases) {
        const text = [
          "// ==UserScript==",
          `// @name         ${item.name} UTF-8 regression`,
          "// @namespace    test",
          "// @version      1.0.0",
          `// @description  ${item.text}`,
          "// ==/UserScript==",
          "/*",
          "a".repeat(17 * 1024),
          "*/",
          `const message = ${JSON.stringify(item.text)};`,
        ].join("\n");

        const result = await readRawContent(
          new Blob([text], { type: "application/octet-stream" }),
          "application/octet-stream"
        );

        expect(result, item.name).toContain(item.text);
        for (const mojibake of item.mojibake) {
          expect(result, item.name).not.toContain(mojibake);
        }
      }
    });

    it.concurrent("correctly decodes UTF-8 content larger than the full validation limit", async () => {
      const text = "Hello 世界 Emoji 🚀\n".repeat(20 * 1024);

      await expect(readRawContent(new Blob([text]), null)).resolves.toBe(text);
    });

    it.concurrent("keeps a UTF-8 emoji crossing a sampled range boundary intact", async () => {
      const text = `${"a".repeat(16 * 1024 - 2)}🚀${"b".repeat(300 * 1024)}`;

      await expect(readRawContent(new Blob([text]), null)).resolves.toBe(text);
    });

    it.concurrent("keeps large mostly valid UTF-8 with late corruption as UTF-8", async () => {
      const prefix = "a".repeat(300 * 1024);
      const suffix = "你好世界 Emoji 🚀";
      const suffixBytes = new TextEncoder().encode(suffix);
      const bytes = new Uint8Array(prefix.length + 1 + suffixBytes.length);
      bytes.fill(0x61, 0, prefix.length);
      bytes[prefix.length] = 0xff;
      bytes.set(suffixBytes, prefix.length + 1);

      const result = await readRawContent(blobFromBytes(bytes), null);

      expect(result).toBe(`${prefix}\ufffd${suffix}`);
      expect(result).toContain(suffix);
    });

    it.concurrent("detects legacy CJK bytes hidden between large UTF-8 ranges", async () => {
      const utf8Part = new TextEncoder().encode("// ==UserScript==\n".repeat(12000));
      const gbkBlock = new Uint8Array([
        ...Array.from({ length: 64 }).flatMap(() => [
          0xd5, 0xe2, 0xca, 0xc7, 0xd2, 0xbb, 0xb8, 0xf6, 0x47, 0x42, 0x4b, 0xb1, 0xe0, 0xc2, 0xeb, 0xb2, 0xe2, 0xca,
          0xd4,
        ]),
      ]);
      const bytes = new Uint8Array(utf8Part.length * 2 + gbkBlock.length);
      bytes.set(utf8Part);
      bytes.set(gbkBlock, utf8Part.length);
      bytes.set(utf8Part, utf8Part.length + gbkBlock.length);

      const result = await readRawContent(blobFromBytes(bytes), null);

      expect(result).toContain("这是一个GBK编码测试");
    });

    it.concurrent("detects legacy CJK encodings when UTF-8 validation fails", async () => {
      const gbkText = "这是一个GBK编码测试Sentence混合12345。";
      const gbkBytes = new Uint8Array([
        0xd5, 0xe2, 0xca, 0xc7, 0xd2, 0xbb, 0xb8, 0xf6, 0x47, 0x42, 0x4b, 0xb1, 0xe0, 0xc2, 0xeb, 0xb2, 0xe2, 0xca,
        0xd4, 0x53, 0x65, 0x6e, 0x74, 0x65, 0x6e, 0x63, 0x65, 0xbb, 0xec, 0xba, 0xcf, 0x31, 0x32, 0x33, 0x34, 0x35,
        0xa1, 0xa3,
      ]);
      const shiftJisText = "これはShiftJISのテスト文除withEnglish123";
      const shiftJisBytes = new Uint8Array([
        0x82, 0xb1, 0x82, 0xea, 0x82, 0xcd, 0x53, 0x68, 0x69, 0x66, 0x74, 0x4a, 0x49, 0x53, 0x82, 0xcc, 0x83, 0x65,
        0x83, 0x58, 0x83, 0x67, 0x95, 0xb6, 0x8f, 0x9c, 0x77, 0x69, 0x74, 0x68, 0x45, 0x6e, 0x67, 0x6c, 0x69, 0x73,
        0x68, 0x31, 0x32, 0x33,
      ]);

      await expect(readRawContent(new Blob([gbkBytes.buffer]), null)).resolves.toBe(gbkText);
      await expect(readRawContent(new Blob([shiftJisBytes.buffer]), null)).resolves.toBe(shiftJisText);
    });

    it.concurrent("preserves legacy fallback fixture coverage through decoded output", async () => {
      const cases: [Uint8Array, string][] = [
        [new Uint8Array([0xa7, 0xda, 0xb7, 0x52, 0x20, 0x43, 0x20, 0xbb, 0x79, 0xa8, 0xec]), "big5"],
        [
          new Uint8Array([
            0xb3, 0x6f, 0xac, 0x4f, 0xa4, 0x40, 0xad, 0xd3, 0x42, 0x69, 0x67, 0x35, 0xb4, 0xfa, 0xb8, 0xd5, 0xa5, 0xdc,
            0xa4, 0x40, 0xa5, 0x5f, 0xa6, 0x72, 0x45, 0x6e, 0x67, 0x6c, 0x69, 0x73, 0x68, 0xbb, 0x50, 0xa4, 0xa4, 0x31,
            0x32, 0x33, 0xa1, 0x43,
          ]),
          "big5",
        ],
        [
          new Uint8Array([
            0xd5, 0xe2, 0xca, 0xc7, 0xd2, 0xbb, 0xb8, 0xf6, 0x47, 0x42, 0x4b, 0xb1, 0xe0, 0xc2, 0xeb, 0xb2, 0xe2, 0xca,
            0xd4, 0x53, 0x65, 0x6e, 0x74, 0x65, 0x6e, 0x63, 0x65, 0xbb, 0xec, 0xba, 0xcf, 0x31, 0x32, 0x33, 0x34, 0x35,
            0xa1, 0xa3,
          ]),
          "gb18030",
        ],
        [
          new Uint8Array([
            0x82, 0xb1, 0x82, 0xea, 0x82, 0xcd, 0x53, 0x68, 0x69, 0x66, 0x74, 0x4a, 0x49, 0x53, 0x82, 0xcc, 0x83, 0x65,
            0x83, 0x58, 0x83, 0x67, 0x95, 0xb6, 0x8f, 0x9c, 0x77, 0x69, 0x74, 0x68, 0x45, 0x6e, 0x67, 0x6c, 0x69, 0x73,
            0x68, 0x31, 0x32, 0x33,
          ]),
          "shift_jis",
        ],
        [
          new Uint8Array([
            0xc0, 0xcc, 0xb0, 0xcd, 0xc0, 0xba, 0x45, 0x55, 0x43, 0x2d, 0x4b, 0x52, 0xc0, 0xce, 0xc4, 0xda, 0xb5, 0xf9,
            0xc5, 0xd7, 0xbd, 0xba, 0xc6, 0xae, 0xb9, 0xae, 0xc0, 0xe5, 0x54, 0x65, 0x73, 0x74, 0x31, 0x32, 0x33,
          ]),
          "euc-kr",
        ],
        [
          new Uint8Array([
            0x43, 0x61, 0x66, 0xe9, 0x20, 0x6e, 0x61, 0xef, 0x76, 0x65, 0x20, 0x72, 0xe9, 0x73, 0x75, 0x6d, 0xe9, 0x20,
            0x77, 0x69, 0x74, 0x68, 0x20, 0x41, 0x53, 0x43, 0x49, 0x49, 0x20, 0x31, 0x32, 0x33, 0x34, 0x35,
          ]),
          "iso-8859-2",
        ],
        [
          new Uint8Array([
            0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x20, 0xe4, 0xb8, 0x96, 0xe7, 0x95, 0x8c, 0x2c, 0x20, 0x74, 0x68, 0x69, 0x73,
            0x20, 0x69, 0x73, 0x20, 0x55, 0x54, 0x46, 0x38, 0x20, 0xe6, 0xb8, 0xac, 0xe8, 0xa9, 0xa6,
          ]),
          "utf-8",
        ],
        [
          new Uint8Array([
            84, 104, 105, 115, 32, 99, 111, 115, 116, 115, 32, 53, 48, 128, 32, 151, 32, 113, 117, 105, 116, 101, 32,
            101, 120, 112, 101, 110, 115, 105, 118, 101, 148, 32, 105, 110, 100, 101, 101, 100, 46,
          ]),
          "windows-1252",
        ],
        [
          new Uint8Array([
            69, 108, 32, 110, 105, 241, 111, 32, 99, 111, 109, 105, 243, 32, 112, 105, 241, 97, 116, 97, 32, 121, 32,
            116, 111, 109, 243, 32, 99, 97, 102, 233, 46,
          ]),
          "iso-8859-1",
        ],
        [
          new Uint8Array([
            208, 210, 201, 215, 197, 212, 32, 205, 201, 210, 32, 49, 50, 51, 32, 65, 66, 67, 32, 212, 197, 211, 212,
          ]),
          "koi8-r",
        ],
      ];

      for (const [bytes, encoding] of cases) {
        await expectReadBlobContentDecodesAs(bytes, encoding);
      }
    });

    it.concurrent("preserves legacy GBK and GB18030 edge fixture coverage", async () => {
      const cases: [Uint8Array, string][] = [
        [new Uint8Array([0xc4, 0xe3, 0xba, 0xc3]), "big5"],
        [new Uint8Array([0xc4, 0xe3, 0xba, 0xc3, 0xa3, 0xac, 0xca, 0xc0, 0xbd, 0xe7, 0xa3, 0xa1]), "big5"],
        [new Uint8Array([0xd6, 0xd0, 0xce, 0xc4, 0xb2, 0xe2, 0xca, 0xd4]), "big5"],
        [
          new Uint8Array([0xd6, 0xd0, 0xce, 0xc4, 0xb2, 0xe2, 0xca, 0xd4, 0xc0, 0xa9, 0xd5, 0xb9, 0xfd, 0x9d]),
          "gb18030",
        ],
        [
          new Uint8Array([0xd6, 0xd0, 0xce, 0xc4, 0x81, 0x36, 0x92, 0x32, 0xb2, 0xe2, 0xca, 0xd4, 0x92, 0x57]),
          "gb18030",
        ],
        [new Uint8Array([0xad, 0x71, 0x81, 0x92]), "gb18030"],
        [new Uint8Array([0xd6, 0xd0, 0xce, 0xc4, 0x95, 0x34, 0xb2, 0x35, 0xb2, 0xe2, 0xca, 0xd4]), "gb18030"],
      ];

      for (const [bytes, encoding] of cases) {
        await expectReadBlobContentDecodesAs(bytes, encoding);
      }
    });

    it.concurrent("keeps legacy CJK readable when unsupported emoji bytes are present", async () => {
      const gbkBytes = new Uint8Array([
        0xd5, 0xe2, 0xca, 0xc7, 0xd2, 0xbb, 0xb8, 0xf6, 0x47, 0x42, 0x4b, 0xb1, 0xe0, 0xc2, 0xeb, 0xb2, 0xe2, 0xca,
        0xd4, 0x53, 0x65, 0x6e, 0x74, 0x65, 0x6e, 0x63, 0x65,
      ]);
      const emojiBytes = new TextEncoder().encode("🚀");
      const bytes = new Uint8Array(gbkBytes.length + emojiBytes.length);
      bytes.set(gbkBytes);
      bytes.set(emojiBytes, gbkBytes.length);

      const result = await readRawContent(blobFromBytes(bytes), null);

      expect(result).toContain("这是一个GBK编码测试Sentence");
    });

    it.concurrent("preserves legacy single-byte fixture coverage", async () => {
      const cases: [Uint8Array, string][] = [
        [
          new Uint8Array([
            0x43, 0x61, 0x66, 0xe9, 0x20, 0x64, 0xe9, 0x6a, 0xe0, 0x20, 0x76, 0x75, 0x2c, 0x20, 0xe9, 0x6c, 0xe8, 0x76,
            0x65, 0x20, 0x66, 0x72, 0x61, 0x6e, 0xe7, 0x61, 0x69, 0x73, 0x2c, 0x20, 0xe0, 0x20, 0x62, 0x69, 0x65, 0x6e,
            0x74, 0xf4, 0x74, 0x21,
          ]),
          "iso-8859-1",
        ],
        [
          new Uint8Array([
            0x93, 0x50, 0x72, 0x69, 0x63, 0x65, 0x20, 0x69, 0x73, 0x20, 0x35, 0x30, 0x80, 0x20, 0x96, 0x20, 0x43, 0x61,
            0x66, 0xe9, 0x99, 0x20, 0x64, 0xe9, 0x6a, 0xe0, 0x20, 0x76, 0x75, 0x94,
          ]),
          "windows-1252",
        ],
        [
          new Uint8Array([
            0x50, 0x72, 0x69, 0x63, 0x65, 0x3a, 0x20, 0x31, 0x30, 0x80, 0x20, 0x96, 0x20, 0x93, 0x73, 0x70, 0x65, 0x63,
            0x69, 0x61, 0x6c, 0x94, 0x20, 0x83, 0x20, 0x6f, 0x66, 0x66, 0x65, 0x72, 0x85,
          ]),
          "windows-1252",
        ],
      ];

      for (const [bytes, encoding] of cases) {
        await expectReadBlobContentDecodesAs(bytes, encoding);
      }
    });

    it.concurrent("detects legacy bytes after a large ASCII prefix", async () => {
      const shiftJisText = "これはShiftJISのテスト文除withEnglish123";
      const shiftJisBytes = new Uint8Array([
        0x82, 0xb1, 0x82, 0xea, 0x82, 0xcd, 0x53, 0x68, 0x69, 0x66, 0x74, 0x4a, 0x49, 0x53, 0x82, 0xcc, 0x83, 0x65,
        0x83, 0x58, 0x83, 0x67, 0x95, 0xb6, 0x8f, 0x9c, 0x77, 0x69, 0x74, 0x68, 0x45, 0x6e, 0x67, 0x6c, 0x69, 0x73,
        0x68, 0x31, 0x32, 0x33,
      ]);
      const bytes = new Uint8Array(40 * 1024);
      bytes.fill(0x61);
      bytes.set(shiftJisBytes, 18 * 1024);

      await expect(readRawContent(blobFromBytes(bytes), null)).resolves.toBe(
        `${"a".repeat(18 * 1024)}${shiftJisText}${"a".repeat(bytes.length - 18 * 1024 - shiftJisBytes.length)}`
      );
    });

    it.concurrent(
      "detects legacy bytes after an ASCII prefix larger than the full UTF-8 validation limit",
      async () => {
        const shiftJisText = "これはShiftJISのテスト文除withEnglish123";
        const shiftJisBytes = new Uint8Array([
          0x82, 0xb1, 0x82, 0xea, 0x82, 0xcd, 0x53, 0x68, 0x69, 0x66, 0x74, 0x4a, 0x49, 0x53, 0x82, 0xcc, 0x83, 0x65,
          0x83, 0x58, 0x83, 0x67, 0x95, 0xb6, 0x8f, 0x9c, 0x77, 0x69, 0x74, 0x68, 0x45, 0x6e, 0x67, 0x6c, 0x69, 0x73,
          0x68, 0x31, 0x32, 0x33,
        ]);
        const prefixLength = 260 * 1024;
        const bytes = new Uint8Array(prefixLength + shiftJisBytes.length);
        bytes.fill(0x61);
        bytes.set(shiftJisBytes, prefixLength);

        await expect(readRawContent(blobFromBytes(bytes), null)).resolves.toBe(
          `${"a".repeat(prefixLength)}${shiftJisText}`
        );
      }
    );

    it.concurrent("falls back to windows-1252 for invalid UTF-8", async () => {
      const bytes = new Uint8Array([
        0x50, 0x72, 0x69, 0x63, 0x65, 0x3a, 0x20, 0x31, 0x30, 0x80, 0x20, 0x96, 0x20, 0x93, 0x73, 0x70, 0x65, 0x63,
        0x69, 0x61, 0x6c, 0x94,
      ]);
      const result = await readRawContent(new Blob([bytes.buffer]), null);

      expect(result).toBe("Price: 10€ – “special”");
    });

    it.concurrent("handles Response-like object", async () => {
      const text = "Response content";
      const buffer = new TextEncoder().encode(text).buffer;
      const response = {
        async arrayBuffer() {
          return buffer;
        },
      } as Response;

      await expect(readRawContent(response, "text/plain; charset=utf-8")).resolves.toBe(text);
    });

    it.concurrent("handles Uint8Array", async () => {
      const text = "Uint8Array content";
      const uint8 = new TextEncoder().encode(text) as Uint8Array<ArrayBuffer>;
      await expect(readRawContent(uint8, "text/plain; charset=utf-8")).resolves.toBe(text);
    });

    it.concurrent("handles content larger than 16KB", async () => {
      const text = "a".repeat(20 * 1024);
      const blob = new Blob([text]);

      const result = await readRawContent(blob, null);

      expect(result).toBe(text);
      expect(result.length).toBe(20 * 1024);
    });
  });
});
