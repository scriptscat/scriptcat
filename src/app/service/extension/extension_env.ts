export type TExtensionEnv = {
  inIncognitoContext: boolean;
  incognitoMode?: chrome.runtime.ManifestV3["incognito"];
  userAgentData?: GMUserAgentData | null;
};

type GMUserAgentData = typeof GM_info.userAgentData;

export type BrowserInfo = {
  name: string;
  vendor: string;
  version: string;
  buildID: string;
};

export type RuntimeWithBrowserInfo = typeof chrome.runtime & {
  getBrowserInfo?: () => Promise<BrowserInfo>;
};

export type NavigatorWithUserAgentData = Navigator & {
  userAgentData?: {
    brands: { brand: string; version: string }[];
    mobile: boolean;
    platform: string;
    getHighEntropyValues?: (hints: string[]) => Promise<{ fullVersionList?: { brand: string; version: string }[] }>;
  };
};

type ClientHintsArch = {
  bitness: "32" | "64";
  architecture: "x86" | "arm" | "mips";
};

const PLATFORM_OS_NAME: Record<string, string> = {
  mac: "macOS",
  win: "Windows",
  android: "Android",
  cros: "Chrome OS",
  linux: "Linux",
  openbsd: "Open/FreeBSD",
  fuchsia: "Fuchsia",
};

// Chromium 与 Firefox 暴露的架构名称不同；此处归一化 x86/ARM。MIPS 项兼容 Tampermonkey，UA-CH 未定义 MIPS token。
// 未列出的架构（如 riscv64、ppc64、s390x、sparc64、noarch）不推断 UA-CH 值，因此同时省略 architecture 和 bitness。
const PLATFORM_ARCH: Partial<Record<string, ClientHintsArch>> = {
  "x86-32": { bitness: "32", architecture: "x86" },
  "x86-64": { bitness: "64", architecture: "x86" },
  arm: { bitness: "32", architecture: "arm" },
  arm64: { bitness: "64", architecture: "arm" },
  aarch64: { bitness: "64", architecture: "arm" },
  mips: { bitness: "32", architecture: "mips" },
  mips64: { bitness: "64", architecture: "mips" },
};

/**
 * Tampermonkey 在 Chromium 上把 `getHighEntropyValues(["fullVersionList"])` 的结果当作 `brands` 输出，
 * 而非标准低熵 `navigator.userAgentData.brands`（仅主版本号）。不支持或被策略拒绝时静默回退到低熵值，
 * 这是能力探测而非错误吞没。
 */
async function highEntropyBrands(
  userAgentData: NonNullable<NavigatorWithUserAgentData["userAgentData"]>
): Promise<{ brand: string; version: string }[]> {
  if (!userAgentData.getHighEntropyValues) return userAgentData.brands;
  try {
    const { fullVersionList } = await userAgentData.getHighEntropyValues(["fullVersionList"]);
    return fullVersionList?.length ? fullVersionList : userAgentData.brands;
  } catch (error) {
    console.warn(error);
    return userAgentData.brands;
  }
}

export const getExtensionEnv = (): TExtensionEnv => ({
  inIncognitoContext: chrome.extension?.inIncognitoContext ?? false,
  incognitoMode: chrome.runtime.getManifest().incognito,
});

export const extensionEnv: TExtensionEnv = getExtensionEnv();

export const getExtensionUserAgentData = async (): Promise<GMUserAgentData | null> => {
  const userAgentData = (navigator as NavigatorWithUserAgentData).userAgentData;
  const runtime = chrome.runtime as RuntimeWithBrowserInfo;
  if (!userAgentData && !runtime.getBrowserInfo) {
    return null;
  }

  let platformInfo: chrome.runtime.PlatformInfo | undefined;
  if (runtime.getPlatformInfo) {
    try {
      platformInfo = await runtime.getPlatformInfo();
    } catch (error) {
      // 避免 API 无法执行的问题。不影响整体运作
      console.warn(error);
    }
  }

  let resultData: GMUserAgentData;
  if (userAgentData) {
    resultData = {
      brands: await highEntropyBrands(userAgentData),
      mobile: userAgentData.mobile,
      platform: userAgentData.platform,
    } satisfies GMUserAgentData;
  } else if (runtime.getBrowserInfo) {
    try {
      const browserInfo = await runtime.getBrowserInfo();
      resultData = {
        brands: [{ brand: browserInfo.name, version: browserInfo.version }],
        mobile: platformInfo?.os === "android",
      };
      const platform = platformInfo && PLATFORM_OS_NAME[platformInfo.os];
      if (platform) {
        resultData.platform = platform;
      }
    } catch (error) {
      console.warn(error);
      return null;
    }
  } else {
    return null;
  }

  const architecture = platformInfo && PLATFORM_ARCH[platformInfo.arch];
  if (architecture) {
    Object.assign(resultData, architecture);
  }
  return resultData;
};
