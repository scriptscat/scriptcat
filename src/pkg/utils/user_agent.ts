// Windows 的 NT 内核号与产品名对不上，且 10 与 11 在 UA 里完全一致（区分需要 userAgentData 高熵值），
// 所以只到「10/11」为止，不替维护者猜。
const WINDOWS_NT_NAME: Record<string, string> = {
  "10.0": "10/11",
  "6.3": "8.1",
  "6.2": "8",
  "6.1": "7",
};

/** 浏览器判定：Chromium 衍生浏览器的 UA 里都带 Chrome 令牌，故必须排在 Chrome 之前 */
const BROWSER_RULES: { re: RegExp; name: string }[] = [
  { re: /Edg(?:A|iOS)?\/(\d+)/, name: "Edge" },
  { re: /OPR\/(\d+)/, name: "Opera" },
  { re: /Vivaldi\/(\d+)/, name: "Vivaldi" },
  { re: /(?:Firefox|FxiOS)\/(\d+)/, name: "Firefox" },
  { re: /(?:Chrome|Chromium|CriOS)\/(\d+)/, name: "Chrome" },
];

function detectOS(ua: string): string {
  // Android 的 UA 同时含有 Linux，必须先判
  const android = ua.match(/Android (\d+(?:\.\d+)?)/);
  if (android) return `Android ${android[1]}`;

  const ios = ua.match(/CPU (?:iPhone )?OS (\d+(?:_\d+)?)/);
  if (ios) return `${ua.includes("iPad") ? "iPadOS" : "iOS"} ${ios[1].replaceAll("_", ".")}`;

  const windows = ua.match(/Windows NT ([\d.]+)/);
  if (windows) return `Windows ${WINDOWS_NT_NAME[windows[1]] ?? windows[1]}`;

  // Mac OS X 的版本号自 10.15.7 起被浏览器冻结，报出来是假的，只给系统名
  if (ua.includes("Mac OS X")) return "macOS";
  // ChromeOS 的 UA 同样带 X11，必须先于 Linux 判
  if (ua.includes("CrOS")) return "ChromeOS";
  if (/Linux|X11/.test(ua)) return "Linux";
  return "";
}

function detectBrowser(ua: string): { name: string; version: string } | null {
  for (const { re, name } of BROWSER_RULES) {
    const matched = ua.match(re);
    if (matched) return { name, version: matched[1] };
  }
  // Safari 的 Safari/ 后面跟的是 WebKit 版本，真正的浏览器版本在 Version/ 里
  const safari = ua.match(/Version\/(\d+(?:\.\d+)?) .*Safari\//);
  return safari ? { name: "Safari", version: safari[1] } : null;
}

/**
 * `navigator.userAgentData.getHighEntropyValues()` 的返回子集。
 * Chromium 的 UA 已被 UA reduction 冻结（版本恒为 `143.0.0.0`、Windows 恒为 `NT 10.0; Win64; x64`、
 * macOS 恒为 `10_15_7`），真实的系统版本 / 构建号 / 架构只能从这里拿。非 Chromium 浏览器没有该 API。
 */
export interface UserAgentHints {
  platform?: string;
  platformVersion?: string;
  fullVersionList?: { brand: string; version: string }[];
  architecture?: string;
  bitness?: string;
}

interface NavigatorUAData {
  getHighEntropyValues?: (hints: string[]) => Promise<UserAgentHints>;
}

/**
 * 读取 high-entropy client hints；不支持或被策略拒绝时返回 undefined，由调用方退回纯 UA 解析。
 * 这是个能力探测而非错误吞没：整条链路本就是「能拿到就更精确」的增强。
 */
export async function collectUserAgentHints(): Promise<UserAgentHints | undefined> {
  const uaData = (navigator as Navigator & { userAgentData?: NavigatorUAData }).userAgentData;
  if (!uaData?.getHighEntropyValues) return undefined;
  try {
    return await uaData.getHighEntropyValues(["platformVersion", "fullVersionList", "architecture", "bitness"]);
  } catch {
    return undefined;
  }
}

/** 去掉版本号末尾无意义的 `.0` 段：Chromium 冻结后的 `143.0.0.0` 实际只有主版本有效 */
function trimVersion(version: string): string {
  return version.replace(/(\.0)+$/, "");
}

/** 用 platformVersion 还原 UA 里看不出的系统版本；无法判定时返回空串，让 UA 的判断继续生效 */
function osFromHints(hints: UserAgentHints): string {
  const { platform, platformVersion } = hints;
  if (!platform || !platformVersion) return "";
  const major = Number.parseInt(platformVersion, 10);
  if (!Number.isFinite(major)) return "";
  if (platform === "Windows") {
    // 微软给出的映射：主版本 ≥ 13 是 Win11，1~12 是 Win10，0 则是 Win7/8/8.1（此时 UA 的 NT 号更准）
    if (major >= 13) return "Windows 11";
    return major >= 1 ? "Windows 10" : "";
  }
  return `${platform} ${trimVersion(platformVersion)}`;
}

/** 从 fullVersionList 里取该浏览器的真实构建号；`Chromium` 与 `Not(A:Brand` 等占位品牌不会误匹配 */
function versionFromHints(hints: UserAgentHints, browserName: string): string {
  const brand = hints.fullVersionList?.find((entry) => entry.brand.toLowerCase().includes(browserName.toLowerCase()));
  return brand ? trimVersion(brand.version) : "";
}

function archFromHints(hints: UserAgentHints): string {
  const { architecture, bitness } = hints;
  if (!architecture || !bitness) return "";
  return architecture === "x86" && bitness === "64" ? "x64" : `${architecture}${bitness}`;
}

/**
 * 把 UA（可选叠加 client hints）归纳成 issue 模板「系统 / 浏览器及版本」那栏期望的人话，
 * 形如 `Windows 11 + Chrome 143.0.7499.96 (arm64)`。
 * 系统或浏览器任一认不出就原样返回整条 UA —— 只报出一半的半成品比原文更容易误导维护者。
 */
export function describeUserAgent(ua: string, hints?: UserAgentHints): string {
  const browser = detectBrowser(ua);
  const os = (hints && osFromHints(hints)) || detectOS(ua);
  if (!os || !browser) return ua;

  const version = (hints && versionFromHints(hints, browser.name)) || trimVersion(browser.version);
  const arch = hints ? archFromHints(hints) : "";
  return `${os} + ${browser.name} ${version}${arch ? ` (${arch})` : ""}`;
}
