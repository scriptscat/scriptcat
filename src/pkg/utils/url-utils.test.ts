import { describe, it, expect } from "vitest";
import { toEncodedURL, prettyUrl } from "./url-utils"; // Update with your actual file path

describe.concurrent("toEncodedURL() Comprehensive Suite", () => {
  describe.concurrent("Core Functionality & Sanitization", () => {
    it.concurrent("should handle standard URLs without changes", () => {
      const input = "https://example.com/path/to/page?query=1";
      expect(toEncodedURL(input)).toBe("https://example.com/path/to/page?query=1");
    });

    it.concurrent("should normalize backslashes to forward slashes", () => {
      const input = "https:\\\\example.com\\path\\file.txt";
      // URL constructor normalizes host and path separators
      expect(toEncodedURL(input)).toBe("https://example.com/path/file.txt");
    });

    it.concurrent("should preserve non-standard ports", () => {
      const input = "https://localhost:8080/api/v1";
      expect(toEncodedURL(input)).toBe("https://localhost:8080/api/v1");
    });

    it.concurrent("should handle IPv6 addresses with ports", () => {
      const input = "http://[2001:db8::1]:8080/path";
      expect(toEncodedURL(input)).toBe("http://[2001:db8::1]:8080/path");
    });
  });

  describe.concurrent("Punycode & International Domains (IDN)", () => {
    it.concurrent("should convert CJK domains to Punycode", () => {
      // "点看" (click/see)
      const input = "https://点看.com/path";
      const result = toEncodedURL(input);
      expect(result).toBe("https://xn--3pxu8k.com/path");
    });

    it.concurrent("should handle German Umlauts in domains", () => {
      const input = "https://müller.de";
      // muller.de -> xn--mller-kva.de
      expect(toEncodedURL(input)).toContain("xn--mller-kva.de");
    });

    it.concurrent("should handle complex CJK domains with ports", () => {
      const input = "https://测试.机构:9000/home";
      const result = toEncodedURL(input);
      expect(result).toBe("https://xn--0zwm56d.xn--nqv7f:9000/home");
    });
  });

  describe.concurrent("International Character Encoding (Path vs Query)", () => {
    it.concurrent("should encode CJK characters in path and query", () => {
      const input = "https://example.com/测试?q=你好";
      const result = toEncodedURL(input);
      // Path: /%E6%B5%8B%E8%AF%95  Query: q=%E4%BD%A0%E5%A5%BD
      expect(result).toBe("https://example.com/%E6%B5%8B%E8%AF%95?q=%E4%BD%A0%E5%A5%BD");
    });

    it.concurrent("should handle Latin accents and Foreign scripts", () => {
      // French "crème", Russian "москва", Arabic "مرحبا"
      const input = "https://example.com/crème/москва?lang=مرحبا";
      const result = toEncodedURL(input);
      expect(result).toContain("%C3%A8me"); // crème
      expect(result).toContain("%D0%BC%D0%BE%D1%81%D0%BA%D0%B2%D0%B0"); // москва
      expect(result).toContain("%D9%85%D8%B1%D8%AD%D8%A8%D8%A7"); // مرحبا
    });

    it.concurrent("should correctly encode Emojis and ZWJ sequences", () => {
      // 🚀 and 👨‍👩‍👧 (Family)
      const input = "https://example.com/🚀?user=👨‍👩‍👧";
      const result = toEncodedURL(input);
      expect(result).toContain("%F0%9F%9A%80"); // 🚀
      expect(decodeURIComponent(result)).toContain("👨‍👩‍👧");
    });
  });

  describe.concurrent("Spacing & Special Whitespace", () => {
    it.concurrent("should encode standard spaces as %20", () => {
      const input = "https://example.com/path with space?name=john doe";
      expect(toEncodedURL(input)).toBe("https://example.com/path%20with%20space?name=john%20doe");
    });

    it.concurrent("should handle CJK Ideographic Spaces (U+3000)", () => {
      const input = "https://example.com/CJK　Space";
      expect(toEncodedURL(input)).toContain("%E3%80%80");
    });

    it.concurrent("should handle non-breaking spaces (U+00A0)", () => {
      const input = "https://example.com/non\u00A0breaking";
      expect(toEncodedURL(input)).toContain("%C2%A0");
    });
  });

  describe.concurrent("Encoding Resilience (Double-Encoding Prevention)", () => {
    it.concurrent("should not double-encode already encoded Latin/CJK components", () => {
      // %20 is already encoded, but 'test' is not
      const input = "https://example.com/already%20encoded/测试";
      const result = toEncodedURL(input);
      expect(result).toBe("https://example.com/already%20encoded/%E6%B5%8B%E8%AF%95");
    });

    it.concurrent("should fix partially malformed encoded strings", () => {
      // The % at the end is invalid; the function should catch the error and encode it.concurrent
      const input = "https://example.com/search?q=100%";
      expect(toEncodedURL(input)).toBe("https://example.com/search?q=100%25");
    });
  });

  describe.concurrent("Edge Cases", () => {
    it.concurrent("should handle URL fragments (#) correctly", () => {
      const input = "https://example.com/page?query=1#section-1";
      expect(toEncodedURL(input)).toBe("https://example.com/page?query=1#section-1");
    });

    it.concurrent("should throw if the input is not a valid URL format", () => {
      const input = "this-is-not-a-url";
      expect(() => toEncodedURL(input)).toThrow();
    });
  });

  describe.concurrent("WHATWG URL Normalization Edge Cases", () => {
    it.concurrent("should remove default port 80 for http", () => {
      const input = "http://example.com:80/path";
      expect(toEncodedURL(input)).toBe("http://example.com/path");
    });

    it.concurrent("should remove default port 443 for https", () => {
      const input = "https://example.com:443/path";
      expect(toEncodedURL(input)).toBe("https://example.com/path");
    });

    it.concurrent("should lowercase hostnames", () => {
      const input = "https://EXAMPLE.COM/Path";
      expect(toEncodedURL(input)).toContain("example.com");
    });

    it.concurrent("should resolve dot segments", () => {
      const input = "https://example.com/a/b/../c/./d";
      expect(toEncodedURL(input)).toBe("https://example.com/a/c/d");
    });

    it.concurrent("should auto-add trailing slash for bare origin", () => {
      const input = "https://example.com";
      expect(toEncodedURL(input)).toBe("https://example.com/");
    });
  });
  describe.concurrent("Username / Password Handling", () => {
    it.concurrent("should preserve username and password", () => {
      const input = "https://user:pass@example.com/path";
      expect(toEncodedURL(input)).toBe("https://user:pass@example.com/path");
    });

    it.concurrent("should encode special chars in username", () => {
      const input = "https://us er:p@ss@example.com/";
      const result = toEncodedURL(input);
      expect(result).toContain("us%20er");
    });
  });

  describe.concurrent("Encoded Delimiters", () => {
    it.concurrent("should preserve encoded slash in path", () => {
      const input = "https://example.com/a%2Fb/c";
      expect(toEncodedURL(input)).toBe("https://example.com/a%2Fb/c");
    });

    it.concurrent("should preserve encoded question mark in path", () => {
      const input = "https://example.com/a%3Fb";
      expect(toEncodedURL(input)).toBe("https://example.com/a%3Fb");
    });

    it.concurrent("should preserve encoded hash in path", () => {
      const input = "https://example.com/a%23b";
      expect(toEncodedURL(input)).toBe("https://example.com/a%23b");
    });
  });

  describe.concurrent("Duplicate Query Keys", () => {
    it.concurrent("should preserve duplicate keys order", () => {
      const input = "https://example.com?a=1&a=2&a=3";
      expect(toEncodedURL(input)).toBe("https://example.com/?a=1&a=2&a=3");
    });
  });

  describe.concurrent("Empty Query Edge Cases", () => {
    it.concurrent("should handle empty query key", () => {
      const input = "https://example.com/?=value";
      expect(toEncodedURL(input)).toBe("https://example.com/?=value");
    });

    it.concurrent("should handle empty value", () => {
      const input = "https://example.com/?key=";
      expect(toEncodedURL(input)).toBe("https://example.com/?key=");
    });

    it.concurrent("should handle bare question mark", () => {
      const input = "https://example.com/?";
      expect(toEncodedURL(input)).toBe("https://example.com/?");
    });
  });

  describe.concurrent("Fragment Encoding", () => {
    it.concurrent("should encode unicode in hash", () => {
      const input = "https://example.com/#测试";
      const result = toEncodedURL(input);
      expect(result).toContain("#%E6%B5%8B%E8%AF%95");
    });

    it.concurrent("should preserve already encoded hash", () => {
      const input = "https://example.com/#%E6%B5%8B";
      expect(toEncodedURL(input)).toBe("https://example.com/#%E6%B5%8B");
    });
  });

  describe.concurrent("Idempotence Guarantee", () => {
    it.concurrent("should return identical result when run twice", () => {
      const input = "https://example.com/测试?q=hello world#片段";
      const once = toEncodedURL(input);
      const twice = toEncodedURL(once);
      expect(twice).toBe(once);
    });
  });

  describe.concurrent("Invalid Percent Encodings", () => {
    it.concurrent("should encode stray percent", () => {
      const input = "https://example.com/100%complete";
      expect(toEncodedURL(input)).toContain("100%25complete");
    });

    it.concurrent("should fix broken percent sequence", () => {
      const input = "https://example.com/%E0%A4%A";
      const result = toEncodedURL(input);
      expect(result).toContain("%25E0"); // or properly re-encoded
    });
  });
});

