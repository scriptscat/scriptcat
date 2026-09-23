import { describe, expect, it, vi } from "vitest";
import type * as Utils from "@App/pkg/utils/utils";

const { isFirefox } = vi.hoisted(() => ({
  isFirefox: vi.fn(() => false),
}));

vi.mock("@App/pkg/utils/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof Utils>()),
  isFirefox,
}));

import { filterUserScriptApiPatternsByScheme } from "./utils";

const patterns = [
  "https://example.com/*",
  "ws://example.com/*",
  "wss://example.com/*",
  "ftp://example.com/*",
  "notsupported://example.com/*",
];

describe("filterUserScriptApiPatternsByScheme", () => {
  it("保留 Chromium userScripts 支持的 scheme，并过滤其他 scheme", () => {
    expect(filterUserScriptApiPatternsByScheme(patterns)).toEqual(["https://example.com/*"]);
  });

  it("保留 Firefox userScripts 额外支持的 scheme，并过滤未知 scheme", () => {
    isFirefox.mockReturnValue(true);

    expect(filterUserScriptApiPatternsByScheme(patterns)).toEqual([
      "https://example.com/*",
      "ws://example.com/*",
      "wss://example.com/*",
      "ftp://example.com/*",
    ]);
  });
});
