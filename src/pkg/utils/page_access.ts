/** 页面对扩展的可注入性分类。`file` 单独成类：浏览器另有「允许访问文件网址」开关。 */
export type TPageAccessKind = "web" | "file" | "restricted";

// 浏览器强制保留、任何扩展都注入不了的页面。about:blank 也在内：它没有内容可注入。
const INJECTABLE_PROTOCOLS = new Set(["http:", "https:"]);

// 商店页由浏览器单独保护，scheme 是 https 但同样注入不了。
const isExtensionStore = (url: URL) =>
  url.hostname === "chromewebstore.google.com" ||
  url.hostname === "addons.mozilla.org" ||
  (url.hostname === "chrome.google.com" && url.pathname.startsWith("/webstore"));

export const getPageAccessKind = (url: string): TPageAccessKind => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "restricted";
  }
  if (parsed.protocol === "file:") return "file";
  if (!INJECTABLE_PROTOCOLS.has(parsed.protocol)) return "restricted";
  return isExtensionStore(parsed) ? "restricted" : "web";
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
