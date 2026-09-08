import { describe, it, expect } from "vitest";
import { describeUserAgent } from "./user_agent";

describe("describeUserAgent", () => {
  describe("桌面浏览器", () => {
    it("识别 macOS 上的 Edge", () => {
      expect(
        describeUserAgent(
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0"
        )
      ).toBe("macOS + Edge 151");
    });

    it("识别 macOS 上的 Chrome", () => {
      expect(
        describeUserAgent(
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36"
        )
      ).toBe("macOS + Chrome 143");
    });

    it("识别 macOS 上的 Safari（用 Version/ 而非 Safari/ 的版本号）", () => {
      expect(
        describeUserAgent(
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15"
        )
      ).toBe("macOS + Safari 17.4");
    });

    it("识别 Windows 上的 Chrome", () => {
      expect(
        describeUserAgent(
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36"
        )
      ).toBe("Windows 10/11 + Chrome 143");
    });

    it("识别 Windows 上的 Firefox", () => {
      expect(
        describeUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:151.0) Gecko/20100101 Firefox/151.0")
      ).toBe("Windows 10/11 + Firefox 151");
    });

    it("识别 Linux 上的 Chrome", () => {
      expect(
        describeUserAgent(
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36"
        )
      ).toBe("Linux + Chrome 143");
    });

    it("识别 ChromeOS", () => {
      expect(
        describeUserAgent(
          "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36"
        )
      ).toBe("ChromeOS + Chrome 143");
    });
  });

  describe("移动端", () => {
    it("识别 Android 上的 Edge（含系统大版本）", () => {
      expect(
        describeUserAgent(
          "Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Mobile Safari/537.36 EdgA/146.0.0.0"
        )
      ).toBe("Android 16 + Edge 146");
    });

    it("识别 Android 上的 Firefox", () => {
      expect(describeUserAgent("Mozilla/5.0 (Android 13; Mobile; rv:119.0) Gecko/119.0 Firefox/119.0")).toBe(
        "Android 13 + Firefox 119"
      );
    });

    it("识别 iPad（UA 里没有 iPhone 令牌，且系统名是 iPadOS）", () => {
      expect(
        describeUserAgent(
          "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1"
        )
      ).toBe("iPadOS 17.4 + Safari 17.4");
    });

    it("识别 iOS 上的 Safari（下划线版本号转成点）", () => {
      expect(
        describeUserAgent(
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1"
        )
      ).toBe("iOS 17.4 + Safari 17.4");
    });
  });

  describe("Chromium 衍生浏览器优先于 Chrome 判定", () => {
    it("Opera 不应被识别成 Chrome", () => {
      expect(
        describeUserAgent(
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 OPR/129.0.0.0"
        )
      ).toBe("Windows 10/11 + Opera 129");
    });

    it("Vivaldi 不应被识别成 Chrome", () => {
      expect(
        describeUserAgent(
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Vivaldi/7.0.0.0"
        )
      ).toBe("Windows 10/11 + Vivaldi 7");
    });
  });

  describe("兜底：不猜就不丢信息", () => {
    it("完全认不出时原样返回 UA，而不是返回 Unknown", () => {
      expect(describeUserAgent("SomeBrandNewAgent/1.0")).toBe("SomeBrandNewAgent/1.0");
    });

    it("只认得出系统时也原样返回 UA（半截信息反而误导维护者）", () => {
      expect(describeUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) NoBrowserToken/9")).toBe(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) NoBrowserToken/9"
      );
    });

    it("空串返回空串", () => {
      expect(describeUserAgent("")).toBe("");
    });
  });

  // Chromium 的 UA 已被 UA reduction 冻结：版本号恒为 `143.0.0.0`、Windows 恒为 `NT 10.0; Win64; x64`、
  // macOS 恒为 `Intel Mac OS X 10_15_7`，都不再反映真实环境。真实信息只能从 high-entropy client hints 拿。
  describe("high-entropy client hints 补充细节", () => {
    const CHROME_WIN =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";
    const CHROME_MAC =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";

    it("platformVersion 主版本 ≥ 13 判定为 Windows 11", () => {
      expect(describeUserAgent(CHROME_WIN, { platform: "Windows", platformVersion: "15.0.0" })).toBe(
        "Windows 11 + Chrome 143"
      );
    });

    it("platformVersion 主版本 1~12 判定为 Windows 10", () => {
      expect(describeUserAgent(CHROME_WIN, { platform: "Windows", platformVersion: "10.0.0" })).toBe(
        "Windows 10 + Chrome 143"
      );
    });

    it("platformVersion 主版本为 0（Win7/8/8.1）时不硬猜，退回 UA 的判断", () => {
      expect(describeUserAgent(CHROME_WIN, { platform: "Windows", platformVersion: "0.3.0" })).toBe(
        "Windows 10/11 + Chrome 143"
      );
    });

    it("macOS 报出真实系统版本（UA 里的 10_15_7 是冻结的假值）", () => {
      expect(describeUserAgent(CHROME_MAC, { platform: "macOS", platformVersion: "15.3.1" })).toBe(
        "macOS 15.3.1 + Chrome 143"
      );
    });

    it("fullVersionList 补出真实构建号（UA 里的 143.0.0.0 是冻结的）", () => {
      expect(
        describeUserAgent(CHROME_WIN, {
          platform: "Windows",
          platformVersion: "15.0.0",
          fullVersionList: [
            { brand: "Not(A:Brand", version: "99.0.0.0" },
            { brand: "Chromium", version: "143.0.7499.96" },
            { brand: "Google Chrome", version: "143.0.7499.96" },
          ],
        })
      ).toBe("Windows 11 + Chrome 143.0.7499.96");
    });

    it("按浏览器名匹配品牌，不会错配到 Chromium 或占位品牌", () => {
      const edgeUA = `${CHROME_WIN} Edg/151.0.0.0`;
      expect(
        describeUserAgent(edgeUA, {
          fullVersionList: [
            { brand: "Not(A:Brand", version: "99.0.0.0" },
            { brand: "Chromium", version: "151.0.7499.96" },
            { brand: "Microsoft Edge", version: "151.0.3519.61" },
          ],
        })
      ).toBe("Windows 10/11 + Edge 151.0.3519.61");
    });

    it("architecture + bitness 补出真实架构（UA 里的 x64 在 ARM 机器上也是假的）", () => {
      expect(
        describeUserAgent(CHROME_WIN, {
          platform: "Windows",
          platformVersion: "15.0.0",
          architecture: "arm",
          bitness: "64",
        })
      ).toBe("Windows 11 + Chrome 143 (arm64)");
    });

    it("x86 + 64 显示为 x64", () => {
      expect(describeUserAgent(CHROME_MAC, { architecture: "x86", bitness: "64" })).toBe("macOS + Chrome 143 (x64)");
    });

    it("hints 缺省时行为与不传完全一致", () => {
      expect(describeUserAgent(CHROME_WIN, {})).toBe(describeUserAgent(CHROME_WIN));
    });

    it("只给部分 hints 时只补那一部分", () => {
      expect(describeUserAgent(CHROME_WIN, { architecture: "arm", bitness: "64" })).toBe(
        "Windows 10/11 + Chrome 143 (arm64)"
      );
    });

    it("整条 UA 都认不出时，hints 不足以救回来，仍原样返回 UA", () => {
      expect(describeUserAgent("SomeBrandNewAgent/1.0", { platform: "Windows", platformVersion: "15.0.0" })).toBe(
        "SomeBrandNewAgent/1.0"
      );
    });
  });
});
