import { afterEach, describe, expect, it, vi } from "vitest";
import { extensionEnv, getExtensionEnv, getExtensionUserAgentData } from "./extension_env";
import type { BrowserInfo, RuntimeWithBrowserInfo } from "./extension_env";

type NavigatorWithUserAgentData = Navigator & {
  userAgentData?: {
    brands: { brand: string; version: string }[];
    mobile: boolean;
    platform: string;
  };
};

type PlatformInfoFixture = {
  os: string;
  arch: string;
};

const runtime = chrome.runtime as RuntimeWithBrowserInfo;

describe("extensionEnv 常量", () => {
  it("读取扩展上下文状态与 manifest 的 incognito 模式", () => {
    // mock 默认 inIncognitoContext = false
    expect(extensionEnv.inIncognitoContext).toBe(false);
    expect(extensionEnv).toHaveProperty("incognitoMode");
    expect(extensionEnv.incognitoMode).toBe(chrome.runtime.getManifest().incognito);
    // userAgentData 为可选字段，常量初始化时不应填充
    expect(extensionEnv.userAgentData).toBeUndefined();
  });

  it("chrome.extension 缺失时仍能初始化环境并默认非隐身", () => {
    const originalExtension = chrome.extension;
    try {
      Object.defineProperty(chrome, "extension", { configurable: true, value: undefined });
      expect(() => getExtensionEnv()).not.toThrow();
      expect(getExtensionEnv().inIncognitoContext).toBe(false);
    } finally {
      Object.defineProperty(chrome, "extension", { configurable: true, value: originalExtension });
    }
  });
});

