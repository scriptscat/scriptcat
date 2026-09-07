/** 页面对扩展的可注入性分类。`file` 单独成类：浏览器另有「允许访问文件网址」开关。 */
export type TPageAccessKind = "web" | "file" | "restricted";

// 白名单而非黑名单：其余协议（chrome:// / 扩展页 / about: / devtools: / view-source: …）
// 一律按浏览器保留页处理。顶层 about:blank 同理——没有内容可注入。
const INJECTABLE_PROTOCOLS = new Set(["http:", "https:"]);

export const getPageAccessKind = (url: string): TPageAccessKind => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "restricted";
  }
  if (parsed.protocol === "file:") return "file";
  return INJECTABLE_PROTOCOLS.has(parsed.protocol) ? "web" : "restricted";
};

/**
 * 是否为扩展商店页。各浏览器只保护「自家」商店：Edge 商店在 Chrome 里就是普通网页，
 * 反之亦然。因此调用方只能拿它给「已确认没注入」的页面一个更准确的原因，
 * 不能反过来断定注入不了——否则会误伤在别家浏览器里正常运行的脚本。
 */
export const isExtensionStoreUrl = (url: string): boolean => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const { hostname, pathname } = parsed;
  return (
    hostname === "chromewebstore.google.com" ||
    hostname === "addons.mozilla.org" ||
    (hostname === "chrome.google.com" && pathname.startsWith("/webstore")) ||
    (hostname === "microsoftedge.microsoft.com" && pathname.startsWith("/addons"))
  );
};

/**
 * 取用于判定「同一注入前提」的 origin。解析失败返回空字符串。
 * file:// 的 origin 在各浏览器多为 "null"，改用 scheme 代替：本地文件页之间共享同一个授权开关。
 */
export const toOrigin = (url: string): string => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "file:" ? "file://" : parsed.origin;
  } catch {
    return "";
  }
};
