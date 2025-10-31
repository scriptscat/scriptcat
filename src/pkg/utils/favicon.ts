// 从脚本的@match和@include规则中提取域名
export function extractFaviconsDomain(matche: string[] = [], include: string[] = []) {
  // 提取域名
  const domains = new Map<string, { match: string; domain: string }>();

  // 处理match和include规则
  for (const pattern of [...matche, ...include]) {
    const domain = extractDomainFromPattern(pattern);
    if (domain) {
      // 使用match作为key，避免重复
      domains.set(domain, { match: pattern, domain });
    } else {
      // 如果无法提取域名，仍然保留原始pattern
      domains.set(pattern, { match: pattern, domain: "" });
    }
  }

  return Array.from(domains.values());
}

/**
 * 从URL模式中提取域名
 */
function extractDomainFromPattern(pattern: string): string | null {
  try {
    // 处理match模式: scheme://host/path
    const matchPattern = /^(http|https|\*):\/\/([^/]+)(?:\/(.*))?$/;
    const matches = pattern.match(matchPattern);

    if (matches) {
      let host = matches[2];

      // 删除最后的*
      // 例如 "example.com*" 变为 "example.com"
      while (host.endsWith("*")) {
        host = host.slice(0, -1);
      }

      // 删除 * 通配符
      // 例如 "*.example.com" 变为 "example.com"
      // a.*.example.com 变为 "example.com"
      while (host.includes("*")) {
        // 从最后一个 * 开始删除
        const lastAsteriskIndex = host.lastIndexOf("*");
        host = host.slice(lastAsteriskIndex + 1);
      }

      // 删除第一个.
      // 例如 ".example.com" 变为 "example.com"
      while (host.startsWith(".")) {
        host = host.slice(1);
      }

      return host;
    }

    // 尝试作为URL解析
    if (pattern.startsWith("http://") || pattern.startsWith("https://")) {
      const url = new URL(pattern);
      return url.hostname;
    }

    // 尝试匹配域名格式
    const domainMatch = pattern.match(/([a-z0-9][-a-z0-9]*\.)+[a-z0-9][-a-z0-9]*/i);
    return domainMatch ? domainMatch[0] : null;
  } catch {
    return null;
  }
}

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
export async function fetchIconByDomain(domain: string): Promise<string[]> {
  const url = `https://${domain}`;
  const icons: string[] = [];

  // 设置超时时间（例如 5 秒）
  const timeout = 5000; // 单位：毫秒

  // 获取页面HTML
  const response = await fetch(url, { signal: timeoutAbortSignal(timeout) });
  const html = await response.text();
  const resolvedPageUrl = response.url;
  const resolvedUrl = new URL(resolvedPageUrl);
  const resolvedOrigin = resolvedUrl.origin;

  parseFaviconsNew(html, (href) => icons.push(resolveUrl(href, resolvedPageUrl)));

  // 检查默认favicon位置
  if (icons.length === 0) {
    const faviconUrl = `${resolvedOrigin}/favicon.ico`;
    icons.push(faviconUrl);
  }

  const urls = await Promise.all(
    icons.map((icon) =>
      fetch(icon, { method: "HEAD", signal: timeoutAbortSignal(timeout) })
        .then((res) => {
          if (res.ok && checkFileNameEqual(res.url, icon)) {
            return res.url;
          }
        })
        .catch(() => {
          // 忽略错误
        })
    )
  );

  return urls.filter((url) => !!url) as string[];
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