describe.concurrent("prettyUrl", () => {
  describe.concurrent("Domain / Punycode Handling", () => {
    it.concurrent("should decode CJK Punycode domains", () => {
      expect(prettyUrl("http://xn--6qq79v.com")).toBe("http://你好.com/");
    });

    it.concurrent("should decode Emoji domains", () => {
      expect(prettyUrl("https://xn--vi8h.la/path")).toBe("https://🍕.la/path");
    });

    it.concurrent("should handle mixed Latin and Foreign scripts", () => {
      expect(prettyUrl("http://xn--maana-pta.com")).toBe("http://mañana.com/");
    });
  });

  describe.concurrent("Path and Percent Encoding", () => {
    it.concurrent("should decode CJK characters in the pathname", () => {
      // %E6%B5%8B%E8%AF%95 -> 测试
      expect(prettyUrl("https://example.com/%E6%B5%8B%E8%AF%95")).toBe("https://example.com/测试");
    });

    it.concurrent("should decode spaces and common symbols in path", () => {
      expect(prettyUrl("https://site.com/hello%20world")).toBe("https://site.com/hello world");
    });

    it.concurrent("should NOT decode if it.concurrent introduces reserved URL delimiters like ? or #", () => {
      // If %3F (?) is decoded inside the path, it.concurrent breaks the URL structure
      const input = "https://example.com/path%3Fquery";
      expect(prettyUrl(input)).toBe(input);
    });
  });

  describe.concurrent("Search and Hash Parameters", () => {
    it.concurrent("should decode complex query strings while preserving & and =", () => {
      const input = "https://google.com/search?q=%E4%BD%A0%E5%A5%BD&hl=zh";
      expect(prettyUrl(input)).toBe("https://google.com/search?q=你好&hl=zh");
    });

    it.concurrent("should decode fragments (hashes)", () => {
      expect(prettyUrl("https://wiki.org/Main#%E7%BB%93%E8%AE%BA")).toBe("https://wiki.org/Main#结论");
    });
  });

  describe.concurrent("Edge Cases and Safety", () => {
    it.concurrent("should return empty string for null/undefined", () => {
      expect(prettyUrl(null as any)).toBe("");
      expect(prettyUrl(undefined)).toBe("");
    });

    it.concurrent("should return the original string if it.concurrent is not a valid URL", () => {
      const invalid = "not-a-url-at-all";
      expect(prettyUrl(invalid)).toBe(invalid);
    });

    it.concurrent("should handle ports correctly", () => {
      expect(prettyUrl("http://localhost:8080/test")).toBe("http://localhost:8080/test");
    });

    it.concurrent("should handle URLs with base URLs provided", () => {
      expect(prettyUrl("/path?q=%E2%9C%85", "https://base.com")).toBe("https://base.com/path?q=✅");
    });

    it.concurrent("should fail gracefully on malformed percent encoding", () => {
      // %E4 is an incomplete sequence for a 3-byte UTF-8 char
      const malformed = "https://example.com/%E4%BD";
      expect(prettyUrl(malformed)).toBe(malformed);
    });
  });

  describe.concurrent("Internationalization / Foreign Languages", () => {
    it.concurrent("should handle RTL (Right-to-Left) scripts like Arabic", () => {
      // xn--ngbo2ef is part of an Arabic domain string
      expect(prettyUrl("http://xn--ngbo2ef.com/%D9%85%D8%B1%D8%AD%D8%A8%D8%A7")).toBe("http://بنده.com/مرحبا");
    });
  });

  describe.concurrent("Idempotence", () => {
    it.concurrent("should produce identical result when run twice", () => {
      const input = "https://xn--6qq79v.com/%E6%B5%8B%E8%AF%95?q=%F0%9F%9A%80";
      const once = prettyUrl(input);
      const twice = prettyUrl(once);
      expect(twice).toBe(once);
    });
  });

  describe.concurrent("Encoded Structural Characters", () => {
    it.concurrent("should not decode encoded slash in path", () => {
      const input = "https://example.com/a%2Fb";
      expect(prettyUrl(input)).toBe(input);
    });

    it.concurrent("should not decode encoded ampersand in query value", () => {
      const input = "https://example.com/?q=hello%26world";
      expect(prettyUrl(input)).toBe(input);
    });

    it.concurrent("should not decode encoded equals in query value", () => {
      const input = "https://example.com/?q=a%3Db";
      expect(prettyUrl(input)).toBe(input);
    });

    it.concurrent("should not decode encoded hash in path", () => {
      const input = "https://example.com/a%23b";
      expect(prettyUrl(input)).toBe(input);
    });
  });

  describe.concurrent("IPv6 and Authority Edge Cases", () => {
    // it.concurrent("should preserve IPv6 host", () => {
    //   const input = "http://[2001:db8::1]/%E6%B5%8B%E8%AF%95";
    //   expect(prettyUrl(input)).toBe("http://[2001:db8::1]/测试");
    // });

    it.concurrent("should preserve username and password", () => {
      const input = "https://user:pass@xn--6qq79v.com/%E6%B5%8B";
      expect(prettyUrl(input)).toBe("https://user:pass@你好.com/测");
    });
  });

  describe.concurrent("Duplicate Query Keys", () => {
    it.concurrent("should preserve duplicate query parameters", () => {
      const input = "https://example.com/?a=1&a=2&a=3";
      expect(prettyUrl(input)).toBe("https://example.com/?a=1&a=2&a=3");
    });
  });

  describe.concurrent("Complex Unicode Sequences", () => {
    it.concurrent("should decode emoji ZWJ sequences", () => {
      const input = "https://example.com/%F0%9F%91%A8%E2%80%8D%F0%9F%91%A9%E2%80%8D%F0%9F%91%A7";
      expect(prettyUrl(input)).toBe("https://example.com/👨‍👩‍👧");
    });

    it.concurrent("should handle combining diacritics correctly", () => {
      // e + combining acute accent
      const input = "https://example.com/e%CC%81";
      expect(prettyUrl(input)).toBe("https://example.com/é");
    });
  });

  // describe.concurrent("Mixed Encoded + Unencoded Segments", () => {
  //   it.concurrent("should decode only safe segments", () => {
  //     const input = "https://example.com/%E6%B5%8B%E8%AF%95%2Fsafe";
  //     // %2F should NOT decode
  //     expect(prettyUrl(input)).toBe(input);
  //   });
  // });

  describe.concurrent("Dot Segment Awareness", () => {
    it.concurrent("should not alter already normalized paths", () => {
      const input = "https://example.com/a/b/../c";
      const pretty = prettyUrl(input);
      expect(pretty).toBe("https://example.com/a/c");
    });
  });

  describe.concurrent("Default Port Handling", () => {
    it.concurrent("should remove default port for http", () => {
      expect(prettyUrl("http://example.com:80/")).toBe("http://example.com/");
    });

    it.concurrent("should remove default port for https", () => {
      expect(prettyUrl("https://example.com:443/")).toBe("https://example.com/");
    });
  });

  describe.concurrent("Empty Query Edge Cases", () => {
    it.concurrent("should preserve empty value", () => {
      const input = "https://example.com/?key=";
      expect(prettyUrl(input)).toBe("https://example.com/?key=");
    });

    it.concurrent("should preserve empty query key", () => {
      const input = "https://example.com/?=value";
      expect(prettyUrl(input)).toBe("https://example.com/?=value");
    });
  });

  describe.concurrent("Trailing Slash Consistency", () => {
    it.concurrent("should preserve trailing slash", () => {
      const input = "https://example.com/path/";
      expect(prettyUrl(input)).toBe("https://example.com/path/");
    });

    it.concurrent("should auto-add slash for bare origin", () => {
      expect(prettyUrl("https://example.com")).toBe("https://example.com/");
    });
  });

  describe.concurrent("Hash / Fragment Edge Cases", () => {
    it.concurrent("should preserve empty fragment", () => {
      const input = "https://example.com/#";
      expect(prettyUrl(input)).toBe("https://example.com/#");
    });

    it.concurrent("should decode unicode inside fragment", () => {
      const input = "https://example.com/#%F0%9F%9A%80";
      expect(prettyUrl(input)).toBe("https://example.com/#🚀");
    });

    it.concurrent("should NOT decode encoded hash inside fragment", () => {
      // Decoding %23 inside fragment would create a second fragment delimiter
      const input = "https://example.com/#section%231";
      expect(prettyUrl(input)).toBe(input);
    });

    it.concurrent("should NOT decode encoded question mark inside fragment", () => {
      // Avoid introducing query semantics inside fragment
      const input = "https://example.com/#part%3Fquery";
      expect(prettyUrl(input)).toBe(input);
    });

    it.concurrent("should decode safe characters but preserve encoded structural ones in fragment", () => {
      const input = "https://example.com/#hello%20world%23anchor";
      expect(prettyUrl(input)).toBe(input);
    });

    it.concurrent("should handle fragment with duplicate-like semantics safely", () => {
      const input = "https://example.com/#a=1&a=2";
      expect(prettyUrl(input)).toBe("https://example.com/#a=1&a=2");
    });

    it.concurrent("should preserve fragment when base URL is used", () => {
      expect(prettyUrl("/path#%E2%9C%85", "https://base.com")).toBe("https://base.com/path#✅");
    });

    it.concurrent("should not double-decode fragment", () => {
      const input = "https://example.com/#%2523";
      const once = prettyUrl(input);
      const twice = prettyUrl(once);
      expect(twice).toBe(once);
    });

    it.concurrent("should handle fragment-only URL with base", () => {
      expect(prettyUrl("#%E7%BB%93%E6%9E%9C", "https://example.com/page")).toBe("https://example.com/page#结果");
    });

    it.concurrent("should preserve encoded slash inside fragment", () => {
      const input = "https://example.com/#a%2Fb";
      expect(prettyUrl(input)).toBe(input);
    });
  });
});
