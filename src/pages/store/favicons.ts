import { type Script, ScriptDAO } from "@App/app/repo/scripts";
import { FaviconDAO, type FaviconFile, type FaviconRecord } from "@App/app/repo/favicon";
import { v5 as uuidv5 } from "uuid";
import { getFaviconRootFolder } from "@App/app/service/service_worker/utils";
import { readBlobContent } from "@App/pkg/utils/encoding";

let scriptDAO: ScriptDAO | null = null;
let faviconDAO: FaviconDAO | null = null;
const loadFaviconPromises = new Map<string, any>(); // 关联 iconUrl 和 blobUrl

/**
 * 从URL模式中提取域名
 */
export const extractDomainFromPattern = (pattern: string): string | null => {
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
};

// 从脚本的@match和@include规则中提取域名
export const extractFaviconsDomain = (matche: string[] = [], include: string[] = []) => {
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
};

// AbortSignal.timeout 是较新的功能。如果不支持 AbortSignal.timeout，则返回传统以定时器操作 AbortController
export const timeoutAbortSignal =
  typeof AbortSignal?.timeout === "function"
    ? (milis: number) => {
        return AbortSignal.timeout(milis);
      }
    : (milis: number) => {
        const controller: AbortController = new AbortController();
        const signal = controller.signal;
        // 中断请求
        setTimeout(controller.abort.bind(controller), milis);
        return signal;
      };

/**
 * 解析相对URL为绝对URL
 */
const resolveUrl = (href: string, base: string): string => {
  try {
    return new URL(href, base).href;
  } catch {
    return href; // 如果解析失败，返回原始href
  }
};

export const parseFaviconsNew = (html: string, callback: (href: string) => void) => {
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
};

const getFilename = (url: string) => {
  const i = url.lastIndexOf("/");
  if (i >= 0) return url.substring(i + 1);
  return url;
};

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
  const html = await readBlobContent(response, response.headers.get("content-type"));
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

// 获取脚本的favicon
export const getScriptFavicon = async (uuid: string): Promise<FaviconRecord[]> => {
  scriptDAO ||= new ScriptDAO();
  faviconDAO ||= new FaviconDAO();
  const script = await scriptDAO.get(uuid);
  if (!script) {
    return [];
  }
  const favicon = await faviconDAO.get(uuid);
  if (favicon) {
    return favicon.favicons;
  }
  // 提取域名
  const domains = extractFaviconsDomain(script.metadata?.match || [], script.metadata?.include || []);

  // 并发获取favicon
  const faviconRecords: FaviconRecord[] = await Promise.all(
    domains.map(async (domain) => {
      try {
        if (domain.domain) {
          const icons = await fetchIconByDomain(domain.domain);
          const icon = icons.length > 0 ? icons[0] : "";
          return { match: domain.match, website: "http://" + domain.domain, icon };
        }
      } catch {
        // 忽略错误
      }
      return { match: domain.match, website: "", icon: "" };
    })
  );
  // 储存并返回结果
  await faviconDAO.save(uuid, {
    uuid,
    favicons: faviconRecords,
  });
  return faviconRecords;
};

// 加载favicon并缓存到OPFS (blobUrl结果在SW活跃时保持在loadFaviconPromises)
export const loadFavicon = async (iconUrl: string): Promise<string> => {
  const directoryHandle = await getFaviconRootFolder();
  // 使用url的uuid作为文件名
  const filename = `icon_${uuidv5(iconUrl, uuidv5.URL)}.dat`;
  // 检查文件是否存在
  let fileHandle: FileSystemFileHandle | undefined;
  try {
    fileHandle = await directoryHandle.getFileHandle(filename);
  } catch {
    // 文件不存在，继续往下走
  }
  if (!fileHandle) {
    // 文件不存在，下载并保存
    const newFileHandle = await directoryHandle.getFileHandle(filename, { create: true });
    const response = await fetch(iconUrl);
    const blob = await response.blob();
    const writable = await newFileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
  }
  // OPFS 文件信息
  const opfsRet = { dirs: ["cached_favicons"], filename: filename };
  const file = await getFileFromOPFS(opfsRet);
  const blobUrl = URL.createObjectURL(file);
  return blobUrl;
};

const getFileFromOPFS = async (opfsRet: FaviconFile): Promise<File> => {
  let dirHandle = await navigator.storage.getDirectory();
  for (const dir of opfsRet.dirs) {
    dirHandle = await dirHandle.getDirectoryHandle(dir);
  }
  const fileHandle = await dirHandle.getFileHandle(opfsRet.filename);
  const file = await fileHandle.getFile();
  return file;
};

// 处理单个脚本的favicon
const processScriptFavicon = async (script: Script) => {
  const favFnAsync = async () => {
    const icons = await getScriptFavicon(script.uuid); // 恒久。不会因SW重启而失效
    if (icons.length === 0) return [];
    const newIcons = await Promise.all(
      icons.map(async (icon) => {
        let iconUrl = "";
        if (icon.icon) {
          try {
            const iconWebUrl = icon.icon;
            let loadFaviconPromise = loadFaviconPromises.get(iconWebUrl);
            if (!loadFaviconPromise) {
              // SW重启的话，再次 loadFavicon 时，直接返回 sessionBlobUrl
              loadFaviconPromise = loadFavicon(iconWebUrl);
              loadFaviconPromises.set(iconWebUrl, loadFaviconPromise);
            }
            const blobUrl = await loadFaviconPromise;
            iconUrl = blobUrl;
          } catch (_) {
            // ignored
          }
        }
        return {
          match: icon.match,
          website: icon.website,
          icon: iconUrl,
        };
      })
    );
    return newIcons;
  };
  return {
    uuid: script.uuid,
    fav: await favFnAsync(),
  };
};

type FavIconResult = {
  uuid: string;
  fav: {
    match: string;
    website?: string;
    icon?: string;
  }[];
};

type TFaviconStack = { chunkResults: FavIconResult[]; pendingCount: number };

// 处理favicon加载，以批次方式处理
export const loadScriptFavicons = async function* (scripts: Script[]) {
  const stack: TFaviconStack[] = [];
  const asyncWaiter: { promise?: any; resolve?: any } = {};
  const createPromise = () => {
    asyncWaiter.promise = new Promise<TFaviconStack>((resolve) => {
      asyncWaiter.resolve = resolve;
    });
  };
  createPromise();
  let pendingCount = scripts.length;
  if (!pendingCount) return;
  const results: FavIconResult[] = [];
  let waiting = false;
  for (const script of scripts) {
    processScriptFavicon(script).then((result: FavIconResult) => {
      results.push(result);
      // 下一个 MacroTask 执行。
      // 使用 requestAnimationFrame 而非setTimeout 是因为前台才要显示。而且网页绘画中时会延后这个
      if (!waiting) {
        requestAnimationFrame(() => {
          waiting = false;
          const chunkResults: FavIconResult[] = results.slice(0);
          results.length = 0;
          pendingCount -= chunkResults.length;
          stack.push({ chunkResults, pendingCount });
          asyncWaiter.resolve();
        });
        waiting = true;
      }
    });
  }
  while (true) {
    await asyncWaiter.promise;
    while (stack.length) {
      yield stack.shift()!;
    }
    if (pendingCount <= 0) break;
    createPromise();
  }
};
