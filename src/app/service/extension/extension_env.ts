export type TExtensionEnv = {
  inIncognitoContext: boolean;
  userAgentData?: GMUserAgentData | null;
};

type GMUserAgentData = typeof GM_info.userAgentData;

export const extensionEnv: TExtensionEnv = {
  inIncognitoContext: chrome.extension.inIncognitoContext,
} satisfies TExtensionEnv;

export const getExtensionUserAgentData = async (): Promise<GMUserAgentData | null> => {
  // @ts-ignore
  const userAgentData = navigator.userAgentData;
  if (userAgentData) {
    const resultData: GMUserAgentData = {
      brands: userAgentData.brands,
      mobile: userAgentData.mobile,
      platform: userAgentData.platform,
    } satisfies GMUserAgentData;
    // 处理architecture和bitness
    if (chrome.runtime.getPlatformInfo) {
      try {
        const platformInfo = await chrome.runtime.getPlatformInfo();
        resultData.architecture = platformInfo.nacl_arch;
        resultData.bitness = platformInfo.arch.includes("64") ? "64" : "32";
      } catch (e) {
        // 避免 API 无法执行的问题。不影响整体运作
        console.warn(e);
      }
    }
    return resultData;
  }
  return null;
};
