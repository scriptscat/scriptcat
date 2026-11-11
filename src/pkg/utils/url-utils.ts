import { decodePunycode } from "./punycode";

/**
 * Converts a machine-encoded URL into a human-readable format.
 * 把编码URL变成使用者可以阅读的格式
 */
export const prettyUrl = (s: string | undefined | null, baseUrl?: string): string => {
  if (!s) return "";

  const EXTRA = {
    DECODE_URI: 0,
    DECODE_COMP: 1,
    PRESERVE_Q: 2,
    PRESERVE_H: 4,
    PRESERVE_A: 8,
  } as const;
  const safeDecode = (val: string, extra: number) => {
    try {
      const decodeFn = extra & EXTRA.DECODE_COMP ? decodeURIComponent : decodeURI;
      let decoded = decodeFn(val);
      // Re-encode delimiters to prevent breaking the URL structure
      if (extra & EXTRA.PRESERVE_Q) decoded = decoded.replace(/[=&\s]/g, encodeURIComponent);
      if (extra & EXTRA.PRESERVE_H) decoded = decoded.replace(/\s/g, encodeURIComponent);
      if (extra & EXTRA.PRESERVE_A) decoded = decoded.replace(/[=&:@/\\\s]/g, encodeURIComponent);
      return decoded;
    } catch {
      return val;
    }
  };

  try {
    const u = new URL(s, baseUrl);

    // 1. Core components: Protocol, Punycode Host, and Port
    const protocol = u.protocol ? `${u.protocol}//` : "";
    const host = u.hostname
      .split(".")
      .map((p) => {
        try {
          return p.startsWith("xn--") ? decodePunycode(p) : p;
        } catch {
          // punycode 解码失败时回退到原始 label，避免整个 prettyUrl 失败
          return p;
        }
      })
      .join(".");
    const port = u.port ? `:${u.port}` : "";

    // 2. Decode Path and Hash safely
    const path = safeDecode(u.pathname, EXTRA.DECODE_URI);
    let hash = safeDecode(u.hash, EXTRA.DECODE_URI | EXTRA.PRESERVE_H);
    if (!hash && s.endsWith("#")) hash = "#";

    // 3. Search Params: Decode key/value pairs while escaping delimiters
    const params = Array.from(new URLSearchParams(u.search));
    const m = params.map(
      ([k, v]) =>
        `${safeDecode(k, EXTRA.DECODE_COMP | EXTRA.PRESERVE_Q)}=${safeDecode(v, EXTRA.DECODE_COMP | EXTRA.PRESERVE_Q)}`
    );
    const search = params.length ? `?${m.join("&")}` : "";

    // 4. Auth: User and Password
    const user = safeDecode(u.username, EXTRA.DECODE_COMP | EXTRA.PRESERVE_A);
    const pass = safeDecode(u.password, EXTRA.DECODE_COMP | EXTRA.PRESERVE_A);
    const auth = user ? `${user}${pass ? `:${pass}` : ""}@` : "";

    return `${protocol}${auth}${host}${port}${path}${search}${hash}`;
  } catch {
    return s;
  }
};

// 站点语言前缀，如 en、zh-CN、pt-BR
const LOCALE_SEGMENT = "(?:[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]+)*/)?";
// 详情页及其子页面（/code、/versions、/discussions/123 …）；带 "." 的路径已是脚本文件直链，不做转换
const GREASYFORK_PAGE = new RegExp(`^/${LOCALE_SEGMENT}scripts/(\\d+)(?:-([^/]+))?(?:/[^.]*)?$`);
const SCRIPTCAT_PAGE = new RegExp(`^/${LOCALE_SEGMENT}script-show-page/(\\d+)(?:/[^.]*)?$`);
// /{owner}/{repo}/blob/{ref}/{path}；ref 可能含 "/"，raw 域名下去掉 blob 段后路径布局一致，无需拆分 ref 与 path
const GITHUB_BLOB_PAGE = /^\/([^/]+\/[^/]+)\/blob\/(.+)$/;

/**
 * 把 Greasy Fork / ScriptCat 的脚本详情页、GitHub 的文件页面链接转换为可直接下载脚本的安装链接，其余输入原样返回。
 * Greasy Fork / ScriptCat 的安装链接只按脚本 ID 定位，文件名部分可任意，所以无需请求页面获取真实脚本名。
 */
export const toScriptInstallUrl = (url: string): string => {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  if (u.hostname === "greasyfork.org") {
    const m = GREASYFORK_PAGE.exec(u.pathname);
    if (m) return `https://update.greasyfork.org/scripts/${m[1]}/${m[2] || m[1]}.user.js`;
  } else if (u.hostname === "scriptcat.org") {
    const m = SCRIPTCAT_PAGE.exec(u.pathname);
    if (m) return `https://scriptcat.org/scripts/code/${m[1]}/${m[1]}.user.js`;
  } else if (u.hostname === "github.com") {
    const m = GITHUB_BLOB_PAGE.exec(u.pathname);
    if (m) return `https://raw.githubusercontent.com/${m[1]}/${m[2]}`;
  }
  return url;
};
