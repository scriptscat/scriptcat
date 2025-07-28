import { type TMsgResponse } from "@App/app/service/service_worker/utils";

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

const localFavIconCaches = new Map<string, Promise<string[]>>();

const makeError = (e: any) => {
  const { name } = e;
  const o = {
    [name]: class extends Error {
      constructor(message: any) {
        super(message);
        this.name = name;
      }
    },
  };
  return new o[name](e.message);
};

function getFaviconFromDomain(domain: string): Promise<string[]> {
  let ret = localFavIconCaches.get(domain);
  if (ret) return ret;
  ret = chrome.runtime.sendMessage({ message: "fetch-icon-by-domain", domain }).then((r: TMsgResponse) => {
    if (r.ok) return r.res!;
    const error = r.err!;
    if (error.errType === 11) {
      // 網絡錯誤
      console.warn(`${error.message}`);
    } else if (error.errType === 12) {
      // 超时
      console.warn(`${error.message}`);
    } else {
      // 其他错误
      console.error(makeError(error));
    }
    return [];
  });
  localFavIconCaches.set(domain, ret);
  return ret;
}