describe("getExtensionUserAgentData", () => {
  const originalUserAgentData = (navigator as NavigatorWithUserAgentData).userAgentData;
  const originalGetPlatformInfo = chrome.runtime.getPlatformInfo;
  const originalGetBrowserInfo = runtime.getBrowserInfo;

  const setNavigatorUserAgentData = (value: NavigatorWithUserAgentData["userAgentData"]) => {
    Object.defineProperty(navigator, "userAgentData", {
      configurable: true,
      get: () => value,
    });
  };

  const setPlatformInfo = (value: PlatformInfoFixture) => {
    Object.defineProperty(chrome.runtime, "getPlatformInfo", {
      configurable: true,
      value: vi.fn().mockResolvedValue(value),
    });
  };

  const setBrowserInfo = (value: BrowserInfo) => {
    runtime.getBrowserInfo = vi.fn<() => Promise<BrowserInfo>>().mockResolvedValue(value);
  };

  const firefoxInfo: BrowserInfo = {
    name: "Firefox",
    vendor: "Mozilla",
    version: "156.0",
    buildID: "test-build",
  };

  afterEach(() => {
    vi.restoreAllMocks();
    setNavigatorUserAgentData(originalUserAgentData);
    Object.defineProperty(chrome.runtime, "getPlatformInfo", {
      configurable: true,
      value: originalGetPlatformInfo,
    });
    runtime.getBrowserInfo = originalGetBrowserInfo;
  });

  it("navigator.userAgentData 和 getBrowserInfo 都缺失时返回 null", async () => {
    setNavigatorUserAgentData(undefined);
    runtime.getBrowserInfo = undefined;

    const result = await getExtensionUserAgentData();
    expect(result).toBeNull();
  });

  it("没有 chrome.runtime.getPlatformInfo 时只返回基础字段", async () => {
    setNavigatorUserAgentData({
      brands: [{ brand: "Chromium", version: "120" }],
      mobile: false,
      platform: "macOS",
    });
    Object.defineProperty(chrome.runtime, "getPlatformInfo", { configurable: true, value: undefined });

    const result = await getExtensionUserAgentData();
    expect(result).toEqual({
      brands: [{ brand: "Chromium", version: "120" }],
      mobile: false,
      platform: "macOS",
    });
  });

  it("normalizes Chromium x86-64 to x86 / 64", async () => {
    setNavigatorUserAgentData({ brands: [], mobile: false, platform: "Linux" });
    setPlatformInfo({ os: "linux", arch: "x86-64" });

    const result = await getExtensionUserAgentData();
    expect(result).toEqual({
      brands: [],
      mobile: false,
      platform: "Linux",
      architecture: "x86",
      bitness: "64",
    });
  });

  it("normalizes Chromium x86-32 to x86 / 32", async () => {
    setNavigatorUserAgentData({ brands: [], mobile: false, platform: "Windows" });
    setPlatformInfo({ os: "win", arch: "x86-32" });

    const result = await getExtensionUserAgentData();
    expect(result?.architecture).toBe("x86");
    expect(result?.bitness).toBe("32");
  });

  it.each([
    ["arm64", "arm", "64"],
    ["arm", "arm", "32"],
  ])("normalizes Chromium %s to %s / %s", async (arch, architecture, bitness) => {
    setNavigatorUserAgentData({ brands: [], mobile: false, platform: "Linux" });
    setPlatformInfo({ os: "linux", arch });

    const result = await getExtensionUserAgentData();
    expect(result?.architecture).toBe(architecture);
    expect(result?.bitness).toBe(bitness);
  });

  it("omits architecture and bitness for an unsupported Chromium architecture", async () => {
    setNavigatorUserAgentData({ brands: [], mobile: false, platform: "Linux" });
    setPlatformInfo({ os: "linux", arch: "riscv64" });

    const result = await getExtensionUserAgentData();
    expect(result).toEqual({ brands: [], mobile: false, platform: "Linux" });
  });

  it("keeps Chromium userAgentData authoritative when Firefox browser info exists", async () => {
    setNavigatorUserAgentData({ brands: [{ brand: "Chromium", version: "120" }], mobile: false, platform: "Linux" });
    setBrowserInfo(firefoxInfo);
    const getBrowserInfo = vi.spyOn(runtime, "getBrowserInfo");

    const result = await getExtensionUserAgentData();
    expect(result?.brands).toEqual([{ brand: "Chromium", version: "120" }]);
    expect(getBrowserInfo).not.toHaveBeenCalled();
  });

  it("synthesizes Firefox Linux x86-64 userAgentData", async () => {
    setNavigatorUserAgentData(undefined);
    setBrowserInfo(firefoxInfo);
    setPlatformInfo({ os: "linux", arch: "x86-64" });

    const result = await getExtensionUserAgentData();
    expect(result).toEqual({
      brands: [{ brand: "Firefox", version: "156.0" }],
      mobile: false,
      platform: "Linux",
      architecture: "x86",
      bitness: "64",
    });
  });

  it("synthesizes Firefox Android ARM64 userAgentData", async () => {
    setNavigatorUserAgentData(undefined);
    setBrowserInfo(firefoxInfo);
    setPlatformInfo({ os: "android", arch: "aarch64" });

    const result = await getExtensionUserAgentData();
    expect(result).toEqual({
      brands: [{ brand: "Firefox", version: "156.0" }],
      mobile: true,
      platform: "Android",
      architecture: "arm",
      bitness: "64",
    });
  });

  it("synthesizes Firefox macOS Apple Silicon from an aarch64 fixture", async () => {
    setNavigatorUserAgentData(undefined);
    setBrowserInfo(firefoxInfo);
    setPlatformInfo({ os: "mac", arch: "aarch64" });

    const result = await getExtensionUserAgentData();
    expect(result).toEqual({
      brands: [{ brand: "Firefox", version: "156.0" }],
      mobile: false,
      platform: "macOS",
      architecture: "arm",
      bitness: "64",
    });
  });

  it("continues with Firefox low-entropy fields when getPlatformInfo rejects", async () => {
    setNavigatorUserAgentData(undefined);
    setBrowserInfo(firefoxInfo);
    Object.defineProperty(chrome.runtime, "getPlatformInfo", {
      configurable: true,
      value: vi.fn().mockRejectedValue(new Error("API not available")),
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await getExtensionUserAgentData();
    expect(result).toEqual({ brands: [{ brand: "Firefox", version: "156.0" }], mobile: false });
    expect(warnSpy).toHaveBeenCalled();
  });

  it("returns null and warns when getBrowserInfo rejects", async () => {
    setNavigatorUserAgentData(undefined);
    const getBrowserInfo = vi.fn<() => Promise<BrowserInfo>>().mockRejectedValue(new Error("API not available"));
    runtime.getBrowserInfo = getBrowserInfo;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await getExtensionUserAgentData();
    expect(result).toBeNull();
    expect(getBrowserInfo).toHaveBeenCalledOnce();
    expect(warnSpy).toHaveBeenCalled();
  });
});
