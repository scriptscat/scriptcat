import { describe, it, expect } from "vitest";
import { prettyUrl, toScriptInstallUrl } from "./url-utils";

describe.concurrent("prettyUrl", () => {
  describe.concurrent("Domain / Punycode Handling", () => {
    it.concurrent("basic", () => {
      expect(prettyUrl("http://xn--viertelvergngen-bwb.com")).toBe("http://viertelvergnügen.com/");
      expect(prettyUrl("http://xn--maana-pta.com")).toBe("http://mañana.com/");
      expect(prettyUrl("http://xn--bcher-kva.com")).toBe("http://b\xFCcher.com/");
      expect(prettyUrl("http://xn--caf-dma.com")).toBe("http://caf\xE9.com/");
      expect(prettyUrl("http://xn----dqo34k.com")).toBe("http://\u2603-\u2318.com/");
      expect(prettyUrl("http://xn----dqo34kn65z.com")).toBe("http://\uD400\u2603-\u2318.com/");
      expect(prettyUrl("http://xn--ls8h.la")).toBe("http://\uD83D\uDCA9.la/");
      expect(prettyUrl("http://джумла@xn--p-8sbkgc5ag7bhce.xn--ba-lmcq")).toBe("http://джумла@джpумлатест.bрфa/");
    });

    it.concurrent("should decode CJK Punycode domains", () => {
      expect(prettyUrl("http://xn--6qq79v.com")).toBe("http://你好.com/");
    });

    it.concurrent("should decode Emoji domains", () => {
      expect(prettyUrl("https://xn--vi8h.la/path")).toBe("https://🍕.la/path");
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

    it.concurrent("should NOT decode if it introduces reserved URL delimiters like ? or #", () => {
      // If %3F (?) is decoded inside the path, it breaks the URL structure
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

    it.concurrent("should return the original string if it is not a valid URL", () => {
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

describe.concurrent("toScriptInstallUrl", () => {
  it.concurrent("Greasy Fork 脚本页面链接转换为 update 域名的安装链接，保留 slug 作为文件名", () => {
    expect(toScriptInstallUrl("https://greasyfork.org/zh-CN/scripts/419215-autopager")).toBe(
      "https://update.greasyfork.org/scripts/419215/autopager.user.js"
    );
    expect(toScriptInstallUrl("https://greasyfork.org/scripts/419215-autopager")).toBe(
      "https://update.greasyfork.org/scripts/419215/autopager.user.js"
    );
  });

  it.concurrent("Greasy Fork 无 slug 时用脚本 ID 作文件名", () => {
    expect(toScriptInstallUrl("https://greasyfork.org/en/scripts/419215")).toBe(
      "https://update.greasyfork.org/scripts/419215/419215.user.js"
    );
  });

  it.concurrent("Greasy Fork 脚本子页面与查询参数、锚点同样识别", () => {
    expect(toScriptInstallUrl("https://greasyfork.org/zh-CN/scripts/419215-autopager/code?version=1#top")).toBe(
      "https://update.greasyfork.org/scripts/419215/autopager.user.js"
    );
    expect(toScriptInstallUrl("https://greasyfork.org/pt-BR/scripts/419215-autopager/discussions/12345")).toBe(
      "https://update.greasyfork.org/scripts/419215/autopager.user.js"
    );
    expect(toScriptInstallUrl("https://greasyfork.org/en/scripts/419215-auto.pager")).toBe(
      "https://update.greasyfork.org/scripts/419215/auto.pager.user.js"
    );
  });

  it.concurrent("ScriptCat 脚本页面链接（含或不含语言前缀、子页面）转换为安装链接", () => {
    expect(toScriptInstallUrl("https://scriptcat.org/zh-CN/script-show-page/2827")).toBe(
      "https://scriptcat.org/scripts/code/2827/2827.user.js"
    );
    expect(toScriptInstallUrl("https://scriptcat.org/script-show-page/2827/code")).toBe(
      "https://scriptcat.org/scripts/code/2827/2827.user.js"
    );
  });

  it.concurrent(
    "GitHub 文件页面（blob）链接转换为 raw.githubusercontent.com 原始文件链接，丢弃查询参数与行号锚点",
    () => {
      expect(toScriptInstallUrl("https://github.com/scriptscat/scriptcat/blob/main/example/gm_xhr.js")).toBe(
        "https://raw.githubusercontent.com/scriptscat/scriptcat/main/example/gm_xhr.js"
      );
      expect(toScriptInstallUrl("https://github.com/owner/repo/blob/feature/x/dist/a.user.js?plain=1#L10")).toBe(
        "https://raw.githubusercontent.com/owner/repo/feature/x/dist/a.user.js"
      );
    }
  );

  it.concurrent("已经是脚本文件的直链保持不变", () => {
    for (const url of [
      "https://update.greasyfork.org/scripts/419215/AutoPager.user.js",
      "https://greasyfork.org/scripts/419215/code/AutoPager.user.js",
      "https://scriptcat.org/scripts/code/2827/x.user.js",
      "https://github.com/scriptscat/scriptcat/raw/main/example/gm_xhr.js",
    ]) {
      expect(toScriptInstallUrl(url)).toBe(url);
    }
  });

  it.concurrent("非脚本详情页、其他站点和无法解析的输入保持不变", () => {
    for (const url of [
      "https://greasyfork.org/zh-CN/scripts/by-site/example.com",
      "https://greasyfork.org/zh-CN/users/1-someone",
      "https://scriptcat.org/zh-CN/search",
      "https://github.com/scriptscat/scriptcat",
      "https://github.com/scriptscat/scriptcat/tree/main/example",
      "https://example.com/zh-CN/scripts/419215-autopager",
      "https://openuserjs.org/scripts/someone/Script",
      "not a url",
    ]) {
      expect(toScriptInstallUrl(url)).toBe(url);
    }
  });
});
