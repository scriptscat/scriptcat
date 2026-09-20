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

type NavigatorWithUserAgentData = Navigator & {
  userAgentData?: {
    brands: { brand: string; version: string }[];
    mobile: boolean;
    platform: string;
  };
};

type ClientHintsArch = {
  architecture: string;
  bitness: string;
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
  "x86-32": { architecture: "x86", bitness: "32" },
  "x86-64": { architecture: "x86", bitness: "64" },
  arm: { architecture: "arm", bitness: "32" },
  arm64: { architecture: "arm", bitness: "64" },
  aarch64: { architecture: "arm", bitness: "64" },
  mips: { architecture: "mips", bitness: "32" },
  mips64: { architecture: "mips", bitness: "64" },
};

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
      brands: userAgentData.brands,
      mobile: userAgentData.mobile,
      platform: userAgentData.platform,
    } satisfies GMUserAgentData;
  } else {
    if (!runtime.getBrowserInfo) {
      return null;
    }
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
  }

  const architecture = platformInfo && PLATFORM_ARCH[platformInfo.arch];
  if (architecture) {
    Object.assign(resultData, architecture);
  }
  return resultData;
};
