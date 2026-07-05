import { afterEach, describe, expect, it, vi } from "vitest";
import { extensionEnv, getExtensionUserAgentData } from "./extension_env";

describe("extensionEnv 常量", () => {
  it("从 chrome.extension.inIncognitoContext 读取 incognito 状态", () => {
    // mock 默认 inIncognitoContext = false
    expect(extensionEnv.inIncognitoContext).toBe(false);
    // userAgentData 为可选字段，常量初始化时不应填充
    expect(extensionEnv.userAgentData).toBeUndefined();
  });
});

describe("getExtensionUserAgentData", () => {
  const originalUserAgentData = (navigator as any).userAgentData;
  const originalGetPlatformInfo = chrome.runtime.getPlatformInfo;

  const setNavigatorUserAgentData = (value: any) => {
    Object.defineProperty(navigator, "userAgentData", {
      configurable: true,
      get: () => value,
    });
  };

  afterEach(() => {
    setNavigatorUserAgentData(originalUserAgentData);
    if (originalGetPlatformInfo === undefined) {
      // @ts-ignore
      delete chrome.runtime.getPlatformInfo;
    } else {
      chrome.runtime.getPlatformInfo = originalGetPlatformInfo;
    }
    vi.restoreAllMocks();
  });

  it("navigator.userAgentData 缺失时返回 null", async () => {
    setNavigatorUserAgentData(undefined);
    const result = await getExtensionUserAgentData();
    expect(result).toBeNull();
  });

  it("没有 chrome.runtime.getPlatformInfo 时只返回基础字段", async () => {
    setNavigatorUserAgentData({
      brands: [{ brand: "Chromium", version: "120" }],
      mobile: false,
      platform: "macOS",
    });
    // @ts-ignore
    delete chrome.runtime.getPlatformInfo;

    const result = await getExtensionUserAgentData();
    expect(result).toEqual({
      brands: [{ brand: "Chromium", version: "120" }],
      mobile: false,
      platform: "macOS",
    });
    expect((result as any).architecture).toBeUndefined();
    expect((result as any).bitness).toBeUndefined();
  });

  it("getPlatformInfo 返回 x86-64 时 bitness 为 64", async () => {
    setNavigatorUserAgentData({
      brands: [],
      mobile: false,
      platform: "Linux",
    });
    chrome.runtime.getPlatformInfo = vi.fn().mockResolvedValue({
      os: "linux",
      arch: "x86-64",
      nacl_arch: "x86-64",
    }) as any;

    const result = await getExtensionUserAgentData();
    expect(result?.architecture).toBe("x86-64");
    expect(result?.bitness).toBe("64");
  });

  it("getPlatformInfo 返回 x86-32 时 bitness 为 32", async () => {
    setNavigatorUserAgentData({
      brands: [],
      mobile: false,
      platform: "Windows",
    });
    chrome.runtime.getPlatformInfo = vi.fn().mockResolvedValue({
      os: "win",
      arch: "x86-32",
      nacl_arch: "x86-32",
    }) as any;

    const result = await getExtensionUserAgentData();
    expect(result?.architecture).toBe("x86-32");
    expect(result?.bitness).toBe("32");
  });

  it("getPlatformInfo 抛异常时降级返回基础字段", async () => {
    setNavigatorUserAgentData({
      brands: [{ brand: "Chromium", version: "120" }],
      mobile: false,
      platform: "Android",
    });
    chrome.runtime.getPlatformInfo = vi.fn().mockRejectedValue(new Error("API not available")) as any;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await getExtensionUserAgentData();
    expect(result).toEqual({
      brands: [{ brand: "Chromium", version: "120" }],
      mobile: false,
      platform: "Android",
    });
    expect((result as any).architecture).toBeUndefined();
    expect((result as any).bitness).toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
  });
});
