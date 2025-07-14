/**
 * 从脚本的@match和@include规则中提取favicon图标
 * @param matche match规则数组
 * @param include include规则数组
 * @returns favicon URL数组
 */
export async function extractFavicons(
  matche: string[] = [],
  include: string[] = []
): Promise<{ match: string; website: string; icon?: string }[]> {
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

  // 将Map转换为数组并去重
  const uniqueDomains = Array.from(domains.values());

  // 获取favicon
  const faviconUrls = new Array<{ match: string; website: string; icon: string }>();

  // 并发获取favicon
  const fetchPromises = uniqueDomains.map(async (domain) => {
    try {
      if (domain.domain) {
        const icons = await getFaviconFromDomain(domain.domain);
        if (icons.length > 0) {
          faviconUrls.push({ match: domain.match, website: "http://" + domain.domain, icon: icons[0] });
        } else {
          faviconUrls.push({ match: domain.match, website: "http://" + domain.domain, icon: "" });
        }
      } else {
        faviconUrls.push({ match: domain.match, website: "", icon: "" });
      }
    } catch (error) {
      console.error(`Failed to fetch favicon for ${domain.domain || domain.match}:`, error);
    }
  });
  // 等待所有favicon获取完成
  await Promise.all(fetchPromises);

  return faviconUrls.slice();
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

/**
 * 从域名获取favicon
 */
async function getFaviconFromDomain(domain: string): Promise<string[]> {
  const url = `https://${domain}`;
  const icons: string[] = [];

  // 设置超时时间（例如 5 秒）
  const timeout = 5000; // 单位：毫秒

  try {
    // 获取页面HTML
    const response = await fetch(url, { signal: timeoutAbortSignal(timeout) });
    const html = await response.text();

    parseFaviconsNew(html, (href) => icons.push(resolveUrl(href, url)));

    // 检查默认favicon位置
    if (icons.length === 0) {
      const faviconUrl = `${url}/favicon.ico`;
      try {
        const faviconResponse = await fetch(faviconUrl, { method: "HEAD", signal: timeoutAbortSignal(timeout) });
        if (faviconResponse.ok) {
          icons.push(faviconUrl);
        }
      } catch {
        // 忽略错误
      }
    }

    return icons;
  } catch (error: any) {
    if (error.name === "AbortError") {
      // 超时
      console.warn(`Timeout while fetching favicon:`, url);
    } else {
      // 其他错误
      console.error(`Error fetching favicon for ${domain}:`, error);
    }
    return [];
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
