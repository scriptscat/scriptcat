import { afterEach, describe, expect, it, vi } from "vitest";
import { isApiSupportedMatchPattern } from "./url_matcher";

const patterns = [
  "https://example.com/*",
  "ws://example.com/*",
  "wss://example.com/*",
  "ftp://example.com/*",
  "notsupported://example.com/*",
];

describe("isApiSupportedMatchPattern", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("保留 Chromium userScripts 支持的 scheme，并过滤其他 scheme", () => {
    expect(patterns.filter(isApiSupportedMatchPattern)).toEqual(["https://example.com/*", "ftp://example.com/*"]);
  });

  it("保留 Firefox userScripts 额外支持的 scheme，并过滤未知 scheme", () => {
    // isFirefox() 以 mozInnerScreenX 全局判断 Firefox
    vi.stubGlobal("mozInnerScreenX", 0);

    expect(patterns.filter(isApiSupportedMatchPattern)).toEqual([
      "https://example.com/*",
      "ws://example.com/*",
      "wss://example.com/*",
      "ftp://example.com/*",
    ]);
  });
});
