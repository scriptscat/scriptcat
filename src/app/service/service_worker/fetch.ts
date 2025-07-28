import { msgResponse, type TMsgResponse } from "./utils";

// AbortSignal.timeout 是较新的功能。如果不支持 AbortSignal.timeout，则返回传统以定时器操作 AbortController
const timeoutAbortSignal =
  typeof AbortSignal?.timeout === "function"
    ? (milis: number) => {
        return AbortSignal.timeout(milis);
      }
    : (milis: number) => {
        let controller: AbortController | null = new AbortController();
        const signal = controller.signal;
        setTimeout(() => {
          controller!.abort(); // 中断请求
          controller = null;
        }, milis);
        return signal;
      };

const getFilename = (url: string) => {
  const i = url.lastIndexOf("/");
  if (i >= 0) return url.substring(i + 1);
  return url;
};

function parseFaviconsNew(html: string, callback: (href: string) => void) {
  // Early exit if no link tags
  if (!html.toLowerCase().includes("<link")) return;

  // Regex to match favicon-related link tags
  const faviconRegex = /<link[^>]+rel=["'](?:icon|apple-touch-icon|apple-touch-icon-precomposed)["'][^>]*>/gi;
  const hrefRegex = /href=["'](.*?)["']/i;

  // Find all matching link tags
  const matches = html.match(faviconRegex);
  if (matches) {
    for (const match of matches) {
      const hrefMatch = match.match(hrefRegex);
      if (hrefMatch && hrefMatch[1]) {
        callback(hrefMatch[1]);
      }
    }
  }

  return;
}

const checkFileNameEqual = (a: string, b: string) => {
  const name1 = getFilename(a);
  const name2 = getFilename(b);
  return 0 === name1.localeCompare(name2, "en", { sensitivity: "base" });
};

/**
 * 从域名获取favicon
 */
export async function getFaviconFromDomain_(domain: string): Promise<TMsgResponse> {
  const url = `https://${domain}`;
  const icons: string[] = [];

  // 设置超时时间（例如 5 秒）
  const timeout = 5000; // 单位：毫秒
  let domainOK = false;
  let fetchingUrl = "";

  try {
    // 获取页面HTML
    const response = await fetch((fetchingUrl = url), { signal: timeoutAbortSignal(timeout) });
    const html = await response.text();
    const resolvedPageUrl = response.url;
    const resolvedUrl = new URL(resolvedPageUrl);
    const resolvedOrigin = resolvedUrl.origin;

    parseFaviconsNew(html, (href) => icons.push(resolveUrl(href, resolvedPageUrl)));
    domainOK = true;

    // 检查默认favicon位置
    if (icons.length === 0) {
      const faviconUrl = `${resolvedOrigin}/favicon.ico`;
      icons.push(faviconUrl);
    }

    const urls = await Promise.all(
      icons.map(async (icon) => {
        try {
          const res = await fetch((fetchingUrl = icon), { method: "HEAD", signal: timeoutAbortSignal(timeout) });
          if (res.ok && checkFileNameEqual(res.url, icon)) {
            return res.url;
          }
        } catch {
          // 忽略错误
        }
      })
    );

    return msgResponse(0, { res: urls.filter((url) => !!url) as string[] });
  } catch (error: any) {
    if (error.name === "TypeError" && error.message === "Failed to fetch" && !domainOK) {
      // 網絡錯誤
      return msgResponse(11, { name: "TypeError", message: `Unable to fetch ${domain}` });
    } else if (error.name === "AbortError" || error.name === "TimeoutError") {
      // 超时
      return msgResponse(12, { name: "TimeoutError", message: `Timeout while fetching favicon: ${fetchingUrl}` });
    } else {
      // 其他错误
      return msgResponse(1, { name: error.name, message: `Error fetching favicon for ${domain}:\n${error.message}` });
    }
  }
}

/**
 * 解析相对URL为绝对URL
 */
function resolveUrl(href: string, base: string): string {
  try {
    return new URL(href, base).href;
  } catch {
    return href; // 如果解析失败，返回原始href
  }
}
